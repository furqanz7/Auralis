# Auralis Crystal Icon Design

## Scope

Use the supplied crystal artwork only for browser and device icons. Keep every visible Auralis wordmark and all page layouts unchanged.

## Source And Treatment

- Source: `/Users/Furqan/Downloads/IMG_2127 2.JPG`
- Preserve the artwork's monochrome crystal, glow, rings, and black background.
- Use one centered square crop with enough breathing room for platform masking.
- Do not redraw, recolor, sharpen, or add typography.

## Outputs

- A PNG favicon for browser tabs.
- A 180 x 180 PNG Apple touch icon.
- 192 x 192 and 512 x 512 PNG web-app manifest icons.
- New asset filenames so browsers do not continue using the previous cached icon.

## Integration

- Add the favicon and Apple touch icon links to every HTML entry point.
- Replace the existing multicolour SVG icon references in `site.webmanifest` with the new crystal PNG icons.
- Leave the in-page React brand components and their styling untouched.

## Verification

- Add a regression test covering all HTML icon links and manifest sizes.
- Run the complete test suite and production build.
- Verify the production page resolves each icon successfully after deployment.
