# MRP Catalog and Availability Design

## Goal

Make the MRP game directory useful in the default Docker deployment without
claiming that unmounted games can launch, and show real cover art only when an
image asset is supplied.

## Task Contract

- **Target behavior:** The default `/library/maopao` view shows the tracked MRP
  catalog. Each entry reports whether its MRP package and vmrp runtime are
  available. Games without both remain browsable but cannot be launched.
- **Scope:** Serve the tracked catalog through a server API, detect runtime and
  package availability, update the React MRP list and launch dialog, and expose
  optional cover URLs with an honest missing-cover placeholder.
- **Preserve:** The existing `compose.mrp.yaml` mounts, same-origin MRP game
  routes, explicit runtime packaging boundaries, J2ME/Flash catalogs, and
  licensed-game distribution restrictions.
- **Acceptance:** Default Docker catalog returns the tracked records instead of
  `[]`; unavailable games have a clear non-launchable state; enabled MRP
  installs mark existing packages launchable; provided covers render while
  missing covers are visibly identified; server and browser tests pass.

## Data Flow

The server reads the tracked `maopao-revival/hall/manifest.json` as the catalog
source. A new catalog endpoint enriches each record with `available` and an
optional artwork URL. Availability requires both the vmrp player entry point
and the game's `.mrp` file to exist under the configured vendor tree.

The React library consumes that endpoint. It keeps unavailable entries
browsable, shows a setup status in the game dialog, and disables only the Start
action. It never infers that HTTP 200 with an empty array means a healthy
catalog.

## Artwork

The tracked manifest currently contains no artwork fields and the repository
does not include MRP binaries or screenshots. Do not fabricate game screenshots
or redistribute proprietary game content. If a record contains an approved
`iconUrl`/`coverUrl`, render it; otherwise render a consistent placeholder that
clearly indicates artwork is unavailable.

## Failure Handling

Malformed or unreadable manifests produce a catalog error, not a successful
empty list. Missing runtime and individual packages are separate availability
states so a partially populated installation remains useful.

## Verification

- Unit tests for manifest validation, availability detection, safe artwork URL
  selection, and launch gating.
- Web build and browser smoke test for default catalog, missing resources,
  optional resource availability, and fallback artwork.
- Docker smoke where feasible; verify the default image returns catalog entries
  while reporting runtime unavailable.
- Android WebView is not part of this task's platform scope.
