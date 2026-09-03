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
  // Tracked by dataUrl (not container element) since perchance's own
  // re-renders can replace a container wholesale — surviving that is the
  // same reason the button-reattach logic below re-scans on an interval
  // and on every DOM mutation, rather than attaching once and assuming it
  // sticks. Session-only (a fresh page load starts empty), which matches
  // the actual complaint: losing track of what's saved *within* a batch of
  // generations, not across restarting the app entirely.
  window.__promptloomSavedDataUrls = window.__promptloomSavedDataUrls || new Set();
  const SAVED_MARKER_CLASS = 'promptloom-saved-marker';

  function outputFor(container) {
    const iframe = container && container.querySelector ? container.querySelector('iframe') : null;
    return iframe && iframe.textToImagePluginOutput;
  }

  function markSaved(container) {
    if (!container || container.querySelector('.' + SAVED_MARKER_CLASS)) return;
    // Containing block for the absolutely-positioned badge below — only
    // force this if the container doesn't already establish one itself.
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    const badge = document.createElement('div');
    badge.className = SAVED_MARKER_CLASS;
    badge.textContent = '✓ Saved';
    badge.style.cssText =
      'position:absolute;top:4px;right:4px;background:#2ecc71;color:#fff;' +
      'font:bold 11px sans-serif;padding:2px 6px;border-radius:4px;' +
      'pointer-events:none;z-index:9999;';
    container.appendChild(badge);
  }

  function captureAndSave(container) {
    try {
      const output = outputFor(container);
      if (output && output.dataUrl && output.inputs) {
        const seed = output.inputs.seed != null ? String(output.inputs.seed) : null;
        window.promptloomBridge.saveImage(output.dataUrl, output.inputs.prompt || '', seed);
        window.__promptloomSavedDataUrls.add(output.dataUrl);
        markSaved(container);
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
    document.querySelectorAll('.t2i-image-ctn').forEach((container) => {
      const output = outputFor(container);
      if (output && output.dataUrl && window.__promptloomSavedDataUrls.has(output.dataUrl)) {
        markSaved(container);
      }
    });
  }

  scan();
  if (window.__promptloomScanInterval) return;
  window.__promptloomScanInterval = setInterval(scan, 1000);
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
`;

// perchance's Shape control (confirmed by hand, 2026-08-29):
// <div class="input-ctn input-type-select">
//   <div class="input-inner">
//     <div class="input-label"><span>🖼️ Shape</span></div>
//     <div class="input-wrapper">
//       <select data-name="shape" onchange="...">
//         <option value="768x768" selected>Square</option>
//         <option value="512x768">Portrait</option>
//         <option value="768x512">Landscape</option>
//       </select>
//     </div>
//   </div>
// </div>
// Only 2-3 options and picked often enough that a click-to-open dropdown is
// more friction than it's worth — this replaces it with an always-visible
// button list next to the (hidden, but still functional) <select>, driving
// the same element so perchance's own onchange handler still fires exactly
// as if the dropdown had been used normally.
const SHAPE_SELECTOR = 'select[data-name="shape"]';
const INJECT_SHAPE_LIST_SCRIPT = `
(() => {
  const BUTTON_CLASS = 'promptloom-shape-btn';

  function signatureOf(select) {
    return Array.from(select.options).map((o) => o.value).join(',');
  }

  function syncSelected(select, list) {
    list.querySelectorAll('.' + BUTTON_CLASS).forEach((btn) => {
      const active = btn.dataset.value === select.value;
      btn.style.background = active ? '#2ecc71' : 'transparent';
      btn.style.color = active ? '#fff' : '';
      btn.style.fontWeight = active ? 'bold' : 'normal';
    });
  }

  function render(select, list) {
    list.innerHTML = '';
    Array.from(select.options).forEach((option) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = BUTTON_CLASS;
      btn.dataset.value = option.value;
      btn.textContent = option.textContent;
      btn.style.cssText =
        'display:block; width:100%; padding:4px 8px; margin-bottom:2px;' +
        'border-radius:4px; border:1px solid #888; cursor:pointer;' +
        'text-align:left; background:transparent; font:inherit;';
      btn.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        syncSelected(select, list);
      });
      list.appendChild(btn);
    });
    syncSelected(select, list);
  }

  function convert(select) {
    if (select.__promptloomListEl) {
      // The available shapes can change (e.g. switching model) — rebuild
      // if the option set itself changed, otherwise just re-sync which
      // button looks selected in case something outside our own clicks
      // changed select.value.
      const signature = signatureOf(select);
      if (select.__promptloomOptionsSignature !== signature) {
        render(select, select.__promptloomListEl);
        select.__promptloomOptionsSignature = signature;
      } else {
        syncSelected(select, select.__promptloomListEl);
      }
      return;
    }
    const list = document.createElement('div');
    list.className = 'promptloom-shape-list';
    select.style.display = 'none';
    select.insertAdjacentElement('afterend', list);
    select.__promptloomListEl = list;
    select.__promptloomOptionsSignature = signatureOf(select);
    render(select, list);
  }

  function scan() {
    document.querySelectorAll(${JSON.stringify(SHAPE_SELECTOR)}).forEach(convert);
  }

  scan();
  if (window.__promptloomShapeScanInterval) return;
  window.__promptloomShapeScanInterval = setInterval(scan, 1000);
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
`;

export async function injectShapeListSelect(): Promise<void> {
  const frame = await findFrameWithSelector(PROMPT_SELECTOR);
  if (!frame) return; // Same not-fatal reasoning as injectSaveButtons — retried on the next frame load.
  await frame.executeJavaScript(INJECT_SHAPE_LIST_SCRIPT);
}

// perchance's community-gallery tile (confirmed by hand, 2026-08-30): each
// result sits in a <div class="imageCtn" data-image-id="..." data-prompt="..."
// data-negative-prompt="..." data-seed="..." data-guidance-scale="...">,
// with the actual rendered image at .imageWrapperInner img[src]. This is a
// different page/tab than the generator's own results grid (.t2i-image-ctn,
// handled by injectSaveButtons above) — those carry an in-memory dataUrl on
// the iframe element, these only carry a remote https://aigc.uploads.dev/...
// URL, so saving means downloading it (done in the main process, see
// ipc.ts's perchance:saveImageFromUrl — a page-context fetch/canvas read
// would be subject to that image host's own CORS policy). Whether a tile
// is already saved is likewise resolved in the main process (ipc.ts's
// perchance:checkGallerySaved, backed by db.ts): first a fast lookup by
// data-image-id, falling back to a prompt match + content-hash confirm for
// anything saved before that ID was tracked.
const GALLERY_TILE_SELECTOR = '.imageCtn[data-image-id]';
const INJECT_GALLERY_SAVE_SCRIPT = `
(() => {
  // Tracked by data-image-id, which (unlike the generator's own dataUrl) is
  // stable across perchance's own gallery re-renders. Session-only cache of
  // *confirmed matches* only (never "confirmed not saved" — a tile can go
  // from unsaved to saved at any time, e.g. via its own button click).
  window.__promptloomGallerySavedIds = window.__promptloomGallerySavedIds || new Set();
  // Tiles awaiting an async checkGallerySaved answer (see runQueue below) —
  // processed one at a time rather than all at once, so a gallery page full
  // of tiles doesn't fire off dozens of simultaneous fetch+hash checks.
  window.__promptloomGalleryCheckQueue = window.__promptloomGalleryCheckQueue || [];
  window.__promptloomGalleryQueueRunning = window.__promptloomGalleryQueueRunning || false;
  const BUTTON_CLASS = 'promptloom-gallery-save-btn';
  const SAVED_CLASS = 'promptloom-gallery-saved-badge';

  function markSaved(tile) {
    const existingBtn = tile.querySelector('.' + BUTTON_CLASS);
    if (existingBtn) existingBtn.remove();
    // outline rather than border: doesn't participate in the box model, so
    // it can't shift this tile's layout/sizing within the gallery's
    // flex-wrap grid the way adding a border would. The badge text alone is
    // too small to register at a glance when scanning a full page of tiles.
    tile.style.outline = '5px solid #2ecc71';
    if (tile.querySelector('.' + SAVED_CLASS)) return;
    if (getComputedStyle(tile).position === 'static') {
      tile.style.position = 'relative';
    }
    const badge = document.createElement('div');
    badge.className = SAVED_CLASS;
    badge.textContent = '✓ Saved';
    badge.style.cssText =
      'position:absolute; top:4px; left:4px; z-index:9999; pointer-events:none;' +
      'background:#2ecc71; color:#fff; font:bold 11px sans-serif;' +
      'padding:2px 6px; border-radius:4px;';
    tile.appendChild(badge);
  }

  function attachSaveButton(tile) {
    if (tile.querySelector('.' + BUTTON_CLASS) || tile.querySelector('.' + SAVED_CLASS)) return;
    const imageId = tile.dataset.imageId;
    if (getComputedStyle(tile).position === 'static') {
      tile.style.position = 'relative';
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = BUTTON_CLASS;
    btn.textContent = '💾 Save';
    btn.title = 'Save to PromptLoom';
    btn.style.cssText =
      'position:absolute; top:4px; left:4px; z-index:9999; cursor:pointer;' +
      'background:rgba(0,0,0,0.72); color:#fff; border:1px solid #fff;' +
      'border-radius:4px; padding:2px 6px; font:bold 11px sans-serif;';
    // Stops the click from also reaching whatever perchance's own listener
    // on the tile does (e.g. opening a lightbox).
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const img = tile.querySelector('.imageWrapperInner img');
      const imageUrl = img && img.src;
      if (!imageUrl) return;
      window.promptloomBridge.saveImageFromUrl(imageUrl, tile.dataset.prompt || '', tile.dataset.seed || null, imageId || null);
      // Optimistic — this is fire-and-forget all the way down (matches
      // perchance's own save button's UX), so the badge shows immediately
      // rather than waiting on the main process's download to finish.
      window.__promptloomGallerySavedIds.add(imageId);
      markSaved(tile);
    });
    tile.appendChild(btn);
  }

  // Drains __promptloomGalleryCheckQueue one tile at a time — each check
  // may fetch+hash the remote image (see ipc.ts's perchance:checkGallery-
  // Saved), so this deliberately awaits each before starting the next
  // instead of firing them all in parallel.
  async function runQueue() {
    if (window.__promptloomGalleryQueueRunning) return;
    window.__promptloomGalleryQueueRunning = true;
    while (window.__promptloomGalleryCheckQueue.length) {
      const tile = window.__promptloomGalleryCheckQueue.shift();
      const imageId = tile.dataset.imageId;
      // Tile may have scrolled out and been pruned from the DOM since it
      // was queued — nothing to attach a button/badge to in that case.
      if (!imageId || !document.body.contains(tile)) continue;
      if (window.__promptloomGallerySavedIds.has(imageId)) {
        markSaved(tile);
        continue;
      }
      try {
        const img = tile.querySelector('.imageWrapperInner img');
        const imageUrl = img && img.src;
        const matched = imageUrl
          ? await window.promptloomBridge.checkGallerySaved(imageId, tile.dataset.prompt || '', imageUrl)
          : false;
        if (matched) {
          window.__promptloomGallerySavedIds.add(imageId);
          markSaved(tile);
        } else {
          attachSaveButton(tile);
        }
      } catch (err) {
        console.error('[PromptLoom] gallery save-state check failed', err);
        attachSaveButton(tile); // fail open — a spurious button beats a tile stuck with neither.
      }
    }
    window.__promptloomGalleryQueueRunning = false;
  }

  function attach(tile) {
    const imageId = tile.dataset.imageId;
    if (!imageId || tile.__promptloomChecked) return;
    if (tile.querySelector('.' + BUTTON_CLASS) || tile.querySelector('.' + SAVED_CLASS)) return;
    // Already confirmed saved this session (e.g. by clicking its own
    // button) — no need to round-trip through the queue for that.
    if (window.__promptloomGallerySavedIds.has(imageId)) {
      markSaved(tile);
      return;
    }
    tile.__promptloomChecked = true;
    window.__promptloomGalleryCheckQueue.push(tile);
    runQueue();
  }

  function scan() {
    document.querySelectorAll(${JSON.stringify(GALLERY_TILE_SELECTOR)}).forEach(attach);
  }

  scan();
  if (window.__promptloomGalleryScanInterval) return;
  // The gallery loads more tiles on scroll, so keep re-scanning rather than
  // attaching once. tile.__promptloomChecked keeps this from re-queuing
  // (and re-fetching/re-hashing) the same still-present tile every tick.
  window.__promptloomGalleryScanInterval = setInterval(scan, 1000);
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
`;

export async function injectGallerySaveButtons(): Promise<void> {
  const frame = await findFrameWithSelector(GALLERY_TILE_SELECTOR);
  if (!frame) return; // Not fatal — the gallery tab may not be open yet; retried on the next frame load.
  await frame.executeJavaScript(INJECT_GALLERY_SAVE_SCRIPT);
}

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
