/**
 * Europeana, proxied.
 *
 * Europeana needs an API key. A key in browser code is a key given away, so
 * the browser never sees it: it asks this server, and this server asks
 * Europeana. Without EUROPEANA_API_KEY the route answers 501 and the
 * application carries on with Wikimedia Commons alone — which is the normal
 * case, not an error.
 *
 * Only records that carry a usable thumbnail, a source page and a licence are
 * returned, and never more than six.
 */

const ENDPOINT = 'https://api.europeana.eu/record/v2/search.json';
const MAX_RESULTS = 6;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

const cache = new Map();
const inFlight = new Map();

export function isConfigured() {
  return !!(process.env.EUROPEANA_API_KEY || '').trim();
}

function first(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

/** A record with no provenance is not a record we can show. */
function shape(item) {
  const thumb = first(item.edmPreview);
  const page = first(item.guid) || first(item.edmIsShownAt);
  const licence = first(item.rights);
  if (!thumb || !page || !licence) return null;
  const title = first(item.title);
  if (!title) return null;
  return {
    id: `europeana-${String(item.id || page).replace(/[^\w-]+/g, '-').slice(0, 60)}`,
    title: String(title).slice(0, 180),
    alt: String(first(item.dcDescription) || title).slice(0, 240),
    caption: String(title).slice(0, 180),
    sourceType: 'api',
    source: 'Europeana collection',
    url: thumb,
    width: null,
    height: null,
    sourcePage: page,
    creator: first(item.dcCreator) || null,
    credit: `Europeana collection${item.dataProvider ? ` — ${first(item.dataProvider)}` : ''}`,
    licence: String(licence),
    licenceUrl: String(licence).startsWith('http') ? String(licence) : null,
    verified: true
  };
}

/**
 * Search Europeana for images of a topic.
 * Returns { status, results }: 'ok' | 'empty' | 'offline' | 'not-configured'.
 * It never throws, and a failure here never reaches a lesson.
 */
export async function searchEuropeana(query) {
  if (!isConfigured()) return { status: 'not-configured', results: [] };
  const q = String(query || '').trim().slice(0, 120);
  if (!q) return { status: 'empty', results: [] };

  const hit = cache.get(q);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { status: 'cache', results: hit.results };
  }
  // one request per topic, however many callers ask at once
  if (inFlight.has(q)) return inFlight.get(q);

  const url = `${ENDPOINT}?wskey=${encodeURIComponent(process.env.EUROPEANA_API_KEY.trim())}`
    + `&query=${encodeURIComponent(q)}`
    + '&qf=TYPE:IMAGE&media=true&thumbnail=true&reusability=open'
    + `&rows=${MAX_RESULTS * 3}&profile=standard`;

  const run = (async () => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ac.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) return { status: 'offline', results: [] };
      const data = await res.json();
      const results = [];
      for (const item of data.items || []) {
        const rec = shape(item);
        if (rec) results.push(rec);
        if (results.length >= MAX_RESULTS) break;
      }
      if (results.length) cache.set(q, { at: Date.now(), results });
      if (cache.size > 200) cache.delete(cache.keys().next().value);
      return { status: results.length ? 'ok' : 'empty', results };
    } catch (err) {
      return { status: 'offline', results: [] };
    } finally {
      clearTimeout(timer);
      inFlight.delete(q);
    }
  })();

  inFlight.set(q, run);
  return run;
}
