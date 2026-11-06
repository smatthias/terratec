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
the saved project. Drag to orbit; right-drag to pan; scroll to zoom. Plan sets the
camera above the room, using perspective projection. The room uses a two-wall cutaway.

```sh
ctest --test-dir build --output-on-failure
npm test
npm run build
```

The native executable may also be built directly when CMake is unavailable:

```sh
mkdir -p build
g++ -std=c++17 -Wall -Wextra -Wpedantic core/main.cpp -o build/terratec-core
```

## Project contract

```json
{
  "schemaVersion": 1,
  "units": "m",
  "name": "Studio",
  "room": { "width": 6, "depth": 4, "height": 2.8 }
}
```

Coordinates are right-handed, with Y up and the floor in X/Z. Dimensions describe
the clear interior and must be finite numbers from 0.1 to 1000 metres. The service
validates before saving and atomically replaces its single project file. Unsupported
versions are rejected rather than silently migrated. Additional fields are discarded.

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

One rectangular room and one saved project only. No arbitrary wall drawing, snapping,
undo, BIM exchange, manufacturing, AI design or physics integration yet. Geometry
quantities come from the native core; Three.js constructs the preview from the same
validated dimensions. The optional Google font falls back to the system sans-serif.

Progress and next steps are tracked in [docs/ROADMAP.md](docs/ROADMAP.md).
