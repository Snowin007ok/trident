/**
 * Daily Briefing setup check.
 *
 *   npm run diagnose
 *
 * Tells you three things: whether a key was found, which models that key can
 * actually use, and what happens when TRIDENT's configured model is called.
 *
 * The key itself is never printed — only whether one exists and how long it is.
 * The output is safe to copy and share.
 */

import { GEMINI_MODEL } from './config.js';

const key = process.env.GEMINI_API_KEY;

console.log('\nDaily Briefing — setup check');
console.log('─────────────────────────\n');

if (!key || !key.trim()) {
  console.log('✗ No GEMINI_API_KEY found.\n');
  console.log('  Create a .env file beside package.json containing one line:');
  console.log('      GEMINI_API_KEY=your-key-here');
  console.log('  then run this again.\n');
  process.exit(1);
}
console.log(`✓ A key was found (${key.trim().length} characters). Its value is not printed.`);
console.log(`  Configured model: ${GEMINI_MODEL}\n`);

let GoogleGenAI;
try {
  ({ GoogleGenAI } = await import('@google/genai'));
} catch (err) {
  console.log('✗ The @google/genai package is not installed.');
  console.log('  Run:  npm install\n');
  process.exit(1);
}
console.log('✓ The @google/genai package is installed.\n');

const ai = new GoogleGenAI({ apiKey: key.trim() });

/* ---------------------------------------------------- what this key can use */

console.log('Asking Google which models this key may use…\n');
let usable = [];
try {
  const pager = await ai.models.list();
  for await (const m of pager) {
    const actions = m.supportedActions || m.supportedGenerationMethods || [];
    if (!actions.length || actions.includes('generateContent')) {
      usable.push(String(m.name || '').replace(/^models\//, ''));
    }
  }
} catch (err) {
  console.log(`✗ Could not list models: ${short(err)}\n`);
}

if (usable.length) {
  const flash = usable.filter((n) => /flash/i.test(n) && !/embed|image|tts|live|audio/i.test(n));
  console.log(`✓ ${usable.length} models available to this key.`);
  console.log('  Flash models you could use:');
  (flash.length ? flash : usable).slice(0, 15).forEach((n) => {
    console.log(`      ${n}${n === GEMINI_MODEL ? '   <-- currently configured' : ''}`);
  });
  if (!usable.includes(GEMINI_MODEL)) {
    console.log(`\n  ⚠ "${GEMINI_MODEL}" is NOT in that list.`);
    console.log('    Pick one of the names above and set it in server/config.js:');
    console.log("        export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'the-name-you-picked';");
    console.log('    or try it straight away without editing anything:');
    console.log('        GEMINI_MODEL=the-name-you-picked npm start');
  }
  console.log('');
}

/* ------------------------------------------------------------- a real call */

/**
 * Try the configured model, then a short list of fallbacks, and report the
 * first one that genuinely answers. A model can appear in the list above and
 * still refuse the call — several need billing enabled on the project.
 */
async function tryModel(name) {
  const res = await ai.models.generateContent({
    model: name,
    contents: 'Reply with the single word: ready',
    config: { maxOutputTokens: 200, temperature: 0 }
  });
  return (res.text || '').trim();
}

const candidates = [GEMINI_MODEL, 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-flash', 'gemini-3.1-flash-lite']
  .filter((n, i, a) => n && a.indexOf(n) === i);

let working = null;
for (const name of candidates) {
  process.stdout.write(`Calling ${name}… `);
  try {
    const reply = await tryModel(name);
    console.log(`✓ answered "${reply}"`);
    working = name;
    break;
  } catch (err) {
    console.log(`✗ ${short(err)}`);
  }
}

console.log('');

// ---------------------------------------------------------------------------
// Stage two. A plain call proves the key and the model name. It does NOT prove
// the call the Daily Briefing actually makes, which also carries a system instruction
// and a strict JSON schema — and those can be refused on their own. So repeat
// the real thing, against a real lesson, and print exactly what comes back.
// ---------------------------------------------------------------------------
// Only when the configured model is the one that answered: config.js has
// already been evaluated, so GEMINI_MODEL can no longer be redirected here.
if (working && working === GEMINI_MODEL) {
  process.stdout.write('Making the real Daily Briefing request (JSON schema + instruction)… ');
  try {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const lessons = JSON.parse(await readFile(path.join(here, '..', 'data', 'lessons.json'), 'utf8'));
    const list = Array.isArray(lessons) ? lessons : (lessons.lessons || []);
    const lessonId = list[0] && list[0].id;
    if (!lessonId) throw new Error('no lesson found in data/lessons.json');
    void lessonId;

    const { validateInput } = await import('./brief.js');
    const { generateBrief } = await import('./gemini.js');

    // a representative summary, exactly as the browser would send one
    const checked = await validateInput({
      mode: 'school', board: 'Tamil Nadu State Board', classLevel: '9',
      pathLabel: 'TN State Board • Class 9',
      level: 2, levelName: 'Archive Seeker', xp: 280, streak: 3,
      lessonsCompleted: 2, lessonsAvailable: 14, quizAccuracy: 80, quizAnswered: 5,
      questDone: 1, questTotal: 3,
      questFlags: { story: true, quiz: false, event: false },
      incompleteLessons: list.slice(0, 3).map((l) => ({ id: l.id })),
      event: { title: 'The Suez Canal opens', year: '1869', description: 'A shipping route between two seas.' }
    });
    if (!checked.ok) throw new Error(`the sample summary was rejected: ${checked.message}`);

    // A 503 means the model is busy, which says nothing about this setup. Give
    // it a few tries, spaced out, before calling it a failure.
    let out = null;
    for (let i = 0; i < 4; i += 1) {
      try {
        out = await generateBrief(checked.input);
        break;
      } catch (err) {
        if (err.kind !== 'unavailable' || i === 3) throw err;
        process.stdout.write('busy, retrying… ');
        await new Promise((r) => setTimeout(r, 2500 * (i + 1)));
      }
    }

    if (out && typeof out.greeting === 'string' && out.greeting.trim()) {
      console.log('✓');
      console.log(`\n  The model answered: "${String(out.greeting).slice(0, 60)}"`);
      console.log('  The Daily Briefing will work.\n');
    } else {
      console.log('✗ the reply came back empty');
      console.log('\n  The call succeeded but the model returned nothing usable. This is almost');
      console.log('  always the thinking budget eating the whole output allowance. Check that');
      console.log('  server/gemini.js sets thinkingConfig: { thinkingBudget: 0 }.\n');
      process.exit(1);
    }
  } catch (err) {
    console.log('✗');
    const kind = (err && err.kind) || 'unknown';
    console.log(`\n  Reason (${kind}): ${short(err)}`);
    if (kind === 'unavailable' || kind === 'rate-limited') {
      console.log('\n  Nothing is wrong with this installation — the model is busy or you have');
      console.log('  hit the free-tier limit. The server now falls back to another model when');
      console.log('  this happens, so the briefing may well work even though this check did not.');
      console.log('  Start the server and try a question; if it still fails, wait and re-run.\n');
    } else {
      console.log('\n  The key and the model name are fine — a plain call just worked. What was');
      console.log('  refused is the structured request. The message above says which part.\n');
    }
    process.exit(1);
  }
}

if (working && working === GEMINI_MODEL) {
  console.log(`✓ All set. ${working} works and is already configured.`);
  console.log('\n  Restart the server and Ask TRIDENT will answer:');
  console.log('      npm start\n');
} else if (working) {
  console.log(`✓ ${working} works, but TRIDENT is configured to use ${GEMINI_MODEL}.`);
  console.log('\n  Use it right now without editing anything:');
  console.log(`      GEMINI_MODEL=${working} npm start`);
  console.log('\n  Or make it permanent — open server/config.js and set:');
  console.log(`      export const GEMINI_MODEL = process.env.GEMINI_MODEL || '${working}';\n`);
} else {
  console.log('✗ None of the models answered.\n');
  console.log('  If every line said "quota" or "429": that is a rate limit, not a setup');
  console.log('  problem — wait a few minutes and run this again.');
  console.log('  If they said "API key" or "permission": the key was rejected. Check it was');
  console.log('  pasted whole into .env, with no spaces or quotes.');
  console.log('  If they said "billing": that model needs billing enabled on the project.');
  console.log('  Pick a different name from the list above and try:');
  console.log('      GEMINI_MODEL=the-name-you-picked npm run diagnose\n');
  process.exit(1);
}

/** The message only, trimmed, with anything key-shaped stripped out. */
function short(err) {
  const raw = String((err && err.message) || err || 'unknown error');
  return raw
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[key redacted]')
    .replace(/AQ\.[A-Za-z0-9_-]{10,}/g, '[key redacted]')
    .replace(/key=[^&\s"]+/gi, 'key=[redacted]')
    .slice(0, 400);
}
