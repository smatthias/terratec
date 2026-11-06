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
  "schemaVersion": 2,
  "units": "m",
  "name": "Studio",
  "room": {
    "width": 6, "depth": 4, "height": 2.8,
    "outline": [{"x":-3,"z":-2},{"x":3,"z":-2},{"x":3,"z":2},{"x":-3,"z":2}]
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

Schema 1 rectangular projects migrate to schema 2 on read; schema 2 saves the explicit
outline. Width/depth are derived from its bounds. Unsupported versions are rejected.
The service validates before saving and atomically replaces its single project file.
Additional fields are discarded. Native area/volume/perimeter use the polygon,
not its bounding rectangle. Both views render that same polygon.

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

One convex four-corner room and one saved project only. Orthographic plan, surface selection, grid snapping, corner dragging, undo/redo and numeric endpoint editing are available. No arbitrary wall drawing,
BIM exchange, manufacturing, AI design or physics integration yet. Geometry
quantities come from the native core; Three.js constructs the preview from the same
validated outline. The optional Google font falls back to the system sans-serif.

Progress and next steps are tracked in [docs/ROADMAP.md](docs/ROADMAP.md).
