/**
 * TRIDENT Daily Briefing — the dashboard's personal guide.
 *
 * One card, five sections: welcome, progress, next step, today in history,
 * today's mission. It replaces the per-lesson Ask TRIDENT panel: the model now
 * speaks once a day, on the dashboard, instead of waiting inside every lesson.
 *
 * What the model is trusted with, and what it is not:
 *
 *   trusted   the wording of five short sentences, and the choice of ONE lesson
 *             from a list this file supplies
 *   not       every number on the card. Lessons done, accuracy, streak and XP
 *             are read from local state and rendered here as figures; the
 *             server additionally refuses any sentence containing a number it
 *             did not supply.
 *
 * One briefing per calendar date per learning profile, held in localStorage.
 * Revisiting the dashboard re-renders from that copy and makes no request.
 */

import { el, clear, toast } from './ui.js';
import { icon } from './icons.js';
import * as store from './storage.js';
import * as gamify from './gamify.js';
import * as progress from './progress.js';
import * as library from './library.js';
import * as profile from './profile.js';
import { todayKey, pickDailyEvent } from './daily.js';
import { fetchEventsForDate } from './wikipedia.js';

let DATA = null;
export function init(data) { DATA = data; }

const CACHE_PREFIX = 'trident:daily-brief:';

/**
 * The shape of a cached briefing.
 *
 * 2: progress figures are class-specific. A briefing cached under 1 may quote
 * a board-wide denominator ("2 of 25"), so it is dropped on sight rather than
 * shown again. Nothing else in localStorage is touched — progress, saved items
 * and the Wikimedia and Open Library caches all stay as they are.
 */
const BRIEF_SCHEMA = 2;

/**
 * Only a briefing Gemini actually produced is ever cached, and it is cached for
 * the calendar day. A fallback card is NOT a briefing: caching one would mean a
 * ten-minute outage at breakfast costs the student their guide until midnight,
 * and would quietly present a template as though the guide had written it. So a
 * failure leaves the cache empty, the card says so, and Retry is live.
 */
const UNAVAILABLE_NOTE =
  'Personal AI briefing is temporarily unavailable. Your progress and daily activities are still available.';
const SOURCE_NOTE =
  'Generated from your progress, verified TRIDENT content and today’s Wikimedia event.';

/* ------------------------------------------------------------ profile id */

/** Stable id for the chosen path, so a different path means a different cache. */
export function profileId(state) {
  const p = profile.current(state);
  if (!p) return 'none';
  return p.mode === 'school'
    ? `school-${p.board || 'x'}-${p.classLevel || 'x'}`
    : `exam-${p.exam || 'x'}`;
}

export function cacheKey(dateKey, id) { return `${CACHE_PREFIX}${dateKey}:${id}`; }

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (!record || record.schema !== BRIEF_SCHEMA) {
      // written by an older build, against a denominator that no longer holds
      localStorage.removeItem(key);
      return null;
    }
    return record;
  } catch (err) { return null; }
}

function clearCache(key) {
  try { localStorage.removeItem(key); } catch (err) { /* nothing to undo */ }
}

function writeCache(key, value) {
  try {
    // yesterday's briefings are of no use to anyone
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX) && !k.startsWith(`${CACHE_PREFIX}${todayKey()}:`)) {
        localStorage.removeItem(k);
      }
    }
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) { /* a full or blocked store must never break the dashboard */ }
}

/** Is this record a briefing Gemini really produced? Only those are stored. */
export function isRealBriefing(brief) {
  return !!(brief && brief.available === true);
}

/* --------------------------------------------------- the figures, locally */

/**
 * Everything the card shows as a number, computed here from local state.
 * Nothing in this object is ever taken from a response.
 */
export function figures(state, today) {
  const prof = profile.current(state);
  // board AND class: a Class 7 learner is measured against Class 7
  const scope = profile.scopedLessons(prof);

  const completed = scope.filter((l) => state.completedLessons[l.id]).length;
  const acc = progress.overallAccuracy(state);
  const quest = gamify.questProgress(state, today);
  const lvl = gamify.levelProgress(state.xp || 0);

  return {
    lessonsCompleted: completed,
    lessonsAvailable: scope.length,
    quizAccuracy: acc.pct,
    quizAnswered: acc.asked,
    streak: store.effectiveStreak(state, today),
    xp: state.xp || 0,
    level: lvl.current.level,
    levelName: lvl.current.name,
    questDone: quest.done,
    questTotal: quest.total,
    questFlags: {
      story: !!(quest.tasks.find((t) => t.id === 'story') || {}).done,
      quiz: !!(quest.tasks.find((t) => t.id === 'quiz') || {}).done,
      event: !!(quest.tasks.find((t) => t.id === 'event') || {}).done
    }
  };
}

/** The three lessons the guide may choose between — titles and routes included. */
export function candidateLessons(state) {
  const unfinished = DATA.lessons.lessons.filter((l) => !state.completedLessons[l.id]);
  return profile.rank(unfinished).slice(0, 3).map((l) => ({
    id: l.id, title: l.title, route: `#/lesson/${l.id}`
  }));
}

/**
 * Exactly what leaves the browser. Written as a literal so that what is sent is
 * visible in one place: no name, no saved books, no history, no device data,
 * no file paths, no other localStorage field.
 */
export function payloadFor(state, today, event) {
  const f = figures(state, today);
  const prof = profile.current(state);
  const board = prof && prof.mode === 'school' ? profile.boardByValue(prof.board) : null;

  return {
    mode: prof ? prof.mode : 'school',
    board: board ? board.name : '',
    classLevel: prof && prof.mode === 'school' ? String(prof.classLevel || '') : '',
    pathLabel: prof ? profile.label(prof) : '',
    level: f.level,
    levelName: f.levelName,
    xp: f.xp,
    streak: f.streak,
    lessonsCompleted: f.lessonsCompleted,
    lessonsAvailable: f.lessonsAvailable,
    quizAccuracy: f.quizAccuracy,
    quizAnswered: f.quizAnswered,
    questDone: f.questDone,
    questTotal: f.questTotal,
    questFlags: f.questFlags,
    incompleteLessons: candidateLessons(state),
    event: event ? {
      title: event.title,
      year: String(event.year || ''),
      description: (event.text || '').slice(0, 240)
    } : null
  };
}

/**
 * A fingerprint of the progress that would make a new briefing worth asking
 * for. A scroll position or a saved book is not on this list.
 */
export function progressStamp(state, today) {
  const f = figures(state, today);
  return [f.lessonsCompleted, f.quizAnswered, f.quizAccuracy, f.questDone, f.streak, f.xp].join('|');
}

/* ------------------------------------------------- the deterministic card */

/** The briefing built with no model at all. Identical logic to the server's. */
export function localBrief(state, today, lessons) {
  const f = figures(state, today);
  const prof = profile.current(state);
  const first = lessons[0] || null;
  const todo = [];
  if (!f.questFlags.story) todo.push('read today’s story');
  if (!f.questFlags.quiz) todo.push('complete today’s five-question quiz');
  if (!f.questFlags.event) todo.push('explore today’s historical event');
  const last = todo.pop();

  return {
    greeting: prof && prof.mode === 'competitive'
      ? `Welcome back — ${profile.label(prof)}.`
      : `Welcome back, ${prof && prof.classLevel ? `Class ${prof.classLevel} ` : ''}Explorer.`,
    progressMessage: `You have completed ${f.lessonsCompleted} of ${f.lessonsAvailable} lessons. `
      + `Your current streak is ${f.streak} ${f.streak === 1 ? 'day' : 'days'}.`,
    recommendedLessonId: first ? first.id : null,
    recommendationReason: first ? `Continue: ${first.title}.` : 'Every lesson on your path is complete.',
    eventSignificance: null,
    mission: last
      ? `Today: ${todo.length ? `${todo.join(', ')} and ${last}` : last}.`
      : 'Today’s quest is done. Take the Timeline Challenge if you would like more.',
    encouragement: 'Your progress and daily activities are all here.',
    available: false,
    reason: 'offline',
    lessons
  };
}

/* ------------------------------------------------------------- the request */

let inFlight = null;

async function requestBrief(payload) {
  const res = await fetch('api/daily-brief', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`brief ${res.status}`);
  return res.json();
}

/**
 * Get today's briefing: from this device's copy if there is one for this date
 * and this profile, otherwise from the server, once.
 */
export async function getBrief({ force = false } = {}) {
  const state = store.load();
  const today = todayKey();
  const key = cacheKey(today, profileId(state));
  const stamp = progressStamp(state, today);

  const cached = readCache(key);
  // a cached entry only ever exists for a briefing Gemini produced
  if (cached && cached.brief && !force) {
    return { ...cached.brief, cached: true, stamp: cached.stamp, refreshUsed: !!cached.refreshUsed };
  }

  let event = null;
  try {
    const result = await fetchEventsForDate(today);
    event = pickDailyEvent(result.events || [], today);
  } catch (err) { event = null; }

  const lessons = candidateLessons(state);
  const payload = payloadFor(state, today, event);

  let brief;
  try {
    // one request at a time, whatever the dashboard does
    if (!inFlight) inFlight = requestBrief(payload).finally(() => { inFlight = null; });
    brief = await inFlight;
  } catch (err) {
    brief = localBrief(state, today, lessons);
  }

  const record = {
    schema: BRIEF_SCHEMA,
    brief: { ...brief, lessons: brief.lessons || lessons, event },
    stamp,
    // a manual refresh is spent only when it actually produced a briefing —
    // a failed one must not cost the student their one refresh of the day
    refreshUsed: (force && isRealBriefing(brief)) ? true : !!(cached && cached.refreshUsed),
    at: new Date().toISOString()
  };
  // a fallback is never written: tomorrow's cache slot stays free, and so does
  // the next visit's chance to reach the guide
  if (isRealBriefing(brief)) writeCache(key, record);
  else clearCache(key);
  return { ...record.brief, cached: false, stamp, refreshUsed: record.refreshUsed, event };
}

/* ------------------------------------------------------------------- view */

function statCell(value, label, testid) {
  return el('div', { class: 'brief-stat', 'data-testid': testid }, [
    el('b', { text: String(value) }), el('span', { text: label })
  ]);
}

function eventBlock(event, significance) {
  if (!event) {
    return el('div', { class: 'brief-event', 'data-testid': 'brief-event' }, [
      el('span', { class: 'brief-label', 'data-testid': 'brief-wikimedia-label', text: 'Live historical data from Wikimedia' }),
      el('p', { class: 'hint', text: 'Today’s event could not be fetched. Nothing is invented in its place.' })
    ]);
  }
  return el('div', { class: 'brief-event', 'data-testid': 'brief-event' }, [
    el('span', { class: 'brief-label', 'data-testid': 'brief-wikimedia-label', text: 'Live historical data from Wikimedia' }),
    el('div', { class: `brief-event-body${event.image ? ' has-image' : ''}` }, [
      event.image
        ? el('img', { class: 'brief-event-img', src: event.image, alt: '', loading: 'lazy' })
        : null,
      el('div', { class: 'stack' }, [
        el('div', { class: 'brief-event-year', 'data-testid': 'brief-event-year', text: String(event.year) }),
        el('h3', { class: 'brief-event-title', text: event.title }),
        el('p', { class: 'brief-event-text', text: event.text || '' }),
        significance
          ? el('p', { class: 'brief-significance', 'data-testid': 'brief-significance' }, [
            el('span', { class: 'brief-ai-tick', text: 'Why it matters — ' }), significance
          ])
          : null,
        el('a', {
          class: 'btn btn-ghost btn-sm', href: event.url, target: '_blank',
          rel: 'noopener noreferrer', 'data-testid': 'brief-event-link', text: 'Read on Wikipedia'
        })
      ].filter(Boolean))
    ].filter(Boolean))
  ]);
}

/** The action the student should take next, as a real route to real content. */
function nextAction(brief, state) {
  const lesson = brief.recommendedLessonId ? library.lessonById(brief.recommendedLessonId) : null;
  if (lesson) {
    return { href: `#/lesson/${lesson.id}`, label: 'Continue Lesson', title: lesson.title };
  }
  const quest = gamify.questProgress(state, todayKey());
  const quiz = quest.tasks.find((t) => t.id === 'quiz');
  if (quiz && !quiz.done) return { href: '#/quiz', label: 'Start Quiz', title: 'Today’s five questions' };
  return { href: '#/timeline', label: 'Take the Timeline Challenge', title: 'Four events, in order' };
}

/**
 * Render the card into `host`, replacing whatever is there.
 *
 * Each paint announces the briefing on `trident:brief`, so the floating
 * companion always asks about the mission and lesson now on screen.
 */
export function paint(host, brief) {
  const state = store.load();
  const today = todayKey();
  const f = figures(state, today);
  const action = nextAction(brief, state);
  const stale = brief.stamp && brief.stamp !== progressStamp(state, today);
  const canRefresh = stale && !brief.refreshUsed;

  // a fallback card always offers a live Retry: the student is looking at a
  // template, and "Up to date" would be a lie about what they are reading
  const fallback = !isRealBriefing(brief);
  const label = fallback
    ? 'Retry AI Briefing'
    : canRefresh ? 'Refresh after my progress changed' : 'Up to date';

  const refreshBtn = el('button', {
    class: `btn btn-sm brief-refresh${fallback ? ' btn-secondary' : ' btn-ghost'}`,
    type: 'button',
    'data-testid': 'brief-refresh',
    disabled: !fallback && !canRefresh,
    title: fallback
      ? 'Try the guide again — your progress and today’s activities are unaffected either way'
      : canRefresh
        ? 'Ask for a new briefing now that your progress has changed'
        : 'Already up to date with your progress — a new briefing arrives tomorrow'
  }, [icon('refresh', 15), label]);

  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = fallback ? 'Trying again…' : 'Refreshing…';
    const next = await getBrief({ force: true });
    paint(host, next);
    toast(isRealBriefing(next)
      ? 'Briefing updated.'
      : 'The guide is still unreachable. Your dashboard is unaffected.');
  });

  clear(host);
  // native append stringifies null — the list is filtered, never passed raw
  host.append(...[
    el('div', { class: 'brief-head' }, [
      el('span', { class: 'brief-badge', 'data-testid': 'brief-badge' }, [icon('compassRose', 14), 'AI DAILY GUIDE']),
      refreshBtn
    ]),

    el('h2', { class: 'brief-greeting', 'data-testid': 'brief-greeting', text: brief.greeting }),
    el('p', { class: 'brief-progress', 'data-testid': 'brief-progress', text: brief.progressMessage }),

    el('div', { class: 'brief-stats', 'data-testid': 'brief-stats' }, [
      statCell(`${f.lessonsCompleted}/${f.lessonsAvailable}`, 'Lessons done', 'brief-stat-lessons'),
      statCell(`${f.quizAccuracy}%`, 'Quiz accuracy', 'brief-stat-accuracy'),
      statCell(f.streak, f.streak === 1 ? 'Day streak' : 'Day streak', 'brief-stat-streak'),
      statCell(f.xp, 'XP earned', 'brief-stat-xp')
    ]),

    el('div', { class: 'brief-next', 'data-testid': 'brief-next' }, [
      el('div', { class: 'stack' }, [
        el('span', { class: 'brief-label', text: 'Recommended next step' }),
        el('p', { class: 'brief-reason', 'data-testid': 'brief-reason', text: brief.recommendationReason }),
        // the sub-line names the destination; it is pointless when the sentence
        // above already does (the local template says "Continue: <title>.")
        action.title && !String(brief.recommendationReason || '').includes(action.title)
          ? el('span', { class: 'hint', text: action.title })
          : null
      ].filter(Boolean)),
      el('a', {
        class: 'btn btn-primary brief-action', href: action.href, 'data-testid': 'brief-action'
      }, [icon('arrowRight', 18), action.label])
    ]),

    eventBlock(brief.event, brief.eventSignificance),

    el('div', { class: 'brief-mission', 'data-testid': 'brief-mission' }, [
      el('span', { class: 'brief-label', text: 'Today’s mission' }),
      el('p', { text: brief.mission })
    ]),

    brief.available === false
      ? el('p', { class: 'brief-degraded', 'data-testid': 'brief-degraded', text: UNAVAILABLE_NOTE })
      : null,

    el('p', { class: 'brief-note', 'data-testid': 'brief-note' }, [icon('info', 13), ` ${SOURCE_NOTE}`])
  ].filter(Boolean));

  // questions live in the floating companion now, reachable from every page —
  // the briefing itself stays a briefing, readable at a glance
  window.dispatchEvent(new CustomEvent('trident:brief', { detail: brief }));
}

/* ---------------------------------------------- Ask your Daily Guide ----- */
/* The transport and the question list live here; the panel that uses them is  */
/* js/companion.js. Nothing below writes progress, XP or localStorage.         */

export const ASK_MAX_CHARS = 200;
const ASK_HISTORY_MAX = 3;

/**
 * The student's last three questions, in memory only.
 *
 * Not localStorage, not sent anywhere: the server is given one question at a
 * time with no history at all, so nothing here can leak into a prompt. The list
 * exists purely so the student can see and re-ask what they just typed, and it
 * is gone the moment the page reloads.
 */
let askHistory = [];
export function history() { return askHistory.slice(); }
export function clearHistory() { askHistory = []; }

function remember(question) {
  askHistory = [question, ...askHistory.filter((q) => q !== question)].slice(0, ASK_HISTORY_MAX);
}

let askInFlight = false;
export function asking() { return askInFlight; }

export const GUIDE_DOWN =
  'Your Daily Guide is temporarily unavailable. Everything on the dashboard still works.';

/**
 * Put one question to the guide.
 *
 * `askInFlight` is the guard that makes a double click — or a suggestion button
 * pressed twice — one request, not two. The payload is the briefing's own
 * anonymous summary plus the question: no name, no saved items, no browser or
 * device data, and no earlier question.
 */
export async function ask(question, brief = {}) {
  const q = String(question || '').trim().slice(0, ASK_MAX_CHARS);
  if (!q) return { ok: false, message: 'Please type a question first.' };
  if (askInFlight) return { ok: false, busy: true, message: 'One question at a time, please.' };

  askInFlight = true;
  try {
    const state = store.load();
    const today = todayKey();
    const payload = {
      ...payloadFor(state, today, brief.event || null),
      question: q,
      mission: brief.mission || '',
      recommendedLessonId: brief.recommendedLessonId || null
    };

    const res = await fetch('api/daily-brief/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await res.json();
    remember(q);
    return body;
  } catch (err) {
    remember(q);
    return { ok: false, message: GUIDE_DOWN };
  } finally {
    askInFlight = false;
  }
}

/** Build the card, showing the deterministic version first so nothing waits. */
export function render(host) {
  const state = store.load();
  const today = todayKey();
  // the deterministic card is painted first and stays on screen while the guide
  // is asked; when an answer arrives it is swapped in, in place
  paint(host, { ...localBrief(state, today, candidateLessons(state)), event: null, stamp: progressStamp(state, today) });
  getBrief()
    .then((brief) => paint(host, brief))
    .catch(() => { /* the local card stays exactly as it is */ });
  return host;
}
