/**
 * TRIDENT Daily Briefing — the server side.
 *
 *   validate what the browser sent → ask Gemini for prose only →
 *   check every claim it made → answer, or fall back to a local template.
 *
 * Three rules shape this file.
 *
 * 1. Gemini never supplies a number. Progress figures are computed in the
 *    browser from local state and rendered there; the model is given them only
 *    so the sentence reads naturally, and any figure it returns that was not
 *    supplied is treated as invented and the sentence is discarded.
 * 2. Gemini never supplies a lesson. It may only name an id the server itself
 *    put in the prompt, and the title and route shown to the student are the
 *    server's own, never the browser's or the model's.
 * 3. Nothing here needs a key. With GEMINI_API_KEY absent the deterministic
 *    briefing is built and returned, and the dashboard is unaffected.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { LIMITS, BRIEF_LIMITS, hasApiKey } from './config.js';
import { generateBrief, generateGuideAnswer, isRetryable } from './gemini.js';

const APP_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/* ------------------------------------------------------------ lesson index */

let lessonIndex = null;

/**
 * The trusted lesson table. The browser's idea of a lesson's title or route is
 * never used — only its id, and only to look the real thing up here.
 */
export async function lessons() {
  if (!lessonIndex) {
    const raw = JSON.parse(await readFile(join(APP_ROOT, 'data', 'lessons.json'), 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw.lessons || []);
    lessonIndex = new Map(list.map((l) => [l.id, {
      id: l.id,
      title: l.title,
      topic: l.topic || '',
      classLevel: l.classLevel || '',
      path: l.path || '',
      route: `#/lesson/${l.id}`
    }]));
  }
  return lessonIndex;
}

export function resetLessonIndex() { lessonIndex = null; }

/* -------------------------------------------------------------- validation */

const MODES = new Set(['school', 'competitive']);

function text(value, max) {
  if (typeof value !== 'string') return '';
  // control characters out, whitespace collapsed, then cut to length
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function count(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), max);
}

function percent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Reduce whatever arrived to exactly the fields this feature accepts.
 *
 * Returns { ok: true, input } or { ok: false, error, message }. Unknown keys
 * are not reported — they are simply never read.
 */
export async function validateInput(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'bad-request', message: 'The briefing request could not be read.' };
  }

  const mode = MODES.has(payload.mode) ? payload.mode : null;
  if (!mode) {
    return { ok: false, error: 'bad-request', message: 'No learning path was supplied.' };
  }

  const index = await lessons();
  const incomplete = [];
  const seen = new Set();
  for (const item of Array.isArray(payload.incompleteLessons) ? payload.incompleteLessons : []) {
    if (incomplete.length >= BRIEF_LIMITS.maxLessons) break;
    const id = typeof item === 'string' ? item : (item && item.id);
    if (typeof id !== 'string' || seen.has(id)) continue;
    // an id the shipped lesson table does not contain is dropped, and with it
    // any title or route the browser tried to attach to it
    const real = index.get(id);
    if (!real) continue;
    seen.add(id);
    incomplete.push(real);
  }

  const evt = payload.event && typeof payload.event === 'object' ? payload.event : null;
  const event = evt && text(evt.title, BRIEF_LIMITS.maxTitleChars)
    ? {
      title: text(evt.title, BRIEF_LIMITS.maxTitleChars),
      year: text(String(evt.year == null ? '' : evt.year), 12),
      description: text(evt.description, BRIEF_LIMITS.maxTextChars)
    }
    : null;

  return {
    ok: true,
    input: {
      mode,
      board: text(payload.board, 60),
      classLevel: text(payload.classLevel, 8),
      pathLabel: text(payload.pathLabel, 60),
      level: count(payload.level, BRIEF_LIMITS.maxLevel),
      levelName: text(payload.levelName, 60),
      xp: count(payload.xp, BRIEF_LIMITS.maxXp),
      streak: count(payload.streak, BRIEF_LIMITS.maxStreak),
      lessonsCompleted: count(payload.lessonsCompleted, BRIEF_LIMITS.maxLessonCount),
      lessonsAvailable: count(payload.lessonsAvailable, BRIEF_LIMITS.maxLessonCount),
      quizAccuracy: percent(payload.quizAccuracy),
      quizAnswered: count(payload.quizAnswered, BRIEF_LIMITS.maxLessonCount),
      questDone: count(payload.questDone, 10),
      questTotal: count(payload.questTotal, 10),
      questFlags: {
        story: payload.questFlags ? !!payload.questFlags.story : false,
        quiz: payload.questFlags ? !!payload.questFlags.quiz : false,
        event: payload.questFlags ? !!payload.questFlags.event : false
      },
      incompleteLessons: incomplete,
      event
    }
  };
}

/* ---------------------------------------------------- the local fall-back */

function pathPhrase(input) {
  if (input.mode === 'competitive') return input.pathLabel || 'your examination';
  const cls = input.classLevel ? `Class ${input.classLevel}` : 'your class';
  return input.board ? `${input.board}, ${cls}` : cls;
}

function missionFor(input) {
  const todo = [];
  if (!input.questFlags.story) todo.push('read today’s story');
  if (!input.questFlags.quiz) todo.push('complete today’s five-question quiz');
  if (!input.questFlags.event) todo.push('explore today’s historical event');
  if (!todo.length) return 'Today’s quest is done. Take the Timeline Challenge if you would like more.';
  const last = todo.pop();
  return `Today: ${todo.length ? `${todo.join(', ')} and ${last}` : last}.`;
}

/**
 * The briefing the dashboard shows when Gemini is absent, out of quota or
 * simply wrong. Every sentence is a template filled from figures the browser
 * computed, so it is always true and always available.
 */
export function localBrief(input) {
  const first = input.incompleteLessons[0] || null;
  return {
    greeting: input.mode === 'competitive'
      ? `Welcome back — ${pathPhrase(input)}.`
      : `Welcome back, ${input.classLevel ? `Class ${input.classLevel} ` : ''}Explorer.`,
    progressMessage: `You have completed ${input.lessonsCompleted} of ${input.lessonsAvailable} lessons. `
      + `Your current streak is ${input.streak} ${input.streak === 1 ? 'day' : 'days'}.`,
    recommendedLessonId: first ? first.id : null,
    recommendationReason: first ? `Continue: ${first.title}.` : 'Every lesson on your path is complete.',
    eventSignificance: null,
    mission: missionFor(input),
    encouragement: 'Your progress and daily activities are all here.',
    source: 'local'
  };
}

/* --------------------------------------------------- checking what came back */

/**
 * Every number the model is allowed to have seen. A figure outside this set in
 * a sentence about progress means the model did arithmetic of its own, and the
 * sentence is thrown away rather than shown to a student.
 */
function suppliedNumbers(input) {
  const ok = new Set([
    input.level, input.xp, input.streak, input.lessonsCompleted,
    input.lessonsAvailable, input.quizAccuracy, input.quizAnswered,
    input.questDone, input.questTotal
  ].map(Number));
  if (input.classLevel) ok.add(Number(input.classLevel));
  if (input.event && input.event.year) ok.add(Number(String(input.event.year).replace(/[^0-9]/g, '')));
  ok.add(5); // the daily quiz is always five questions
  return ok;
}

export function inventsNumbers(str, allowed) {
  const found = String(str || '').match(/\d[\d,]*/g) || [];
  return found.some((raw) => !allowed.has(Number(raw.replace(/,/g, ''))));
}

/**
 * Keep only what the model is permitted to decide: the wording, and a choice
 * among lesson ids the server supplied. Anything else falls back.
 */
export function validateBrief(raw, input) {
  const local = localBrief(input);
  const allowedIds = new Set(input.incompleteLessons.map((l) => l.id));
  const numbers = suppliedNumbers(input);
  const out = { ...local, source: 'gemini' };

  const keep = (value, max, fallback) => {
    const t = text(value, max);
    return t || fallback;
  };

  out.greeting = keep(raw && raw.greeting, BRIEF_LIMITS.maxTextChars, local.greeting);

  const progress = text(raw && raw.progressMessage, BRIEF_LIMITS.maxTextChars);
  out.progressMessage = progress && !inventsNumbers(progress, numbers) ? progress : local.progressMessage;

  const claimed = typeof (raw && raw.recommendedLessonId) === 'string' ? raw.recommendedLessonId : null;
  out.recommendedLessonId = claimed && allowedIds.has(claimed) ? claimed : local.recommendedLessonId;

  const reason = text(raw && raw.recommendationReason, BRIEF_LIMITS.maxTextChars);
  out.recommendationReason = reason && !inventsNumbers(reason, numbers)
    ? reason : local.recommendationReason;

  const sig = text(raw && raw.eventSignificance, BRIEF_LIMITS.maxTextChars);
  // two sentences at most, and only when there is a real event to explain
  out.eventSignificance = input.event && sig && !inventsNumbers(sig, numbers)
    ? sig.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ')
    : null;

  const mission = text(raw && raw.mission, BRIEF_LIMITS.maxTextChars);
  out.mission = mission && !inventsNumbers(mission, numbers) ? mission : local.mission;

  out.encouragement = keep(raw && raw.encouragement, BRIEF_LIMITS.maxTextChars, local.encouragement);

  return out;
}

/* ------------------------------------------------------------------ cache */

const cache = new Map();

export function cacheKeyFor(input) {
  return JSON.stringify([
    input.mode, input.board, input.classLevel, input.level, input.xp, input.streak,
    input.lessonsCompleted, input.lessonsAvailable, input.quizAccuracy,
    input.questDone, input.incompleteLessons.map((l) => l.id).join(','),
    input.event ? `${input.event.year}:${input.event.title}` : ''
  ]);
}

export function clearCache() { cache.clear(); }

/* ------------------------------------------------------------------ brief */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Produce a briefing. Never throws for an expected failure: a missing key, an
 * exhausted quota or a busy model all return a deterministic briefing with
 * `available: false`, which is what the dashboard is built to show.
 */
export async function brief(payload, deps = {}) {
  const checked = await validateInput(payload);
  if (!checked.ok) {
    return { status: 400, body: { error: checked.error, message: checked.message } };
  }
  const input = checked.input;
  const lessonsForClient = input.incompleteLessons;

  const respond = (body) => ({
    status: 200,
    body: { ...body, lessons: lessonsForClient }
  });

  if (!hasApiKey()) {
    return respond({ ...localBrief(input), available: false, reason: 'unconfigured' });
  }

  const key = cacheKeyFor(input);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < LIMITS.cacheTtlMs) {
    return respond({ ...hit.value, cached: true, available: true });
  }

  const run = deps.generateBrief || generateBrief;
  let attempt = 0;
  for (;;) {
    try {
      const raw = await run(input);
      const value = validateBrief(raw, input);
      if (cache.size >= LIMITS.cacheMaxEntries) cache.delete(cache.keys().next().value);
      cache.set(key, { value, at: Date.now() });
      return respond({ ...value, available: true });
    } catch (err) {
      const kind = (err && err.kind) || 'unavailable';
      if (isRetryable(kind) && attempt === 0) {
        attempt += 1;
        await sleep(LIMITS.retryDelayMs);
        continue;
      }
      // the provider's own words never reach the browser
      return respond({ ...localBrief(input), available: false, reason: kind });
    }
  }
}


/* ------------------------------------------------ Ask your Daily Guide ---- */

const OUT_OF_SCOPE =
  'Your Daily Guide only covers what is on this dashboard: your progress, today’s mission, '
  + 'the lesson it recommends, and today’s Wikimedia event. Ask about one of those, or open a '
  + 'lesson for the history itself.';

const GUIDE_UNAVAILABLE =
  'Your Daily Guide is temporarily unavailable. Everything on the dashboard still works.';

/**
 * One question from the dashboard.
 *
 * Three things are checked before an answer is shown: the model must say the
 * question was in scope, the answer must contain no figure the server did not
 * supply, and there must be an answer at all. Anything else becomes a plain
 * sentence — never a provider error, never a guess.
 */
export async function askGuide(payload, deps = {}) {
  const question = text(payload && payload.question, LIMITS.askMaxQuestionChars);
  if (!question) {
    return { status: 400, body: { error: 'bad-request', message: 'Please type a question first.' } };
  }

  const checked = await validateInput(payload);
  if (!checked.ok) {
    return { status: 400, body: { error: checked.error, message: checked.message } };
  }
  const input = checked.input;

  if (!hasApiKey()) {
    return { status: 200, body: { ok: false, reason: 'unconfigured', message: GUIDE_UNAVAILABLE } };
  }

  // the briefing the student is looking at, so the guide answers about THAT
  // mission and THAT lesson rather than reasoning its own up
  const brief = {
    mission: text(payload.mission, BRIEF_LIMITS.maxTextChars),
    recommendedLessonId: input.incompleteLessons.some((l) => l.id === payload.recommendedLessonId)
      ? payload.recommendedLessonId : null
  };

  const run = deps.generateGuideAnswer || generateGuideAnswer;
  try {
    const raw = await run(input, question, brief);
    const answer = text(raw && raw.answer, 600);

    if (raw && raw.inScope === false) {
      return { status: 200, body: { ok: true, inScope: false, message: OUT_OF_SCOPE } };
    }
    if (!answer) {
      return { status: 200, body: { ok: false, reason: 'empty', message: GUIDE_UNAVAILABLE } };
    }
    if (inventsNumbers(answer, suppliedNumbers(input))) {
      // a figure the server never supplied means the guide did arithmetic of
      // its own; the student is told nothing rather than something invented
      return { status: 200, body: { ok: false, reason: 'unverified', message: GUIDE_UNAVAILABLE } };
    }
    return { status: 200, body: { ok: true, inScope: true, answer } };
  } catch (err) {
    return {
      status: 200,
      body: { ok: false, reason: (err && err.kind) || 'unavailable', message: GUIDE_UNAVAILABLE }
    };
  }
}
