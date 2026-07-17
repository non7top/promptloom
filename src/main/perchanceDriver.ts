import type { WebFrameMain } from 'electron';
import { getPerchanceWebContents } from './perchanceView';

// perchance's generator page structure (confirmed by hand, 2026-07-16,
// including the real source of window.t2i_privateGallerySave):
// - prompt input: <textarea data-name="description">
// - each result sits in a <div class="t2i-image-ctn"> containing a nested
//   <iframe>. The actual generation data lives as a property the plugin
//   attaches directly to that iframe element —
//   iframe.textToImagePluginOutput = { dataUrl, inputs: { prompt,
//   negativePrompt, seed, guidanceScale } } — not on any <img> tag, and
//   not encoded as a string anywhere.
// - perchance's own "private save" button calls a global
//   window.t2i_privateGallerySave(buttonEl, containerEl) function that
//   reads exactly that property.
//
// The generator itself may run inside a nested <iframe> rather than the
// top-level document (common for perchance.org, which wraps generators in
// a shell page) — document.querySelector from the main frame won't see
// into that, even though the elements are visibly on screen. Search every
// frame in the page for the one that actually contains these elements.
const PROMPT_SELECTOR = 'textarea[data-name="description"]';
const FRAME_SEARCH_RETRIES = 10;
const FRAME_SEARCH_RETRY_DELAY_MS = 500;

async function frameHasSelector(frame: WebFrameMain, selector: string): Promise<boolean> {
  try {
    return Boolean(
      await frame.executeJavaScript(`!!document.querySelector(${JSON.stringify(selector)})`),
    );
  } catch {
    // Cross-origin or destroyed frames can throw; treat as "not found".
    return false;
  }
}

async function findFrameWithSelector(selector: string): Promise<WebFrameMain | null> {
  const webContents = getPerchanceWebContents();
  for (const frame of webContents.mainFrame.framesInSubtree) {
    // eslint-disable-next-line no-await-in-loop -- frames must be checked sequentially
    if (await frameHasSelector(frame, selector)) {
      return frame;
    }
  }
  return null;
}

async function findGeneratorFrame(): Promise<WebFrameMain> {
  const frame = await findFrameWithSelector(PROMPT_SELECTOR);
  if (!frame) {
    throw new Error(
      'Prompt textarea not found in any frame of the perchance page (still on the ' +
        'Cloudflare check, or the page structure has changed)',
    );
  }
  return frame;
}

// Never throw inside injected code: executeJavaScript() doesn't propagate
// the actual JS error message across the boundary, only a generic
// "Script failed to execute" wrapper. Return a result object instead and
// raise the real error in normal TS code below.
export async function populatePrompt(promptText: string): Promise<void> {
  const frame = await findGeneratorFrame();
  const result = (await frame.executeJavaScript(`
    (() => {
      try {
        const textarea = document.querySelector(${JSON.stringify(PROMPT_SELECTOR)});
        if (!textarea) return { ok: false, error: 'Prompt textarea not found on page' };
        textarea.value = ${JSON.stringify(promptText)};
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String((err && err.message) || err) };
      }
    })();
  `)) as { ok: boolean; error?: string };

  if (!result.ok) {
    throw new Error(result.error ?? 'Failed to populate the prompt field');
  }
}

// Wrapping window.t2i_privateGallerySave (a JS reference, not a DOM node)
// was meant to sidestep the site's own re-renders wiping out an injected
// button — but DevTools showed the save button also has its own
// addEventListener-bound listener(s), which may hold a closured reference
// to the original function rather than looking up window.
// t2i_privateGallerySave fresh, making our wrap irrelevant to whichever
// listener actually fires. Instead, we attach to the actual button, first
// stripping every listener perchance itself attached (see attach() below),
// and read the generation data ourselves rather than depending on
// perchance's own function at all. Still needs the same "keep re-attaching"
// treatment as any injected-DOM approach, since the button element itself
// can get replaced by a re-render.
const ATTACH_SAVE_LISTENER_SCRIPT = `
(() => {
  function captureAndSave(container) {
    try {
      const iframe = container && container.querySelector ? container.querySelector('iframe') : null;
      const output = iframe && iframe.textToImagePluginOutput;
      if (output && output.dataUrl && output.inputs) {
        const seed = output.inputs.seed != null ? String(output.inputs.seed) : null;
        window.promptloomBridge.saveImage(output.dataUrl, output.inputs.prompt || '', seed);
      }
    } catch (err) {
      console.error('[PromptLoom] failed to capture image for save', err);
    }
  }

  function attach(button) {
    if (button.__promptloomListenerAttached) return;
    // Racing perchance's own listener(s) with just a capture-phase listener
    // isn't reliable — same-target listeners run in registration order
    // regardless of capture/bubble, and the site's own listener is very
    // likely attached before ours gets a chance to. Cloning drops every
    // addEventListener-bound listener the original had, and removing the
    // onclick attribute drops the inline handler too, so the clone truly
    // has none of the site's own behavior left — only ours.
    const clone = button.cloneNode(true);
    clone.removeAttribute('onclick');
    clone.__promptloomListenerAttached = true;
    button.replaceWith(clone);
    clone.addEventListener('click', () => captureAndSave(clone.closest('.t2i-image-ctn')));
  }

  function scan() {
    document.querySelectorAll('.private-save-button').forEach(attach);
  }

  scan();
  if (window.__promptloomScanInterval) return;
  window.__promptloomScanInterval = setInterval(scan, 1000);
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
`;

export async function injectSaveButtons(): Promise<void> {
  for (let attempt = 0; attempt < FRAME_SEARCH_RETRIES; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop -- retries must happen sequentially
    const frame = await findFrameWithSelector(PROMPT_SELECTOR);
    if (frame) {
      // eslint-disable-next-line no-await-in-loop
      await frame.executeJavaScript(ATTACH_SAVE_LISTENER_SCRIPT);
      return;
    }
    // eslint-disable-next-line no-await-in-loop -- retries must happen sequentially
    await new Promise((resolve) => setTimeout(resolve, FRAME_SEARCH_RETRY_DELAY_MS));
  }
  // Not fatal — the page may still be on the Cloudflare check. The user
  // will just not see saves land in PromptLoom until they navigate past
  // it and the next frame-load retry succeeds, so this is logged rather
  // than thrown.
  // eslint-disable-next-line no-console
  console.warn('[perchanceDriver] Gave up looking for the generator frame to attach the save listener in');
}
