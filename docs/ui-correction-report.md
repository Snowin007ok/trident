# TRIDENT — UI/UX correction pass

This pass fixes what the interface was getting wrong. It does not redesign the app or add features.

Nothing about what the app teaches or records has changed:

- **Data:** lessons, questions, answers, citations and page references are unchanged.
- **Learner records:** saved progress, XP, streaks and the reward ledger are unchanged.
- **Behaviour:** the daily selection is unchanged.
- **Integrations:** Wikimedia, Open Library and Gemini are unchanged.
- **Source material:** nothing in `APP DATABASE`, `TRIDENT_DATABASE_PREP`, any PDF or any chunk file was touched.

## What each element now means

| Element | Meaning |
|---|---|
| Tricolour band under the header | Brand identity, and nothing else |
| Navy meter | Learning progress (course, lesson journey, setup) |
| Teal meter | Quiz position |
| Flame + "N days" | Study streak |
| Star + "N XP" | Experience points |
| Green | Correct or finished |
| Red | Incorrect or error, and only that |
| Saffron | The primary action and the selected navigation |
| Portrait | The learner's profile |

## The seven fixes

1. **Header tricolour.**
   - **Before:** a long saffron section, an invisible white section and a green section. It read as a progress bar two-thirds done.
   - **After:** three touching, equal stripes, full width and 4px high.
     - Colours are `#FF9933`, `#FFFFFF` and `#138808`.
     - A navy hairline runs above and below, so the white stripe stays visible on parchment.
     - It is `aria-hidden`, with no progress attributes, no rounded ends and no animation.
     - It is identical on every route and at every progress level.
   - The tricolour was also removed from two places where it had been acting as progress:
     - the unused XP bar;
     - the mobile era route, which is now a plain dashed line.
2. **Continue your journey.**
   - **Before:** three outlined boxes.
   - **After:** the shared meter.
     - One rounded 10px track, filled navy to exactly `done / total`, with small ticks at chapter boundaries.
     - Text above reads "0 of 3 chapters explored" and "0%".
     - When everything is done, it shows "All explored" with a tick.
   - The button changes with progress: "Start your first lesson", then "Continue reading", then "Review lessons".
   - The picture keeps its proportions (`object-fit: cover`, fixed column) and sits on one grid with the text.
3. **The two header zeros.**
   - **Before:** a flame and a bare "0", then a sun and another bare "0".
   - **After:** "0 days" and "0 XP", with singular and plural handled ("1 day", "2 days"). XP is written "1,250 XP".
   - The sun icon is now a star, used everywhere XP appears.
   - Each figure is plain text, not styled as a button, and quieter than the class chip.
   - Each has a tooltip on hover and keyboard focus.
   - The accessible labels are "0-day learning streak" and "0 experience points".
   - On a phone, the labels stay visible; only the word "Explorer" is dropped.
4. **Learn page course progress.**
   - Uses the same meter, with the text "0 of 3 lessons read — 0% of the course".
   - The action sits in its own column with clear space between it and the bar: "Start learning", then "Continue reading", then "Review lessons".
   - The lesson reader's class bar is the same meter.
5. **Quiz.**
   - **Progress header:**
     - The circular medallion is gone.
     - "Question 1 of 5" sits on the left and "20% complete" on the right, above one continuous teal track (20%, 40%, 60%, 80%, 100%).
     - The track is never red.
   - **Answer cards:**
     - Every state keeps a 2px border and the same radius, so nothing jumps.
     - Default: neutral. Hover: navy. Chosen: navy with a filled radio.
     - Correct: green border, radio, icon and "Correct answer", all one green.
     - Your wrong answer: red border, radio, icon and "Your answer", all one red.
     - The orange border that used to appear alongside the red label is gone.
     - Keyboard focus draws a 3px ring outside the card.
     - Long answers wrap. On a phone, the status label moves under the answer text.
6. **Textbook image caption.**
   - **Order:** the small "Verified textbook image" badge, then the description (22px, semibold, the strongest line), then the full citation (quieter, 9.6:1).
   - The caption is a solid navy band under the picture, never over it. It uses fixed colours, so it reads the same in the dark theme.
   - The citation text is unchanged.
   - The Home hero and the story picture use the same caption. On a phone, the hero puts the mission first and the picture after it.
7. **Portrait avatars.**
   - **Before:** an "L" in a circle labelled "Guest learner".
   - **After:** a circular portrait with a navy ring and a gold keyline.
   - **Button:** shows the portrait and the name "Explorer".
   - **Menu:** shows "Local learner profile — progress is saved on this device." and a picker of ten portraits.
   - **Picker:** a keyboard-operable radio group, where each target is at least 44px.
   - **If a portrait fails to load:** the TRIDENT emblem takes its place.
   - **Not changed:** the TRIDENT logo itself.

## Other corrections

- **Sticky header:** fully opaque, with z-index 30. `--header-h` is set once, and `scroll-padding-top` uses it, so anchors and focused headings land below the header. Header content can no longer spill past the right edge at 1280 and 1440.
- **Type:** body text is now 16px (it was 15). Labels and metadata are 13–14px. Answer text is regular weight, not bold. There are no all-caps eyebrows.
- **Spacing:** phone gutters are now 16px each side (they were 12). The route under the hero no longer starts a line with a stray dash. The hero facts no longer start a line with a stray dot.
- **Zero states:**
  - Progress shows "No lessons completed yet".
  - The first-time button reads "Start your first lesson".
  - The streak tile reads "0 days".
  - Quiz accuracy with no answers reads "No quiz yet", instead of a green "0%".
- **Colour:** the quiz-accuracy figure is navy rather than decorative green.
- **Onboarding:**
  - Its selection cards had no styles at all. They are now proper cards with a selected state.
  - The loose "1 2 3 4" step labels are replaced by "Step N of 4" on the shared meter.
- **Touch targets:** the brand link, the nav links, the class chip and "Save to archive" are all at least 44px.

## Avatars

The ten portraits from `kings.zip` were extracted as copies. The ZIP was read-only, and `__MACOSX` and Apple metadata files were skipped.

Each portrait was cropped to its face, checked by eye and saved as a 256px WebP in `assets/avatars/`. `data/avatars.json` maps each one to its original file name and SHA-256, and records the crop, the alt text and, where the file name states it, the name.

| id | Original file | Name shown |
|---|---|---|
| portrait-01 (**default**) | `2529b984affc43c7dcf738e407f1a669.jpg` | none |
| portrait-02 | `Alexander-the-Great-detail-painting-Porus-Charles.webp` | Alexander the Great |
| portrait-03 | `Che_Guevara_-_Guerrillero_Heroico_by_Alberto_Korda.jpg` | Che Guevara |
| portrait-04 | `charlemagne.webp` | Charlemagne |
| portrait-05 | `d4d97173f0dc45f1c6eb9b4376bc0e21-68428303a7e55.jpg` | none |
| portrait-06 | `dimichele-1.jpg` | none |
| portrait-07 | `forzqx2ssqbwermvcguuj4fy_647_101515120457.avif` | none |
| portrait-08 | `images (1).jpeg` | none |
| portrait-09 | `images.jpeg` | none |
| portrait-10 | `rubens412.jpg` | none |

None of the files carries embedded title, creator or subject metadata. Names therefore come only from the three file names that state them. The other seven get a description of what is visible, with no identity guessed from a face.

**How the choice is stored:** storage schema v7 adds one field, `avatarId`, holding only the chosen id.

- It starts as `null`, which shows the fixed default, portrait-01. There is no random rotation.
- The v6 → v7 migration adds that one field and touches nothing else.

## Tests

- **`npm run test:ui`: 37 of 37 pass.** Checks 1–15 and 19–31 were kept. Check 5 was updated, 11 and 15 were widened, and 16–18 and 32–37 are new or rewritten. How they map to the 20 required tests:

| Required test | Check |
|---|---|
| 1. Tricolour: three equal, continuous sections, never changes with progress | 16 |
| 2. Course progress 0 / 33.33 / 66.67 / 100% | 17 |
| 3–4. "0 days", "0 XP", "1 day" | 32 |
| 5–6. Quiz 20% → 100%, never red | 18 |
| 7–10. Green, red, constant borders, no overlap with long answers | 33 |
| 11. Caption title and citation contrast | 34 |
| 12–14. Avatar survives reload, progress untouched, fallback | 35 |
| 15. Sticky header never covers content | 36 |
| 16. No overflow at 375, 768, 1280 and 1440, including clipped text inside cards | 15 |
| 17. Visible keyboard focus | 11 and 32 |
| 18. Reduced motion | 12 |
| 19. Data byte-for-byte unchanged | 37 (SHA-256 against the committed files) |
| 20. Zero console errors and uncaught exceptions on all 11 routes | 15 |

- **`npm test`: 36 of 36 pass.**

## Files changed

| File | Change |
|---|---|
| `css/tokens.css` | flag, meter, caption, header-height and navy-wash tokens; 16px body |
| `css/base.css` | tricolour band, the meter, header stats and tooltips, profile button, avatar frames, profile menu, sticky header |
| `css/components.css` | journey card, course row, quiz answer states, caption hierarchy, hero caption band, onboarding cards |
| `css/responsive.css` | phone header, answer layout, hero order, 16px gutters |
| `js/ui.js` | `progressMeter()` and `percent()` — the one progress component |
| `js/avatars.js` | **new** — manifest, default, picker and fallback |
| `js/app.js` | labelled header figures, profile menu with picker, journey meter, hero facts |
| `js/library.js` | course meter, action wording, reader meter |
| `js/quiz.js` | position-based quiz meter; medallion removed |
| `js/progress.js` | path meters, zero states |
| `js/onboarding.js` | step meter |
| `js/storage.js` | schema v7 (`avatarId`), `setAvatar()` |
| `js/icons.js` | XP star |
| `data/avatars.json`, `assets/avatars/` | **new** |
| `docs/redesign-checks.mjs` | checks updated and added (see Tests) |
| `README.md` | structure lines |

## Limitations

- **Portrait rights.** The ten portraits came in the ZIP with no licence information. Several look like modern paintings or photographs. The site is public, so check that you may use them before publishing.
- **Two portraits worth a second look.**
  - portrait-08 (`images (1).jpeg`) is a modern staged photograph of a real person, not a historical portrait.
  - portrait-03 is a well-known photograph of a political figure.

  You may want to drop either one; it is a one-line change in `data/avatars.json`.
- **Changed quiz behaviour.** The quiz meter now follows the question you are on, as this brief asks. The previous pass had made it count answered questions, so question 1 showed 0%.
- **Browsers tested.** Everything was checked in Chromium only. The meter uses the native `<progress>` element, styled for WebKit and Firefox, but it was not tested in Safari or Firefox.
- **Live Wikimedia.** Wikimedia is still unreachable from both test environments, so Today in History shows its real "could not be loaded" state in the screenshots.

## Screenshots — `docs/screenshots/ui-correction/`

1. `1-dashboard-1440.png`
2. `2-learn-library-1440.png`
3. `3-journey-card-1440.png`
4. `4-quiz-before-answering.png`
5. `5-quiz-after-incorrect.png`
6. `6-verified-image-caption.png`
7. `7-profile-avatar-picker.png`
8. `8-dashboard-375.png`
9. `9-quiz-375.png`
