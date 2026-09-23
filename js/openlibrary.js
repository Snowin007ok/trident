/**
 * Book discovery powered by Open Library.
 *
 * These are supplementary recommendations — public library records that may be
 * interesting alongside a lesson. They are NOT verified syllabus sources, they
 * never become lesson text or quiz questions, and nothing in TRIDENT's cited
 * content comes from here.
 *
 * As with the Wikimedia client, everything that knows the remote service — the
 * URL and the translation of its JSON — lives in one function, `requestSearch()`.
 *
 * Politeness, in order:
 *   - the search topic is a handful of words from lesson metadata, never the
 *     textbook passage;
 *   - results are cached per normalised topic for seven days;
 *   - requests are spaced at least a second apart, Open Library's stated limit;
 *   - a topic already in flight is shared rather than requested twice;
 *   - nothing is requested until the learner opens the section.
 */

const CACHE_PREFIX = 'trident:openlibrary:';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // seven days
const MIN_INTERVAL_MS = 1000;                    // one request per second
const TIMEOUT_MS = 9000;
const LIMIT = 6;

/* ------------------------------------------------------------- the topic */

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'from',
  'with', 'by', 'is', 'was', 'were', 'are', 'that', 'this', 'it', 'its', 'as',
  'what', 'how', 'why', 'when', 'who', 'means', 'meaning', 'about', 'into',
  'more', 'than', 'their', 'they', 'them', 'his', 'her', 'we', 'our'
]);

/**
 * Build a short search topic from trusted lesson metadata only — the lesson's
 * own topic and title, plus its era label. The textbook passage is never sent.
 */
export function topicFor(lesson, eraLabel) {
  const parts = [];
  if (lesson && lesson.topic) parts.push(String(lesson.topic));
  if (lesson && lesson.title) parts.push(String(lesson.title));
  const words = [];
  const seen = new Set();
  parts.join(' ')
    .replace(/[“”"'’‘(),.:;?!—–]/g, ' ')
    .split(/\s+/)
    .forEach((w) => {
      const clean = w.trim();
      const lower = clean.toLowerCase();
      if (!clean || STOP_WORDS.has(lower) || seen.has(lower)) return;
      seen.add(lower);
      words.push(clean);
    });
  let topic = words.slice(0, 4).join(' ');
  if (eraLabel && !/\bindia\b/i.test(topic)) topic = `${topic} ${eraLabel}`.trim();
  return topic.slice(0, 80).trim() || 'Indian history';
}

/** The cache key form: lower case, single spaces, no punctuation. */
export function normaliseTopic(topic) {
  return String(topic || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cacheKey(topic) { return CACHE_PREFIX + normaliseTopic(topic); }

/* ---------------------------------------------------------------- cache */

export function readCache(topic) {
  try {
    const raw = localStorage.getItem(cacheKey(topic));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.books)) return null;
    const age = Date.now() - new Date(parsed.fetchedAt).getTime();
    if (!Number.isFinite(age) || age > CACHE_TTL_MS) return null;   // expired
    return parsed;
  } catch (err) {
    return null;
  }
}

function writeCache(topic, books) {
  try {
    localStorage.setItem(cacheKey(topic), JSON.stringify({
      topic: normaliseTopic(topic), books, fetchedAt: new Date().toISOString()
    }));
  } catch (err) { /* a full store just means the next visit refetches */ }
}

/* ------------------------------------------------- the service adapter --- */

const COVER_URL = (id) => `https://covers.openlibrary.org/b/id/${encodeURIComponent(id)}-M.jpg`;
const WORK_URL = (key) => `https://openlibrary.org${key}`;

/**
 * THE ONLY FUNCTION THAT KNOWS ABOUT OPEN LIBRARY.
 * Takes a topic, returns at most six plain book records.
 */
async function requestSearch(topic, signal) {
  const endpoint = 'https://openlibrary.org/search.json'
    + `?q=${encodeURIComponent(topic)}`
    + '&fields=key,title,author_name,first_publish_year,cover_i'
    + `&limit=${LIMIT}`;

  const res = await fetch(endpoint, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`search responded with ${res.status}`);
  const json = await res.json();
  const docs = Array.isArray(json.docs) ? json.docs : [];

  return docs
    .filter((d) => d && typeof d.key === 'string' && /^\/(works|books)\//.test(d.key) && d.title)
    .slice(0, LIMIT)
    .map((d) => ({
      key: d.key,
      title: text(d.title),
      authors: Array.isArray(d.author_name) ? d.author_name.slice(0, 3).map(text).filter(Boolean) : [],
      year: Number.isFinite(d.first_publish_year) ? String(d.first_publish_year) : null,
      cover: Number.isFinite(d.cover_i) ? COVER_URL(d.cover_i) : null,
      url: WORK_URL(d.key)
    }))
    .filter((b) => b.title);
}

/** Remote strings are text, never markup. */
function text(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
}

/* ------------------------------------------------------------- fetching */

const inFlight = new Map();     // normalised topic -> promise
let lastRequestAt = 0;          // for the one-per-second floor
let queue = Promise.resolve();  // serialises requests so the floor holds

function paced(run) {
  const job = queue.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return run();
  });
  // keep the chain alive even when one request rejects
  queue = job.then(() => undefined, () => undefined);
  return job;
}

/**
 * Books for a topic.
 * Returns { status, books, topic }:
 *   'cache'   — served from a cache entry less than seven days old
 *   'fresh'   — network call succeeded and was cached
 *   'empty'   — the search returned nothing
 *   'stale'   — network failed, but an older cache entry exists
 *   'offline' — network failed and nothing is cached
 */
export async function searchBooks(topic) {
  const key = normaliseTopic(topic);
  if (!key) return { status: 'empty', books: [], topic: key };

  const cached = readCache(key);
  if (cached) return { status: 'cache', books: cached.books, topic: key };

  if (inFlight.has(key)) return inFlight.get(key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const job = paced(async () => {
    try {
      const books = await requestSearch(topic, controller.signal);
      if (!books.length) return { status: 'empty', books: [], topic: key };
      writeCache(key, books);
      return { status: 'fresh', books, topic: key };
    } catch (err) {
      // an expired entry is still better than nothing when the network is down
      const stale = readAnyCache(key);
      if (stale && stale.books.length) return { status: 'stale', books: stale.books, topic: key };
      return { status: 'offline', books: [], topic: key };
    } finally {
      clearTimeout(timer);
      inFlight.delete(key);
    }
  });

  inFlight.set(key, job);
  return job;
}

/** The cache entry regardless of age, used only as an offline fallback. */
function readAnyCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && Array.isArray(parsed.books) ? parsed : null;
  } catch (err) {
    return null;
  }
}

/** A stable id for a saved book, used to keep the saved list free of duplicates. */
export function bookId(book) { return `ol:${book.key}`; }

export const ATTRIBUTION = 'Book discovery powered by Open Library';
