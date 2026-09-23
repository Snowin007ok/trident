/**
 * Every limit and switch for the Daily Briefing backend, in one place.
 *
 * The API key is NOT here and is never written to any file. It is read from
 * process.env.GEMINI_API_KEY at request time and nowhere else.
 */

/**
 * The model. One constant, so a future model change is a one-line edit.
 *
 * Google retires older models for new keys: a key issued today gets a 404 on
 * gemini-2.5-flash saying to use gemini-3.6-flash instead. Being listed by the
 * models endpoint is also not the same as being callable — some need billing.
 * `npm run diagnose` reports which ones actually answer for your key.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

/**
 * Stand-ins, tried in order and only when the configured model answers 503
 * ("experiencing high demand") — a free-tier fact of life that says nothing
 * about this installation. A wrong key, a retired name or a rejected request
 * is never retried on another model: those are faults to report, not to route
 * around. Set GEMINI_FALLBACK_MODELS to an empty string to switch this off.
 *
 * The list ends with lite models on purpose: when the headline Flash models are
 * saturated the lite ones usually still answer, and a briefing written by a
 * smaller model is worth far more to a student than no briefing at all.
 */
export const GEMINI_FALLBACK_MODELS = (
  process.env.GEMINI_FALLBACK_MODELS
  ?? 'gemini-3.5-flash,gemini-flash-latest,gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-3.1-flash-lite'
)
  .split(',')
  .map((n) => n.trim())
  .filter((n) => n && n !== GEMINI_MODEL);

export const LIMITS = {
  /** Longest briefing we ask Gemini for. Short output is also fast output. */
  maxOutputTokens: 600,
  /** The homepage guide answers in a sentence or two, so it needs less again. */
  askMaxOutputTokens: 400,
  /** Longest question the homepage guide accepts. */
  askMaxQuestionChars: 200,
  /** How many of the student's own questions the browser keeps, in memory only. */
  askHistoryLength: 3,
  /**
   * How long one attempt may take before it is abandoned.
   *
   * A structured request — system instruction plus a strict JSON schema — is
   * markedly slower than a plain one, and 20 seconds was cutting it off before
   * the model had finished. 45 gives it room; the student never waits on it,
   * because the deterministic card is already on screen.
   */
  requestTimeoutMs: 45000,
  /** One short retry, and only for temporary server-side failures. */
  retryDelayMs: 1200,
  /** Per-browser rate limit. */
  rateWindowMs: 60000,
  rateMaxRequests: 8,
  /** An identical summary is answered from memory for this long. */
  cacheTtlMs: 10 * 60 * 1000,
  cacheMaxEntries: 200,
  /** Refuse absurd request bodies outright. */
  maxBodyBytes: 8192
};

/**
 * Every field the browser is allowed to send, and how far it may go.
 *
 * Anything outside this list is dropped before the payload is looked at, so a
 * field added to the browser by accident — a name, a saved book, a stray
 * localStorage key — cannot reach Gemini even if someone sends it on purpose.
 */
export const BRIEF_LIMITS = {
  maxTextChars: 240,
  maxTitleChars: 160,
  maxLessons: 3,
  maxLevel: 5,
  maxXp: 10_000_000,
  maxStreak: 4000,
  maxLessonCount: 100_000
};

export const PORT = Number(process.env.PORT) || 8080;

/** True when a key is configured. The value itself is never returned. */
export function hasApiKey() {
  return typeof process.env.GEMINI_API_KEY === 'string'
    && process.env.GEMINI_API_KEY.trim().length > 0;
}
