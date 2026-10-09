# Premium UI redesign: report (2026-10-09)

## 1. Design direction and inspiration

**Direction: "calm control room".** This follows the ISA-101 / high-performance HMI rule that grey means normal, so colour appears only for PASS / REVIEW / REJECT or when something needs attention. It borrows the restraint of modern product dashboards (Tremor, Vercel Geist, Linear).

- **Themes.** The default is light, which suits projectors and bright factory floors. A dark "night shift" theme can be switched on from the top right, and the choice is remembered on that computer. If the user has not chosen, the computer's own setting decides.
- **Colour.** Surfaces are neutral grey and white. One blue accent marks things you can press. PASS is green, REVIEW amber and REJECT red, always together with an icon and a word.
- **Type.** Geist for text and Geist Mono for part IDs and timings. Every number uses tabular figures.
- **Spacing and shape.** Everything sits on a 4 px grid. Corner radii are 6, 9, 14 and 18 px. Cards have 1 px borders and almost no shadow.
- **Reusable pieces.** Panel, KPI strip, verdict card, 4-step severity meter, status dots, segmented control, chips, version cards, zone bar with handles, skeleton loaders, empty states, notes and error banners, plus a modal review viewer.

**References I actually read:**
- Tremor component source (Card, CategoryBar, BarList, AreaChart, ProgressBar) and the shadcn/ui dashboard.
- Siemens iX classic light and dark tokens.
- ISA-101 / high-performance HMI guides: Tatsoft, Inductive Automation, Control Engineering, the ASM Consortium white paper and the Emerson DeltaV themes.
- Cognex VisionPro and LandingLens review screens.
- Keyboard review patterns in Roboflow, Label Studio, Labelbox and Lightroom.
- WCAG 2.2 and the IBM Carbon status rules.

**References I could not inspect:** Dribbble, Behance and Mobbin (blocked or behind a login).

I did read Awwwards, 21st.dev and Aceternity. They are catalogues of marketing effects (glow, glass, beams, shaders), so I used them only as a list of things to avoid in an operator tool.

## 2. Main improvements (the 5 biggest opportunities)

1. **The result is easy to read at a glance.**
   - A verdict card shows the decision icon and word next to a Low / Medium / High / Critical meter.
   - Part names are short (`cast_def_0_1493`), with the full name on hover.
   - Likely-cause rows show the reading, the normal value and the SHAP bar, followed by the fix and the work-order button.
   - A check-time bar splits the time between the defect model and the anomaly model.
   - A recent-parts filmstrip shows real thumbnails.
2. **Colour is honest.**
   - KPI colour appears only for rejects and parts waiting.
   - First-pass yield gets a meter, so it is no longer shown in green at 0%.
   - The rejected count is split by defect type.
   - Low-risk machines are grey instead of green.
3. **Reviewing is faster.**
   - The review queue sits beside the inspector on wide screens.
   - Cards say "Unusual surface · anomaly 0.817" or "Possible blowholes · 42% sure".
   - The large viewer has a details panel and Pass / Reject buttons, with keys P, R, 1 / 2 / 3, ← → and Esc. After each decision it opens the next part.
4. **Charts show the evidence.**
   - The early-warning chart has a score axis, gridlines, shaded warning and reject zones, and a hover readout.
   - A stats row shows the latest score, the trend, and the time left to the warning and reject lines.
   - Machine risk bars have a 0–100 % scale.
   - The review-range handles now sit on the zone bar itself.
5. **It reads well everywhere.**
   - Light and dark themes, plus a page title and one-line purpose for each tab.
   - Tablet and phone layouts, with a bottom tab bar on screens 860 px wide or less.
   - Loading skeletons and clear empty and error states.
   - Subtle motion that switches off when the computer asks for reduced motion.

## 3. Frontend files changed

- `web/src/styles.css`: rewritten as a token-based design system with light and dark themes.
- `web/src/App.jsx`: layout only (page title, banner icon). The state, polling, refresh and hash routing are the same.
- `web/src/format.js` (new): display helpers only (short part name, time, labels).
- `web/src/components/`: Header, Kpis, Inspector, ReviewQueue, EarlyWarning, MachineRisk, SelfLearning and ReviewRules were all restyled. Icon.jsx gained new icons with the same API.
- `web/index.html`: sets the theme before the first paint and updates the theme colour.
- `web/vite.config.js`: the dev proxy now also forwards `/retrain` and `/rules`. This only affects `npm run dev`; the built app was already fine.
- `web/dist`: rebuilt.
- Unchanged: `web/src/api.js`, `web/src/main.jsx`, `package.json`.

## 4. Backend and business logic

- **Not touched:** `api.py`, `qi/`, models, data, the Dockerfile and the dependencies.
- **Same requests.** `api.js` is byte-identical, so every request goes through the same function with the same body. The tests logged these calls:
  - POST /inspect (one photo at a time)
  - POST /review/{id} `{label}`
  - POST /work-orders `{machine, action, part}`
  - POST /rules `{ignore_below, reject_above, anomaly_review}`, still debounced at 400 ms
  - POST /retrain/use `{version}`
  - GET polling every 15 s, and every 1.5 s while retraining
- **Small UI-only additions:**
  - The theme switch.
  - In the large review viewer: keyboard shortcuts, Previous / Next and moving on to the next part. These call the same `decide()` as the card buttons.
  - The viewer ignores slow image answers for a part you already left.
  - Focus goes back to where it was when the viewer closes.
- **Display-only formatting:**
  - Short part names.
  - Confidence shown with up to one decimal, so 0.497 shows as 49.7 % and is never rounded onto a threshold.
  - The anomaly score shown exactly as the backend sends it.

## 5. Build and tests

**Build.** `npm run build` (Vite 6.3.7) passes. CSS is 45 KB and JS 193 KB (60 KB gzipped).

**Backend used.** I ran the real FastAPI backend in the cloud with your real `best.pt` and `model.ckpt`.

**Screens.** I captured every tab and the review viewer at 1440 / 820 / 390 px wide, in light and dark. There were 0 console errors and no sideways scrolling.

**Click-through test: 26 / 26 passed.** It covered:
- uploading 4 photos, the heat-map toggle and creating a work order
- Pass on a card
- in the viewer: key 2, →, click zoom, Ctrl+R (correctly ignored), R to reject, moving on to the next part, and Esc
- tabs and the URL hash, and the machine chip
- the slider (one debounced save) and Reset to defaults
- the theme switch, which is kept after a reload

**Self-learning test.** I passed 4 parts with the P key. The retrain started by itself and the progress bar showed it. It created version 2 (exam 35/35, 41.7 s on CPU). I then switched to v1 and back.

**Regression review.** Five independent reviewers looked for problems (behaviour parity, data honesty, accessibility, responsive layout and edge cases), each followed by a skeptical verifier. They made 38 reports, of which 27 were confirmed, and all 27 are fixed. None involved API calls or business logic. Examples:
- The viewer could show the previous part's photo if answers arrived late.
- White text on coloured badges was below the contrast standard.
- The top bar was cramped between 721 and 1240 px.
- 0.497 could be shown as "50%".
- Clicking the anomaly slider track did nothing.

**Failures.** On the first run, two checks failed because my test compared text without ignoring upper case. I fixed the test; the app was not at fault. The final run passed 26/26.

## 6. Not verified / limitations

- **Browsers.** Tested in Chromium on Linux only. It has not been tried in Edge or Chrome on your Windows laptop, and Firefox and Safari have not been tried at all (the Firefox slider styles are written but I have not seen them).
- **PASS screen.** It has not been seen with a real part: all the test photos are defect photos, so no part passed during the tests.
- **Fonts.** They come from Google Fonts. Without internet, the app falls back to Segoe UI.
- **Screen readers.** Not tried with a real screen reader. Keyboard use and ARIA labels were checked through code review and the tests.
- **Ideas not built, because they need backend changes:**
  - undo after Pass / Reject
  - a heat-map opacity slider and colour legend
  - a draft-then-apply step for the review range

Screenshots are in `docs/screenshots/`. To go back to the old UI, see `docs/UI_ROLLBACK.md`.
