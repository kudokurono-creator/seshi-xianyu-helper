# Spectral Hook Lantern Design

## Goal

Add a restrained, B2-weight interaction effect to primary actions: the Sidebar `SeshiMark` charges and throws a spectral hook toward the clicked action, pauses on impact, then either pulls a soul fragment back into the mark on success or breaks the chain on failure.

## Scope

This pass changes visual feedback only. It must not change business logic, API calls, routing, data flow, or page information architecture.

The effect is available only to an explicit primary-action whitelist:

- Add account, sync orders, ship order, import orders
- Add/sync product, add/save card inventory
- Add/save keyword or delivery rule, save default reply
- Save system/model configuration, load model, send AI message

Navigation, filters, pagination, edit/delete actions, toggles, close/cancel actions, refresh-only actions, and passive links do not summon the hook.

## Interaction Model

1. A whitelisted button calls a visual trigger immediately before or alongside its existing handler.
2. The global layer resolves the source mark: Sidebar mark on desktop; compact mobile mark/menu trigger below the desktop breakpoint.
3. The layer renders one B2 chain at a time: charge (90ms), travel (280ms), impact hold (110ms), request/result tension, and return (360ms).
4. A successful operation returns one soul particle to the source mark and gives it a single 80ms brightness lift.
5. A failed operation breaks the chain near the target without returning a soul particle.
6. Actions that only open a modal complete a short capture-and-return cycle without awaiting an API result.
7. A request lasting longer than 1.8s keeps only a very faint tension line until the result is known. A second trigger replaces the previous visual sequence.

## Architecture

`SpectralHookProvider` lives at the authenticated app shell and owns the current effect state. `SpectralHookLayer` is a fixed SVG overlay with `pointer-events: none`, responsible only for geometry and CSS animation. `useSpectralAction` exposes a small trigger API to whitelisted buttons; it accepts an optional promise so the layer can map success and failure without taking ownership of the promise or altering the existing handler.

The source and target use DOM rectangles sampled at trigger time. The layer computes a cubic path from the source center to the target center, clamps the path to the viewport, and clears safely when navigation, resize, reduced-motion, or target removal makes the geometry stale.

## Visual Language

- Palette is limited to `--text-primary`, `--accent`, `--accent-bright`, and `--status-danger` for the failure break.
- Chain is a broken/dashed curved stroke with one hook-shaped terminal; it is visible but low contrast during travel.
- Impact is a short scale/opacity settle, never a continuous pulse.
- Success uses one small soul particle and one source-core lift; failure has no persistent flashing.
- Reduced-motion removes travel/return animation and keeps a single static, low-contrast state change.

## Responsive Behavior

Desktop source is the Sidebar `SeshiMark`. On mobile, the existing menu trigger gains a compact `SeshiMark` source so the effect remains visibly anchored without forcing the Sidebar open. The trigger keeps its existing keyboard and screen-reader behavior.

## Accessibility and Safety

The SVG layer is decorative and `aria-hidden="true"`. It cannot capture pointer input, change focus, or delay an action. Existing button labels, disabled states, and API error handling remain authoritative. No effect is triggered for disabled buttons or canceled operations.

## Validation

- Unit tests cover whitelist classification, success/failure state transitions, one-active-effect replacement, and reduced-motion behavior.
- TypeScript and production build must pass.
- Browser verification checks desktop and mobile source anchoring, overlay non-interference with charts/buttons, successful return, failed break, and no horizontal overflow.
