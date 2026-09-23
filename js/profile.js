/**
 * The learner's profile — which board and class, or which examination, they are
 * preparing for — and the personalisation that follows from it.
 *
 * Two rules govern this module:
 *   1. The profile changes what is shown FIRST. It never hides content. Every
 *      lesson, saved item and past result stays reachable.
 *   2. Nothing here writes progress. It only reads the profile and ranks things.
 */

import * as store from './storage.js';

let DATA = null;
export function init(data) { DATA = data; }

/* ------------------------------------------------------------ vocabulary */

/** The stored board value ↔ the path id used throughout the shipped data. */
export const BOARDS = [
  { value: 'tamil_nadu_state_board', pathId: 'tn', name: 'Tamil Nadu State Board', short: 'TN State Board' },
  { value: 'cbse', pathId: 'cbse', name: 'CBSE', short: 'CBSE' }
];

export const EXAMS = [
  {
    value: 'tnpsc', pathId: 'tnpsc', name: 'TNPSC', short: 'TNPSC',
    status: 'beta', statusLabel: 'Beta',
    note: 'Practice drawn only from manually reviewed State Board and CBSE passages. The Tamil TNPSC study materials are not indexed — their embedded text failed verification.'
  },
  {
    value: 'upsc', pathId: null, name: 'UPSC', short: 'UPSC',
    status: 'coming_soon', statusLabel: 'Coming Soon',
    note: 'UPSC will become available after verified syllabus sources and questions are added.'
  }
];

export function boardByValue(v) { return BOARDS.find((b) => b.value === v) || null; }
export function examByValue(v) { return EXAMS.find((e) => e.value === v) || null; }

/* ------------------------------------------------------------- the profile */

export function current(state) {
  const s = state || store.load();
  const p = s.learningProfile;
  if (!p || (p.mode !== 'school' && p.mode !== 'competitive')) return null;
  return p;
}

/** Is the stored profile still something this build can honour? */
export function isValid(p) {
  if (!p) return false;
  if (p.mode === 'school') {
    const board = boardByValue(p.board);
    if (!board || !p.classLevel) return false;
    return lessonsFor({ path: board.pathId, classLevel: p.classLevel }).length > 0;
  }
  if (p.mode === 'competitive') {
    const exam = examByValue(p.exam);
    return !!(exam && exam.status === 'beta');
  }
  return false;
}

/** The path id ('tn' | 'cbse' | 'tnpsc') the profile points at, or null. */
export function pathId(p) {
  const prof = p === undefined ? current() : p;
  if (!prof) return null;
  if (prof.mode === 'school') {
    const b = boardByValue(prof.board);
    return b ? b.pathId : null;
  }
  const e = examByValue(prof.exam);
  return e ? e.pathId : null;
}

export function classLevel(p) {
  const prof = p === undefined ? current() : p;
  return prof && prof.mode === 'school' ? prof.classLevel : null;
}

/** "CBSE • Class 10" · "TN State Board • Class 8" · "TNPSC • Beta" */
export function label(p) {
  const prof = p === undefined ? current() : p;
  if (!prof) return 'No learning path chosen';
  if (prof.mode === 'school') {
    const b = boardByValue(prof.board);
    return `${b ? b.short : 'Board'} • Class ${prof.classLevel}`;
  }
  const e = examByValue(prof.exam);
  return `${e ? e.short : 'Examination'} • ${e ? e.statusLabel : ''}`.trim();
}

/** The two-line form used on the Settings page. */
export function describe(p) {
  const prof = p === undefined ? current() : p;
  if (!prof) return { goal: 'Not chosen yet', detail: 'Choose a board and class, or an examination.' };
  if (prof.mode === 'school') {
    const b = boardByValue(prof.board);
    return { goal: 'School Education', detail: `${b ? b.name : 'Board'} • Class ${prof.classLevel}` };
  }
  const e = examByValue(prof.exam);
  return { goal: 'Competitive Examination', detail: `${e ? e.name : 'Examination'} • ${e ? e.statusLabel : ''}`.trim() };
}

/* --------------------------------------------------- what the data contains */

export function lessonsFor({ path, classLevel: cls }) {
  if (!DATA) return [];
  return DATA.lessons.lessons.filter((l) => (!path || l.path === path) && (!cls || l.classLevel === cls));
}

/**
 * Classes offered for a board, built from the shipped data rather than a fixed
 * list: a class appears when the board has books or lessons for it, and class 11
 * is always shown so its "Content coming soon" state is visible and honest.
 */
export function classesForBoard(boardValue) {
  const board = boardByValue(boardValue);
  if (!board || !DATA) return [];
  const withBooks = new Set(
    DATA.library.books.filter((b) => b.path === board.pathId).map((b) => b.classLevel)
  );
  const withLessons = new Set(lessonsFor({ path: board.pathId }).map((l) => l.classLevel));
  const availability = DATA.library.classAvailability || {};
  const levels = [...new Set([...withBooks, ...withLessons, '11'])]
    .filter(Boolean)
    .sort((a, b) => Number(a) - Number(b));

  return levels.map((cls) => {
    const count = lessonsFor({ path: board.pathId, classLevel: cls }).length;
    const state = (availability[cls] || {}).state || 'available';
    const label9 = (availability[cls] || {}).label || '';
    let note = `${count} lesson${count === 1 ? '' : 's'}`;
    let disabledReason = null;
    if (count === 0) {
      if (state === 'coming_soon') { note = label9 || 'Content coming soon'; disabledReason = 'No verified lessons are indexed for this class yet.'; }
      else {
        note = 'Lessons coming soon';
        disabledReason = 'Verified source material is available, but prepared lessons for this class are coming soon.';
      }
    } else if (state === 'limited') {
      note = `${count} lesson${count === 1 ? '' : 's'} · ${label9 || 'Limited coverage'}`;
    }
    return { classLevel: cls, count, state, note, selectable: count > 0, disabledReason };
  });
}

/* ------------------------------------------------------------ ranking ----- */
/* Everything below reorders. Nothing below filters anything out of reach.    */

function matchScore(item, prof) {
  if (!prof) return 0;
  const wantPath = pathId(prof);
  const wantClass = classLevel(prof);
  let score = 0;
  if (wantPath && item.path === wantPath) score += 2;
  if (wantClass && item.classLevel === wantClass) score += 1;
  // the TNPSC beta draws on verified State Board and CBSE material by design
  if (wantPath === 'tnpsc' && (item.path === 'tn' || item.path === 'cbse')) score += 1;
  return score;
}

export function matches(item, p) {
  return matchScore(item, p === undefined ? current() : p) > 0;
}

/** Stable, highest-match-first ordering. Ties keep their original order. */
export function rank(items, p) {
  const prof = p === undefined ? current() : p;
  if (!prof) return items.slice();
  return items
    .map((item, i) => ({ item, i, score: matchScore(item, prof) }))
    .sort((a, b) => (b.score - a.score) || (a.i - b.i))
    .map((x) => x.item);
}

/** Stories carry a path but no class, so they are preferred by path alone. */
export function preferStoryFn(p) {
  const prof = p === undefined ? current() : p;
  if (!prof) return null;
  const want = pathId(prof);
  if (!want) return null;
  return (story) => (want === 'tnpsc'
    ? (story.path === 'tn' || story.path === 'cbse')
    : story.path === want);
}

/**
 * The learner's own class exactly — board AND class, not board alone.
 *
 * `preferFn` reorders a mixed bank; this one decides what a Class 6 student is
 * entitled to see as "their" content. Where a class has too little of it, the
 * caller widens the pool and labels the result, rather than quietly serving
 * another class's material as though it were theirs.
 */
export function strictFn(p) {
  const prof = p === undefined ? current() : p;
  if (!prof) return null;
  if (prof.mode === 'competitive') {
    // the TNPSC beta is built from verified State Board and CBSE passages by
    // design, so for it "own content" means exactly those two paths
    const want = pathId(prof);
    if (want !== 'tnpsc') return null;
    return (item) => item.path === 'tn' || item.path === 'cbse';
  }
  const wantPath = pathId(prof);
  const wantClass = classLevel(prof);
  if (!wantPath || !wantClass) return null;
  return (item) => item.path === wantPath && item.classLevel === wantClass;
}

/**
 * The lessons that belong to the learner's own class — board AND class.
 *
 * This is the denominator a learner is shown: a Class 7 student is measured
 * against Class 7, not against every class their board offers. Only the
 * Library's board overview counts wider than this.
 *
 * It falls back to the whole library when a profile's own class has nothing,
 * so a figure is never divided by zero.
 */
export function scopedLessons(p) {
  const all = DATA ? DATA.lessons.lessons : [];
  const strict = strictFn(p === undefined ? current() : p);
  if (!strict) return all;
  const mine = all.filter(strict);
  return mine.length ? mine : all;
}

/** A predicate the daily pickers use to prefer, never to restrict. */
export function preferFn(p) {
  const prof = p === undefined ? current() : p;
  if (!prof) return null;
  return (item) => matchScore(item, prof) > 0;
}

/** The path a cited book belongs to, used to prefer timeline events. */
export function pathOfBook(bookTitle) {
  if (!DATA || !bookTitle) return null;
  const book = DATA.library.books.find((b) => b.title === bookTitle);
  return book ? book.path : null;
}

export function preferTimelineFn(p) {
  const prof = p === undefined ? current() : p;
  if (!prof) return null;
  const want = pathId(prof);
  if (!want) return null;
  return (event) => {
    const path = pathOfBook(event.citation && event.citation.book);
    if (!path) return false;
    if (want === 'tnpsc') return path === 'tn' || path === 'cbse';
    return path === want;
  };
}

/** One short line explaining what the learner is being shown, and why. */
export function personalisedNote(p) {
  const prof = p === undefined ? current() : p;
  if (!prof) return null;
  if (prof.mode === 'competitive') {
    return 'Ordered for your TNPSC preparation. Everything else in the library is still open to you.';
  }
  const b = boardByValue(prof.board);
  return `Ordered for ${b ? b.name : 'your board'}, class ${prof.classLevel}. Everything else in the library is still open to you.`;
}
