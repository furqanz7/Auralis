# Auralis Cinematic Redesign

## Goal

Rework the Auralis landing page into a premium, cinematic studio experience that feels materially rich and intentional, while preserving the current information architecture and copy.

## Confirmed Direction

The approved direction combines Chromatic Noir structure with Molten Editorial materiality:

- Near-black obsidian page surface with warm porcelain typography.
- A single sculptural hero artwork: dark glass, mineral gold, an arterial-red seam, and a precisely limited chartreuse signal.
- Editorial display typography paired with a neutral, high-legibility UI sans-serif.
- Hairline geometry, aligned rails, and open layouts instead of frosted, rounded UI cards.
- Motion is slow and purposeful: image drift, line reveals, service-detail transitions, and scroll reveals.
- Desktop receives a precise cursor ring and coordinate readout; touch and reduced-motion users receive no custom pointer behavior.

## Brand Boundary

The Auralis wordmark remains intentionally isolated from this pass. Keep the existing lockup structure so a later wordmark decision can be swapped in without touching navigation layout, responsive behavior, or section components. Remove the pastel gradient treatment from the current mark so it does not conflict with the new palette.

## Page Composition

### Navigation and hero

- Convert the pill navigation into a thin fixed rail with a line divider and a quiet underlined primary action.
- Replace the existing cosmic bloom and Three.js overlay with `public/assets/auralis-obsidian-hero.png`.
- Keep the hero copy and CTAs, but use a larger editorial display heading, left-aligned negative space, and a compact material note in place of the glass signal panel.
- Show a small cursor-coordinate artifact over the hero art as a static compositional detail; the live pointer layer adds the dynamic response.

### Services and process

- Retain the current four service tabs and active-detail behavior.
- Treat the stage as an open technical rail, not a pair of floating glass cards.
- Use red, chartreuse, porcelain, and mineral accents only as controlled state signals.
- Rebuild the three-step workflow into an aligned horizontal sequence with visible numbering and a shared line, collapsing to a stacked sequence on smaller viewports.

### Work and contact

- Keep the three project records and their CTA behavior.
- Replace generic translucent card styling with large editorial project frames, controlled image crops, grid-line details, and distinct accent positions.
- Keep the contact content, but present it on a black material-image field with a direct mail action and restrained secondary link.

## Interaction and Accessibility

- Introduce a standalone `PointerSystem` component that uses requestAnimationFrame and refs rather than React state on every pointer movement.
- The system must remain `aria-hidden`, use the native pointer underneath, and automatically disable for coarse pointers or reduced motion.
- Hovering a link, button, or project changes the cursor’s label and ring scale without moving layout.
- Keyboard focus states remain visible and use the same chartreuse signal color.
- Existing semantic navigation, headings, links, buttons, and service-tab selection behavior remain intact.

## Responsive Rules

- Desktop: fixed nav rail, hero artwork weighted right, live cursor layer available.
- Tablet: nav collapses to a two-row rail; service and contact layouts become one column.
- Mobile: no custom pointer, no dense coordinate UI, hero image is cropped toward the material seam, actions become full-width, project frames stack, and all text remains readable over a dark image treatment.

## Validation

- `npm run build` succeeds without unused-import or asset-resolution errors.
- Desktop browser check: the page has meaningful content, no framework overlay, no relevant console warnings/errors, and the service selector plus custom pointer interaction update as intended.
- Mobile browser check: no clipped headline, overlapping navigation, or inaccessible CTA; pointer UI remains hidden.
- The final desktop screenshot is visually compared with the accepted blended concept and the standalone hero artwork.
