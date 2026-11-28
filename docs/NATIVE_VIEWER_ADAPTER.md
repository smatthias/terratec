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

## Resource admission and source lookup

Exports enforce configurable triangle and logical retained CPU mesh budgets (defaults: 2,000,000 triangles and 64 MiB). The reviewed OBJ importer expands each triangle into three 96-byte vertices and three 4-byte indices: 300 bytes per triangle. The pinned C++ contract checks the ABI, exact-fit admission and one-byte-over rejection against the engine budget implementation. This excludes allocation overhead, parser peak memory, textures, GPU allocations and framebuffers; it is not a process memory guarantee.

The manifest records resource usage and contiguous source ranges, including scoped room, wall or furniture identifiers and material references. The export panel can look up a zero-based triangle from the just-exported manifest. OBJ face numbers are one-based. This lookup does not implement native picking: geometry remains one native mesh node.

## Read-only bundle verification

Use **Verify native viewer bundle** in the adapter panel, or:

```sh
npm run check:native-bundle -- /path/to/terratec-native-viewer.zip
```

The reader accepts only TerraTec's canonical, uncompressed ZIP profile: at most 16 entries, 32 MiB of text payload and bounded archive overhead. It checks CRCs, UTF-8, safe unique names, local headers, the central directory and end record, with no extraction. The native bundle must contain exactly the four exported files in order. Recompressed ZIPs, reformatted JSON and other externally rewritten archives are rejected; re-export from the original handoff instead.

Verification rebuilds the current pinned adapter output from the embedded checksummed handoff, then compares all four files exactly. This checks scene asset paths/transforms, OBJ geometry/normals, source/material ranges, engine profile and resource claims together. Browser verification additionally enforces the current receiving resource limits; the command uses the default limits. Successful verification enables source-range lookup without changing the workspace, material mapping or downloading a new bundle. Failures clear the previous range result.

Checksums establish internal consistency, not author identity or authenticity. A fully regenerated archive containing a different valid model can pass. Verification does not run the native renderer or physics, and older adapter output without the current resource/source metadata must be re-exported.

## Check a supplied ZIP with the pinned native engine

Both native checks accept the verified ZIP directly. Without `--bundle` they keep using the generated compatibility fixture, which now passes through the same archive verification path.

```sh
npm run check:native-viewer -- --engine-repo /path/to/terraflux-engine --bundle /path/to/terratec-native-viewer.zip --report /tmp/native-parser.json
npm run check:native-render -- --engine-repo /path/to/terraflux-engine --bundle /path/to/terratec-native-viewer.zip --backend osmesa --report /tmp/native-render.json
```

Verification and default receiving resource admission finish before engine access, compilation or native execution. Only the four verified files are written into a temporary directory. The source repository remains read-only; builds still use the recorded engine commit. Parser checks compare imported triangle counts, bounds, normals and logical memory against the verified manifest. Rendering checks require the supplied triangle count, positive visible pixels and matching direct/offscreen coverage. A model outside the smoke camera's view can fail rendering even when its archive and parser checks pass.

Reports identify the exact input by SHA-256, byte count, fixture/supplied mode and receiving admission result. The parser report additionally records the expected summary and native output. Treat a report as new evidence only when its command exits successfully; a failed command does not replace a pre-existing report. Rendering still requires the documented graphics dependencies and backend setup. This remains an explicit native smoke check, not an interactive launcher or a physics connection.

## View recorded native check reports

After exporting or verifying a ZIP in the adapter panel, use **Import native check report** to select a parser or render report produced by the commands above. The panel displays the ZIP SHA-256 and accepts only a report matching its archive hash/size, source hashes, pinned engine commit and resource calculation. Parser reports also require matching geometry summaries and successful native output. Render reports require matching triangle counts, both direct/offscreen modes, positive consistent coverage, valid offscreen targets and the recorded backend context.

Report input is limited to 64 KiB. A rejected report clears the prior result. Selecting a new bundle, changing purpose/resource limits or closing the panel also clears it. Imported results remain read-only and do not change the project or the native capability gate. They are labeled **matching imported reports**: the JSON is not signed, importing does not rerun native code on the browser's device, and consistency does not prove authenticity. Live physics remains disconnected.

## Select source geometry in the browser

After exporting or verifying a bundle, choose **Preview native source geometry**. The read-only Three.js preview uses the same verified receiver meshes that produced the OBJ, with element ordering and triangle counts checked against the native manifest. Click geometry or use the source-element selector; the complete element is highlighted and the parent panel's zero-based triangle/source/material lookup updates. The accessible selector includes floors, ceilings, walls and furniture bounds. Selecting a ceiling temporarily reveals it. Drag to orbit, zoom, fit the scene, or toggle ceilings/wireframe without modifying the source.

The preview closes on its button or Escape and releases geometries, materials, controls, render context, resize observation and animation. Replacing the bundle or changing its admission settings clears the preview together with report state. Selection is browser-local and does not alter the workspace, source ZIP, material bindings, native combined mesh or native picking support. A browser without WebGL receives an explicit unavailable message; the verified bundle and source lookup remain usable.

### Isolate and frame a selected element

**Isolate selected native element** hides other preview meshes and frames the current source element. Changing selection keeps isolation focused on the new element, including a ceiling selected through the list. Hidden meshes are excluded from raycast picking. Uncheck isolation to restore the normal cutaway/ceiling visibility settings.

**Fit selected native element** frames its bounding box and moves the orbit target to its centre. **Fit native source geometry** returns to whole-scene framing without changing the isolation checkbox. Selection framing follows subsequent selection changes and viewport resizing. The view status reports the visible element count, framing mode and isolation state. These controls modify only preview visibility and camera state; the source geometry, ZIP, native ranges and material bindings remain unchanged.

### Selected source measurements

The preview's collapsible measurement inspector reports X/Y/Z minimum, maximum and axis-aligned span, centre, triangulated area and the half-open native triangle range `[first, endExclusive)`. Values use verified source positions in the bundle's local Y-up metre frame, with receiver placement already baked in, before browser recentering/Float32 conversion. Display values round to four decimal places; the calculations retain source precision.

Wall area sums actual triangles, so opening voids are excluded even though the outer bounds span the whole wall. Furniture is explicitly marked as a bounding-box approximation: axis-aligned extents of a rotated box are not its nominal dimensions, and bounds surface area does not describe cabinet internals or manufacturing quantities. Zero-thickness room surfaces have no inferred thickness. No volume, mass or physical properties are calculated. Measurements update with source selection and leave the project, archive and geometry unchanged.
