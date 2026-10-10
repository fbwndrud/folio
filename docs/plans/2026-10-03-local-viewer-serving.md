# Local viewer serving

## Direction

Default to local viewing and read-only exports. No cloud deployment, GitHub
publication, external binding or online authoring is implied. Prompt language
work remains a separate lane.

The existing MCP viewer already serves on loopback with per-session tokens,
same-origin write restrictions and mandatory server-side step locks. Preserve
that implementation and reuse it for a standalone launcher.

## Changes

- `npm run setup`: install locked backend and viewer dependencies, build screens.
- `npm run viewer -- <work>` / `folio-view <work>`: standalone local viewer without
  needing an active AI session; optional section selection.
- `npm run preview -- <export>`: loopback-only preview of a Folio read-only
  viewer export. No manuscript/config APIs, writable endpoints or cloud access.
- Launcher stays alive until viewer closure, idle timeout or termination signal;
  cleans up listeners and server resources. Paths resolve from user arguments;
  bundled resources resolve from module location.
- English help/setup messages and updated installation/serving documentation.

## Checks

Synthetic fixtures only. Verify standalone startup from another working folder
and paths with spaces, missing screens/invalid inputs, authenticated work reads,
shutdown/termination, export markers, Host rejection, read-only behavior,
static images and blocked symlinks/traversal. Run required root checks and viewer
tests/build. Exercise the setup command and browser preview with synthetic data.

## Boundaries

No model/network calls in core, no automatic package installation when opening a
work, no changes to mandatory locks, no real works committed, no remote push.
Static exports remain snapshots; previewing them does not modify the original.

## Validation results

- `npm run setup` completed installation from both lockfiles and built screens.
- Root check passed lint, typecheck and 1,346 tests, with no skipped tests.
- Viewer tests: 30 passed. Production screen build passed; the pre-existing
  lazy graph bundle size warning remains.
- Actual documented npm commands started both the work viewer (at a selected
  section) and read-only preview. Both served correctly in the browser without
  an AI server session. The work viewer exited with status 0 after Close viewer.
- Preview browser error log was empty. Setup and serving require no personal
  machine path constants. Synthetic works stayed in temporary folders.
- Added a regression check for npm lifecycle naming: `viewer` avoids `preview`
  being interpreted as the automatic `pre` hook for a script named `view`.

No remote deployment was performed. Servers bind only to 127.0.0.1. GitHub/static
publication and online authenticated editing remain separate deployment scopes.
