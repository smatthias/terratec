# TerraFlux native viewer adapter

Target profile: `terraflux-native-scene-v2`, reviewed at TerraFlux Engine commit
`1ce82c3c0dfd5f8f12a149a4b47d25c2c584aebc`.

The inspected native viewer has a concrete `terraflux.scene` v2 graph and an OBJ
asset parser. Its transforms use a right-handed Y-up frame. The inspected
TerraFlux Physics checkout exposes weather/grid scenario interfaces, not this
scene loader. This adapter targets the native viewer explicitly; it does not
claim that all TerraFlux components accept the same inputs.

## Supported and unsupported capabilities

| Capability | Adapter behaviour |
| --- | --- |
| Scene graph v2 | One non-drawable Root and one drawable mesh node |
| OBJ geometry | Indexed receiver triangles and supplied normals |
| Coordinates | Metres, Y up; receiver placement already baked into vertices |
| Asset paths | Fixed relative `assets/model.obj`; no external dependencies |
| Scoped source elements | Triangle ranges retained in `adapter.json` |
| Physical material execution | Unsupported by this scene loader |
| Density/friction/restitution | Preserved in `handoff.json`, not translated into solver state |
| Live physics | Disconnected |
| Native rendering | OSMesa direct/offscreen smoke passed locally; desktop/hardware checks remain device-specific |

The single asset avoids the native graph's 128-asset limit. It deliberately does
not create separately selectable native nodes for every source element. Asset and
root transforms are identity, preventing double application of room/receiver pose.
No MTL files or external textures are referenced, so the viewer uses its fallback
visual material. Material bindings remain available in the handoff sidecar.

## Bundle

Open Native viewer adapter inside Simulation material mapping. Select a valid
checksummed handoff to download one deterministic, uncompressed ZIP containing:

- `scene.json`: directly consumable native scene-v2 graph.
- `assets/model.obj`: combined vertices, normals and triangle faces.
- `handoff.json`: verified source, material mappings and provenance.
- `adapter.json`: pinned capabilities, element ranges and explicit unsupported features.

Legacy or stripped-checksum handoffs are refused. Checksummed handoffs are fully
verified before conversion. No project or input file is modified. ZIP paths are
fixed; entries are bounded, CRC-protected and checked with a standard ZIP reader.
The adapter enforces the reviewed parser's 2,000,000 position and 6,000,000 triangle
index limits, plus conservative 16 MiB OBJ and 32 MiB bundle limits.

Extract the ZIP, preserving paths. The reviewed engine documents viewer invocation
in this form (run from your built engine checkout):

```sh
./build-gl/terraflux-terrain-viewer --scene /path/to/extracted/scene.json
```

The adapter does not launch the viewer, invoke a solver or contact a service.
A reproducible software-rendering check is available below; deployment graphics support still needs its own runtime check.

## Native parser interoperability

From the TerraTec source checkout, with g++ supporting C++20, git, tar and a local
TerraFlux Engine repository containing the pinned commit:

```sh
npm run check:native-viewer -- --engine-repo /path/to/terraflux-engine
```

The checker archives committed sources at the pinned revision into a temporary
directory, compiles the real scene/OBJ/math implementations with TerraTec's test
harness, and loads the generated fixture bundle. It checks node/asset shape,
triangle count, bounds and normals. The engine worktree is never modified or used
as build output, and uncommitted engine changes are excluded. Temporary files are
removed afterward. No network access is required.

The local check passed with 28 triangles and matching bounds/normals on the pinned
revision. This optional cross-repository check is not part of default CI because
CI does not assume another checkout or its credentials. Default tests check scene
structure, indices, exact ZIP contents/CRCs, strict handoff policy and browser export.

## Reproducible native rendering smoke check

```sh
npm run check:native-render -- --engine-repo /path/to/terraflux-engine --backend xvfb --report test-results/native-render.json
npm run check:native-render -- --engine-repo /path/to/terraflux-engine --backend osmesa --report test-results/native-render.json
```

The checker builds the actual pinned native viewer from archived committed sources,
exports the fixture bundle, and executes its `--smoke-test` in direct and offscreen
modes with terrain/fire hidden. Both modes must import the expected triangle count,
render a completed frame and report positive OBJ pixels. Offscreen must create a
valid target without fallback/resize failures, perform its final composition, and
match direct-mode OBJ pixel coverage. The report records measured counts and the
OSMesa renderer/version where available. It never runs a physical solver.

Linux build dependencies: CMake 3.20+, a C++20 compiler, libpng/JPEG/OpenGL/GLFW
headers/libraries, git and tar. The default `xvfb` backend also needs Xvfb and xauth.
The `osmesa` backend requires GLFW 3.4+ with Null/OSMesa support and libOSMesa.
It needs no display sockets. Optional `TERRATEC_CMAKE`, `TERRATEC_RENDER_PREFIX` and
`TERRATEC_RENDER_CXX_FLAGS` support user-local toolchains/dependency prefixes.
`TERRATEC_KEEP_RENDER_TMP=1` retains temporary build files for diagnosis; otherwise
they are removed. The engine worktree remains untouched.

The OSMesa backend builds a **test-only context bootstrapper** and preloads it only
into the viewer child process. It selects GLFW Null + OSMesa and disables the
forward-compatible context bit that OSMesa cannot provide. The OpenGL core-profile
and 4.3 request remain intact. It does not replace geometry, rendering, pixel
readback or engine functions. The measured context version must actually be 4.3+.
This is not a desktop X11/Wayland or hardware-GPU validation.

Recorded local result: llvmpipe, OpenGL 4.5 core, Mesa 25.0.7; 28 imported triangles;
3,838 visible OBJ pixels in both direct and offscreen modes; 1280×800 offscreen
target with zero resize failures and no fallback. The measured reference report is
`fixtures/terraflux/native-render-osmesa-reference.json`. Pixel counts are reference
observations, not universal performance/visual baselines across drivers. Xvfb could
not run in this workspace because Unix display sockets are blocked; no X11 result
is claimed. This optional cross-repository render check is separate from default CI.

## Capability requirements

`nativeViewerCapabilities(requiredFeatures)` checks the pinned profile:

- `sceneGeometry`, `normals`, `relativeObjAssets`: supported by the reviewed loader.
- `nativeRendering`: requires a runtime check on the receiving graphics setup.
- `physicalMaterialExecution`, `rigidBodySimulation`, `fluidSimulation`,
  `structuralSimulation`: unsupported through this scene adapter.
- Unknown requested features block rather than silently falling back.

`nativeViewerBundle`/`nativeViewerZip` accept `{requiredFeatures}` and refuse blocked
or runtime-unverified requirements. These are source-profile checks, not discovery
or negotiation with a running engine. The UI's Physical simulation purpose disables
bundle export and reports unsupported requirements; Geometry viewer purpose retains
the existing geometry-only export. A local rendering pass never promotes physics
support or every receiving device's rendering capability automatically.
