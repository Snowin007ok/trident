/**
 * The only module that talks to Gemini.
 *
 * The API key is read from process.env.GEMINI_API_KEY here and nowhere else.
 * It is never logged, never returned in a response, never written to disk and
 * never sent to the browser. If it is missing, this module reports that the
 * feature is unconfigured and the rest of the application carries on.
 *
 * The model name lives in server/config.js as a single constant.
 */

import { GEMINI_MODEL, GEMINI_FALLBACK_MODELS, LIMITS, hasApiKey } from './config.js';

/** The instruction the model is given, verbatim. */
export const SYSTEM_INSTRUCTION = [
  "You are TRIDENT's daily history-learning guide.",
  'Write a short, encouraging briefing using only the supplied student-progress summary,',
  'available TRIDENT lessons and Wikimedia event.',
  'Never invent progress, lessons, rewards or historical details.',
  'Do not claim that the Wikimedia event comes from a textbook.',
  'Recommend only an available lesson ID.',
  'If information is missing, omit it.'
].join(' ');

/** The shape the model must return. */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    greeting: { type: 'string' },
    progressMessage: { type: 'string' },
    recommendedLessonId: { type: 'string', nullable: true },
    recommendationReason: { type: 'string' },
    eventSignificance: { type: 'string', nullable: true },
    mission: { type: 'string' },
    encouragement: { type: 'string' }
  },
  required: ['greeting', 'progressMessage', 'recommendationReason', 'mission', 'encouragement']
};

/**
 * The prompt. Only the anonymous summary goes in — no name, no history, no
 * saved items, no device information, no file paths, no textbook database.
 */
export function buildBriefPrompt(input) {
  const lines = [];
  lines.push('STUDENT SUMMARY (all figures are already final — never recalculate them):');
  lines.push(input.mode === 'school'
    ? `- Learning path: ${input.board || 'board not set'}, Class ${input.classLevel || '—'}`
    : `- Learning path: ${input.pathLabel || 'examination'} preparation`);
  lines.push(`- Level ${input.level}${input.levelName ? ` (${input.levelName})` : ''}, ${input.xp} XP`);
  lines.push(`- Streak: ${input.streak} day(s)`);
  lines.push(`- Lessons completed: ${input.lessonsCompleted} of ${input.lessonsAvailable}`);
  lines.push(input.quizAnswered
    ? `- Quiz accuracy: ${input.quizAccuracy}% over ${input.quizAnswered} questions`
    : '- Quiz accuracy: no quiz answered yet');
  lines.push(`- Today's quest: ${input.questDone} of ${input.questTotal} done`
    + ` (story ${input.questFlags.story ? 'done' : 'not done'},`
    + ` quiz ${input.questFlags.quiz ? 'done' : 'not done'},`
    + ` event ${input.questFlags.event ? 'done' : 'not done'})`);

  lines.push('');
  if (input.incompleteLessons.length) {
    lines.push('AVAILABLE LESSONS — recommendedLessonId must be one of these ids, or null:');
    input.incompleteLessons.forEach((l) => {
      lines.push(`- id: ${l.id} | title: ${l.title} | topic: ${l.topic} | Class ${l.classLevel}`);
    });
  } else {
    lines.push('AVAILABLE LESSONS: none outstanding. Set recommendedLessonId to null.');
  }

  lines.push('');
  if (input.event) {
    lines.push("TODAY'S WIKIMEDIA EVENT — live encyclopaedia data, NOT a TRIDENT textbook:");
    lines.push(`- ${input.event.year}: ${input.event.title}`);
    if (input.event.description) lines.push(`- ${input.event.description}`);
    lines.push('Write at most two sentences in eventSignificance saying why it matters.');
    lines.push('Add no dates, names or facts that are not in those lines.');
  } else {
    lines.push('TODAY\'S WIKIMEDIA EVENT: none available. Set eventSignificance to null.');
  }

  lines.push('');
  lines.push('Write the briefing for this student. Use no numbers other than the ones above.');
  lines.push(input.mode === 'school' && input.classLevel
    ? `Keep the language suitable for Class ${input.classLevel}.`
    : 'Keep the language plain and direct.');
  return lines.join('\n');
}

let clientPromise = null;

async function client() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { GoogleGenAI } = await import('@google/genai');
      return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    })();
  }
  return clientPromise;
}

/**
 * One briefing. Throws an Error carrying a `kind` the caller can act on:
 *   'unconfigured' | 'rate-limited' | 'unavailable' | 'timeout' | 'bad-json'
 */
export async function generateBrief(input) {
  if (!hasApiKey()) {
    throw Object.assign(new Error('Daily Briefing is not configured'), { kind: 'unconfigured' });
  }
  return runChain(
    [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS],
    (model) => attempt(model, {
      prompt: buildBriefPrompt(input),
      schema: RESPONSE_SCHEMA,
      instruction: SYSTEM_INSTRUCTION,
      maxOutputTokens: LIMITS.maxOutputTokens
    })
  );
}

/* ------------------------------------------------ the homepage guide ----- */

/**
 * The instruction for "Ask your Daily Guide". It is deliberately narrower than
 * the briefing's: four subjects, nothing else, and no facts of its own.
 */
export const GUIDE_SYSTEM_INSTRUCTION = [
  "You are TRIDENT's daily study guide, answering one short question on the student's dashboard.",
  'You may answer ONLY about: the student\'s own progress figures, today\'s mission,',
  'the recommended lesson, and today\'s Wikimedia event — all of which are supplied to you below.',
  'Any other question — general history, homework answers, other subjects, TRIDENT itself,',
  'or anything personal — is out of scope: set inScope to false and leave answer empty.',
  'Never invent progress figures, lessons, rewards, dates, names or historical details.',
  'Use only the supplied summary. Do not claim the Wikimedia event comes from a textbook.',
  'Answer in at most three short sentences.'
].join(' ');

const GUIDE_SCHEMA = {
  type: 'object',
  properties: {
    inScope: { type: 'boolean' },
    answer: { type: 'string' }
  },
  required: ['inScope', 'answer']
};

/** The guide sees the same anonymous summary the briefing does — and nothing more. */
export function buildGuidePrompt(input, question, brief) {
  const lines = [];
  lines.push('STUDENT SUMMARY (these figures are final — never recalculate them):');
  lines.push(input.mode === 'school'
    ? `- Learning path: ${input.board || 'board not set'}, Class ${input.classLevel || '—'}`
    : `- Learning path: ${input.pathLabel || 'examination'} preparation`);
  lines.push(`- Level ${input.level}, ${input.xp} XP, streak ${input.streak} day(s)`);
  lines.push(`- Lessons completed: ${input.lessonsCompleted} of ${input.lessonsAvailable}`);
  lines.push(input.quizAnswered
    ? `- Quiz accuracy: ${input.quizAccuracy}% over ${input.quizAnswered} questions`
    : '- Quiz accuracy: no quiz answered yet');
  lines.push(`- Today's quest: ${input.questDone} of ${input.questTotal} done`);

  lines.push('');
  lines.push("TODAY'S MISSION:");
  lines.push(`- ${(brief && brief.mission) || 'Not set.'}`);

  lines.push('');
  if (input.incompleteLessons.length) {
    lines.push('RECOMMENDED LESSON (the only lesson you may name):');
    const rec = input.incompleteLessons.find((l) => l.id === (brief && brief.recommendedLessonId))
      || input.incompleteLessons[0];
    lines.push(`- ${rec.title} (${rec.topic}, Class ${rec.classLevel})`);
    lines.push('Other lessons still open to this student:');
    input.incompleteLessons.filter((l) => l.id !== rec.id)
      .forEach((l) => lines.push(`- ${l.title}`));
    // the guide holds a title and a topic, not the passage, so it cannot set a
    // real question — and must not make one up to seem helpful
    lines.push('You have this lesson\'s title and topic only, not its text.');
    lines.push('If the student asks to be quizzed, say what the lesson covers and tell them');
    lines.push("today's Daily Quiz has five cited questions waiting. Do not invent quiz questions.");
  } else {
    lines.push('RECOMMENDED LESSON: none outstanding — every lesson on this path is complete.');
  }

  lines.push('');
  if (input.event) {
    lines.push("TODAY'S WIKIMEDIA EVENT — live encyclopaedia data, NOT a TRIDENT textbook:");
    lines.push(`- ${input.event.year}: ${input.event.title}`);
    if (input.event.description) lines.push(`- ${input.event.description}`);
    lines.push('Say nothing about it that is not in those two lines.');
  } else {
    lines.push("TODAY'S WIKIMEDIA EVENT: none available today.");
  }

  lines.push('');
  lines.push(`STUDENT QUESTION: ${question}`);
  return lines.join('\n');
}

/** One answer from the homepage guide. Same model chain, same failure kinds. */
export async function generateGuideAnswer(input, question, brief) {
  if (!hasApiKey()) {
    throw Object.assign(new Error('the guide is not configured'), { kind: 'unconfigured' });
  }
  return runChain(
    [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS],
    (model) => attempt(model, {
      prompt: buildGuidePrompt(input, question, brief),
      schema: GUIDE_SCHEMA,
      instruction: GUIDE_SYSTEM_INSTRUCTION,
      maxOutputTokens: LIMITS.askMaxOutputTokens
    })
  );
}

/**
 * Walk a list of models, stopping at the first that answers.
 *
 * Only an overloaded model is worth asking a different one. A bad key, a
 * retired name, a rejected request or an exhausted quota would fail exactly
 * the same way on every model, so those stop the walk and are reported as
 * they are.
 *
 * Exported so the test suite can drive it without a network.
 */
export async function runChain(chain, run) {
  for (let i = 0; i < chain.length; i += 1) {
    try {
      return await run(chain[i]);
    } catch (err) {
      if (err.kind !== 'unavailable' || i === chain.length - 1) throw err;
      console.error(`Daily Briefing: ${chain[i]} was busy — trying ${chain[i + 1]}.`);
    }
  }
  throw Object.assign(new Error('no model configured'), { kind: 'unavailable' });
}

/**
 * Flash models reason internally before answering, and that reasoning is
 * charged against maxOutputTokens. With a 600-token allowance an unbounded
 * reasoning pass can consume the lot and return an empty string, so the budget
 * is held down: the 2.x family takes a numeric budget, the 3.x family a level.
 * A model that knows neither field says so, and `attempt` retries without it.
 */
function thinkingFor(model) {
  if (/^gemini-2[.]/.test(model)) return { thinkingConfig: { thinkingBudget: 0 } };
  return { thinkingConfig: { thinkingLevel: 'low' } };
}

/** One request to one model. `schema` and `prompt` decide which job it is. */
async function attempt(model, { prompt, schema, instruction, maxOutputTokens }, opts = {}) {
  const ai = await client();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIMITS.requestTimeoutMs);

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: instruction,
        responseMimeType: 'application/json',
        responseSchema: schema,
        maxOutputTokens,
        temperature: 0.4,
        ...(opts.plainThinking ? {} : thinkingFor(model)),
        abortSignal: controller.signal
      }
    });

    const text = typeof response.text === 'string' ? response.text : '';
    if (!text.trim()) {
      throw Object.assign(new Error('empty response'), { kind: 'bad-json' });
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      throw Object.assign(new Error('unparseable response'), { kind: 'bad-json' });
    }
  } catch (err) {
    // a model that does not recognise the thinking field is told once, plainly,
    // to go without it rather than being written off as broken
    if (!opts.plainThinking && /thinking|thought/i.test(String((err && err.message) || ''))) {
      clearTimeout(timer);
      return attempt(model, { prompt, schema, instruction, maxOutputTokens }, { plainThinking: true });
    }
    throw classify(err, model);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Map an SDK or network failure onto one of our own kinds, and say so on the
 * server console — the operator needs to know WHY, even though the student is
 * only ever shown a plain sentence. The key is stripped from anything logged.
 */
function classify(err, model = GEMINI_MODEL) {
  if (err && err.kind) return err;
  const status = err && (err.status || err.code);
  const message = String((err && err.message) || '');
  let kind;

  if (err && err.name === 'AbortError') kind = 'timeout';
  else if (status === 429 || /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(message)) kind = 'rate-limited';
  else if (status === 404 || /\b404\b|NOT_FOUND|is not found|not supported/i.test(message)) kind = 'bad-model';
  else if (status === 401 || status === 403
    || /API key|API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED/i.test(message)) kind = 'bad-key';
  else kind = 'unavailable';

  console.error(`Daily Briefing: ${model} failed (${kind}) — ${redact(message) || 'no message'}`);
  if (kind === 'bad-model') {
    console.error(`Daily Briefing: "${model}" was refused. Run "npm run diagnose" to list the models this key can use.`);
  }
  if (kind === 'bad-key') {
    console.error('Daily Briefing: the key was rejected. Run "npm run diagnose" to check it.');
  }
  return Object.assign(err, { kind });
}

/** Never let a key reach a log line, however it got into the message. */
function redact(text) {
  return String(text)
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[key redacted]')
    .replace(/AQ\.[A-Za-z0-9_-]{10,}/g, '[key redacted]')
    .replace(/key=[^&\s"]+/gi, 'key=[redacted]')
    .slice(0, 300);
}

/** Retryable exactly once, and only for a temporary server-side failure. */
export function isRetryable(kind) {
  return kind === 'unavailable' || kind === 'timeout';
}

export { GEMINI_MODEL };
