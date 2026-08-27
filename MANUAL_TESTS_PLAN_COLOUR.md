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

### Known limitation
A plan is only colour here if `plan.url` itself is colour. Plans imported
locally still get greyscaled at import (`PdfPicker.tsx:169`), and two dormant
migrations (`useSiteStore.ts:1410`, `PdfPicker.tsx:832`) will re-grey stored
PDFs on any device where their flags (`grayscale_migration_v3_done`,
`grayscale_migration_v2_done`) are not yet set.
