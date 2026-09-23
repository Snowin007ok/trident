/**
 * Historical imagery.
 *
 * Two kinds of picture appear in TRIDENT and they are never confused with one
 * another:
 *
 *   textbook — extracted from the page range a verified lesson cites, carrying
 *              its book, chapter and pages. Labelled "Verified textbook image".
 *   api      — fetched live from Wikimedia Commons (or Europeana, only when the
 *              server has a key). Labelled with its source and licence, and
 *              never presented as a citation.
 *
 * Nothing is shown unless its record is complete and `verified` is true.
 */

import { el, clear, toast } from './ui.js';
import { icon } from './icons.js';
import * as store from './storage.js';

let CATALOGUE = { images: [] };
const byLesson = new Map();

export function init(catalogue) {
  CATALOGUE = catalogue && Array.isArray(catalogue.images) ? catalogue : { images: [] };
  byLesson.clear();
  CATALOGUE.images.filter(usable).forEach((img) => {
    if (!img.lessonId) return;
    if (!byLesson.has(img.lessonId)) byLesson.set(img.lessonId, []);
    byLesson.get(img.lessonId).push(img);
  });
}

/** A record is usable only when every field a reader would need is present. */
function usable(img) {
  if (!img || img.verified !== true) return false;
  if (!img.url || !img.alt || !img.caption || !img.credit || !img.licence) return false;
  if (img.sourceType === 'textbook') return !!(img.bookTitle && img.pageStart);
  return !!(img.sourcePage && img.licenceUrl);
}

export function forLesson(lessonId) {
  return byLesson.get(lessonId) || [];
}

/** The one image a lesson leads with. */
export function primaryFor(lessonId) {
  const all = forLesson(lessonId);
  return all.find((i) => i.primary) || all[0] || null;
}

/**
 * An image for a story — only one extracted from the same book and an
 * overlapping page range as the passage the story is drawn from. A story with
 * no such image gets none, rather than a picture borrowed from elsewhere.
 */
export function forStory(story) {
  if (!story || !story.citations || !story.citations.length) return null;
  const c = story.citations[0];
  const hit = CATALOGUE.images.filter(usable).filter((img) =>
    img.sourceType === 'textbook' && img.bookTitle === c.book
    && !(img.pageEnd < c.pageStart || img.pageStart > c.pageEnd));
  return hit.find((i) => i.primary) || hit[0] || null;
}

/** An image for a timeline event, matched the same way: same book, same pages. */
export function forCitation(c) {
  if (!c) return null;
  const hit = CATALOGUE.images.filter(usable).filter((img) =>
    img.sourceType === 'textbook' && img.bookTitle === c.book
    && !(img.pageEnd < c.pageStart || img.pageStart > c.pageEnd));
  return hit.find((i) => i.primary) || hit[0] || null;
}

export function byId(id) {
  return CATALOGUE.images.find((i) => i.id === id && usable(i)) || null;
}

export function count() {
  return CATALOGUE.images.filter(usable).length;
}

/** Every image the learner's own class can show, for the archive's browser. */
export function forClass(board, classLevel) {
  return CATALOGUE.images.filter(usable).filter((i) =>
    (!board || i.board === board) && (!classLevel || i.classLevel === classLevel));
}

/* ==========================================================================
   Rendering
   ========================================================================== */

/**
 * A figure with its picture, caption and source line.
 *
 * `size` picks the shape: 'hero' for the dashboard, 'lesson' for the big one
 * under a lesson title, 'thumb' for a timeline milestone or an archive tile.
 * Dimensions are always reserved so nothing jumps as images arrive, and
 * everything below the fold loads lazily.
 */
export function figure(img, { size = 'lesson', expandable = false, onSave = null } = {}) {
  if (!img || !usable(img)) return null;
  const ratio = img.width && img.height ? `${img.width} / ${img.height}` : '4 / 3';

  const picture = el('div', { class: 'hi-frame', style: `aspect-ratio:${ratio}` });
  const image = el('img', {
    src: img.url, alt: img.alt, loading: size === 'hero' ? 'eager' : 'lazy',
    decoding: 'async',
    width: img.width || null, height: img.height || null
  });
  image.addEventListener('error', () => { picture.replaceWith(motif(ratio)); }, { once: true });
  picture.append(image);

  if (expandable) {
    const open = el('button', {
      class: 'hi-expand', type: 'button',
      'aria-label': `Open a larger view of this image: ${img.alt}`,
      onclick: () => lightbox(img)
    }, [icon('plus', 16)]);
    picture.append(open);
  }

  const source = img.sourceType === 'textbook'
    ? el('span', { class: 'hi-source is-textbook' }, [icon('evidence', 14), 'Verified textbook image'])
    : el('span', { class: 'hi-source is-api' }, [icon('api', 14), img.credit]);

  return el('figure', { class: `hi hi-${size}`, 'data-testid': 'history-image' }, [
    picture,
    el('figcaption', { class: 'hi-cap' }, [
      el('span', { class: 'hi-caption-text', text: img.caption }),
      el('span', { class: 'hi-meta' }, [
        source,
        img.sourceType === 'textbook'
          ? el('span', { class: 'hi-cite', text: img.credit })
          : el('a', { class: 'hi-cite', href: img.sourcePage, target: '_blank', rel: 'noopener noreferrer', text: 'Source page' }),
        img.sourceType !== 'textbook' && img.licenceUrl
          ? el('a', { class: 'hi-cite hi-licence', href: img.licenceUrl, target: '_blank', rel: 'noopener noreferrer', text: img.licence })
          : null,
        onSave ? saveButton(img, onSave) : null
      ].filter(Boolean))
    ])
  ]);
}

function saveButton(img, onSave) {
  const saved = () => (store.load().savedImages || []).some((s) => s.id === img.id);
  const btn = el('button', {
    class: 'hi-save', type: 'button', 'data-testid': 'save-image',
    'aria-pressed': String(saved())
  }, [icon('saved', 14), saved() ? 'In your archive' : 'Save to archive']);
  btn.addEventListener('click', () => {
    const now = store.toggleSavedImage({
      id: img.id, title: img.title, caption: img.caption, alt: img.alt,
      url: img.url, sourceType: img.sourceType, credit: img.credit,
      sourcePage: img.sourcePage || null, licence: img.licence,
      licenceUrl: img.licenceUrl || null, width: img.width, height: img.height
    });
    const on = (now.savedImages || []).some((s) => s.id === img.id);
    clear(btn);
    btn.append(icon('saved', 14), on ? 'In your archive' : 'Save to archive');
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('is-on', on);
    if (onSave) onSave(on);
    toast(on ? 'Saved to your Visual Archive.' : 'Removed from your Visual Archive.');
  });
  if (saved()) btn.classList.add('is-on');
  return btn;
}

/** A drawn stand-in, so a failed image never leaves a hole. */
export function motif(ratio = '4 / 3', label = 'No picture available') {
  const box = el('div', {
    class: 'hi-frame hi-motif', style: `aspect-ratio:${ratio}`,
    role: 'img', 'aria-label': label, 'data-testid': 'image-motif'
  });
  box.innerHTML = `
    <svg viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" focusable="false" aria-hidden="true">
      <rect width="120" height="90" fill="var(--sky)"/>
      <g fill="none" stroke="var(--teal)" stroke-width="1.1" opacity="0.55">
        <path d="M0 64c14-8 24 4 38-2s24 6 40-2 28 2 42-4"/>
        <path d="M0 74c16-7 26 5 40-1s24 6 40-3 26 3 40-3"/>
      </g>
      <g fill="none" stroke="var(--ink)" stroke-width="1.6" opacity="0.5">
        <path d="M42 54V34l18-10 18 10v20z"/><path d="M52 54V42h16v12"/>
      </g>
    </svg>`;
  return box;
}

/* ---------------------------------------------------------------- lightbox */

let openBox = null;
function lightbox(img) {
  if (openBox) return;
  const opener = document.activeElement;
  const close = () => {
    if (!openBox) return;
    openBox.remove(); openBox = null;
    document.removeEventListener('keydown', onKey, true);
    if (opener && opener.focus) opener.focus();
  };
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = openBox.querySelectorAll('button, a[href]');
    if (!f.length) return;
    const first = f[0]; const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  const closeBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Close', onclick: close });
  const dialog = el('div', {
    class: 'hi-lightbox', role: 'dialog', 'aria-modal': 'true',
    'aria-label': `Larger view: ${img.alt}`, 'data-testid': 'image-lightbox'
  }, [
    el('img', { src: img.url, alt: img.alt }),
    el('div', { class: 'hi-lb-foot' }, [
      el('p', { text: img.caption }),
      el('p', { class: 'hint', text: img.credit }),
      closeBtn
    ])
  ]);
  openBox = el('div', { class: 'hi-lb-backdrop' }, [dialog]);
  openBox.addEventListener('mousedown', (e) => { if (e.target === openBox) close(); });
  document.addEventListener('keydown', onKey, true);
  document.getElementById('modalRoot').append(openBox);
  closeBtn.focus();
}

/* ==========================================================================
   Wikimedia Commons — the live image source
   --------------------------------------------------------------------------
   One search per topic, cached for seven days, at most six results, and every
   result must carry a thumbnail, a source page and a licence before it is
   allowed anywhere near the interface.
   ========================================================================== */

const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const CACHE_PREFIX = 'trident:commons:';
const CACHE_DAYS = 7;
const MAX_RESULTS = 6;
const inFlight = new Map();

function cacheKey(topic) { return CACHE_PREFIX + topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60); }

function readCache(topic) {
  try {
    const raw = localStorage.getItem(cacheKey(topic));
    if (!raw) return null;
    const rec = JSON.parse(raw);
    const age = Date.now() - new Date(rec.at).getTime();
    if (age > CACHE_DAYS * 864e5) { localStorage.removeItem(cacheKey(topic)); return null; }
    return rec;
  } catch (err) { return null; }
}

function writeCache(topic, results) {
  try {
    localStorage.setItem(cacheKey(topic), JSON.stringify({ at: new Date().toISOString(), results }));
  } catch (err) { /* a full store is not fatal */ }
}

/** Plain text out of the HTML fragments Commons returns in its metadata. */
function plain(html) {
  if (!html) return '';
  const d = document.createElement('div');
  d.textContent = String(html).replace(/<[^>]*>/g, ' ');
  return d.textContent.replace(/\s+/g, ' ').trim();
}

/**
 * Search Commons for pictures of a topic.
 * Resolves to { status, results } where status is 'ok' | 'cache' | 'empty' |
 * 'offline'. It never throws and never returns a partial record.
 */
export async function searchCommons(topic) {
  if (!topic) return { status: 'empty', results: [] };
  const cached = readCache(topic);
  if (cached) return { status: 'cache', results: cached.results };

  // two callers asking for the same topic share one request
  if (inFlight.has(topic)) return inFlight.get(topic);

  const url = `${COMMONS}?action=query&format=json&origin=*`
    + '&generator=search&gsrnamespace=6&gsrlimit=12'
    + `&gsrsearch=${encodeURIComponent(topic)}`
    + '&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=640'
    + '&iiextmetadatafilter=LicenseShortName|LicenseUrl|Artist|Credit|ImageDescription|ObjectName';

  const run = (async () => {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Commons responded ${res.status}`);
      const data = await res.json();
      const pages = (data && data.query && data.query.pages) ? Object.values(data.query.pages) : [];
      const results = [];
      for (const p of pages) {
        const info = (p.imageinfo || [])[0];
        if (!info) continue;
        const meta = info.extmetadata || {};
        const licence = plain(meta.LicenseShortName && meta.LicenseShortName.value);
        const licenceUrl = (meta.LicenseUrl && meta.LicenseUrl.value) || null;
        const thumb = info.thumburl;
        const page = info.descriptionurl;
        // incomplete provenance means it is not shown, however good it looks
        if (!thumb || !page || !licence || !licenceUrl) continue;
        if (!/^image\//.test(info.mime || 'image/')) continue;
        results.push({
          id: `commons-${p.pageid}`,
          title: plain((meta.ObjectName && meta.ObjectName.value) || p.title.replace(/^File:/, '')),
          alt: plain((meta.ImageDescription && meta.ImageDescription.value) || p.title.replace(/^File:/, ''))
            .slice(0, 240),
          caption: plain((meta.ObjectName && meta.ObjectName.value) || p.title.replace(/^File:/, '')).slice(0, 180),
          sourceType: 'api',
          source: 'Wikimedia Commons',
          url: thumb,
          width: info.thumbwidth || null,
          height: info.thumbheight || null,
          sourcePage: page,
          creator: plain(meta.Artist && meta.Artist.value) || null,
          credit: 'Wikimedia Commons',
          licence,
          licenceUrl,
          verified: true
        });
        if (results.length >= MAX_RESULTS) break;
      }
      if (results.length) writeCache(topic, results);
      return { status: results.length ? 'ok' : 'empty', results };
    } catch (err) {
      return { status: 'offline', results: [] };
    } finally {
      inFlight.delete(topic);
    }
  })();

  inFlight.set(topic, run);
  return run;
}

/**
 * Europeana, through the server so its key never reaches the browser. The
 * endpoint answers 501 when no key is configured, which is the normal case.
 */
export async function searchEuropeana(topic) {
  if (!topic) return { status: 'empty', results: [] };
  try {
    const res = await fetch(`api/images/europeana?q=${encodeURIComponent(topic)}`);
    if (res.status === 501) return { status: 'not-configured', results: [] };
    if (!res.ok) return { status: 'offline', results: [] };
    const data = await res.json();
    return { status: (data.results || []).length ? 'ok' : 'empty', results: data.results || [] };
  } catch (err) {
    return { status: 'offline', results: [] };
  }
}
