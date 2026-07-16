import type { WebFrameMain } from 'electron';
import type { GenerationResult } from '../shared/types';
import { getPerchanceWebContents } from './perchanceView';

interface ImageProbe {
  title: string;
  src: string;
}

// perchance's generator page structure (confirmed by hand, 2026-07-16):
// - prompt input: <textarea data-name="description">
// - generate button: <button id="generateButtonEl">
// - result: <img id="resultImgEl">, whose `src` is already a data: URL and
//   whose `title` embeds "seed=<n>" alongside the full prompt used.
//
// The generator itself may run inside a nested <iframe> rather than the
// top-level document (common for perchance.org, which wraps generators in
// a shell page) — document.querySelector from the main frame won't see
// into that, even though the elements are visibly on screen. Search every
// frame in the page for the one that actually contains these elements.
const PROMPT_SELECTOR = 'textarea[data-name="description"]';
const GENERATE_BUTTON_SELECTOR = '#generateButtonEl';
const RESULT_IMAGE_SELECTOR = '#resultImgEl';
const POLL_INTERVAL_MS = 500;
const TIMEOUT_MS = 60_000;

function extractSeed(title: string): string | null {
  const match = title.match(/seed=(\d+)/);
  return match ? match[1] : null;
}

// The title also embeds the exact prompt actually submitted (may differ
// subtly from what we sent, e.g. trimming) — more authoritative than our
// own locally-composed string, and saves having to remember it separately.
function extractCapturedPrompt(title: string): string | null {
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

async function findGeneratorFrame(): Promise<WebFrameMain> {
  const webContents = getPerchanceWebContents();
  for (const frame of webContents.mainFrame.framesInSubtree) {
    // eslint-disable-next-line no-await-in-loop -- frames must be checked sequentially
    if (await frameHasSelector(frame, PROMPT_SELECTOR)) {
      return frame;
    }
  }
  throw new Error(
    'Prompt textarea not found in any frame of the perchance page (still on the ' +
      'Cloudflare check, or the page structure has changed)',
  );
}

async function probeResultImage(frame: WebFrameMain): Promise<ImageProbe | null> {
  return frame.executeJavaScript(`
    (() => {
      const img = document.querySelector(${JSON.stringify(RESULT_IMAGE_SELECTOR)});
      return img ? { title: img.title, src: img.src } : null;
    })();
  `) as Promise<ImageProbe | null>;
}

// Never throw inside injected code: executeJavaScript() doesn't propagate
// the actual JS error message across the boundary, only a generic
// "Script failed to execute" wrapper. Return a result object instead and
// raise the real error in normal TS code below.
async function injectPromptAndClickGenerate(
  frame: WebFrameMain,
  promptText: string,
): Promise<{ ok: boolean; error?: string }> {
  return frame.executeJavaScript(`
    (() => {
      try {
        const textarea = document.querySelector(${JSON.stringify(PROMPT_SELECTOR)});
        if (!textarea) return { ok: false, error: 'Prompt textarea not found on page' };
        textarea.value = ${JSON.stringify(promptText)};
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        const button = document.querySelector(${JSON.stringify(GENERATE_BUTTON_SELECTOR)});
        if (!button) return { ok: false, error: 'Generate button not found on page' };
        button.click();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String((err && err.message) || err) };
      }
    })();
  `) as Promise<{ ok: boolean; error?: string }>;
}

/**
 * Drives the perchance generator page for a single prompt: inject the text,
 * click Generate, wait for the result image + seed to change, and capture
 * them from the resulting <img>'s `src`/`title`.
 */
export async function generateImage(promptText: string): Promise<GenerationResult> {
  const frame = await findGeneratorFrame();
  const before = await probeResultImage(frame);

  const injected = await injectPromptAndClickGenerate(frame, promptText);
  if (!injected.ok) {
    throw new Error(injected.error ?? 'Failed to inject prompt and click Generate');
  }

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const current = await probeResultImage(frame);
    if (current && current.title !== before?.title && current.src.startsWith('data:image')) {
      return {
        imageDataUrl: current.src,
        seed: extractSeed(current.title),
        capturedPrompt: extractCapturedPrompt(current.title),
      };
    }
    // eslint-disable-next-line no-await-in-loop -- polling must happen sequentially
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error('Timed out waiting for perchance to generate an image');
}
