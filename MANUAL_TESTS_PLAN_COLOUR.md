# Manual Tests: Plan colour + Replace PDF

Covers three changes that ship together on `claude/site-right-plan-colour-ms4lt0`:

1. The single-plan viewer no longer forces greyscale.
2. Locally imported PDFs are stored as imported, and the two grayscale
   migrations are retired.
3. "Replace PDF" swaps the PDF behind an existing plan, keeping its pins.

Device testing is the real check — the app cannot be exercised end to end
without a phone. Logic is covered by `utils/__tests__/planReplacement.test.ts`
and `utils/__tests__/planCoordinates.test.ts` (`npx jest`).

## 1. Colour in the viewer

- [ ] Import a colour PDF (services drawing, fire strategy shading, coloured
      escape routes) → open it in the single-plan pan/zoom view → colour is
      visible.
- [ ] Pinch-zoom well past 100% → line work stays sharp. It used to blur,
      because the import path rebuilt the PDF as a 1.5× raster.
- [ ] Drop a pin, reopen the plan → the pin is where it was left.

## 2. Nothing re-greys a stored plan

- [ ] Force-quit and reopen the app → the plan is still in colour.
- [ ] Clear app data (or install the APK fresh) and re-import the same PDF →
      still colour. This is the case the retired migrations would have broken:
      their "already done" flags are per-device, so a clean install used to
      re-grey every plan permanently.
- [ ] With plans already on the device, watch the log on startup → no
      `Grayscale migration ...` work, no plan thumbnails changing.

## 3. Exports and the report stay greyscale

- [ ] Export the project ZIP → the `.pdf` inside it is greyscale.
- [ ] Generate the Word report → plan images in it look as they did before.
- [ ] Plan thumbnails in the project list are still greyscale (deliberate —
      only `plan.url` carries colour).

## 4. Replace PDF — same page size (the common case)

Use a plan that already has several pins spread across the page.

- [ ] Tap 🔧 to enter management mode → each plan shows **Replace PDF** next to
      Rename and 🗑️.
- [ ] Tap **Replace PDF**, pick the colour original of that same plan → no
      prompt appears, toast reads "Plan PDF replaced successfully".
- [ ] Open the plan → it is in colour, and **every pin is exactly where it
      was**. Compare against a screenshot taken beforehand.
- [ ] Pin count is unchanged; opening a pin still shows its photos, comment
      and status.
- [ ] The plan's name and its position in the list are unchanged.
- [ ] Force-quit and reopen → the replacement and the pins survived.

## 5. Replace PDF — different page size

- [ ] Replace a plan with a PDF at a different page size (e.g. the A3 version
      of an A1 plan) → the amber "Page size differs" prompt appears, showing
      both sizes in points and the scale factor.
- [ ] Choose **Rescale pins** → pins land over the same features on the new
      drawing. This is the option to use when re-importing the colour original
      of a plan that was greyscaled (and so page-inflated) historically.
- [ ] Repeat, choosing **Keep pin coordinates** → the PDF is replaced and the
      pins keep their raw positions.
- [ ] Repeat, choosing **Cancel** → nothing changes: same PDF, same pins.
- [ ] Replace with a PDF whose proportions differ (portrait vs landscape) →
      the prompt additionally warns that no rescale can line every pin up.

## 6. Replace PDF — error handling

- [ ] Pick a file that is not a readable PDF → toast "Could not read that PDF",
      the plan is untouched.
- [ ] Open the picker and cancel without choosing a file → nothing happens.
- [ ] Pick the *same* file twice in a row → the second attempt still runs (the
      input is cleared between uses).

## 7. Sync

There is no per-plan dirty flag: push uploads every plan's current `plan.url`.

- [ ] After replacing a plan's PDF, push the project → the server receives the
      colour PDF.
- [ ] Pull onto a second device → the plan arrives in colour with pins aligned.

## Notes

- Plans that were greyscaled by an earlier build cannot be recovered in place:
  no colour original is stored anywhere (single `url` column, the offline
  queue's `File` does not survive a restart, and push uploaded the grey copy).
  Replace PDF with the source file is the only way back — hence this feature.
