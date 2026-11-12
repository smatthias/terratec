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
  "schemaVersion": 6,
  "units": "m",
  "name": "Studio",
  "presets": [],
  "room": {
    "width": 6, "depth": 4, "height": 2.8,
    "outline": [{"x":-3,"z":-2},{"x":3,"z":-2},{"x":3,"z":2},{"x":-3,"z":2}],
    "openings": [{"id":"door-1","type":"door","wall":"north","offset":1,"width":0.9,"height":2.1,"sill":0,"hinge":"A","swing":"in"}],
    "furniture": []
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
openings migrate to schema 4, with A-end/inward defaults for doors. Schema 6 persists doors, named opening presets and furniture. Earlier projects migrate
with an empty furniture list. Older projects
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
metres; default output is unscaled, with physical scale options described below. It is a vector drawing, not a BIM or
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

## Duplicate and scaled SVG

Duplicate copies the current validated workspace, including openings and named
presets, adds “(copy)” to its name and starts fresh geometry history. It is an unsaved
copy; Save project creates a new UUID. Editing or saving it does not update its source.
Any existing unsaved source changes remain available through local recovery.

Choose SVG print scale before Export SVG: unscaled vector, 1:20, 1:50, 1:100 or 1:200.
Scaled files declare physical width/height in millimetres while their viewBox remains
in model metres. At 1:100, a 1 m model length occupies 10 mm on paper. Text and line
weights use consistent paper sizes. The selected scale appears on the drawing and
in the filename. Print at 100%/actual size with fit-to-page disabled to retain scale;
fixed A4/A3 sheet settings are available as described below; no automatic scaling or pagination is applied. Scale selection is
an export setting and does not change the project geometry or stored dimensions.

## A4/A3 plan sheets

SVG paper size defaults to Drawing bounds. Choose A4 or A3 plus Portrait/Landscape
for a fixed sheet. A print scale is required. Sheets use 10 mm margins and reserve
12 mm for a footer inside the lower margin area. The complete drawing, including
annotations and title, is centred in the remaining area without changing scale.

Fit feedback shows required and usable millimetres. Export is disabled if the
drawing does not fit; the exporter also rejects oversized layouts. Use suggested
scale explicitly applies a supported scale that fits, when one is available. You
can instead choose larger paper or change orientation. The SVG declares exact sheet
size in millimetres, with a scale transform around the model-metre drawing, a border
and footer. Continue printing at 100%/actual size with fit-to-page disabled.
Pagination and printer-specific unprintable-area handling are not implemented.

## Parametric cabinets

Add cabinet creates a cabinet at the room centre; Place cabinet switches to Plan
and places one at a clicked position. Position follows the selected grid snapping.
Select its footprint in Plan, a visible panel in 3D, or Furniture item in the sidebar.
Edit name, width/depth/height, X/Z position, rotation in degrees, panel thickness and
shelf count, then Apply cabinet. Remove cabinet deletes the selected item.

The model has separate side/top/bottom/back/shelf panels, two closed front doors and
handles. Plan and SVG show its body footprint. Furniture CRUD participates in geometry
undo/redo, project save/load, JSON exchange, duplication and recovery. Schema 6 adds
`room.furniture`; earlier schemas migrate with no furniture. Up to 64 cabinets are
supported. Rotated body footprints must stay in the convex room and cannot overlap;
invalid geometry or room edits are rejected. Height cannot exceed the room height.

There is no cabinet animation, hardware clearance, doorway
or door-swing clearance validation, furniture physics or CNC output yet. The body
footprint collision check excludes protruding handles. Panels are illustrative until
joinery and manufacturing allowances are introduced.

## Cabinet movement and design panel list

In Plan, drag a cabinet body to move it. Grabbing off-centre preserves the pointer
position relative to the body; snapping applies to the cabinet centre. A completed
drag makes one undo entry. Invalid releases, Escape, pointer cancellation, window
blur, view changes or resizing restore the starting room. Clicking a body selects it
without a geometry edit. Numeric position editing remains available.

The selected cabinet shows a design panel bill of materials with grouped quantities,
length/width/thickness in millimetres, total panel area/volume and handle count.
Renderer and bill of materials share one part definition. Export panel CSV downloads
that cabinet's list with quoted cells and formula-like text neutralised for spreadsheets.
Hardware is listed separately from panel material. These are design dimensions, not
machine-ready cut instructions: no kerf, edging, grain, joinery or machining allowances
are applied. Panel bill export does not mutate the model or history.

### Cabinet materials and panel blanks

Choose oak board, birch plywood or white board, then apply the cabinet. Material
selection changes panel colour and is included in saved projects and panel CSV.
These are appearance labels, not certified structural material specifications.

Length/width allowances are total additions in millimetres (0–50 per axis),
applied once to each finished panel dimension. They do not alter rendered
geometry. The inspector and CSV show finished and blank dimensions separately,
with blank area before stock waste. Existing cabinets default to oak and zero
allowances. Kerf, edging, grain, joinery, nesting and machine instructions still
require workshop-specific configuration.

### Stock sheet fit

Each cabinet stores stock length/width in millimetres, edge trim on all four sides
and a permission for 90-degree panel rotation. Defaults are 2440 × 1220 mm, zero
trim and rotation allowed. Disable rotation when the grain direction requires it.
The BOM and CSV classify each blank as direct, rotated or oversize against the
usable sheet. Oversize counts include the quantity of each panel type. Stock
settings save with the cabinet and participate in undo/recovery/JSON exchange.
Individual panel fit does not establish that all panels fit together on a sheet;
use the layout preview for a combined packing estimate. Oversize panels remain
exportable so the CSV can communicate the issue to a workshop.

### Cabinet sheet layouts

The selected cabinet now packs panel blanks across stock sheets with a deterministic
guillotine heuristic. Set kerf (0–20 mm, default 3 mm), then apply the cabinet.
Kerf reserves space between blanks; no extra gap is required against the usable
sheet boundary, which already excludes edge trim. Rotation follows the stock
permission. The preview shows sheet coordinates, panel IDs and gross stock area
utilisation. Oversize panels appear as unplaced and are retained in layout CSV.

Layout CSV uses millimetres from the top-left of each sheet, with placed width
and height reflecting any rotation. Sheet numbers begin at 1. It is a planning
layout for one cabinet: it does not optimise across cabinets, guarantee minimum
sheet count, specify a cutting sequence or generate CNC instructions. Material
and grain requirements still need workshop review.

### Project manufacturing batches

Open **Project manufacturing** to nest all cabinets together. A batch combines
only matching material, thickness, stock dimensions, edge trim, rotation permission
and kerf. Each panel keeps its cabinet ID and name; different blank allowances
can share a batch because the resulting panel sizes are packed individually.
Cabinet codes in the preview link panel labels to the source list. Batch and
sheet numbers are regenerated deterministically; sheet numbers restart per batch.

Project CSV includes batch, material/thickness, cabinet identity, panel identity,
placements and stock settings, including oversize panels. Previews update with
edits and undo/redo. Computation runs only while this section is open. Nesting
remains heuristic, with no guaranteed minimum count, cutting sequence or CNC.

### Printable workshop handoff

In Project manufacturing, choose **Export printable workshop handoff**. Open
the downloaded self-contained HTML in a browser and print/save as PDF using
A4 landscape. It contains a snapshot timestamp, batch totals, cabinet source
references, one sheet diagram per section, placed-dimension registers and
unplaced oversize registers. Diagrams fit the page and are not to scale; all
register coordinates/dimensions are millimetres. Stock/trim/kerf/rotation settings
travel with each batch. Long registers paginate into bounded sections.

The export reflects the current in-memory model, including applied unsaved edits.
It contains escaped text, inline styles/SVG and no executable scripts or remote
assets. This is a workshop review document, not a cutting sequence or CNC file.

### Workshop profiles

Select a cabinet, apply its stock settings, enter a workshop profile name and
choose **Save workshop profile**. Profiles capture stock dimensions, trim, kerf
and rotation permission. They do not capture material, thickness, panel allowances
or cabinet geometry. Choose a saved profile and apply it to copy its settings to
the selected cabinet in one undoable edit.

Names are case-insensitively unique within the project (up to 32 profiles); saving
an existing name replaces that profile while preserving its ID. Existing cabinets
keep independent settings, including after profile update/deletion. Profile list
changes are project metadata, like opening presets, and are not in geometry undo.
Profiles persist in saves, recovery, JSON and duplication; older projects default
to an empty list. Save/export the project to keep newly created profiles.

### Portable profiles and bulk settings

**Export workshop profiles** downloads a versioned JSON file. Import accepts at
most 32 KiB and merges up to 32 validated profiles with fresh IDs. Existing
profiles are retained; colliding names receive an `(import N)` suffix. Invalid
files or capacity violations leave the project unchanged. Save the project after
import to persist the merged list.

Select a profile, choose cabinet checkboxes (or Select all), and apply to the
selection. The entire operation is one geometry undo step. Cabinet dimensions,
materials and blank allowances stay independent. Profile exchange is available
from the selected cabinet’s profile section.

### Workshop job manifests

Project manufacturing exports a versioned job JSON containing the validated
project snapshot, source SHA-256, batch layouts, source cabinet/panel IDs, totals
and handoff issues. A second SHA-256 covers the full manifest payload. The source
reference includes project metadata and profiles as well as geometry. Identical
normalised project snapshots produce the same source hash; export timestamps
change the manifest hash.

**Verify job manifest** accepts up to 2 MiB, rebuilds layouts from the embedded
source and compares all derived content and hashes, then reports whether the
source matches the current project. Verification does not import or modify the
project. Subsequent edits clear the displayed result. Hashes establish consistency,
not authorship or a digital signature. No network submission occurs.

Empty jobs and unplaced oversize panels are blocking issues. Every other job is
marked review-required for workshop decisions on materials, grain, joinery,
edging, tooling and cutting sequence. Manifest export includes blockers so they
remain visible to a recipient; it never means production approval or CNC readiness.

### Local workshop job records

Project manufacturing includes a job register stored by the local Node service,
separately from project files. Create a named job to capture revision 1. Save a
changed current model as a new revision; unchanged source snapshots are rejected.
Old snapshots remain available for comparison and manifest export. Selecting a
revision never replaces the design workspace.

Only the latest planned revision can be marked reviewed, with a reviewer name
and notes. Empty/oversize jobs cannot be marked reviewed. A new revision always
starts planned and does not inherit an earlier review. Reviewed means a recorded
local review, not production approval or authenticated sign-off.

`GET/POST /api/jobs`, `GET /api/jobs/:id`, and POST revision/review subroutes persist
atomic JSON records under `data/jobs`. Writes are serialised within this service
instance and require the expected revision number for edits; stale clients must
reload. Limits: 50 jobs, 20 revisions per job, 128 KiB request bodies. Back up the
data directory to preserve jobs; project JSON/recovery does not include them.
This remains a local development service without multi-user authentication.

### Workshop assignment and fulfilment

The latest reviewed revision can be assigned a workshop name and optional due
date. Assignment and each transition require an actor and notes. Supported paths
are assigned → in-production → completed, or cancellation from either active
state. Completed/cancelled records are terminal. Tracking belongs to that exact
revision; a later revision starts planned with no assignment.

Active assignments must be completed or cancelled before creating a new model
revision. Event-count and revision checks reject stale updates. Audit events are
append-only through the API; source manifests and previous review records remain
unchanged. `POST /api/jobs/:id/fulfilment` persists tracking. **Export workshop job
record** includes all revisions, reviews and fulfilment history; the saved-revision
export still contains only the original manifest. Job-record export uses a versioned backup envelope. Assignment is local metadata: it sends no workshop messages, network
orders or machine instructions and does not establish authenticated sign-off.

### Job backup and restore

**Export workshop job record** now downloads a versioned backup with a SHA-256
checksum covering the job record, revisions, reviews and tracking. Restore
accepts this envelope up to 16 MiB, verifies all embedded model manifests and
checks sequential revisions, review prerequisites, event transitions and timestamps.
Invalid backups leave the store unchanged. Raw job JSON from older exports is
not accepted; export again from the job register to obtain the backup envelope.

`POST /api/jobs/restore` always creates a new local ID; it never overwrites a job.
Matching names gain `(restore N)`. The restored record retains original revision
snapshots/reviews/events and records its source ID, backup checksum and restore
time. This is copy-based restore, without merging divergent histories. Restored
review/tracking claims are untrusted historical metadata, not authenticated
workshop statements. Export checksums establish consistency, not authorship.

### Workshop job register

The local register shows the latest revision’s workflow state, panel/sheet counts,
unplaced panels, assigned workshop and due date. Search matches every entered
word against job name, ID and the latest assignment’s workshop. Status filters
cover planned, reviewed, assigned, in-production, completed, cancelled and blocked.
Sort by recent update, name or due date (undated jobs last). Global summary counts
remain visible while filters show a subset.

Filtering does not close the opened record or alter any saved data. A selected
job outside the filters stays available below. Old completed assignments do not
carry into the summary for a newer planned revision. Reload/refresh retrieves
updates from the local service; this is not a realtime multi-user dashboard.

### Revision costing and quote snapshots

Each job revision can store up to 20 quote snapshots. Enter sheet prices per
material, a handle price, hourly labour, whole labour minutes per panel and markup.
Choose EUR, USD or GBP; there is no currency conversion or supplied market pricing.
One rate per material applies to every stock size/thickness in that revision.
Materials use nested whole sheet counts (including unused sheet area); hardware
uses model handle counts and labour uses panel quantity × entered minutes.

Values are calculated in integer cents. Labour is rounded once to cents, then
markup is rounded once on the subtotal. Totals exclude tax, delivery and services
not represented by these inputs. These are planning estimates, not invoices.
Empty/oversize handoffs cannot be costed. Zero rates are valid and explicit.

Save appends a revision/source-hash-bound snapshot; later rate or model edits do
not change it. New model revisions have no quotes until one is saved. Quotes can
be exported as JSON and travel with job backups; restore recomputes all totals
against the embedded revision. `POST /api/jobs/:id/quotes` requires the expected
head revision and selected revision’s quote count to reject stale appends.

### Printable quotes and recipient fields

Quotes can snapshot a customer/recipient (120 characters), reference (80) and
notes (1000) alongside the saved costing. Later form edits do not change saved
quotes. Job backup/restore validates and retains these fields; older quotes without
them remain readable.

**Export printable quote** downloads self-contained HTML with A4 portrait print
styles: a recipient/total summary, paginated material quantities and pricing/source
references. Open it in a browser to print or save as PDF. It uses the selected
saved quote, including its currency, rates and revision reference. User text is
escaped; the document contains no scripts or remote assets.

The export is a planning estimate, not an invoice. Tax, delivery and unmodelled
services remain excluded. Recipient fields are plain metadata; no customer account,
message sending or legal quote acceptance workflow is implied.

### Customers and local quote lifecycle

Customer records store name, email, phone, address and notes in the local service
(`data/customers`, maximum 200 records). Create or edit them from Revision costing,
then choose **Use customer in quote** to copy name/contact data into the draft.
Saved quote details include that snapshot and the customer ID; later customer
edits leave saved quotes unchanged. Customer records themselves are separate
from job backups and require a data-directory backup. `GET/POST /api/customers`
and `GET/PUT /api/customers/:id` use version checks to reject stale edits.

Saved quotes start as local drafts. Record sent status, then accepted, declined
or withdrawn, with actor/notes for each event. These are terminal outcomes and
do not alter saved costs or recipient fields. `POST /api/jobs/:id/quote-status`
uses revision/event checks to prevent stale updates. Job backups include and
validate the event history. The printable estimate shows its recorded status.
No emails or other communications are sent, and accepted status is a local
observation rather than authenticated customer acceptance or a legal approval.

### Customer search, backups and quote register

Search customer records by name, email, phone or address. Every search word must
match; the selected record remains available outside the filtered results. Export
the selected customer as a versioned JSON backup, then restore it as a new ID.
Name conflicts gain `(restore N)`; existing records and saved quote recipient IDs
are never rewritten. Backups validate contact fields, accept up to 8 KiB and
contain no credentials or automatic messaging instructions. This is one-contact
backup, not a full-directory backup; retain the data directory for all contacts.

**All job quotes** lists saved snapshots from every local job/revision, including
restored copies. Search saved customer, reference, job name or IDs and filter by
local quote status. Open navigates to that exact job, revision and quote snapshot
without replacing the design model. Refresh retrieves local service changes.
`GET /api/quotes` provides compact register rows; currency amounts stay separate
and are never combined into a misleading mixed-currency total.

### Cabinet alignment and spacing

Select a cabinet and choose a different reference in **Alignment and spacing**.
Align minimum edge, centre or maximum edge along world X/Z, or position it before
or after the reference with an exact 0–10 m gap. Rotated footprint bounds define
the edges; the tool moves only the selected cabinet along one world axis and
retains rotation/dimensions. Projected gap feedback is signed along that axis,
not a shortest-distance measurement between rotated surfaces.

These one-off arrangement commands bypass grid snapping. Every resulting body
footprint must remain inside the room and avoid other cabinets. Rejected edits
leave geometry/history unchanged; a valid change is one undo step and follows
normal save/recovery/JSON behaviour. Handles and door-swing clearances are not
included. These are placement operations, not persistent relational constraints.

### Group alignment and equal-gap distribution

In Group layout, select cabinets using the checkboxes or Select all. The active
cabinet stays selected and acts as the fixed anchor for group alignment; all other
selected cabinets align the chosen minimum/centre/maximum edge along world X/Z.
Changing the active cabinet resets the group selection to that cabinet.

Equal-gap distribution requires at least three cabinets. Cabinets are ordered by
projected minimum edge (ID breaks ties), with the first/last held fixed. Interior
cabinets move to equal projected edge gaps, accounting for rotated body widths.
Insufficient span for non-negative gaps is rejected. Other-axis positions and
all dimensions/rotations remain unchanged. Unselected cabinets stay fixed.

All final placements are validated together for containment and collision before
one history commit. Invalid operations leave all positions unchanged. These are
exact, one-off layout commands rather than persistent constraints; normal saved
project, recovery and JSON handling applies to the resulting geometry.

### Cabinet copies and furniture presets

Furniture library provides a target X/Z position for duplicating the active
cabinet or creating an instance from a saved preset. Current grid settings snap
that position. Copies retain dimensions, rotation, material and manufacturing
settings, receive a fresh ID and a copy name, and are placed in one undo step.
Overlap, room boundaries and the 64-cabinet cap reject the entire insertion.

Save applied cabinet parameters as a named project preset (maximum 32). Matching
names update that preset while preserving its ID. Presets omit instance position
and rotation; new instances start at rotation 0° with fresh IDs. Updating/deleting
a preset leaves existing cabinets independent. Preset metadata is outside geometry
undo, like opening presets, and persists via project save/recovery/JSON/duplication.

The optional furniturePresets field is validated when present; older project and
manifest snapshots keep their existing shape and continue to verify unchanged.

### Furniture insertion previews

Furniture library can preview a cabinet copy or selected preset at the target X/Z.
Coordinate edits update the snapped preview. Green ghosts indicate a valid
insertion; red ghosts retain the candidate footprint/body and explain why it is
invalid. Plan shows its footprint; 3D shows translucent panels. Ghosts are not
selectable and do not enter project geometry, quantities, exports or history.

Confirm revalidates the current room and inserts once; Escape or Cancel discards
the preview. Model, selection or grid changes cancel it, and preview ghosts dispose
their geometry/materials when replaced. View switching retains the preview.
Existing direct copy/preset commands remain available. Numeric coordinate previews remain available alongside pointer placement.

### Pointer placement of copies and presets

Choose **Place copy in Plan** or **Place preset in Plan** to enter pointer placement.
The ghost follows the ground-plane pointer position, respecting grid settings.
A primary click at a valid position commits exactly once; an invalid click keeps
the mode active and reports the issue. Dragging does not insert or move cabinets.
Existing cabinet bodies cannot capture the left gesture while placement is active.

Escape, leaving the canvas, focus loss, pointer cancellation or switching to 3D
cancels without a model edit. Model/selection/grid changes also invalidate the
preview. Pointer capture and camera controls are released after each gesture.
Numeric previews still support switching between Plan and 3D; pointer mode is
Plan-only. Each confirmed insertion uses normal one-step undo and persistence.

### Placement rotation and alignment guides

Active numeric/pointer previews accept an angle or ±15° controls. Outside text
fields, R rotates +15° and Shift+R rotates −15°. Angles wrap into 0–359° and the
rotated footprint is revalidated before confirmation. Rotation is a preview-only
override until commit and does not modify the source cabinet or preset.

Yellow guides identify the nearest rotated minimum/centre/maximum bound within
0.08 m on each world axis, with deterministic reference selection. They are visual
only unless **Snap furniture to alignment guides** is enabled. Guide snapping
applies after grid snapping and may produce off-grid coordinates; the actual
preview position is shown explicitly. Snapped candidates still need to pass
containment and overlap validation. Guides are non-pickable and transient.

Use keyboard rotation during pointer placement; leaving the canvas to use sidebar
controls cancels that mode. Numeric previews keep the sidebar rotation controls
and can be viewed in Plan or 3D. Guide alignment uses projected body bounds and
does not imply door-swing, handle or shortest-distance clearance.

### Wall and opening clearance planning

Furniture clearance reports the nearest finite wall-segment distance from the
rotated body, with a configurable minimum wall gap (0–2 m). It flags door planning
zones and windows whose sill is below cabinet height. Inward doors use a
conservative rectangular zone as deep as the larger of door width and configured
access depth (0–3 m); outward doors use the access depth. Windows use a fixed
0.15 m service zone. Touching a zone boundary does not count as overlap.

These are advisory workspace settings, not saved model rules or building-code
checks. **Enforce clearance for preview insertion** additionally blocks preview
confirmation when these planning checks fail. Existing geometry, direct copy/add,
dragging and numeric edits remain advisory; normal body containment/collision
checks always apply. Preview feedback updates after position, rotation, guide
snapping or clearance-setting changes. Cyan lines show nearest-wall gaps and
orange outlines show conflicting opening zones.

Checks exclude handles, passage accessibility rules and actual hinge-sweep sectors.
Door rectangles intentionally overestimate inward sweep and do not model opening
leaves as rigid collision bodies. The settings are planning aids, not regulatory
or physical clearance certification.


## Production bundle and release checks

```sh
npm run test:release
```

Build the native core first using the commands under Run locally. The release
command builds the production assets, checks bundle budgets, and runs the full browser
regression suite against Vite preview with the local API. Native CMake/CTest and
Node tests remain separate CI checks. To inspect the build manually, run the API
and `npm run preview` in separate terminals. Preview is a local verification
server, not the production deployment setup.

The Three.js core, renderer, controls and Vue runtime are separate cached chunks.
Manufacturing and workshop-record panels load when opened. Budgets are 180 kB for
the entry, 400 kB for each JavaScript chunk, 850 kB for initial JavaScript and
950 kB for all JavaScript, measured uncompressed; CSS is limited to 15 kB per file.
`test-results/bundle-report.json` records raw/gzip sizes and initial versus lazy
chunks. The default Vite size warning remains enabled. These checks do not claim
that splitting alone reduces total downloads or guarantees faster rendering.

### Portable local release

After building the C++ core and running `npm run build`, run `npm run package:release` and `npm run test:package`. The platform/architecture tar archive is written to `release/`. CI builds and checks a Linux x64 archive and uploads it as `terratec-linux-release`.

Extract the archive and run `node /path/to/terratec-linux-x64/start.mjs` with Node.js >=22.12.0. Open http://127.0.0.1:3001. The same local server serves the production frontend and API; no npm install, Vite or compiler is needed on the target machine. `PORT` changes the port. Set `TERRATEC_DATA_DIR` to a writable external directory to retain projects, jobs and customers across upgrades; otherwise data is stored beside the extracted app. Back up that directory before upgrading.

The native executable targets the build machine's OS/architecture and runtime libraries. The Linux CI archive is verified on the Ubuntu runner; other Linux distributions and macOS are not yet validated. This is a portable local archive, with no Windows installer or public-hosting configuration. The extraction smoke check starts outside the installation folder and checks HTML/assets, native geometry, and project saving.

### Restart, replacement and recovery

Use an external `TERRATEC_DATA_DIR` for data that must survive application replacement. For example, run `TERRATEC_DATA_DIR=/path/to/terratec-data node /path/to/terratec-linux-x64/start.mjs`. Use the same absolute directory every time. Browser-local pricing presets and unsaved edits are separate from the server data directory; export their backups separately.

1. Stop TerraTec and wait for its process to exit before copying data.
2. Copy the entire data directory to a separate backup location, including projects, jobs, customers and any legacy `project.json`. Keep the original backup unchanged.
3. Extract the new application into a separate folder. Start it with the existing external data directory, then check projects, customers and workshop jobs.
4. To recover, stop the app, copy the complete backup to a new writable data directory, and launch with `TERRATEC_DATA_DIR` pointing to that restored copy. Check the records before resuming work.

`npm run test:package` now checks fresh installation, process restart, replacement with a fresh extraction of the same archive, and offline backup recovery after deleting the working data directory. It compares complete project/customer/job records, including customer versions and reviewed manufacturing manifests, and checks native geometry and frontend assets in each phase. Results are written to `test-results/package-recovery.json` and included in CI artifacts. This verifies current-format recovery and installation replacement; it does not establish compatibility between different release versions or implement a schema migration system.
