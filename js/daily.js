/**
 * Date-driven behaviour: which quiz, which story, which event.
 * Everything here is a pure function of the local calendar date, so the same day
 * always produces the same selection and the next day produces a different one.
 */

import { load } from './storage.js';

/** Local calendar date as YYYY-MM-DD (never UTC — the learner's own day is what counts). */
export function todayKey() {
  const sim = load().simulatedDate;
  if (sim && /^\d{4}-\d{2}-\d{2}$/.test(sim)) return sim;
  return toKey(new Date());
}

export function toKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function prettyDate(key) {
  return keyToDate(key).toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

export function monthDay(key) {
  const [, m, d] = key.split('-');
  return { month: m, day: d };
}

/** Deterministic 32-bit hash — same string in, same number out, on every machine. */
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32) so shuffles are reproducible for a given date. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(items, seed) {
  const arr = items.slice();
  const rand = seededRandom(seed);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Pick the day's quiz. Questions are grouped by type first so that a day's five
 * questions cover a spread of formats rather than five multiple-choice in a row.
 */
export function pickDailyQuestions(questions, dateKey, count = 5, prefer = null) {
  const seed = hashString(`trident-quiz-${dateKey}`);
  const byType = new Map();
  questions.forEach((q) => {
    if (!byType.has(q.type)) byType.set(q.type, []);
    byType.get(q.type).push(q);
  });

  // `prefer` reorders, it never filters: a learner whose board has only a few
  // questions still gets five, and still gets one of each format.
  const order = (pool) => {
    const shuffled = seededShuffle(pool, seed + hashString(pool[0] ? pool[0].type : 'x'));
    if (!prefer) return shuffled;
    return [...shuffled.filter(prefer), ...shuffled.filter((q) => !prefer(q))];
  };

  const typeOrder = seededShuffle([...byType.keys()], seed);
  const picked = [];
  const used = new Set();

  // one of each type first, in a date-dependent order
  typeOrder.forEach((type) => {
    if (picked.length >= count) return;
    const pool = order(byType.get(type));
    const choice = pool.find((q) => !used.has(q.id));
    if (choice) { picked.push(choice); used.add(choice.id); }
  });

  // fill any remaining slots from the whole bank
  const shuffledAll = seededShuffle(questions, seed + 7);
  const all = prefer
    ? [...shuffledAll.filter(prefer), ...shuffledAll.filter((q) => !prefer(q))]
    : shuffledAll;
  for (const q of all) {
    if (picked.length >= count) break;
    if (!used.has(q.id)) { picked.push(q); used.add(q.id); }
  }

  return seededShuffle(picked, seed + 13).slice(0, count);
}

/**
 * The day's quiz, restricted to the learner's own class when their class has
 * enough questions to fill the day, and drawn from the whole bank when it does
 * not. A Class 6 student is never handed Class 9 questions without being told.
 *
 * Returns { questions, mixed }. `mixed` is what the quiz page labels a
 * "Mixed History Challenge" — an honest statement that the day reaches beyond
 * the chosen class because the chosen class does not yet have five questions.
 */
export function dailyQuizSet(questions, dateKey, count = 5, strict = null) {
  const mine = strict ? questions.filter(strict) : questions;
  const enough = mine.length >= count;
  return {
    questions: pickDailyQuestions(enough ? mine : questions, dateKey, count, enough ? null : strict),
    mixed: !enough,
    matching: mine.length
  };
}

export function pickDailyStory(stories, dateKey, prefer = null) {
  return dailyStorySet(stories, dateKey, prefer).story;
}

/** As above, but it also reports whether the profile could be honoured. */
export function dailyStorySet(stories, dateKey, prefer = null) {
  if (!stories.length) return { story: null, mixed: false };
  const mine = prefer ? stories.filter(prefer) : stories;
  const enough = mine.length > 0;
  const pool = enough ? mine : stories;
  const idx = hashString(`trident-story-${dateKey}`) % pool.length;
  return { story: pool[idx], mixed: !!prefer && !enough };
}

/** Choose one "on this day" entry deterministically from whatever the API returned. */
export function pickDailyEvent(events, dateKey) {
  if (!events || !events.length) return null;
  const idx = hashString(`trident-event-${dateKey}`) % events.length;
  return events[idx];
}

export function lastNDateKeys(n, endKey) {
  const out = [];
  const end = keyToDate(endKey);
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    out.push(toKey(d));
  }
  return out;
}

export function daysBetween(aKey, bKey) {
  const a = keyToDate(aKey);
  const b = keyToDate(bKey);
  return Math.round((b - a) / 86400000);
}
