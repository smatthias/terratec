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
| Full native rendering run | Pending; parser interoperability is tested |

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
A later renderer smoke check is still needed for full graphics-path validation.

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
