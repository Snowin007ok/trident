# TRIDENT gamification system

This document is the specification the code implements. Everything here is
deterministic and verifiable: no figure is estimated, no reward is granted for
an activity that did not happen, and nothing can be earned twice.

---

## 1. The rule that governs everything: the reward ledger

Every XP grant is keyed by a **reward id** and written into
`state.awardedRewards` before the XP total changes:

| Activity | Reward id | Keyed on |
|---|---|---|
| Lesson completed | `lesson:<lessonId>` | the lesson |
| Daily Story read | `story:<YYYY-MM-DD>` | the date |
| Daily Quiz completed | `quiz:<YYYY-MM-DD>` | the date |
| Perfect Daily Quiz | `quiz-perfect:<YYYY-MM-DD>` | the date |
| Event of the Day explored | `event:<YYYY-MM-DD>` | the date |
| Timeline Challenge solved | `timeline:<YYYY-MM-DD>` | the date |

`storage.grantReward(id, amount)` returns `0` when the id is already in the
ledger, so reloading the page, navigating backward, revisiting a finished quiz,
un-completing and re-completing a lesson, or replaying a solved Timeline
Challenge all pay out nothing the second time. The ledger is persisted, so this
holds across sessions and across a full browser restart.

Un-completing a lesson deliberately does **not** claw back XP and does **not**
remove the ledger entry. Progress the learner genuinely made is never taken
away, and the entry staying put is what stops a re-completion from paying twice.

## 2. XP values

| Activity | XP | Granted when |
|---|---:|---|
| Complete a lesson | **50** | "Mark complete" is pressed in the lesson reader |
| Read the Daily Story | **30** | "Mark as read" is pressed at the end of the story |
| Complete the Daily Quiz | **100** | the five answers are submitted |
| Perfect Daily Quiz (5/5) | **+50** | submitted with every answer correct — in addition to the 100 |
| Explore Today's Event | **20** | "Explore this event" is pressed on the dashboard |
| Solve the Timeline Challenge | **75** | the four events are checked and the order is correct |

A full day of activity is therefore 150 XP for the three quest tasks, up to 200
with a perfect quiz, plus 75 for the Timeline Challenge and 50 per lesson.

Every grant is announced twice: as a toast, and through the `role="status"`
live region in `index.html`, so a screen-reader user hears
*"Daily Quiz completed: plus 100 XP. Total 380 XP."* and, on a level change,
*"Level up. You are now level 2, Archive Seeker."*

## 3. Levels

| Level | Title | XP required | Span |
|---:|---|---:|---|
| 1 | Explorer | 0 | 0–249 |
| 2 | Archive Seeker | 250 | 250–499 |
| 3 | Chronicler | 500 | 500–999 |
| 4 | Time Navigator | 1,000 | 1,000–1,749 |
| 5 | Master Historian | 1,750 | 1,750+ |

**Why these numbers.** Level 2 arrives after roughly two days of full activity
(or five lessons), which is early enough to feel like a reward for starting and
late enough that it is not free. The gaps then widen — 250, 250, 500, 750 — so
later levels mark real sustained study rather than a week of logins. Level 5 at
1,750 XP is reachable by completing the twenty indexed lessons (1,000 XP) plus
about five full days of quests and challenges; it is an achievable end point for
the content that currently exists, not an unreachable carrot.

The XP bar always shows the position inside the *current* band, with the exact
totals in text beside it, so the bar is never the only source of the number.

## 4. Today's Quest

Three genuine tasks, reset by date:

1. **Read the Daily Story** — +30 XP
2. **Complete the Daily Quiz** — +100 XP
3. **Explore Today's Event** — +20 XP

A task shows as done only when the underlying activity is recorded: the story
and event tasks read the reward ledger, the quiz task reads
`dailyQuizByDate[today]`. Nothing is marked complete by opening a page.

## 5. Badges

Six badges, each with one exact condition, evaluated against stored state by
`gamify.checkUnlocks()` after every award and once at start-up:

| Badge | Condition | Code |
|---|---|---|
| **First Step** | Complete one lesson | `completedLessons` has ≥ 1 entry |
| **Timekeeper** | Complete a Daily Quiz with the timer running | some `dailyQuizByDate[*].timerUsed` |
| **Perfect Recall** | Score 5 out of 5 on a Daily Quiz | some `dailyQuizByDate[*]` with `score === total` |
| **Three-Day Flame** | Reach a three-day streak | `streak.best >= 3` |
| **Ancient Explorer** | Complete three Ancient India lessons | three completed lessons with `era === 'ancient'` |
| **Story Keeper** | Save three Daily Stories | `savedStories.length >= 3` |

A locked badge shows its requirement in full and is never styled or labelled as
earned. An earned badge shows the date it was earned and carries the tricolour
ribbon. Unlocking is one-way and idempotent: `storage.unlockBadge()` returns
`false` if the badge is already recorded, so nothing is announced twice.

## 6. Artefacts

Six collectible artefacts, each tied to one badge, so an artefact can never
appear without the achievement behind it:

| Artefact | Earned with | What it depicts |
|---|---|---|
| Stone Inscription | First Step | a carved slab |
| Navigation Instrument | Timekeeper | a dial for reckoning position and time |
| Historical Seal | Perfect Recall | a stamp pressed into clay or wax |
| Monument Fragment | Three-Day Flame | a piece of worked stone |
| Ancient Coin | Ancient Explorer | struck metal currency |
| Palm-Leaf Manuscript | Story Keeper | text incised on prepared palm leaf |

All six are **original abstract line drawings made for TRIDENT**, drawn inline
as SVG in `js/icons.js`. They illustrate a *category* of object. They are not
reproductions of any particular historical artefact and are not claimed to be —
that statement appears in the interface itself, on both the Collection page and
the Historian's Passport.

## 7. Eras

| Era | Period shown | Indexed lessons |
|---|---|---:|
| Origins | Before cities | 4 |
| Ancient India | c. 2600 BCE – 600 CE | 5 |
| Medieval India | c. 700 – 1700 | 2 |
| Colonial India | c. 1750 – 1947 | 7 |
| Independence | c. 1885 onwards | 2 |

Era membership is a field on each lesson in `data/lessons.json`, assigned from
the lesson's own subject matter and its cited chapter. An era is **complete**
only when every indexed lesson in it is complete, **current** if it is the first
incomplete era, and **locked** only when it has no indexed lessons at all — the
interface never implies that content exists where it does not.

## 8. The Timeline Challenge

Four events per day, drawn from `data/timeline.json` — eighteen events, each one
mirroring a fact already cited in a lesson, with the book, chapter and page
recorded alongside it. **No event, date or citation is invented.**

- The four are picked deterministically from the local date, so the same day
  always gives the same challenge and a different day gives a different one.
- Only events with distinct years are chosen, so the correct order is unambiguous.
- The starting arrangement is shuffled from the same seed and reversed if it
  happens to come out already correct.
- The dates are hidden while the challenge is open — revealing them would give
  away the answer — and shown with their citations once the order is checked.
- Reordering works two ways that do the same job: drag and drop, and per-card
  *move earlier* / *move later* buttons. Every move is announced in a live
  region, and focus follows the moved card.
- Solving it grants 75 XP once per date. Replaying is allowed for practice and
  grants nothing further; the interface says so.
- Three threads — saffron, ivory and green — run behind the board and converge
  into one navy line when the order is correct.

## 9. Migration from schema v1

`storage.migrate()` carries every v1 field across untouched and adds the
gamification fields. Because v1 recorded lessons and daily quizzes but had no
XP, migration **back-credits** the XP for activity that genuinely happened —
50 per completed lesson, 100 per daily quiz, 50 more for each perfect one — and
writes the corresponding reward ids into the ledger, so that activity can never
be credited a second time. The migration is persisted on first load, so it runs
once rather than on every page view. Streaks, saved items, theme, selected path
and reading positions are preserved exactly.

Settings shows the schema version and what the migration did.
