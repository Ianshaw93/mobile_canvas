## Feature: Colour plans in the single-plan pan view

`PdfViewer` previously forced every rendered page to greyscale
(`grayscaleCanvasInPlace`) regardless of the stored PDF's colour. Removed, so
the pan/zoom view now shows the plan as-drawn.

### Test Cases
- [ ] Open a plan from the plan list → pan view shows the plan in its original colours
- [ ] Coloured detail (e.g. service runs, highlighted zones) is legible when zoomed in
- [ ] Pins still land in the correct positions (render scale unchanged at 1.5×)
- [ ] Tap a pin → pin detail preview still renders (already colour, should be unchanged)

### Edge Cases
- [ ] A plan whose source PDF is genuinely black-and-white → still renders correctly, no tint
- [ ] A plan pulled from the server (not locally imported) → colour
- [ ] Export the project → the `.pdf` inside the ZIP is still greyscale
      (`DownloadProjectButton.tsx:678` is unchanged)

## Feature: Plans stay colour in storage

The viewer only shows colour if `plan.url` itself is colour. Three paths wrote
greyscale into `plan.url` and each undid the viewer fix: the local import in
`PdfPicker.handleFileChange`, and two migrations that re-greyed every stored
plan (`runGrayscaleMigrationIfNeeded`, and `MigrationRunner` in `PdfPicker`).
The import now stores the file as-is; both migrations are inert no-ops.

### Test Cases
- [ ] Import a colour PDF → open it in the pan view → colour
- [ ] Pinch-zoom well past 100% → line work stays sharp. It used to blur, because
      the import path rebuilt the PDF as a 1.5× raster PNG
- [ ] Drop a pin, reopen the plan → the pin is where it was left
- [ ] Force-quit and reopen the app → the plan is still colour

### Edge Cases
- [ ] Clear app data (or install the APK fresh) and re-import the same PDF → still
      colour. This is the case the migrations would have broken: their "already
      done" flags are per-device, so a clean install used to re-grey every plan
      permanently — and the Word report renders from `plan.url`, so the report
      went grey too
- [ ] With plans already on the device, watch the log on startup → no grayscale
      migration work, no plan thumbnails changing
- [ ] Generate the Word report → plan images look as they did before
- [ ] Plan thumbnails in the project list are still greyscale (deliberate — only
      `plan.url` carries colour)

## Feature: Replace PDF

Swaps the PDF behind an existing plan while keeping its pins. Needed because
plans greyscaled by an earlier build cannot be recovered in place: no colour
original is stored anywhere (single `url` column, the offline queue's `File`
does not survive a restart, and push uploaded the grey copy). The button is in
management mode next to Rename and 🗑️.

Use a plan that already has several pins spread across the page, and take a
screenshot of it before starting.

### Test Cases
- [ ] Tap 🔧 → each plan shows **Replace PDF** next to Rename and 🗑️
- [ ] Tap **Replace PDF**, pick the colour original of that same plan → no prompt,
      toast reads "Plan PDF replaced successfully"
- [ ] Open the plan → it is in colour and **every pin is exactly where it was**
      (compare against the screenshot)
- [ ] Pin count unchanged; opening a pin still shows its photos, comment and status
- [ ] The plan's name and its position in the list are unchanged
- [ ] Force-quit and reopen → the replacement and the pins survived

### Edge Cases
- [ ] Replace with a PDF at a different page size (e.g. the A3 version of an A1
      plan) → amber "Page size differs" prompt, showing both sizes in points and
      the scale factor
- [ ] Choose **Rescale pins** → pins land over the same features on the new drawing.
      This is the option for re-importing the colour original of a plan that was
      greyscaled (and so page-inflated) historically
- [ ] Choose **Keep pin coordinates** → PDF replaced, pin positions untouched
- [ ] Choose **Cancel** → nothing changes: same PDF, same pins
- [ ] Replace with a PDF whose proportions differ (portrait vs landscape) → the
      prompt additionally warns that no rescale can line every pin up
- [ ] Pick a file that is not a readable PDF → toast "Could not read that PDF", the
      plan is untouched
- [ ] Open the picker and cancel without choosing a file → nothing happens
- [ ] Pick the *same* file twice in a row → the second attempt still runs (the input
      is cleared between uses)

### Sync
There is no per-plan dirty flag — push uploads every plan's current `plan.url`.

- [ ] After replacing a plan's PDF, push the project → the server receives the
      colour PDF
- [ ] Pull onto a second device → the plan arrives in colour with pins aligned

## Logic tests

Covered by `npx jest` (45 tests):
- `utils/__tests__/planReplacement.test.ts` — page-size comparison and pin
  rescaling for Replace PDF
- `utils/__tests__/planCoordinates.test.ts` — the pre-existing pin-alignment fix,
  unchanged
