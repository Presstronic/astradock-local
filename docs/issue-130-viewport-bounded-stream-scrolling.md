# Issue 130: Keep the Runtime Monitor bounded to the window

## Context and problem

The Runtime Monitor shell can grow beyond the available window when its header, current-state rail, detail dock, or event stream has intrinsic content. This pushes the bottom of the screen below the window instead of keeping the table and terminal as bounded scroll regions.

## User story

As a Runtime Monitor user, I want the screen to remain within the application window, so that I can scroll event history inside the Table or Terminal without the whole page extending beyond the viewport.

## In scope

- Give the document and application shell an explicit viewport height and hidden outer overflow.
- Keep the main grid and its children shrinkable through the flex/grid minimum-size boundary.
- Preserve scrolling inside the current-state rail, table, terminal, detail, and status regions where already defined.

## Non-goals

- Changing event retention, pagination, row density, or stream ordering.
- Hiding content without an accessible scroll region.
- Changing the minimum supported application width.

## Acceptance criteria

1. The Runtime Monitor shell does not extend beyond the window bottom at supported viewport sizes.
2. Table and Terminal content scroll within their stream workspace bounds.
3. Current-state and detail regions remain reachable through their existing internal scroll behavior.
4. Header, tabs, toolbar, and status bar remain visible while event rows scroll.
5. No horizontal or vertical document scrollbar is introduced by normal telemetry volume.

## Definition of Done

- CSS viewport and grid/flex sizing boundaries are updated.
- `npm test` and `git diff --check` pass.
- The change is reviewed at compact, default, and relaxed row densities and with a detail drawer open.
- Accessibility review confirms scrollable regions remain keyboard reachable and no content is clipped without an internal scroll path.

## Technology and libraries

None. The change uses existing CSS layout primitives.
