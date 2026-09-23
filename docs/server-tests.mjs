/**
 * TRIDENT Daily Briefing — server tests.
 *
 * Gemini itself is stubbed. That is deliberate and stricter than calling the
 * real service: it lets the suite hand the pipeline invented progress figures,
 * a lesson id that was never offered, an unparseable reply, a 429 and a timeout
 * on demand, and check exactly what a student would be shown in each case.
 * No API key is needed to run this, and none is ever printed.
 *
 *   node docs/server-tests.mjs
 */

import { createApp, resetRateLimits } from '../server/server.js';
import {
  brief, askGuide, clearCache, validateInput, validateBrief, localBrief, inventsNumbers,
  lessons as lessonIndex
} from '../server/brief.js';
import { buildBriefPrompt, buildGuidePrompt, SYSTEM_INSTRUCTION, GUIDE_SYSTEM_INSTRUCTION, runChain } from '../server/gemini.js';
import { GEMINI_MODEL, BRIEF_LIMITS, LIMITS } from '../server/config.js';
import { readFile } from 'node:fs/promises';

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const allLessons = JSON.parse(await readFile(new URL('../data/lessons.json', import.meta.url), 'utf8')).lessons;
const THREE = allLessons.slice(0, 3);

/** A realistic summary, as the browser would send it. */
function summary(extra = {}) {
  return {
    mode: 'school',
    board: 'Tamil Nadu State Board',
    classLevel: '6',
    pathLabel: 'TN State Board • Class 6',
    level: 2,
    levelName: 'Archive Seeker',
    xp: 300,
    streak: 4,
    lessonsCompleted: 3,
    lessonsAvailable: 20,
    quizAccuracy: 80,
    quizAnswered: 10,
    questDone: 1,
    questTotal: 3,
    questFlags: { story: true, quiz: false, event: false },
    incompleteLessons: THREE.map((l) => ({ id: l.id, title: l.title, route: `#/lesson/${l.id}` })),
    event: { title: 'The Suez Canal opens', year: '1869', description: 'A shipping route between two seas.' },
    ...extra
  };
}

/** Each mode is one thing the model can get wrong. */
function stub(mode) {
  return async (input) => {
    const first = input.incompleteLessons[0];
    switch (mode) {
      case 'good':
        return {
          greeting: 'Welcome back, Class 6 Explorer.',
          progressMessage: 'You have finished 3 of 20 lessons and your streak is 4 days.',
          recommendedLessonId: first ? first.id : null,
          recommendationReason: 'It carries on from the chapter you were reading.',
          eventSignificance: 'It shortened the sea route between Europe and Asia. Trade and travel changed as a result.',
          mission: 'Read one lesson and complete today’s five-question quiz.',
          encouragement: 'Steady work.'
        };
      case 'invented-progress':
        return {
          ...{ greeting: 'Hello.', recommendationReason: 'Good next step.', mission: 'Read a lesson.', encouragement: 'Well done.' },
          progressMessage: 'Outstanding — you have completed 19 of 20 lessons and earned 4500 XP!',
          recommendedLessonId: first ? first.id : null,
          eventSignificance: null
        };
      case 'invented-lesson':
        return {
          greeting: 'Hello.',
          progressMessage: 'You have completed 3 of 20 lessons.',
          recommendedLessonId: 'l-does-not-exist',
          recommendationReason: 'Try this one.',
          eventSignificance: null,
          mission: 'Read a lesson.',
          encouragement: 'Keep going.'
        };
      case 'long-significance':
        return {
          greeting: 'Hello.',
          progressMessage: 'You have completed 3 of 20 lessons.',
          recommendedLessonId: first ? first.id : null,
          recommendationReason: 'Next in sequence.',
          eventSignificance: 'One. Two. Three. Four. Five.',
          mission: 'Read a lesson.',
          encouragement: 'Keep going.'
        };
      case 'rate-limited':
        throw Object.assign(new Error('429 RESOURCE_EXHAUSTED'), { kind: 'rate-limited' });
      case 'unavailable':
        throw Object.assign(new Error('503 high demand'), { kind: 'unavailable' });
      case 'bad-json':
        throw Object.assign(new Error('unparseable response'), { kind: 'bad-json' });
      default:
        throw new Error(`unknown stub mode ${mode}`);
    }
  };
}

function counted(inner) {
  let calls = 0;
  const fn = async (...args) => { calls += 1; return inner(...args); };
  fn.calls = () => calls;
  return fn;
}

/* ------------------------------------------------------------ the harness */

async function withServer(deps, fn) {
  const server = createApp(deps);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await fn(base); } finally { server.close(); }
}

async function post(base, body) {
  const res = await fetch(`${base}/api/daily-brief`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const withKey = async (fn) => {
  const had = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key-never-used-because-gemini-is-stubbed';
  try { return await fn(); } finally {
    if (had === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = had;
  }
};

/* ------------------------------------------------------------------ tests */

console.log(`Model constant: ${GEMINI_MODEL}\n`);

// ------------------------------------------- B1. the key cannot leak anywhere
{
  const files = ['index.html', 'js/brief.js', 'js/app.js', 'js/library.js', 'js/wikipedia.js',
    'js/openlibrary.js', 'js/storage.js', 'data/lessons.json', 'data/library.json',
    'README.md', '.env.example', 'package.json'];
  const offenders = [];
  for (const f of files) {
    const text = await readFile(new URL(`../${f}`, import.meta.url), 'utf8');
    if (/AIza[0-9A-Za-z_-]{20,}/.test(text)) offenders.push(`${f}: key-shaped literal`);
    if (/AQ\.[A-Za-z0-9_-]{30,}/.test(text)) offenders.push(`${f}: key-shaped literal`);
    if (f !== 'README.md' && f !== '.env.example' && /GEMINI_API_KEY/.test(text)) {
      offenders.push(`${f}: names the key variable`);
    }
  }
  check('B1. No file the browser can fetch contains or names the API key',
    offenders.length === 0, offenders.join('; ') || `${files.length} files checked`);

  const gitignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
  const example = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  const lines = example.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  check('B1b. .env is ignored by git and .env.example holds only empty variables',
    /^\.env$/m.test(gitignore) && lines.includes('GEMINI_API_KEY=') && lines.every((l) => /^[A-Z_]+=$/.test(l)),
    `.env.example = ${JSON.stringify(example.trim())}`);
}

// --------------------------------------------- B2. the endpoint never leaks it
await withKey(() => withServer({ generateBrief: stub('good') }, async (base) => {
  const res = await fetch(`${base}/api/daily-brief`);
  const body = await res.json();
  const text = JSON.stringify(body);
  check('B2. GET reports only whether the feature is on — never the key',
    body.available === true && !/AIza|GEMINI_API_KEY|test-key/.test(text), `GET -> ${text}`);
}));

// ------------------------------------ B3. a briefing, and what it is built from
await withKey(() => withServer({ generateBrief: stub('good') }, async (base) => {
  clearCache();
  const { status, body } = await post(base, summary());
  const ok = status === 200 && body.available === true
    && body.greeting && body.mission && body.recommendedLessonId === THREE[0].id;
  check('B3. A valid summary produces a briefing naming a supplied lesson',
    ok, `status ${status}, recommended ${body && body.recommendedLessonId}`);
}));

// ------------------------------------------- B4. invented progress is discarded
await withKey(() => withServer({ generateBrief: stub('invented-progress') }, async (base) => {
  clearCache();
  const { body } = await post(base, summary());
  const local = localBrief((await validateInput(summary())).input);
  check('B4. A progress sentence containing figures the server never supplied is replaced',
    body.progressMessage === local.progressMessage && !/19|4500/.test(body.progressMessage),
    `shown: "${body.progressMessage}"`);
}));

// --------------------------------------------- B5. an invented lesson is refused
await withKey(() => withServer({ generateBrief: stub('invented-lesson') }, async (base) => {
  clearCache();
  const { body } = await post(base, summary());
  check('B5. A recommended lesson id that was never offered falls back to a real one',
    body.recommendedLessonId === THREE[0].id
    && THREE.some((l) => l.id === body.recommendedLessonId),
    `asked for l-does-not-exist, returned ${body.recommendedLessonId}`);
}));

// ------------------------------------- B6. the browser cannot smuggle a lesson in
{
  const forged = summary({
    incompleteLessons: [
      { id: 'l-not-in-the-data', title: 'Invented Lesson', route: '#/lesson/../../etc/passwd' },
      { id: THREE[1].id, title: 'A TITLE THE BROWSER MADE UP', route: 'https://example.com/evil' }
    ]
  });
  const { input } = await validateInput(forged);
  const real = allLessons.find((l) => l.id === THREE[1].id);
  check('B6. Unknown lesson ids are dropped, and a known id keeps the server’s own title and route',
    input.incompleteLessons.length === 1
    && input.incompleteLessons[0].title === real.title
    && input.incompleteLessons[0].route === `#/lesson/${real.id}`,
    `kept ${input.incompleteLessons.length} of 2, route ${input.incompleteLessons[0].route}`);
}

// ------------------------------------------ B7. only the named fields get through
{
  const nosy = summary({
    studentName: 'Divya Arul Snowin',
    savedBooks: [{ title: 'A saved book' }],
    browserHistory: ['https://example.com'],
    device: { ua: 'Macintosh', screen: '1440x900' },
    absolutePath: '/Users/divya/Documents/TRIDENT_APP/data',
    apiKey: 'AIzaSyFAKEFAKEFAKEFAKEFAKEFAKE',
    localStorage: { 'trident.state': '{"everything":true}' }
  });
  const { input } = await validateInput(nosy);
  const prompt = buildBriefPrompt(input);
  const leaked = ['Divya', 'saved book', 'example.com', 'Macintosh', '/Users/', 'AIzaSy', 'trident.state']
    .filter((needle) => prompt.includes(needle) || JSON.stringify(input).includes(needle));
  check('B7. A name, saved books, history, device data, paths and raw storage never reach the prompt',
    leaked.length === 0, leaked.length ? `LEAKED: ${leaked.join(', ')}` : '7 forbidden values, none present');
}

// --------------------------------------------- B8. text is bounded and cleaned
{
  const nasty = summary({
    board: 'X'.repeat(500),
    event: { title: 'T'.repeat(900), year: '1869', description: `line one\nline two\u0007bell ${'d'.repeat(900)}` }
  });
  const { input } = await validateInput(nasty);
  check('B8. Over-long text is cut and control characters are stripped',
    input.board.length <= 60
    && input.event.title.length <= BRIEF_LIMITS.maxTitleChars
    && input.event.description.length <= BRIEF_LIMITS.maxTextChars
    && !/[\u0000-\u001F]/.test(input.event.description),
    `board ${input.board.length}, title ${input.event.title.length}, description ${input.event.description.length}`);
}

// ------------------------------------------ B9. two sentences of significance
await withKey(() => withServer({ generateBrief: stub('long-significance') }, async (base) => {
  clearCache();
  const { body } = await post(base, summary());
  const sentences = body.eventSignificance.split(/(?<=[.!?])\s+/).length;
  check('B9. The event explanation is capped at two sentences',
    sentences === 2, `"${body.eventSignificance}"`);
}));

// ---------------------------------------- B10. no key at all is a working page
await withServer({ generateBrief: stub('good') }, async (base) => {
  const had = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    clearCache();
    const { status, body } = await post(base, summary());
    check('B10. With no key the deterministic briefing is returned, not an error',
      status === 200 && body.available === false && body.reason === 'unconfigured'
      && /completed 3 of 20 lessons/.test(body.progressMessage)
      && body.recommendedLessonId === THREE[0].id,
      `status ${status}, reason ${body.reason}`);
  } finally { if (had !== undefined) process.env.GEMINI_API_KEY = had; }
});

// ---------------------------------- B11. quota and outage produce the same card
for (const [mode, label] of [['rate-limited', 'an exhausted quota'], ['bad-json', 'an unusable reply']]) {
  await withKey(() => withServer({ generateBrief: stub(mode) }, async (base) => {
    clearCache();
    const { status, body } = await post(base, summary());
    const text = JSON.stringify(body);
    check(`B11${mode === 'rate-limited' ? 'a' : 'b'}. With ${label} the student still gets a full briefing`,
      status === 200 && body.available === false
      && /completed 3 of 20 lessons/.test(body.progressMessage)
      && !/429|RESOURCE_EXHAUSTED|unparseable|503/.test(text),
      `reason ${body.reason}, no provider wording in the response`);
  }));
}

// ------------------------------------- B12. an identical summary is not re-asked
await withKey(() => withServer({}, async () => {
  clearCache();
  const gen = counted(stub('good'));
  await brief(summary(), { generateBrief: gen });
  await brief(summary(), { generateBrief: gen });
  await brief(summary(), { generateBrief: gen });
  check('B12. The same summary three times over makes one request',
    gen.calls() === 1, `${gen.calls()} call(s) for 3 requests`);
}));

// ------------------------------- B13. changed progress is a different briefing
await withKey(() => withServer({}, async () => {
  clearCache();
  const gen = counted(stub('good'));
  await brief(summary(), { generateBrief: gen });
  await brief(summary({ lessonsCompleted: 4 }), { generateBrief: gen });
  check('B13. A summary with changed progress is treated as a new briefing',
    gen.calls() === 2, `${gen.calls()} calls for 2 different summaries`);
}));

// -------------------------------------------- B14. a bad request is refused
await withKey(() => withServer({ generateBrief: stub('good') }, async (base) => {
  resetRateLimits();
  const a = await post(base, { nothing: true });
  const b = await post(base, { mode: 'administrator' });
  check('B14. A summary with no recognised learning path is rejected, not guessed at',
    a.status === 400 && b.status === 400, `status ${a.status} and ${b.status}`);
}));

// -------------------------------------------------- B15. the rate limit holds
await withKey(() => withServer({ generateBrief: stub('good') }, async (base) => {
  resetRateLimits();
  clearCache();
  let limited = 0;
  for (let i = 0; i < 12; i += 1) {
    const { status, body } = await post(base, summary({ xp: 300 + i }));
    if (status === 429) { limited += 1; check.lastMessage = body.message; }
  }
  check('B15. Too many requests a minute are refused with a plain sentence',
    limited > 0 && !/AIza|stack|Error:/.test(check.lastMessage || ''),
    `${limited} of 12 refused — "${(check.lastMessage || '').slice(0, 60)}…"`);
}));

// ---------------------------------------- B16. the instruction is the one given
{
  const expected = [
    "You are TRIDENT's daily history-learning guide.",
    'Never invent progress, lessons, rewards or historical details.',
    'Do not claim that the Wikimedia event comes from a textbook.',
    'Recommend only an available lesson ID.'
  ];
  check('B16. Gemini is given the instruction the specification states',
    expected.every((phrase) => SYSTEM_INSTRUCTION.includes(phrase)),
    `${SYSTEM_INSTRUCTION.length} characters, all four required sentences present`);
}

// -------------------------------- B17. the event is never dressed as a textbook
{
  const { input } = await validateInput(summary());
  const prompt = buildBriefPrompt(input);
  check('B17. The prompt marks the Wikimedia event as encyclopaedia data, not a textbook',
    /live encyclopaedia data, NOT a TRIDENT textbook/i.test(prompt)
    && /recommendedLessonId must be one of these ids/.test(prompt),
    'both guard rails present in the prompt');
}

// ------------------------------------------- B18. the number check, on its own
{
  const allowed = new Set([3, 20, 4, 5]);
  check('B18. Any figure outside the supplied set is detected as invented',
    inventsNumbers('You finished 3 of 20 lessons.', allowed) === false
    && inventsNumbers('You earned 4,500 XP.', allowed) === true
    && inventsNumbers('No numbers here.', allowed) === false,
    'supplied figures pass, invented figures are caught, prose is untouched');
}

// ------------------------------------- B19. validateBrief with nothing at all
{
  const { input } = await validateInput(summary());
  const out = validateBrief({}, input);
  const local = localBrief(input);
  check('B19. An empty reply leaves every field filled from the local template',
    out.greeting === local.greeting && out.mission === local.mission
    && out.progressMessage === local.progressMessage
    && out.recommendedLessonId === local.recommendedLessonId
    && out.eventSignificance === null,
    'all seven fields present, none invented');
}

// --------------------------------------------- B20-B22. the model fallback chain
{
  const busy = () => Object.assign(new Error('503 high demand'), { kind: 'unavailable' });
  const badKey = () => Object.assign(new Error('API key invalid'), { kind: 'bad-key' });

  const tried = [];
  const out = await runChain(['a', 'b', 'c'], async (m) => {
    tried.push(m);
    if (m !== 'c') throw busy();
    return { greeting: 'ok' };
  });
  check('B20. A busy model falls through to the next one, in order',
    out.greeting === 'ok' && tried.join(',') === 'a,b,c', `tried ${tried.join(' → ')}`);

  const tried2 = [];
  let kind = null;
  try { await runChain(['a', 'b', 'c'], async (m) => { tried2.push(m); throw badKey(); }); }
  catch (err) { kind = err.kind; }
  check('B21. A fault that is not overload stops at the first model — no silent reroute',
    kind === 'bad-key' && tried2.join(',') === 'a', `tried ${tried2.join(' → ')}, reported ${kind}`);

  const tried3 = [];
  let kind3 = null;
  try { await runChain(['a', 'b'], async (m) => { tried3.push(m); throw busy(); }); }
  catch (err) { kind3 = err.kind; }
  check('B22. When every model is busy the failure is reported, not swallowed',
    kind3 === 'unavailable' && tried3.join(',') === 'a,b', `tried ${tried3.join(' → ')}`);
}

// ------------------------------------- B23. no textbook corpus is read at all
{
  const files = ['server/brief.js', 'server/gemini.js', 'server/server.js', 'server/config.js'];
  const offenders = [];
  for (const f of files) {
    const text = await readFile(new URL(`../${f}`, import.meta.url), 'utf8');
    if (/chunks[-\w]*\.jsonl|TRIDENT_DATABASE_PREP|chunks-unverified|Tamil.*OCR/i.test(text)) {
      offenders.push(f);
    }
  }
  check('B23. The server reads no passage corpus — the quarantined files cannot be reached',
    offenders.length === 0,
    offenders.length ? `references found in ${offenders.join(', ')}` : 'the only data file read is data/lessons.json');
}

// ------------------------------- B24. lesson titles and routes come from the data
{
  const index = await lessonIndex();
  const wrong = [...index.values()].filter((l) => {
    const real = allLessons.find((x) => x.id === l.id);
    return !real || real.title !== l.title || l.route !== `#/lesson/${l.id}`;
  });
  check('B24. Every lesson the server can recommend matches data/lessons.json exactly',
    wrong.length === 0 && index.size === allLessons.length,
    `${index.size} lessons indexed, ${wrong.length} mismatched`);
}

/* ------------------------------------------ B25-B31. Ask your Daily Guide */
{
  const guide = (mode) => async (input, question) => {
    switch (mode) {
      case 'progress':
        return { inScope: true, answer: 'You have 3 of 20 lessons done, so the next one is a good place to go.' };
      case 'event':
        return { inScope: true, answer: 'It opened a shipping route between two seas, which changed how goods moved.' };
      case 'out-of-scope':
        return { inScope: false, answer: '' };
      case 'invents':
        return { inScope: true, answer: 'You are on 4,500 XP and 19 lessons — outstanding!' };
      case 'busy':
        throw Object.assign(new Error('503 high demand'), { kind: 'unavailable' });
      default:
        throw new Error('unknown guide mode');
    }
  };

  await withKey(async () => {
    const a = await askGuide({ ...summary(), question: 'What should I study next?' },
      { generateGuideAnswer: guide('progress') });
    check('B25. A student can ask what to study next and gets an answer about their own progress',
      a.status === 200 && a.body.ok === true && a.body.inScope === true && /lessons/.test(a.body.answer),
      `"${a.body.answer}"`);

    const b = await askGuide({ ...summary(), question: 'Why is today’s event important?' },
      { generateGuideAnswer: guide('event') });
    check('B26. A student can ask why today’s event matters',
      b.status === 200 && b.body.ok === true && b.body.inScope === true && !!b.body.answer,
      `"${b.body.answer}"`);

    const c = await askGuide({ ...summary(), question: 'Write my history essay on the French Revolution.' },
      { generateGuideAnswer: guide('out-of-scope') });
    check('B27. An unrelated question is refused, with the four subjects named',
      c.body.ok === true && c.body.inScope === false
      && /progress/.test(c.body.message) && /mission/.test(c.body.message)
      && /event/.test(c.body.message) && !c.body.answer,
      `"${c.body.message.slice(0, 80)}…"`);

    const d = await askGuide({ ...summary(), question: 'How am I doing?' },
      { generateGuideAnswer: guide('invents') });
    check('B28. An answer quoting figures the server never supplied is withheld, not shown',
      d.body.ok === false && d.body.reason === 'unverified' && !d.body.answer
      && !/4,500|19/.test(JSON.stringify(d.body)),
      `reason ${d.body.reason}, nothing invented reaches the student`);

    const e = await askGuide({ ...summary(), question: 'What should I study next?' },
      { generateGuideAnswer: guide('busy') });
    check('B29. A busy model leaves a plain sentence, never the provider’s words',
      e.status === 200 && e.body.ok === false
      && /temporarily unavailable/.test(e.body.message) && !/503|high demand/.test(JSON.stringify(e.body)),
      `"${e.body.message}"`);

    const f = await askGuide({ ...summary(), question: '' }, { generateGuideAnswer: guide('progress') });
    const g = await askGuide({ question: 'hello' }, { generateGuideAnswer: guide('progress') });
    check('B30. An empty question, and one with no learning path, are both refused',
      f.status === 400 && g.status === 400, `status ${f.status} and ${g.status}`);
  });

  // what the guide is actually told
  const { input } = await validateInput(summary());
  const prompt = buildGuidePrompt(input, 'What should I study next?',
    { mission: 'Read one lesson.', recommendedLessonId: THREE[0].id });
  const leaked = ['Divya', 'savedBooks', 'awardedRewards', '/Users/', 'AIza']
    .filter((needle) => prompt.includes(needle));
  check('B31. The guide’s prompt is scoped to four subjects and carries nothing personal',
    leaked.length === 0
    && /TODAY'S MISSION/.test(prompt) && /RECOMMENDED LESSON/.test(prompt)
    && /NOT a TRIDENT textbook/.test(prompt)
    && /out of scope/i.test(GUIDE_SYSTEM_INSTRUCTION)
    && /Never invent progress figures/.test(GUIDE_SYSTEM_INSTRUCTION),
    leaked.length ? `LEAKED: ${leaked.join(', ')}` : 'mission, lesson and event present; no personal value in the prompt');
}

/* ------------------------------- B32. the new timeout and output ceiling */
{
  check('B32. The briefing gets 45 seconds and a 600-token ceiling',
    LIMITS.requestTimeoutMs === 45000 && LIMITS.maxOutputTokens === 600
    && LIMITS.askMaxOutputTokens === 400 && LIMITS.askMaxQuestionChars === 200,
    `timeout ${LIMITS.requestTimeoutMs}ms, briefing ${LIMITS.maxOutputTokens} tokens, guide ${LIMITS.askMaxOutputTokens} tokens`);
}

/* ------------------------- B33. a fallback is never cached as a briefing */
await withKey(() => withServer({}, async () => {
  clearCache();
  let calls = 0;
  const busy = async () => { calls += 1; throw Object.assign(new Error('503'), { kind: 'unavailable' }); };
  const first = await brief(summary(), { generateBrief: busy });
  const second = await brief(summary(), { generateBrief: busy });
  check('B33. A fallback briefing is never cached — the next request tries the model again',
    first.body.available === false && second.body.available === false && calls === 4,
    `${calls} model attempts across 2 requests (each retries once), nothing served from cache`);
}));

/* -------------------------- B34. Europeana without a key answers 501 */
{
  const saved = process.env.EUROPEANA_API_KEY;
  delete process.env.EUROPEANA_API_KEY;
  await withServer({}, async (base) => {
    const res = await fetch(`${base}/api/images/europeana?q=Chola`);
    const body = await res.json().catch(() => null);
    const post = await fetch(`${base}/api/images/europeana`, { method: 'POST' });
    check('B34. Europeana with no key answers 501 and sends no results; other methods are refused',
      res.status === 501 && body && body.status === 'not-configured' && Array.isArray(body.results)
      && body.results.length === 0 && post.status === 405 && !JSON.stringify(body).includes('wskey'),
      `GET ${res.status} ${body && body.status}, POST ${post.status}`);
  });
  if (saved !== undefined) process.env.EUROPEANA_API_KEY = saved;
}

/* ----------------------------------------------------------------- summary */

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.pass);
console.log(`${results.filter((r) => r.pass).length}/${results.length} server checks passed`);
if (failed.length) { console.log('FAILED:'); failed.forEach((f) => console.log(` - ${f.name}: ${f.detail}`)); }
process.exit(failed.length ? 1 : 0);
