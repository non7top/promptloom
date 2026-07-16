export interface GenerationResult {
  imageDataUrl: string;
  seed: string | null;
}

/**
 * Drives the perchance generator page for a single prompt: inject the text,
 * click Generate, wait for the result, and capture the image + seed.
 *
 * Not implemented yet — the real DOM selectors for perchance's prompt input,
 * Generate button, result image, and seed display are unknown (the page
 * sits behind a Cloudflare check that must be cleared by hand first). See
 * README.md for what's needed to wire this up.
 */
export async function generateImage(
  _webview: Electron.WebviewTag,
  _promptText: string,
): Promise<GenerationResult> {
  throw new Error(
    "Perchance driver isn't wired up yet — real DOM selectors are needed (see README).",
  );
}
