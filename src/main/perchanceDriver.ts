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

// Rather than injecting a new button into the DOM — which the site's own
// JS silently wipes out whenever it re-renders a result container, since
// an injected sibling isn't part of that framework's own DOM — wrap the
// *global function* perchance's existing "private save" button already
// calls. Clicking perchance's own save button then also hands that
// image's data + prompt/seed to the main process via the bridge exposed
// by perchancePreload.ts (see ipc.ts's 'perchance:saveImage' handler) —
// the main process, not this script, decides what to do with it, since
// this code runs in perchance's own untrusted page.
//
// A JS reference doesn't get discarded by a DOM re-render the way an
// injected element does, but the site's own per-render init code appears
// to re-assign window.t2i_privateGallerySave fresh each time (plausible
// for a per-instance-setup pattern) — a wrapped reference from an earlier
// render otherwise gets silently clobbered back to the unwrapped original.
// So this keeps re-checking indefinitely rather than wrapping once and
// stopping, same fix as the DOM-button approach needed.
const INTERCEPT_SAVE_FUNCTION_SCRIPT = `
(() => {
  function wrap() {
    const original = window.t2i_privateGallerySave;
    if (typeof original !== 'function' || original.__promptloomWrapped) return;
    const wrapped = function (buttonEl, containerEl) {
      try {
        const iframe = containerEl && containerEl.querySelector ? containerEl.querySelector('iframe') : null;
        const output = iframe && iframe.textToImagePluginOutput;
        if (output && output.dataUrl && output.inputs) {
          const seed = output.inputs.seed != null ? String(output.inputs.seed) : null;
          window.promptloomBridge.saveImage(output.dataUrl, output.inputs.prompt || '', seed);
        }
      } catch (err) {
        console.error('[PromptLoom] failed to capture image for save', err);
      }
      return original.apply(this, arguments);
    };
    wrapped.__promptloomWrapped = true;
    window.t2i_privateGallerySave = wrapped;
  }

  wrap();
  if (window.__promptloomWrapInterval) return;
  window.__promptloomWrapInterval = setInterval(wrap, 500);
})();
`;

export async function injectSaveButtons(): Promise<void> {
  for (let attempt = 0; attempt < FRAME_SEARCH_RETRIES; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop -- retries must happen sequentially
    const frame = await findFrameWithSelector(PROMPT_SELECTOR);
    if (frame) {
      // eslint-disable-next-line no-await-in-loop
      await frame.executeJavaScript(INTERCEPT_SAVE_FUNCTION_SCRIPT);
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
  console.warn('[perchanceDriver] Gave up looking for the generator frame to intercept the save function in');
}
