# TerraTec

Open-source architecture, interior and manufacturing workspace. MIT licensed.

The first foundation connects a Vue/Three.js room preview, Node.js project service,
and C++17 geometry executable. No database or login is required for local development.

## Run locally

Requires Node.js 22.12+, npm, CMake 3.16+ and a C++17 compiler (Ubuntu 22.04 target).

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel 2
npm ci
npm run api
```

In a second terminal:

```sh
npm run dev
```

Open the local address printed by Vite (normally http://127.0.0.1:5173).
Edit the room dimensions, calculate geometry, save, change dimensions, and reopen
the saved project. Drag to orbit; right-drag to pan; scroll to zoom. Plan uses an orthographic camera with north up and all four walls visible. The 3D
view uses a two-wall cutaway. Click a surface or use the surface list to select it.
Selection survives view switches and dimension edits; Escape or Clear selection
clears it. In Plan, drag a round corner handle to edit the outline; drag empty space
to pan. Fit room resets the camera. A drag makes one undo entry when released;
Escape, pointer cancellation, window blur, resizing or switching views cancels it.
An invalid release restores the original shape. Grid snapping applies to handles
and numeric coordinates alike.

Undo/Redo buttons and Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y restore geometry
edits, including dimensions, height and numeric endpoints. Shortcuts leave text-input
undo alone. History is session-local, holds up to 100 edits, and resets on Open saved;
saving does not clear it. Selection, camera position and project-name edits are not
included in geometry history.

```sh
ctest --test-dir build --output-on-failure
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:browser
```

The native executable may also be built directly when CMake is unavailable:

```sh
mkdir -p build
g++ -std=c++17 -Wall -Wextra -Wpedantic core/main.cpp -o build/terratec-core
```

## Project contract

```json
{
  "schemaVersion": 5,
  "units": "m",
  "name": "Studio",
  "presets": [],
  "room": {
    "width": 6, "depth": 4, "height": 2.8,
    "outline": [{"x":-3,"z":-2},{"x":3,"z":-2},{"x":3,"z":2},{"x":-3,"z":2}],
    "openings": [{"id":"door-1","type":"door","wall":"north","offset":1,"width":0.9,"height":2.1,"sill":0,"hinge":"A","swing":"in"}]
  }
}
```

Coordinates are right-handed, with Y up and the floor in X/Z. The outline stores
four shared interior corners in clockwise plan order; wall IDs follow the initial
north/east/south/west edges even after rotation. Select a wall and edit A/B coordinates,
then Apply endpoints. Adjoining walls update together. Optional grid snapping uses
0.1, 0.25, 0.5 or 1 m increments; large rooms render a coarser grid for performance.
Width and depth inputs scale the outline about its bounding-box center. Height is
uniform. Coordinates must be finite and within ±1000 m, wall lengths at least 0.1 m,
and overall spans 0.1–1000 m. Crossing, concave and collapsed outlines are rejected.

Schema 1 rectangles and schema 2 outlines migrate with empty opening lists. Schema 3
openings migrate to schema 4, with A-end/inward defaults for doors. Schema 5 persists door hinge/swing settings and named opening presets. Older projects
migrate with an empty preset list. Width/depth are derived from its bounds. Unsupported versions are rejected.
The service validates before saving and atomically replaces its single project file.
Additional fields are discarded. Native area/volume/perimeter use the polygon,
not its bounding rectangle. Both views render that same polygon. Plan shows wall dimensions in metres with measurement lines, extension lines and end ticks.
Lines follow angled walls and stay a fixed distance from the edge on screen as you zoom.
Selecting a wall with openings adds a second chain of opening widths and intervening
gaps. The overall wall dimension moves outward to keep both rows separate.

Select a wall, then Add door or Add window. Set offset (from endpoint A toward B),
width, height and sill, then Apply opening. Openings leave real holes in the 3D mesh.
Plan shows a horizontal wall section at min(1.2 m, half the room height); walls above
that plane are hidden, including door headers. Side and top clearances are 0.05 m,
with 0.05 m horizontal separation between openings. Doors start at floor level;
windows need a sill of at least 0.1 m. Up to 64 openings are supported. Shrinking a
wall or lowering room height is rejected if existing openings would no longer fit.
Opening add/edit/remove operations participate in undo/redo and project persistence.
In 3D, windows have frames and translucent glazing; doors have frames and a 90° leaf with selectable A/B hinge and inward/outward swing. Plan shows matching door swing arcs and double-line window symbols. Choose Door
hinge and Door swing in the inspector, then Apply opening; both views, history and
saved projects use those settings. Details follow the host wall and cutaway visibility. Click a symbol
or visible opening detail to select its inspector.

For canvas placement, select a wall and choose Place door/window. Move near that wall in Plan to see a green valid or red invalid preview and a
validation message. Previewing does not edit the project or history. Click to commit; the click sets the opening center along the wall and the offset from A
snaps to the selected grid. Invalid/out-of-wall or overlapping placements are rejected
and leave placement mode active. Escape or Cancel placement exits without an edit.
A valid placement makes one undo entry. Place mode includes width, height and sill fields, plus door hinge/swing controls.
Entered sizes are kept exactly; snapping affects only the offset along the wall.
The preview and committed opening use the same sizes and validation. Current placement sizes are remembered per type for the session. To reuse them later,
enter a Preset name and choose Save opening preset, then Save project. Named presets
include type, exact sizes and door orientation. Choose a saved preset and Use preset
to fill placement controls. Saving the same name/type updates it; Delete preset removes
it. Preset edits are project metadata and are separate from geometry undo/redo.
Up to 32 presets are stored per project; their fit is checked when placed on a wall. Numeric Add door/window still uses its standard presets. Numeric Add door/window remains available.
Native quantities remain floor area, interior volume and perimeter; wall material
quantities are not yet calculated.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/health` | Service liveness |
| `GET /api/project` | Open saved project; 404 if none exists |
| `PUT /api/project` | Validate and save JSON project (64 KiB maximum) |
| `POST /api/geometry` | Run C++ core; return area, volume and perimeter |

Defaults: API port 3001, project storage `data/project.json`, native executable
`build/terratec-core`. Override using `PORT`, `TERRATEC_DATA_DIR` and `TERRATEC_CORE`.
The development API binds to loopback and is intended for one local user. The frontend
build is not a production deployment; public hosting and authentication are future work.

## Current limits

Each project contains one convex four-corner room. Multiple named projects can be saved and selected. Orthographic plan, surface selection, grid snapping, corner dragging, undo/redo and numeric endpoint editing are available. No arbitrary wall drawing,
BIM exchange, manufacturing, AI design or physics integration yet. Frames, glazing and door leaves are illustrative; there is no collision, hinge animation or door-swing clearance validation. Preview is a footprint marker rather than a full 3D opening. Geometry
quantities come from the native core; Three.js constructs the preview from the same
validated outline. The optional Google font falls back to the system sans-serif.

Progress and next steps are tracked in [docs/ROADMAP.md](docs/ROADMAP.md).

## Projects and plan export

Use New for a blank unsaved workspace. Save project creates a UUID-backed file on
first save and updates that project afterward; editing the name renames it without
changing its ID. Choose an entry in Saved projects, then Open saved to load it.
Opening or creating a project replaces the current workspace and resets geometry
history; save edits first if you want to retain them. The selector defaults to the
most recently updated entry after a fresh page load.

Projects are stored independently under `data/projects/<id>.json`, with atomic
replacement and a derived project list. `GET /api/projects` lists metadata,
`POST /api/projects` creates a project, and `GET/PUT /api/projects/<id>` reads/updates
one. Invalid IDs are rejected. The earlier `/api/project` endpoints remain available
for legacy files; Open saved falls back to the legacy file if no entry is selected.
A legacy project becomes a separate named project on its next save. Concurrent
updates use last-write-wins semantics; deletion and version history are future work.

Export SVG downloads a standalone measured Plan from the current validated model,
regardless of camera/view. It includes wall sections, openings, hinge/swing symbols,
wall dimensions, opening chains and an escaped project title. Coordinates are in
metres; no physical print scale is assigned. It is a vector drawing, not a BIM or
manufacturing interchange format. The export does not alter the project or history.

## Recovery and portable JSON

Unsaved validated model changes are captured in this browser's local storage, with
up to 20 recovery snapshots. Use Recovery draft → Recover draft after a reload or
workspace switch. Recovery opens an unsaved copy; Save project creates a new server
project and clears the recovered snapshot, so the saved original is preserved.
Discard draft removes a snapshot. If it belongs to the current workspace, it stays
discarded until another model edit. Saving a project clears its current local draft.
Storage failures are shown in the workspace; local recovery is not a server backup.
Only validated model changes are captured: unfinished numeric fields, unapplied
opening edits, placement previews and in-progress corner drags are not snapshots.

Export JSON downloads the canonical model, including openings and named presets,
without a server project ID. Import JSON accepts model files up to 64 KiB, validates
and migrates supported versions before changing the workspace, then opens an unsaved
copy with fresh geometry history. Invalid imports leave the current project intact.
Save project gives imported data a new server ID. JSON transfer is independent of SVG
and retains editable model data. Camera, selection and undo history are not exported.
