# TRIDENT test report

**Run:** headless Chromium (Chrome DevTools Protocol), served over
`python3 -m http.server`. No test framework and no dependency was installed —
the harness in `docs/browser-tests.mjs` uses only Node built-ins, driving the
browser over a WebSocket.

X — 116 in the browser, 26 on the server.
0 uncaught exceptions, 0 unexpected console errors.

```
node docs/browser-tests.mjs        # with the app served at http://localhost:8765
BASE=http://localhost:8000 node docs/browser-tests.mjs   # or any other port

node docs/server-tests.mjs         # the Daily Briefing server — needs no API key
```

The suite covers five layers, and every layer is re-run on every pass:

| Layer | Checks | What it covers |
|---|---:|---|
| Baseline | 37 | the original prototype: routes, data integrity, citations, daily behaviour, storage, accessibility |
| Redesign | 26 | R1–R20: gamification, the Timeline Challenge, motion, contrast, the tricolour, responsive layout |
| Learning profile | 19 | P1–P15: onboarding, the class and examination rules, personalisation, migration |
| External APIs | 13 | A1–A10: Wikimedia request counts and caching, Open Library limits, saved books, offline behaviour |
| Daily Briefing + companion (browser) | 46 | D1–D27: the briefing, figure integrity, caching and Retry, the floating companion, accessibility, what leaves the browser |
| Daily Briefing (server) | 35 | B1–B33: key containment, input validation, invented figures and lessons, the scoped guide, quota and outage behaviour |

---

## Coverage map — the fifteen Daily Briefing requirements

| # | Requirement | Check(s) |
|---|---|---|
| 1 | No Gemini panel remains on lesson pages | D1, D1b |
| 2 | The dashboard contains one Daily Briefing panel | D2, D2b, D2c |
| 3 | Progress figures match localStorage exactly | D3 |
| 4 | Gemini cannot invent or alter progress figures | D4 (browser), B4 + B18 (server) |
| 5 | The recommended lesson exists and opens | D5, B5, B6, B24 |
| 6 | The Wikimedia event keeps its attribution and link | D6, D6b, B17 |
| 7 | Same date and profile make only one Gemini request | D7, D7b, B12 |
| 8 | A profile change produces a different cache key | D8, B13 |
| 9 | Offline and quota failures show the deterministic briefing | D9, B10, B11a, B11b, B19 |
| 10 | No AI action awards XP | D10 |
| 11 | Class 6 quiz content is profile-appropriate or clearly labelled | D11, D11b |
| 12 | Ordering questions begin shuffled and unanswered | D12, D12b |
| 13 | The API key stays server-side | D13, B1, B1b, B2 |
| 14 | Existing citations and textbook content are unchanged | D1b, plus the 37 baseline checks |
| 15 | No console errors occur | R16, and the two console checks at the end of the run |

### The follow-up round

| # | Requirement | Check(s) |
|---|---|---|
| 16 | A real briefing succeeds with the configured key | B3, B32; `npm run diagnose` makes the live call |
| 17 | A timeout leaves the fallback and enables Retry | D15, B11a, B11b |
| 18 | Retry replaces the fallback with the genuine response | D17, D17b |
| 19 | "What should I study next?" is answered | D19, B25 |
| 20 | "Why is today's event important?" is answered | D19d, B26 |
| 21 | Unrelated questions are refused | D20, B27 |
| 22 | No fallback is marked "Up to date" | D15 |
| 23 | No extra XP is awarded | D19b, D10 |
| 24 | No API key reaches the browser | D13, B1, B1b, B2 |
| 25 | Only three questions are kept, in memory | D21 |
| 26 | The lesson page keeps no question box | D1, D1b |

### The companion round

| # | Requirement | Check(s) |
|---|---|---|
| 27 | The fish appears on every signed-in route | D24 (eight routes), D24b (not before sign-in) |
| 28 | It is not a navigation tab | D18b |
| 29 | Clicking opens and closes without changing the URL | D19 |
| 30 | Questions still reach the existing endpoint | D20, D20c |
| 31 | The API key never reaches the browser | D13, B1, B1b, B2 |
| 32 | Questions and answers disappear after a refresh | D23b, D22b |
| 33 | One click makes one request | D21 (three clicks, one request) |
| 34 | Mobile and desktop have no overflow | D24, D25 |
| 35 | No console errors, no broken existing tests | R16, and the 37 baseline checks |
| 36 | Heading, subheading, suggestions, 200-character input | D19b |
| 37 | Animation, hover, pause when open, reduced motion | D26, D26b, D19c |
| 38 | Labels, keyboard, focus trapping, Escape, announcements | D18, D19c, D23 |
| 39 | The permanent dashboard question box is gone | D27 |

### The Class 7, dashboard and leap round

| # | Requirement | Check(s) |
|---|---|---|
| 40 | Class 7 is selectable and opens real cited lessons | C1, C1b, C1c |
| 41 | Class 7 quizzes use only Class 7 evidence | C2 |
| 42 | No unsupported class is presented as complete | C3 |
| 43 | The dashboard is substantially shorter, with no repeats | C4, C4b, 3, 3b |
| 44 | What moved is where it moved to | 3c, 3d |
| 45 | The fish jumps once on hover, focus and tap | C5, C5b |
| 46 | Reduced-motion users get no jump | C6 |
| 47 | The fish obscures no mobile navigation | D25 |
| 48 | Opening the panel does not change the URL | D19 |
| 49 | Existing progress survives | R1, R3, P10, P12 |
| 50 | No citation or source text changes | 14a–14e, C1b |
| 51 | No console errors, overflow or accessibility regressions | R16, D24, 15, the A11y sweep |

### The class-specific totals round

| # | Requirement | Check(s) |
|---|---|---|
| 52 | TN Class 7 with two lessons done shows 2 of 10 | E1 |
| 53 | TN Class 6 uses its own total | E2 |
| 54 | CBSE profiles use their selected class total | E3 |
| 55 | Changing class updates the denominator, deleting nothing | E4 |
| 56 | The Library still shows board-wide totals | E5 |
| 57 | The browser sends the class-specific figures | E6 |
| 58 | Gemini text cannot override the figures | E7, D4, B4, B18 |
| 59 | A stale board-wide briefing never returns | E8 |
| 60 | No data file, citation or passage changes | 14a–14e |
| 61 | The existing suites still pass | all 160 browser and 35 server checks |

---


## Coverage map — the twenty redesign checks

| # | Requirement | Check(s) |
|---|---|---|
| 1 | Existing guest progress survives migration | R1 |
| 2 | XP cannot be awarded twice | R2, R11b, R12b |
| 3 | XP totals correct after reload | R3 |
| 4 | Levels change at documented thresholds | R4 (ten boundary values) |
| 5 | Quest completion reflects actual activity | R5 |
| 6 | Locked badges remain locked | R6 |
| 7 | Badges unlock only at exact conditions | R7 |
| 8 | Artefacts unlock only after conditions | R8 |
| 9 | Timeline Challenge stable within one date | R9 |
| 10 | Timeline Challenge changes on another date | R10 |
| 11 | Keyboard controls work in the Timeline Challenge | R11, R11b |
| 12 | Existing daily quiz and streak behaviour still works | R12, R12b, and baseline 7, 8, 9, 11 |
| 13 | Mobile bottom navigation works | R13 |
| 14 | Reduced-motion mode works | R14 |
| 15 | No horizontal overflow at 375 / 768 / 1440px | R15 (five routes at each width) |
| 16 | No console errors or uncaught exceptions | R16 |
| 17 | No unverified content appears | R17, and baseline 14a–14e |
| 18 | All text combinations meet WCAG AA contrast | R18 |
| 19 | Three tricolour components, no distorted flag | R19 |
| 20 | All existing baseline tests continue to pass | R20 |

## Coverage map — the ten external-API checks

| # | Requirement | Check(s) |
|---|---|---|
| 1 | Wikimedia makes no repeated request after reloading on the same date | A1 |
| 2 | A different preview date uses a different cache key | A2 |
| 3 | Open Library loads a maximum of six books | A3 |
| 4 | Reopening the same topic uses its cache | A4 |
| 5 | Saved books survive reload | A5 |
| 6 | Duplicate books cannot be saved twice | A6 |
| 7 | Both API sections handle offline mode without breaking the page | A7, A7b |
| 8 | No existing XP can be awarded twice | A8, and R2, R11b, R12b |
| 9 | No textbook text or citations are modified | A9, and baseline 14a–14e |
| 10 | No console errors occur | R16 |
| — | Remote markup is never rendered as HTML | A2b |
| — | Source labels and the load date are shown | A1b |
| — | One request per second, and no duplicate in-flight topic | A10 |

### How the two services are tested

The container's egress proxy blocks `api.wikimedia.org` and `openlibrary.org`,
so both services are replaced by a stub that counts calls and records the exact
URLs requested. That is stricter than hitting the live services would be: the
suite can assert that the second visit to a lesson makes **no** request, that a
full page reload makes **no** request, that the search URL carries `limit=6`,
that a service returning nine results still renders only six, and that three
concurrent searches are spaced at least 950ms apart while a repeated topic is
never requested twice. The offline paths are driven by making the same stub
reject.

## Coverage map — the fifteen learning-profile checks

| # | Requirement | Check(s) |
|---|---|---|
| 1 | New guest is redirected to onboarding | P1, P1b |
| 2 | Returning user with a profile skips onboarding | P2 |
| 3 | Board selection shows only classes found in verified data | P3 |
| 4 | Class 11 is disabled and labelled correctly | P4, P4b |
| 5 | UPSC is disabled and labelled "Coming Soon" | P5 |
| 6 | TNPSC is labelled "Beta" | P6 |
| 7 | Confirmation saves the correct profile | P7, P7b |
| 8 | Dashboard recommendations respect the profile | P8 |
| 9 | Library opens with the correct default filters | P9 |
| 10 | Changing the profile preserves XP and all progress | P10 |
| 11 | Cancel leaves the old profile unchanged | P11 |
| 12 | Existing user data migrates without loss | P12, P12b |
| 13 | Mobile onboarding has no horizontal overflow | P13, P13b |
| 14 | No console errors occur | P14 (accessibility), R16 (errors) |
| 15 | All previous tests continue to pass | P15, R20 |

### Notes on the more involved checks

**R1 — migration.** A genuine v1 record is written to `localStorage` (two
completed lessons, one perfect daily quiz, a two-day streak, a saved lesson, a
selected path), then the page is genuinely reloaded. The check confirms the
schema moves to the current version, `migratedFrom` records 1, every v1 field
survives, XP is back-credited to exactly 250 (2 × 50 + 100 + 50) and four reward
ids are written so none of it can be credited again.

**R4 — level thresholds.** Ten values are tested, both sides of every boundary:
0, 249, 250, 499, 500, 999, 1000, 1749, 1750, 5000.

**R11b — Timeline Challenge.** The board is sorted with the keyboard buttons
alone (the dates are hidden while the challenge is open, so the expected order is
read from `data/timeline.json`, the same file the page uses), checked, and then
replayed on the same date. XP rises by exactly 75 and does not rise again;
citations are present on all four cards; the dates appear on reveal and are
hidden again on replay.

**R18 — contrast.** Every leaf text node across eight routes is measured against
its nearest opaque ancestor background, using the WCAG relative-luminance
formula, with the 3:1 threshold applied to large or bold text and 4.5:1 to
everything else. Zero failures on the bright default theme.

**R19 — tricolour.** Asserts the navigation rule renders three bands with the
exact flag values `rgb(255,153,51)` / `rgb(255,255,255)` / `rgb(19,136,8)`, that
it is horizontal (width more than twenty times its height) and carries no
transform, that the XP bar fills in three segments, that the journey threads are
present, that no image anywhere is a flag, and that the page background is not
flag imagery.

**P3/P4 — the class list is derived, not written down.** The check fetches
`data/lessons.json` and `data/library.json` itself and compares the classes the
flow offers against the classes those files actually contain, so a class could
not be shown for a board that has nothing for it. It then confirms class 11 is
disabled and says "Content coming soon", that class 12 says "Limited coverage",
and that at least three classes display a real lesson count.

**P10 — changing path is not destructive.** A lesson is completed through the
interface first, then the path is changed from CBSE class 12 to Tamil Nadu class
10. XP, completed lessons, badges, artefacts, reward-ledger entries, saved
lessons, quiz attempts and the streak are all compared before and after and must
be identical.

**P12 — an existing learner.** A complete v3 record (XP 150, a completed lesson,
a saved lesson, a badge, an artefact, a quiz history, a three-day best streak,
15 minutes of study time) is written and the page reloaded. The learner is sent
to onboarding exactly once; every stored figure is unchanged afterwards; and a
further reload goes straight to the dashboard.

## Colour-distribution measurement

Five full pages were rendered in headless Chromium, the PNGs decoded with Node's
built-in `zlib`, and every second pixel classified by hue, saturation and
lightness:

| Bucket | Target | Measured |
|---|---:|---:|
| Warm ivory and parchment | 55% | 53.0% |
| White | 18% | 23.7% |
| Saffron | 10% | 9.4% |
| Green | 8% | 6.4% |
| Navy | ≤ 15% | 4.9% |
| Gold, terracotta, other | — | 2.6% |

## Full result list — browser (160)

- **PASS** 1. Welcome screen renders — h1=TRIDENT, buttons=2
- **PASS** 1b. Logo asset loads
- **PASS** 1c. Sign-in opens an honest modal (no fake auth)
- **PASS** P1. A new guest is sent to onboarding, not the dashboard — hash=#/onboarding, heading=What are you preparing for?
- **PASS** P1b. The dashboard is unreachable before a profile is chosen — hash=#/onboarding
- **PASS** 2. Guest mode works — hash=#/dashboard, profile=guest
- **PASS** 3. Dashboard loads as three cards with one clear next action — 3 panels, primary action "Continue Learning"
- **PASS** 3b. Everything that moved is gone from the dashboard — gateways=0, era nodes=0, stats=0, story teaser=false, event card=false
- **PASS** 3c. The gateways, era journey, statistics and the day’s event are where they moved to — library: 3 gateways + 5 eras (TNPSC Beta=true); passport: 5 statistics; #/event page present=true
- **PASS** 3d. The dashboard links on to each of them — #/library #/progress #/timeline
- **PASS** 6a. Event of the Day resolves to a real state — state=error-state
- **PASS** 6b. Event of the Day degrades gracefully when the API fails — state=graceful-offline
- **PASS** 6c. Event of the Day renders year, title, image, source link and Save — year=1947, title=Sample, image slot filled=true, link=true, cited=true, saved=1
- **PASS** 6d. An event without an image shows a placeholder, not a broken image — {"rendered":true,"brokenImg":false,"placeholder":true}
- **PASS** 5. Books and lessons display — lessons=30, books=12
- **PASS** 4. Learning-path filter works — cbse rows=6, state-board pill shown=false
- **PASS** 13. Class 11 shows "Content coming soon" and no lessons — rows=0
- **PASS** 13b. Class 12 shows "Limited coverage" with content — rows=2
- **PASS** 7. Daily quiz is stable within one date — 5 questions
- **PASS** 7b. Quiz mixes question formats — Match person and event, Identify the date, Cause and consequence, Arrange in order, Multiple choice
- **PASS** 8. A different date produces a different quiz — today vs 2027-03-14 differ: true, 2027-03-14 vs 2027-07-02 differ: true
- **PASS** 9. Quiz timer counts down and can only start once — 05:00 -> 04:58
- **PASS** 11. Streak increases exactly once per date — before=0, after submit=1, after revisit=1, locked=true
- **PASS** 10. Progress survives a full page reload — saved=1, completed=1
- **PASS** 12. Saved items persist and appear on Progress
- **PASS** 10b. Reading position store present
- **PASS** 14a. No Tamil-script (unverified OCR) text in the shipped data
- **PASS** 14b. No absolute filesystem paths in the shipped data
- **PASS** 14c. No hashes or internal QC fields in the shipped data
- **PASS** 14d. No Political Science book or citation in the shipped data — books=0, citations=0, explanatory mentions in notices=1
- **PASS** 14e. Export size matches the verified index — books=12, lessons=30, questions=54, stories=7
- **PASS** 15. No horizontal overflow at mobile 375px — scrollWidth=375, innerWidth=375
- **PASS** 15. No horizontal overflow at tablet 768px — scrollWidth=753, innerWidth=768
- **PASS** 15. No horizontal overflow at desktop 1280px — scrollWidth=1265, innerWidth=1280
- **PASS** A11y: every image has alt text — missing=0
- **PASS** A11y: exactly one h1 per view — h1 count=1
- **PASS** A11y: skip link present
- **PASS** A11y: all library form controls are labelled — unlabelled=0
- **PASS** Daily story renders with citations and a 3-question quiz — cites=1, questions=3
- **PASS** R1. Existing guest progress survives migration to the current schema — xp=250 (expected 250), ledger=4, lessons=2, streak=2
- **PASS** R2. XP cannot be awarded twice for the same activity — first=50, after re-complete=50, ledger=1
- **PASS** R3. XP totals are correct after a full page reload — xp=50
- **PASS** R4. Levels change at the documented XP thresholds — 0/250/500/1000/1750 all correct
- **PASS** R5. Quest completion reflects real activity only — before="0/3 complete", after="1/3 complete", story done=true, quiz done=false
- **PASS** R6. Locked badges stay locked and explain their requirement — tiles=6, stored badges=0
- **PASS** R7. A badge unlocks only when its exact condition is met — unlocked=[first-step]
- **PASS** R8. An artefact is recovered only after its badge is earned — artefacts=[inscription]
- **PASS** R9. The Timeline Challenge is stable within one date — 4 events
- **PASS** R10. A different date produces a different Timeline Challenge — Battle of Plassey | The Archaeological Survey of India is started | Battle of Buxar | English coal production stands at 4.7 million tonnes  vs  English coal production reaches 250 million tonnes | Hitler invades Austria and Czechoslovakia | Reign of the Egyptian Pharaoh Tutankhamen begins | Battle of Plassey
- **PASS** R11. Timeline Challenge keyboard controls work and are announced — live="English coal production reaches 250 million tonnes moved to position 2 of 4."
- **PASS** R11b. Solving the Timeline Challenge grants 75 XP once per date, with citations — before=50, after=125, after replay=125, citations=4, dates revealed=4
- **PASS** R12. Daily quiz, streak, trail, evidence cards and quiz XP all work — trail=5, score=1/5, xp=100 (expected 100), evidence cards=5
- **PASS** R12b. Revisiting a finished quiz grants no further XP and takes nothing away — xp=100, locked=true
- **PASS** R13. Mobile bottom navigation appears and works — items=Home, Learn, Quest, Saved, Progress, primary nav display=none
- **PASS** R15. No horizontal overflow at 375px — dashboard, quiz, timeline, passport, collection
- **PASS** R15. No horizontal overflow at 768px — dashboard, quiz, timeline, passport, collection
- **PASS** R15. No horizontal overflow at 1440px — dashboard, quiz, timeline, passport, collection
- **PASS** R14. Reduced-motion mode disables animation and confetti — animation-duration=0s, confetti nodes=0
- **PASS** R17. No unverified, Political Science, path or hash content is exposed — tamil=false, polsci=false, paths=false, hashes=false
- **PASS** R18. Text and background combinations meet WCAG AA contrast — all sampled text passes
- **PASS** R19. All three tricolour components appear, with no literal or distorted flag — nav rule bands=rgb(255, 153, 51)/rgb(255, 255, 255)/rgb(19, 136, 8), xp segments=3, journey threads=true, flag images=0
- **PASS** P2. A returning learner with a profile is not asked again — hash=#/dashboard, header chip="TN State Board • Class 9"
- **PASS** P3. Board selection lists only classes present in the verified data — shown=6,7,10,11,12, in data=10,12,6,7
- **PASS** P4. Class 11 is disabled and labelled "Content coming soon" — Class 11Content coming soonNo verified lessons are indexed for this class yet.
- **PASS** P4b. A class with limited material says so, and real lesson counts are shown — Class 122 lessons · Limited coverage
- **PASS** P5. UPSC is disabled, labelled "Coming Soon" and explains why — UPSCComing SoonUPSC will become available after verified syllabus sources and questions are added.
- **PASS** P6. TNPSC is offered and labelled "Beta" — TNPSCBetaPractice drawn only from manually reviewed State Board and CBSE passage
- **PASS** P11. Cancel leaves the existing profile unchanged — board=tamil_nadu_state_board, class=9, settings shows "Tamil Nadu State Board • Class 9"
- **PASS** P7. Confirmation saves exactly the chosen profile, in the documented shape — {"mode":"school","board":"cbse","classLevel":"12","exam":null,"examStage":null,"createdAt":"2026-09-22T21:39:15.924Z","updatedAt":"2026-09-22T21:39:18.631Z"}
- **PASS** P7b. Changing path warns that nothing will be deleted
- **PASS** P8. Dashboard recommendations follow the profile — greeting="CBSE • Class 12", resume href="#/lesson/l-cbse12-themes", suggested lesson=cbse/class 12
- **PASS** P9. The library opens on the profile’s board and class, without hiding anything — f-path=cbse, f-class=12, rows=2, options=all/tn/cbse/tnpsc
- **PASS** P10. Changing the learning path preserves XP and every other record — xp 50→50, lessons 1→1, badges 1→1
- **PASS** P12. An existing learner migrates without loss and is asked once — hash=#/onboarding, v=5, xp=150, ledger=2
- **PASS** P12b. After choosing once, the learner is never redirected again — after choosing=#/dashboard, next load=#/dashboard, xp=150
- **PASS** P13. Mobile onboarding has no horizontal overflow at any step — goal:375/375 board:375/375 class:375/375 confirm:375/375
- **PASS** P13b. Selection cards are keyboard-operable and focus moves to the new heading — card focusable=true, heading focused after step=true
- **PASS** P14. Each step has one heading, states its selection and explains disabled options — h1=1, heading now="Choose your class", announced="Tamil Nadu State Board selected.", every disabled option explained=true, aria-pressed set=true
- **PASS** A1. Wikimedia is requested once per date and never again after a reload — first render=1 call(s), after 2 revisits=1, after full reload=0, cache key=trident:wikimedia-event:2026-09-23
- **PASS** A1b. The card names its source and the date it was loaded for — label="Live data from Wikimedia", line="Live data from Wikimedia · loaded for Wednesday, September 23, 2026"
- **PASS** A2. A different preview date uses a different cache key and its own request — keys=trident:wikimedia-event:2026-09-23, trident:wikimedia-event:2027-06-11
- **PASS** A2b. Remote markup and entities are shown as plain text, never as HTML — event without markup selected today
- **PASS** A3. Nothing is requested until the section is opened, and at most six books load — calls before opening=0, after=1, books rendered=6 (service returned 9)
- **PASS** A4. Reopening the same topic is served from its cache, with no second request — total requests=1, cache key=trident:openlibrary:prehistory reading prehistoric past origins
- **PASS** A5. A saved book survives a full reload and appears in the Collection — saved=1, shown in Collection=1
- **PASS** A6. The same book cannot be saved twice — save → 1, save again (toggles off) → 0, save once more → 1
- **PASS** A8. Saving a book grants no XP — XP 0 before, 0 after
- **PASS** A7. A failed Wikimedia call shows the stated message, keeps the page working and awards nothing — message="Today’s online historical event is temporarily unavailable.Nothi…", XP control present=false
- **PASS** A7b. A failed Open Library call shows the stated message and leaves the lesson usable — message="Online book recommendations are temporarily unavailable.The …", excerpt and citation still present=true
- **PASS** A9. Neither API changes the lesson text or its citation — verbatim excerpt present=true, cited book present=true, Open Library kept out of the citation=true
- **PASS** A10. Requests are spaced a second apart and a repeated topic is not requested twice — 4 searches (one a duplicate) → 3 requests, gaps 1000ms, 1001ms
- **PASS** D1. No Gemini panel, field or mention remains in a lesson page itself — panel=false, input=false, "Ask TRIDENT" in text=false
- **PASS** D1b. The lesson itself, its citation and the books section are untouched — passage+citation=true, Explore More Books=true
- **PASS** D2. The dashboard carries exactly one briefing, after the standing card and the quest — 1 panel(s), after the standing card=true, after the quest=true
- **PASS** D2b. It shows all five sections, the AI label, the source note and a refresh control — sections=all present; badge="AI DAILY GUIDE"; note="Generated from your progress, verified TRIDENT content and today’s Wikimedia event."
- **PASS** D2c. It is not a chat window — there is no open-ended question field — 0 text input(s) inside the card
- **PASS** D3. Every figure on the card is read from localStorage, not from the response — XP 0 vs stored 0; accuracy 0% vs 0%; lessons 0/5
- **PASS** D4. A response claiming 19 of 20 lessons and 9,999 XP cannot move a single figure — card shows 0/5 lessons and 0 XP after a response claiming 19/20 and 9,999
- **PASS** D5. The recommended next step is an existing route that opens real content — "Continue Lesson" -> #/lesson/l-tn9-prehistory -> "Reading the Prehistoric Past"; one of the 3 ids the browser itself offered
- **PASS** D6. The event keeps its own year, link and Wikimedia label, separate from the AI text — label="Live historical data from Wikimedia", year=1869, link=https://en.wikipedia.org/wiki/Suez_Canal…
- **PASS** D6b. The AI explanation is marked as such and never called a textbook — "Why it matters — It mattered then. It still matters now.…"
- **PASS** D7. Revisiting the dashboard on the same date makes no further request — 1 request(s) before, 1 after three more visits; cache key trident:daily-brief:2026-09-23:school-tamil_nadu_state_board-9
- **PASS** D7b. A full page reload is served from the cached briefing, with no request — 0 request(s) after reload (was 1 before), 1 cache key
- **PASS** D8. Changing the learning profile produces a different cache key and one new request — trident:daily-brief:2026-09-23:school-tamil_nadu_state_board-9 → trident:daily-brief:2026-09-23:school-cbse-10
- **PASS** D9. With the backend unreachable the deterministic briefing is shown, with the stated sentence — "Personal AI briefing is temporarily unavailable. Your progress and daily…"; no AI explanation shown; no technical detail
- **PASS** D10. Reading or refreshing the briefing awards no XP and writes no progress — XP 0 -> 0, reward ledger 0 -> 0
- **PASS** D11. A Class 6 profile is served Class 6 questions, or the day is openly labelled mixed — today's five questions are class 6, 6, 6, 6, 6; TN class 6 bank holds 6; labelled mixed=false
- **PASS** D11b. Class 8, 9 and 10 questions never appear unannounced for a Class 6 learner — every question is class 6
- **PASS** D12. An arrange-in-order question starts out of order and counts as unanswered — 1 ordering question(s), starting order [3,2,1], 0 of 5 steps marked answered
- **PASS** D12b. With every other question answered, the untouched ordering list is what blocks submission — blocked on question 4 ("Question 4 has no answer yet."), then accepted once the list was moved
- **PASS** D15. A fallback card offers a live "Retry AI Briefing", never a disabled "Up to date" — button reads "Retry AI Briefing", disabled=false
- **PASS** D16. A fallback is not written to the cache, so the next visit can try again — 0 cache key(s) after a failed briefing
- **PASS** D16b. Returning to the dashboard after a failure asks the guide again — 1 request(s) before, 2 after
- **PASS** D17. Retry replaces the fallback with the real briefing, without reloading the page — "Welcome back, Class 9 Explorer.…" -> "Welcome back, Class 6 Explorer.…", same URL=true
- **PASS** D17b. Only the real briefing is then cached for the day — 1 cache key, button now reads "Up to date"
- **PASS** D18. The twin-fish launcher sits bottom-right, labelled and keyboard-reachable — aria-label="Ask TRIDENT — Your personal history learning guide", art=assets/trident-fish.png, tooltip="Ask TRIDENT"
- **PASS** D18b. It is not a navigation tab — no AI entry in the desktop or mobile navigation
- **PASS** D19. Clicking the fish opens a dialog and closes it again, never changing the URL — role=dialog, aria-modal=true, URL unchanged=true
- **PASS** D19b. It carries the stated heading, subheading, four suggestions and the 200-character input — "Ask TRIDENT" / "Your personal history learning guide"; suggestions: What should I study next? · Explain today’s historical event · How is my progress? · Quiz me on today’s lesson
- **PASS** D19c. Opening the panel moves focus into it and pauses the fish — focus inside=true, animation paused=true
- **PASS** D20. A typed question reaches the existing endpoint and its answer is shown — "Your next lesson is the one on your card, and it follows on …"
- **PASS** D20b. Asking awards no XP and writes no progress — XP 0 -> 0, reward ledger 0 -> 0
- **PASS** D20c. A suggestion button asks its own question — "Explain today’s historical event"
- **PASS** D21. Three rapid clicks on one suggestion produce exactly one request — 1 request(s) from 3 clicks
- **PASS** D22. An unrelated question is refused, with no answer shown in its place — "Your Daily Guide only covers what is on this dashboard: your p…"
- **PASS** D22b. Only the last three questions are kept, in memory — never in storage — kept ["four?","three?","two?"]; 0 storage keys mention questions
- **PASS** D23. Escape closes the panel and returns focus to the fish — closed=true, focus returned=true
- **PASS** D23b. Questions and answers are gone after a refresh — 0 question(s) and 0 answer(s) survived the reload
- **PASS** D24. The fish is on every signed-in route, and causes no horizontal overflow — 8/8 routes show it, 0 overflow
- **PASS** D24b. It is not offered on the welcome screen or during first-run setup — hidden before sign-in = true
- **PASS** D25. On mobile the launcher clears the bottom navigation and the panel is a bottom sheet — clears the nav=true, full-width sheet=true, overflow=false
- **PASS** D25b. The close button closes it
- **PASS** D26. With prefers-reduced-motion the fish hold still and the sparkle is off — swim=off, drift=off, sparkle=off
- **PASS** D26b. Otherwise the fish swim and sparkle, and hold still while the panel is open — companion-swim + companion-sparkle; paused while open=true
- **PASS** D27. The permanent question box is gone, and the briefing itself is untouched — briefing present=true, old box=false, text inputs in the page body=0
- **PASS** C1. Tamil Nadu Class 7 is offered and no longer says "coming soon" — "Class 710 lessons"
- **PASS** C1b. Ten Class 7 lessons exist, each with book, chapter, pages, passage id, board and class — 10 lessons over 10 chapters, 10 distinct source passages
- **PASS** C1c. A Class 7 lesson opens and shows its citation — citation reads "Source: Social Science, Standard Seven, Term I (Volume 3) · Unit 1 — Sources…"
- **PASS** C2. A Class 7 learner is quizzed only on Class 7 evidence — today's five are class 7, 7, 7, 7, 7; bank holds 12 cited questions (cause, chronology, date, match, mcq)
- **PASS** C3. No class is advertised as available without lessons behind it — every class label matches the lessons that exist
- **PASS** C4. The dashboard is three cards, about one screen, with no repeated board label — 3 cards, 1470px against a 761px viewport, board named 0× in the page body
- **PASS** C4b. Each card has one heading and they do not repeat — Level 1 — Explorer | Welcome back, Class 7 Explorer.
- **PASS** C5. The fish leaps once on hover, once on focus and once on tap — hover=true, keyboard focus=true, tap=true, the fish also takes focus=true, splash element=true
- **PASS** C5b. The leap lasts 500–700ms and a resting pointer does not restart it — 640ms; 4 further pointerenter events during the cooldown produced 0 extra leap(s)
- **PASS** C6. With prefers-reduced-motion the fish glows instead of jumping — leaping=false, glowing=true, idle animation=none, ripple=none
- **PASS** E1. A Tamil Nadu Class 7 learner with two lessons done sees 2 of 10 — card reads 2/10; the class holds 10 lessons
- **PASS** E6. The browser sends those same class-specific figures to the endpoint — lessonsCompleted=2, lessonsAvailable=10
- **PASS** E2. A Tamil Nadu Class 6 learner is measured against Class 6 — card reads 1/3 against 3 Class 6 lessons
- **PASS** E3. A CBSE learner is measured against their own CBSE class — card reads 0/2 against 2 CBSE Class 12 lessons
- **PASS** E4. Changing class changes the denominator and deletes nothing earned before — Class 7 showed 2/10, Class 6 now shows 1/3; 3 completed lessons and 320 XP all kept
- **PASS** E5. The Library board overview still reports the whole board — gateway reads "Lessons completed3 / 24" against 24 Tamil Nadu lessons in all
- **PASS** E7. A reply claiming 19 of 20 still cannot move the figure on the card — the response said 19 of 20; the card reads 1/3
- **PASS** E8. A briefing cached by the old build never reappears, and nothing else is cleared — "2 of 25" shown=false, stale entry dropped=true, re-cache=true, Wikimedia caches kept=1, progress untouched=true
- **PASS** D13. No API key, and no mention of one, is reachable from the browser — nine served files and localStorage all clean
- **PASS** D14. The request carries only the seventeen named fields, and at most three lessons — 17 fields, 3 lesson(s) as id/title/route; 738 bytes sent of a 708-byte state
- **PASS** R20. All baseline (pre-redesign) checks still pass — 51/51 baseline checks pass
- **PASS** P15. All learning-profile checks pass alongside the earlier suites — 19/19 profile checks pass
- **PASS** No uncaught page exceptions
- **PASS** No unexpected console errors
- **PASS** R16. No console errors or uncaught exceptions across the redesign — page exceptions=0, console errors=0

## Full result list — Daily Briefing server (35)

- **PASS** B1. No file the browser can fetch contains or names the API key — 12 files checked
- **PASS** B1b. .env is ignored by git and .env.example holds only an empty variable — .env.example = "GEMINI_API_KEY="
- **PASS** B2. GET reports only whether the feature is on — never the key — GET -> {"available":true}
- **PASS** B3. A valid summary produces a briefing naming a supplied lesson — status 200, recommended l-tn6-history-meaning
- **PASS** B4. A progress sentence containing figures the server never supplied is replaced — shown: "You have completed 3 of 20 lessons. Your current streak is 4 days."
- **PASS** B5. A recommended lesson id that was never offered falls back to a real one — asked for l-does-not-exist, returned l-tn6-history-meaning
- **PASS** B6. Unknown lesson ids are dropped, and a known id keeps the server’s own title and route — kept 1 of 2, route #/lesson/l-tn6-harappa-discovery
- **PASS** B7. A name, saved books, history, device data, paths and raw storage never reach the prompt — 7 forbidden values, none present
- **PASS** B8. Over-long text is cut and control characters are stripped — board 60, title 160, description 240
- **PASS** B9. The event explanation is capped at two sentences — "One. Two."
- **PASS** B10. With no key the deterministic briefing is returned, not an error — status 200, reason unconfigured
- **PASS** B11a. With an exhausted quota the student still gets a full briefing — reason rate-limited, no provider wording in the response
- **PASS** B11b. With an unusable reply the student still gets a full briefing — reason bad-json, no provider wording in the response
- **PASS** B12. The same summary three times over makes one request — 1 call(s) for 3 requests
- **PASS** B13. A summary with changed progress is treated as a new briefing — 2 calls for 2 different summaries
- **PASS** B14. A summary with no recognised learning path is rejected, not guessed at — status 400 and 400
- **PASS** B15. Too many requests a minute are refused with a plain sentence — 4 of 12 refused — "The briefing is limited to 8 requests a minute. Please wait …"
- **PASS** B16. Gemini is given the instruction the specification states — 379 characters, all four required sentences present
- **PASS** B17. The prompt marks the Wikimedia event as encyclopaedia data, not a textbook — both guard rails present in the prompt
- **PASS** B18. Any figure outside the supplied set is detected as invented — supplied figures pass, invented figures are caught, prose is untouched
- **PASS** B19. An empty reply leaves every field filled from the local template — all seven fields present, none invented
- **PASS** B20. A busy model falls through to the next one, in order — tried a → b → c
- **PASS** B21. A fault that is not overload stops at the first model — no silent reroute — tried a, reported bad-key
- **PASS** B22. When every model is busy the failure is reported, not swallowed — tried a → b
- **PASS** B23. The server reads no passage corpus — the quarantined files cannot be reached — the only data file read is data/lessons.json
- **PASS** B24. Every lesson the server can recommend matches data/lessons.json exactly — 30 lessons indexed, 0 mismatched
- **PASS** B25. A student can ask what to study next and gets an answer about their own progress — "You have 3 of 20 lessons done, so the next one is a good place to go."
- **PASS** B26. A student can ask why today’s event matters — "It opened a shipping route between two seas, which changed how goods moved."
- **PASS** B27. An unrelated question is refused, with the four subjects named — "Your Daily Guide only covers what is on this dashboard: your progress, today’s m…"
- **PASS** B28. An answer quoting figures the server never supplied is withheld, not shown — reason unverified, nothing invented reaches the student
- **PASS** B29. A busy model leaves a plain sentence, never the provider’s words — "Your Daily Guide is temporarily unavailable. Everything on the dashboard still works."
- **PASS** B30. An empty question, and one with no learning path, are both refused — status 400 and 400
- **PASS** B31. The guide’s prompt is scoped to four subjects and carries nothing personal — mission, lesson and event present; no personal value in the prompt
- **PASS** B32. The briefing gets 45 seconds and a 600-token ceiling — timeout 45000ms, briefing 600 tokens, guide 400 tokens
- **PASS** B33. A fallback briefing is never cached — the next request tries the model again — 4 model attempts across 2 requests (each retries once), nothing served from cache

## Screenshots

`docs/screenshots/`

| File | What it shows |
|---|---|
| `00-welcome-1440.png` | Welcome screen — parchment page, journey lines, saffron primary button |
| `01-dashboard-desktop-1440.png` | Dashboard at 1440px |
| `02-dashboard-tablet-768.png` | Dashboard at 768px |
| `03-dashboard-mobile-375.png` | Dashboard at 375px with the bottom navigation |
| `04-daily-quiz-1440.png` | Daily Quiz — progress trail, timer, XP preview, all five formats |
| `04b-daily-quiz-result-1440.png` | Daily Quiz after submission — summary, feedback states, evidence cards |
| `05-timeline-challenge-1440.png` | Timeline Challenge |
| `06-historians-passport-1440.png` | Historian's Passport |
| `07-badges-and-artefacts-1440.png` | Badge shelf and artefact collection |
| `08-lesson-reader-1440.png` | Lesson reader on parchment |
| `09-onboarding-1-goal-1440.png` | Learning-goal selection |
| `10-onboarding-2-board-1440.png` | Board selection |
| `11-onboarding-3-class-1440.png` | Class selection, with disabled classes explained |
| `12-onboarding-4-confirm-1440.png` | Confirmation |
| `13-settings-learning-profile-1440.png` | The Learning Profile section in Settings |
| `14-onboarding-mobile-375.png` | Onboarding at 375px |
| `15-event-of-the-day-1440.png` | Historical Event of the Day, with its source label and load date |
| `16-explore-more-books-1440.png` | Explore More Books, with one book saved |
| `17-daily-briefing-1440.png` | The Daily Briefing card with the guide reached |
| `18-daily-briefing-offline-1440.png` | The same card with the guide unreachable — every section still filled |
| `19-ask-trident-companion-1440.png` | The twin-fish companion open as a right-side drawer, mid-answer |
| `20-ask-trident-mobile-390.png` | The same companion as a bottom sheet at 390px |
| `21-class7-lesson-1440.png` | A Tamil Nadu Class 7 lesson with its citation |

## Known limitations

1. **The live Wikimedia API cannot be reached from the test environment.** Its
   egress proxy blocks `api.wikimedia.org`, so the "Historical Event of the Day"
   success path is tested with a canned Wikimedia-shaped response injected into
   `fetch`, alongside the real offline path and the no-image path. On a normal
   machine the live call works; it has not been exercised end-to-end here.
2. **Contrast is measured on computed colours, not rendered pixels.** A text
   node over a semi-transparent layer resolves to its nearest opaque ancestor
   background, which is how the layout is actually built, but it is a model
   rather than a screenshot sample.
3. **The badge and artefact checks drive real UI**, but Perfect Recall, Story
   Keeper and Ancient Explorer are verified by their conditions rather than by
   playing through several days; only First Step and its artefact are unlocked
   by genuine interaction inside the suite.
4. **Drag and drop is not simulated.** The Timeline Challenge's keyboard path is
   tested fully; the pointer path shares the same reorder function.
5. **No test covers a real multi-day streak**, because the app's simulated-date
   control is the only way to move days and each change resets the in-page state;
   streak behaviour is tested one date at a time.
6. **The competitive-examination profile is checked at the selection step**, not
   by completing a full TNPSC session, since that path reuses the same verified
   State Board and CBSE material the school paths already cover.
7. **The dark reading theme is not contrast-tested.** R18 measures the bright
   default theme, which is what the application now opens in.
8. **Neither external service is called for real in this environment.** Both are
   stubbed, so request counts, caching and failure handling are verified, but
   the live response shapes are not. The Wikimedia mapping is unchanged from the
   version that worked against the live feed earlier in the project; the Open
   Library mapping follows the documented `search.json` fields and should be
   confirmed once on a machine with network access.
9. **The seven-day Open Library cache expiry is not tested by waiting.** The
   read path checks the stored timestamp; only the fresh and offline branches
   are exercised.
10. **Gemini is never called for real here.** The container's proxy blocks
    `generativelanguage.googleapis.com`, so the request shape, the model name
    and the structured-output schema have not been confirmed against the live
    service from this environment. `npm run diagnose` makes exactly that call on
    a networked machine and reports the result. Everything TRIDENT does with a
    response — figure checking, lesson-id checking, caching, failure wording —
    is tested exhaustively against a stub.
11. **The model's own wording is not tested,** only what TRIDENT will accept
    from it. A bland or oddly-phrased briefing would pass; what cannot pass is
    an invented figure, an invented lesson, a third sentence of event
    significance, or any claim that the Wikimedia event came from a textbook.
12. **The manual refresh is allowed once per day and is not time-tested.** The
    control unlocks when the progress fingerprint changes and locks again after
    one use; the day boundary itself is driven by the calendar date, which the
    suite exercises through the simulated-date control rather than by waiting.
13. **The request-rate limit is per browser address and in memory.** It resets
    when the server restarts and does not span multiple server processes, which
    is appropriate for a single-machine prototype and not for deployment.
