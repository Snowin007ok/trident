/**
 * TRIDENT local storage module.
 * Every read and write of persistent state goes through here so the shape stays
 * in one place and can be migrated when the schema version changes.
 *
 * Schema history
 *   v1 — lessons, saves, quizzes, streak, theme
 *   v2 — adds the gamification layer: xp, awardedRewards, badges, artefacts,
 *        timelineResults, selectedEra. v1 data is carried across untouched and
 *        XP is back-credited for activity v1 already recorded (see migrate()).
 *   v3 — presentation only. The interface default changed from the dark navy
 *        theme to the bright heritage theme, so the stored theme preference is
 *        re-pointed at the new default once. Nothing else is touched: every
 *        lesson, quiz, streak, saved item, badge, artefact, reward id and XP
 *        total carries across exactly as it was.
 *   v4 — adds learningProfile (board / class or examination). Existing users
 *        arrive with it null, which sends them through onboarding once. No
 *        progress is added, removed or re-credited by this migration.
 *   v5 — adds savedBooks, the learner's own shelf of Open Library suggestions.
 *        It starts empty and is entirely separate from savedLessons: a book is
 *        a recommendation, never verified syllabus content, and saving one
 *        grants no XP.
 *   v6 — adds savedImages, the Visual Archive. It starts empty, carries each
 *        image's own source information with it, and grants no XP. No other
 *        field is read or written by this migration.
 */

const KEY = 'trident.state';
export const SCHEMA_VERSION = 6;

function blankState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: { mode: null, name: 'Learner', createdAt: null },
    selectedPath: null,
    theme: 'light',
    completedLessons: {},      // lessonId -> ISO timestamp
    readingPositions: {},      // lessonId -> { scroll, at }
    savedLessons: [],          // lessonId[]
    savedEvents: [],           // { id, date, year, title, ... }[]
    savedStories: [],          // storyId[]
    quizAttempts: [],          // { id, date, kind, score, total, timerUsed, answers[] }
    dailyQuizByDate: {},       // 'YYYY-MM-DD' -> { completedAt, score, total, timedOut, timerUsed, answers }
    streak: { current: 0, best: 0, lastDate: null },
    lastActivityDate: null,
    activeSeconds: 0,
    simulatedDate: null,

    /* ---- v2: gamification ---- */
    xp: 0,
    awardedRewards: {},        // rewardId -> { xp, at }  (the idempotence ledger)
    badges: {},                // badgeId -> ISO timestamp
    artefacts: {},             // artefactId -> ISO timestamp
    timelineResults: {},       // 'YYYY-MM-DD' -> { solved, attempts, at }
    selectedEra: null,
    migratedFrom: null,

    /* ---- v4: which board / class or examination the learner is preparing for.
       null means the learner has not chosen yet and is sent through onboarding. */
    learningProfile: null,     // { mode, board, classLevel, exam, examStage, createdAt, updatedAt }

    /* ---- v5: Open Library suggestions the learner chose to keep ---- */
    savedBooks: [],            // { id, key, title, authors[], year, cover, url, topic, savedAt }[]

    /* ---- v6: the Visual Archive — historical images the learner kept, each
       stored with the source information it was shown with ---- */
    savedImages: []            // { id, title, caption, alt, url, sourceType, credit, sourcePage, licence, licenceUrl }[]
  };
}

let cache = null;
const listeners = new Set();

/**
 * Bring any older saved state onto the current shape without losing anything.
 * v1 recorded completed lessons and daily quizzes but had no XP. Those
 * activities genuinely happened, so migration credits them once and records the
 * reward ids, which keeps them from ever being credited again.
 */
function migrate(raw) {
  if (!raw || typeof raw !== 'object') return blankState();
  const base = blankState();
  const s = { ...base, ...raw };
  // nested objects must be merged, not replaced wholesale
  s.profile = { ...base.profile, ...(raw.profile || {}) };
  s.streak = { ...base.streak, ...(raw.streak || {}) };

  const from = raw.schemaVersion;
  if (from === SCHEMA_VERSION) return s;

  s.schemaVersion = SCHEMA_VERSION;
  s.migratedFrom = from ?? 'unversioned';
  s.awardedRewards = { ...(raw.awardedRewards || {}) };
  s.badges = { ...(raw.badges || {}) };
  s.artefacts = { ...(raw.artefacts || {}) };
  s.timelineResults = { ...(raw.timelineResults || {}) };

  // v2 -> v3: the interface default is now the bright heritage theme. A stored
  // 'dark' from the old default is re-pointed once; the toggle still works and
  // no other field is touched.
  if ((from === undefined || from === null || from < 3) && raw.theme === 'dark') {
    s.theme = 'light';
  }

  // v3 -> v4: no profile yet. It stays null so the learner is asked once; every
  // other field, including all progress, is carried across untouched.
  if (!s.learningProfile || typeof s.learningProfile !== 'object') s.learningProfile = null;

  // v4 -> v5: an empty book shelf. Nothing else is touched.
  if (!Array.isArray(s.savedBooks)) s.savedBooks = [];

  // v5 -> v6: an empty Visual Archive. Nothing else is touched.
  if (!Array.isArray(s.savedImages)) s.savedImages = [];

  if (typeof raw.xp !== 'number') {
    let xp = 0;
    const credit = (id, amount, at) => {
      if (s.awardedRewards[id]) return;
      s.awardedRewards[id] = { xp: amount, at: at || new Date().toISOString(), backfilled: true };
      xp += amount;
    };
    Object.entries(raw.completedLessons || {}).forEach(([lessonId, at]) => {
      credit(`lesson:${lessonId}`, 50, at);
    });
    Object.entries(raw.dailyQuizByDate || {}).forEach(([date, rec]) => {
      credit(`quiz:${date}`, 100, rec.completedAt);
      if (rec.total && rec.score === rec.total) credit(`quiz-perfect:${date}`, 50, rec.completedAt);
    });
    s.xp = xp;
  }
  return s;
}

export function load() {
  if (cache) return cache;
  let parsed = null;
  try {
    const raw = localStorage.getItem(KEY);
    parsed = raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('TRIDENT: could not read saved progress, starting fresh.', err);
  }
  const migrated = migrate(parsed);
  cache = migrated;
  // persist the migration so it happens once, not on every load
  if (parsed && parsed.schemaVersion !== SCHEMA_VERSION) save(migrated);
  return cache;
}

export function save(state) {
  cache = state;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('TRIDENT: could not save progress (storage may be full or blocked).', err);
    return false;
  }
  listeners.forEach((fn) => fn(state));
  return true;
}

export function update(mutator) {
  const state = { ...load() };
  mutator(state);
  save(state);
  return state;
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function resetAll() {
  try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ }
  cache = null;
  return load();
}

export function storageAvailable() {
  try {
    const probe = '__trident_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch (err) { return false; }
}

/* ---------------------------------------------------------- domain helpers */

export function startGuest() {
  return update((s) => {
    s.profile = { mode: 'guest', name: 'Learner', createdAt: new Date().toISOString() };
  });
}

export function setPath(pathId) { return update((s) => { s.selectedPath = pathId; }); }
export function setTheme(theme) { return update((s) => { s.theme = theme; }); }
export function setSimulatedDate(v) { return update((s) => { s.simulatedDate = v || null; }); }
export function setSelectedEra(eraId) { return update((s) => { s.selectedEra = eraId || null; }); }

/* ------------------------------------------------------------ saved books */

export function isBookSaved(id) {
  return load().savedBooks.some((b) => b.id === id);
}

/**
 * Keep or drop an Open Library suggestion. The id is the book's Open Library
 * key, so the same book cannot be saved twice however many lessons suggest it.
 * No XP is granted here — a saved recommendation is not a completed lesson.
 */
export function toggleSavedBook(book) {
  return update((s) => {
    const i = s.savedBooks.findIndex((b) => b.id === book.id);
    if (i >= 0) s.savedBooks.splice(i, 1);
    else s.savedBooks.unshift({ ...book, savedAt: new Date().toISOString() });
    if (s.savedBooks.length > 100) s.savedBooks.length = 100;
  });
}

/**
 * Keep or drop a historical image in the Visual Archive. The whole record is
 * stored, so an archived image keeps its own caption, credit and licence even
 * if it came from an API whose results have since changed.
 */
export function toggleSavedImage(image) {
  return update((s) => {
    if (!Array.isArray(s.savedImages)) s.savedImages = [];
    const i = s.savedImages.findIndex((x) => x.id === image.id);
    if (i >= 0) s.savedImages.splice(i, 1);
    else s.savedImages.unshift({ ...image, savedAt: new Date().toISOString() });
    if (s.savedImages.length > 200) s.savedImages.length = 200;
  });
}

/* --------------------------------------------------------- learning profile */

export function getLearningProfile() { return load().learningProfile; }

export function hasLearningProfile() {
  const p = load().learningProfile;
  return !!(p && (p.mode === 'school' || p.mode === 'competitive'));
}

/**
 * Save the learner's board / class or examination. Only the profile fields are
 * written — XP, completed lessons, quiz history, streaks, badges, artefacts and
 * saved items are never touched here, so changing path cannot reset progress.
 */
export function setLearningProfile({ mode, board = null, classLevel = null, exam = null, examStage = null }) {
  return update((s) => {
    const now = new Date().toISOString();
    const previous = s.learningProfile;
    s.learningProfile = {
      mode, board, classLevel, exam, examStage,
      createdAt: (previous && previous.createdAt) || now,
      updatedAt: now
    };
  });
}

export function markLessonComplete(lessonId, dateKey) {
  return update((s) => {
    s.completedLessons[lessonId] = new Date().toISOString();
    s.lastActivityDate = dateKey;
  });
}
export function unmarkLessonComplete(lessonId) {
  // XP already earned is not clawed back, and the reward id stays in the ledger,
  // so re-completing the lesson cannot pay out a second time.
  return update((s) => { delete s.completedLessons[lessonId]; });
}

export function toggleSavedLesson(lessonId) {
  return update((s) => {
    const i = s.savedLessons.indexOf(lessonId);
    if (i >= 0) s.savedLessons.splice(i, 1); else s.savedLessons.push(lessonId);
  });
}
export function toggleSavedStory(storyId) {
  return update((s) => {
    const i = s.savedStories.indexOf(storyId);
    if (i >= 0) s.savedStories.splice(i, 1); else s.savedStories.push(storyId);
  });
}
export function toggleSavedEvent(evt) {
  return update((s) => {
    const i = s.savedEvents.findIndex((e) => e.id === evt.id);
    if (i >= 0) s.savedEvents.splice(i, 1);
    else s.savedEvents.unshift({ ...evt, savedAt: new Date().toISOString() });
  });
}
export function setReadingPosition(lessonId, scroll) {
  return update((s) => { s.readingPositions[lessonId] = { scroll, at: new Date().toISOString() }; });
}

export function recordQuizAttempt({ dateKey, kind, score, total, timedOut, timerUsed, answers }) {
  return update((s) => {
    const attempt = {
      id: `${kind}-${dateKey}-${Date.now()}`,
      date: dateKey, kind, score, total,
      timedOut: !!timedOut, timerUsed: !!timerUsed,
      answers, at: new Date().toISOString()
    };
    s.quizAttempts.unshift(attempt);
    if (s.quizAttempts.length > 200) s.quizAttempts.length = 200;

    if (kind === 'daily') {
      s.dailyQuizByDate[dateKey] = {
        completedAt: attempt.at, score, total,
        timedOut: !!timedOut, timerUsed: !!timerUsed, answers
      };
      const last = s.streak.lastDate;
      if (last !== dateKey) {
        const yesterday = shiftDateKey(dateKey, -1);
        s.streak.current = last === yesterday ? s.streak.current + 1 : 1;
        s.streak.lastDate = dateKey;
        if (s.streak.current > s.streak.best) s.streak.best = s.streak.current;
      }
    }
    s.lastActivityDate = dateKey;
  });
}

export function recordTimelineResult(dateKey, solved) {
  return update((s) => {
    const prev = s.timelineResults[dateKey] || { attempts: 0, solved: false };
    s.timelineResults[dateKey] = {
      solved: prev.solved || solved,
      attempts: prev.attempts + 1,
      at: new Date().toISOString()
    };
    s.lastActivityDate = dateKey;
  });
}

export function addActiveSeconds(seconds) {
  if (!seconds) return load();
  return update((s) => { s.activeSeconds = (s.activeSeconds || 0) + seconds; });
}

export function effectiveStreak(state, todayKey) {
  const last = state.streak.lastDate;
  if (!last) return 0;
  if (last === todayKey || last === shiftDateKey(todayKey, -1)) return state.streak.current;
  return 0;
}

export function shiftDateKey(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/* ------------------------------------------------------- reward ledger ---- */

export function hasReward(rewardId) {
  return !!load().awardedRewards[rewardId];
}

/**
 * Credit XP for a reward id exactly once. Returns the amount actually granted
 * (0 when the id was already in the ledger), so callers can tell whether to
 * announce it.
 */
export function grantReward(rewardId, amount) {
  const state = load();
  if (state.awardedRewards[rewardId]) return 0;
  update((s) => {
    s.awardedRewards[rewardId] = { xp: amount, at: new Date().toISOString() };
    s.xp = (s.xp || 0) + amount;
  });
  return amount;
}

export function unlockBadge(badgeId) {
  const state = load();
  if (state.badges[badgeId]) return false;
  update((s) => { s.badges[badgeId] = new Date().toISOString(); });
  return true;
}

export function unlockArtefact(artefactId) {
  const state = load();
  if (state.artefacts[artefactId]) return false;
  update((s) => { s.artefacts[artefactId] = new Date().toISOString(); });
  return true;
}
