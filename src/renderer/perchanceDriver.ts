export interface GenerationResult {
  imageDataUrl: string;
  seed: string | null;
  capturedPrompt: string | null;
}

interface ImageProbe {
  title: string;
  src: string;
}

// perchance's generator page structure (confirmed by hand, 2026-07-16):
// - prompt input: <textarea data-name="description">
// - generate button: <button id="generateButtonEl">
// - result: <img id="resultImgEl">, whose `src` is already a data: URL and
//   whose `title` embeds "seed=<n>" alongside the full prompt used.
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

async function probeResultImage(webview: Electron.WebviewTag): Promise<ImageProbe | null> {
  return webview.executeJavaScript(`
    (() => {
      const img = document.querySelector(${JSON.stringify(RESULT_IMAGE_SELECTOR)});
      return img ? { title: img.title, src: img.src } : null;
    })();
  `);
}

/**
 * Drives the perchance generator page for a single prompt: inject the text,
 * click Generate, wait for the result image + seed to change, and capture
 * them from the resulting <img>'s `src`/`title`.
 */
async function injectPromptAndClickGenerate(
  webview: Electron.WebviewTag,
  promptText: string,
): Promise<{ ok: boolean; error?: string }> {
  // Never throw inside injected code: webview.executeJavaScript() doesn't
  // propagate the actual JS error message across the guest-view boundary,
  // only a generic "Script failed to execute" wrapper. Return a result
  // object instead and raise the real error in normal TS code below.
  return webview.executeJavaScript(`
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
  `);
}

export async function generateImage(
  webview: Electron.WebviewTag,
  promptText: string,
): Promise<GenerationResult> {
  const before = await probeResultImage(webview);

  const injected = await injectPromptAndClickGenerate(webview, promptText);
  if (!injected.ok) {
    throw new Error(injected.error ?? 'Failed to inject prompt and click Generate');
  }

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const current = await probeResultImage(webview);
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
