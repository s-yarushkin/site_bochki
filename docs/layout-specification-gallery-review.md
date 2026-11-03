# Specification and gallery review

Compared against the current Google Slides album 1GuLDnKUWfHckXYGTN2Ux5ItNFVd8GAPmY6Qklr7E7b8 (03 November 2026).

- All 14 source-vector snapshots match the current album: 1587 element sizes and transforms.
- Live hashes match all 14 SVG and all 14 GLB files. These assets are unchanged.
- Public tables use all 44 room entries and 160 furniture/equipment entries from the album legend. Room areas agree with the existing specification within rounding.
- Door/window tables show plan opening widths only. No manufacturing door height is confirmed in the album; assumed 2000 mm is not displayed.
- Wall height 2200 mm and other visualization heights are not shown. Wall thickness 45 mm is retained from the album.
- ASTON legend dimensions are displayed as written: 420 x 687 mm (12) and 420 x 670 mm (16), rather than the modeled casing footprint.
- Plan 11 has an existing source inconsistency: the toilet legend says 700 x 450 mm; the modeled footprint is 400 x 635 mm. Public text follows the legend; geometry is preserved as requested.
- Two shoe-shelf entries without numeric codes (plans 12 and 13) are included.
- Examples are a scrolling gallery below model/size/pricing; the generic model CTA no longer silently selects the first layout. Pricing engine and API modules are unchanged.
- Removed the preliminary Deluxe-price sentence; numerical prices and pricebook remain unchanged.

## Validation

- Browser PASS: 1440 and 390 pixel widths, four model views, all 14 unique specification IDs (15 model/example associations), gallery position, independent size picker, no overflow or runtime errors.
- Actual WebGL viewer opens on desktop and mobile; renderer source is unchanged.
- All four standalone model pages use the same scrolling gallery.
- Home hero Node tests (2) and Python build tests (2) passed.
- No lead submissions were made.

## Publication

Reviewed live baseline: /srv/sites/dachapar-preview/releases/HH-2cf7533f5d534d0a.
The prepared overlay changes 18 existing files only. Installation checks all source hashes, copies the complete previous release, verifies the exact changed-file set and public hashes, and restores the previous symlink if checks fail.
Interactive sudo authentication is required; publication has not been performed.
