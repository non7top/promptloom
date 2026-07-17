import type { WebFrameMain } from 'electron';
import { getPerchanceWebContents } from './perchanceView';

// perchance's generator page structure (confirmed by hand, 2026-07-16):
// - prompt input: <textarea data-name="description">
// - each result sits in a <div class="t2i-image-ctn"> containing an <img>
//   whose `src` is already a data: URL and whose `title` embeds
//   "seed=<n>" alongside the full prompt used, plus perchance's own
//   "private save" button calling a global window.t2i_privateGallerySave(
//   buttonEl, containerEl) function.
//
// The generator itself may run inside a nested <iframe> rather than the
// top-level document (common for perchance.org, which wraps generators in
// a shell page) — document.querySelector from the main frame won't see
// into that, even though the elements are visibly on screen. Search every
// frame in the page for the one that actually contains these elements.
const PROMPT_SELECTOR = 'textarea[data-name="description"]';
const FRAME_SEARCH_RETRIES = 10;
const FRAME_SEARCH_RETRY_DELAY_MS = 500;

export function extractSeed(title: string): string | null {
  const match = title.match(/seed=(\d+)/);
  return match ? match[1] : null;
}

// The title also embeds the exact prompt actually submitted (may differ
// subtly from what we sent, e.g. trimming) — more authoritative than any
// locally-composed string, and saves having to remember it separately.
export function extractCapturedPrompt(title: string): string | null {
  const match = title.match(/prompt=([\s\S]*?)\nnegativePrompt=/);
  return match ? match[1].trim() : null;
}

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
// calls. A JS reference doesn't get discarded by DOM re-renders, so this
// only needs to run once (well, once per page load) rather than
// continually fighting to keep a DOM node alive. Clicking perchance's own
// save button then also hands that image's src/title to the main process
// via the bridge exposed by perchancePreload.ts (see ipc.ts's
// 'perchance:saveImage' handler) — the main process, not this script,
// decides what to do with it, since this code runs in perchance's own
// untrusted page.
const INTERCEPT_SAVE_FUNCTION_SCRIPT = `
(() => {
  function wrap() {
    const original = window.t2i_privateGallerySave;
    if (typeof original !== 'function' || original.__promptloomWrapped) {
      return typeof original === 'function';
    }
    const wrapped = function (buttonEl, containerEl) {
      const result = original.apply(this, arguments);
      const img = containerEl && containerEl.querySelector ? containerEl.querySelector('img') : null;
      if (img) window.promptloomBridge.saveImage(img.src, img.title);
      return result;
    };
    wrapped.__promptloomWrapped = true;
    window.t2i_privateGallerySave = wrapped;
    return true;
  }

  if (wrap()) return;
  // The function may not be defined yet the first time this runs (page
  // still initializing) — keep trying until it appears, then stop.
  const interval = setInterval(() => {
    if (wrap()) clearInterval(interval);
  }, 500);
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
