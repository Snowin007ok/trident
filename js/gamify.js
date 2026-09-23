/**
 * TRIDENT gamification: XP, levels, quests, badges, artefacts, eras.
 *
 * Two rules govern everything here:
 *   1. XP is only ever granted for an activity the learner genuinely finished.
 *   2. Every grant is keyed by a reward id and recorded in a ledger, so
 *      reloading, revisiting or navigating backward can never pay out twice.
 */

import * as store from './storage.js';

/* ------------------------------------------------------------------- XP --- */

export const XP_RULES = {
  lesson: 50,
  story: 30,
  quiz: 100,
  quizPerfect: 50,
  event: 20,
  timeline: 75
};

export const XP_LABELS = {
  lesson: 'Lesson completed',
  story: 'Daily Story read',
  quiz: 'Daily Quiz completed',
  quizPerfect: 'Perfect Daily Quiz',
  event: "Today's event explored",
  timeline: 'Timeline Challenge solved'
};

/** Reward ids: lesson keys on the lesson id, everything else on the date. */
export function rewardId(kind, key) {
  const map = {
    lesson: 'lesson', story: 'story', quiz: 'quiz',
    quizPerfect: 'quiz-perfect', event: 'event', timeline: 'timeline'
  };
  return `${map[kind]}:${key}`;
}

/* --------------------------------------------------------------- levels --- */

export const LEVELS = [
  { level: 1, name: 'Explorer', min: 0 },
  { level: 2, name: 'Archive Seeker', min: 250 },
  { level: 3, name: 'Chronicler', min: 500 },
  { level: 4, name: 'Time Navigator', min: 1000 },
  { level: 5, name: 'Master Historian', min: 1750 }
];

export function levelFor(xp) {
  let current = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.min) current = l;
  return current;
}

export function levelProgress(xp) {
  const current = levelFor(xp);
  const next = LEVELS.find((l) => l.min > current.min) || null;
  const floor = current.min;
  const ceiling = next ? next.min : current.min;
  const span = next ? ceiling - floor : 1;
  const into = xp - floor;
  return {
    current, next,
    percent: next ? Math.max(0, Math.min(100, (into / span) * 100)) : 100,
    xp, toNext: next ? Math.max(0, ceiling - xp) : 0,
    ceiling: next ? ceiling : xp
  };
}

/* ---------------------------------------------------------------- eras --- */

export const ERAS = [
  { id: 'origins', label: 'Origins', period: 'Before cities' },
  { id: 'ancient', label: 'Ancient India', period: 'c. 2600 BCE – 600 CE' },
  { id: 'medieval', label: 'Medieval India', period: 'c. 700 – 1700' },
  { id: 'colonial', label: 'Colonial India', period: 'c. 1750 – 1947' },
  { id: 'independence', label: 'Independence', period: 'c. 1885 onwards' }
];

/**
 * Era status from real lesson data. An era is only "complete" when every
 * indexed lesson in it is complete; an era with no indexed lessons is locked.
 */
export function eraStatus(lessons, state) {
  const done = state.completedLessons || {};
  let currentAssigned = false;
  return ERAS.map((era) => {
    const inEra = lessons.filter((l) => l.era === era.id);
    const completed = inEra.filter((l) => done[l.id]).length;
    const total = inEra.length;
    let status;
    if (total === 0) status = 'locked';
    else if (completed === total) status = 'complete';
    else if (!currentAssigned) { status = 'current'; currentAssigned = true; }
    else status = 'available';
    return { ...era, total, completed, status };
  });
}

/* -------------------------------------------------------------- badges --- */

export const BADGES = [
  {
    id: 'first-step', name: 'First Step',
    requirement: 'Complete one lesson.',
    test: (s) => Object.keys(s.completedLessons || {}).length >= 1
  },
  {
    id: 'timekeeper', name: 'Timekeeper',
    requirement: 'Complete a Daily Quiz with the timer running.',
    test: (s) => Object.values(s.dailyQuizByDate || {}).some((r) => r.timerUsed)
  },
  {
    id: 'perfect-recall', name: 'Perfect Recall',
    requirement: 'Score 5 out of 5 on a Daily Quiz.',
    test: (s) => Object.values(s.dailyQuizByDate || {}).some((r) => r.total > 0 && r.score === r.total)
  },
  {
    id: 'three-day-flame', name: 'Three-Day Flame',
    requirement: 'Reach a three-day streak.',
    test: (s) => (s.streak && s.streak.best >= 3)
  },
  {
    id: 'ancient-explorer', name: 'Ancient Explorer',
    requirement: 'Complete three Ancient India lessons.',
    test: (s, ctx) => (ctx.lessons || []).filter((l) => l.era === 'ancient' && s.completedLessons[l.id]).length >= 3
  },
  {
    id: 'story-keeper', name: 'Story Keeper',
    requirement: 'Save three Daily Stories.',
    test: (s) => (s.savedStories || []).length >= 3
  }
];

/* ----------------------------------------------------------- artefacts --- */
/* Each artefact is earned by one badge, so nothing can appear unearned.     */

export const ARTEFACTS = [
  { id: 'inscription', name: 'Stone Inscription', badge: 'first-step',
    note: 'A carved slab, the oldest kind of record a historian can read directly.' },
  { id: 'instrument', name: 'Navigation Instrument', badge: 'timekeeper',
    note: 'A dial for reckoning position and time.' },
  { id: 'seal', name: 'Historical Seal', badge: 'perfect-recall',
    note: 'A stamp pressed into clay or wax to authenticate a document.' },
  { id: 'monument', name: 'Monument Fragment', badge: 'three-day-flame',
    note: 'A piece of worked stone from a standing structure.' },
  { id: 'coin', name: 'Ancient Coin', badge: 'ancient-explorer',
    note: 'Struck metal currency — among the most datable objects an excavation yields.' },
  { id: 'manuscript', name: 'Palm-Leaf Manuscript', badge: 'story-keeper',
    note: 'Text incised on prepared palm leaf and bound between boards.' }
];

export const ARTEFACT_DISCLAIMER =
  'These are original abstract drawings made for TRIDENT. They illustrate a category of object and are not reproductions of any particular historical artefact.';

/* ------------------------------------------------------------ the quest --- */

export function questTasks(state, dateKey) {
  return [
    {
      id: 'story', title: 'Read the Daily Story', icon: 'story',
      xp: XP_RULES.story, href: '#/story',
      sub: 'A cited retelling drawn from a verified passage.',
      done: store.hasReward(rewardId('story', dateKey))
    },
    {
      id: 'quiz', title: 'Complete the Daily Quiz', icon: 'quiz',
      xp: XP_RULES.quiz, href: '#/quiz',
      sub: 'Five questions, one per format.',
      done: !!(state.dailyQuizByDate || {})[dateKey]
    },
    {
      id: 'event', title: "Explore Today's Event", icon: 'event',
      xp: XP_RULES.event, href: '#/event',
      sub: 'From the Wikimedia "On this day" feed.',
      done: store.hasReward(rewardId('event', dateKey))
    }
  ];
}

export function questProgress(state, dateKey) {
  const tasks = questTasks(state, dateKey);
  return { tasks, done: tasks.filter((t) => t.done).length, total: tasks.length };
}

/* ------------------------------------------------------- awarding logic --- */

let announcer = null;
/** app.js hands us a function that shows a toast and writes to a live region. */
export function setAnnouncer(fn) { announcer = fn; }

function announce(message, kind) {
  if (announcer) announcer(message, kind);
}

/**
 * Grant XP for an activity, then re-check every badge and artefact.
 * Returns { xp, badges: [...], artefacts: [...] } describing what was new.
 */
export function award(kind, key, ctx = {}) {
  const id = rewardId(kind, key);
  const amount = XP_RULES[kind] || 0;
  const before = store.load().xp || 0;
  const granted = store.grantReward(id, amount);

  if (granted > 0) {
    const after = store.load().xp || 0;
    const lvlBefore = levelFor(before);
    const lvlAfter = levelFor(after);
    announce(`${XP_LABELS[kind] || 'Activity complete'}: plus ${granted} XP. Total ${after} XP.`, 'xp');
    if (lvlAfter.level > lvlBefore.level) {
      announce(`Level up. You are now level ${lvlAfter.level}, ${lvlAfter.name}.`, 'badge');
    }
  }

  const unlocked = checkUnlocks(ctx);
  return { xp: granted, ...unlocked };
}

/** Re-evaluate badges and artefacts against real state. Safe to call anytime. */
export function checkUnlocks(ctx = {}) {
  const state = store.load();
  const newBadges = [];
  const newArtefacts = [];

  BADGES.forEach((b) => {
    if (state.badges[b.id]) return;
    let earned = false;
    try { earned = !!b.test(state, ctx); } catch (err) { earned = false; }
    if (earned && store.unlockBadge(b.id)) {
      newBadges.push(b);
      announce(`Badge unlocked: ${b.name}. ${b.requirement}`, 'badge');
    }
  });

  const after = store.load();
  ARTEFACTS.forEach((a) => {
    if (after.artefacts[a.id]) return;
    if (after.badges[a.badge] && store.unlockArtefact(a.id)) {
      newArtefacts.push(a);
      announce(`Artefact recovered: ${a.name}.`, 'badge');
    }
  });

  return { badges: newBadges, artefacts: newArtefacts };
}

/**
 * The nearest badge still to be earned, in the order they were designed to
 * fall. Home shows this one so the first achievement always looks reachable
 * rather than presenting a wall of locks.
 */
export function nextReward(state) {
  return BADGES.find((b) => !state.badges[b.id]) || null;
}

export function earnedBadges(state) {
  return BADGES.map((b) => ({ ...b, earnedAt: state.badges[b.id] || null }));
}

export function collectedArtefacts(state) {
  return ARTEFACTS.map((a) => ({
    ...a,
    unlockedAt: state.artefacts[a.id] || null,
    badgeName: (BADGES.find((b) => b.id === a.badge) || {}).name || a.badge,
    requirement: (BADGES.find((b) => b.id === a.badge) || {}).requirement || ''
  }));
}
