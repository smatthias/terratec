# TerraTec → TerraFlux model contract v1

The TerraTec exporter and verifier implement `terratec-terraflux-model`, version 1.
This is a proposed receiving-adapter boundary, not a claim that a TerraFlux engine
already accepts this file. Export and verification stay local and make no network
requests. Verification does not import geometry or change the workspace.

## Coordinates and units

All geometry uses metres in a right-handed project-local frame: Y is up, X/Z are
horizontal. All room floors are at Y=0. There is no terrain elevation, geographic
anchor, latitude/longitude, CRS or relationship to true north. `georeference` is
null. A receiver must supply any geographic placement explicitly.

Room placement is already applied to every exported point. For room-local `(x,z)`
and placement `(px,pz,theta)`, with theta a positive rotation around Y:

```
worldX = px + cos(theta) * x + sin(theta) * z
worldZ = pz - sin(theta) * x + cos(theta) * z
```

Do not apply room placement a second time. Furniture centres are transformed the
same way, at half their height above the floor. `rotationY` combines room and
furniture rotation, in degrees. Sizes stay on the furniture's local X/Y/Z axes.
Placed design sizes are converted from their designer's millimetres by existing
project normalization before export. Derived point values round to 1e-9 m.

## Fields

| Field | Meaning |
| --- | --- |
| `format`, `version` | `terratec-terraflux-model`, `1` |
| `generatedAt` | Export snapshot time |
| `units`, `frame` | Explicit metres, handedness, axes and project-local origin |
| `source.project` | Complete normalized TerraTec source snapshot |
| `source.sha256` | SHA-256 of canonical normalized source JSON |
| `rooms[].id`, `name` | Stable room identity; IDs inside a room are scoped to it |
| `rooms[].floor`, `ceiling` | Convex polygon vertex lists in world coordinates |
| `rooms[].height` | Room height in metres |
| `rooms[].walls[].id` | Stable wall ID in its source room |
| `walls[].start`, `end` | Exact interior wall endpoints at floor height |
| `walls[].surfaces` | Four-vertex wall patches excluding opening voids |
| `walls[].openings` | Door/window references, base endpoints, width, height and sill |
| `rooms[].furniture` | Oriented bounding boxes, names, type and material/design references |
| `openingLinks` | Explicit source room/opening pairs; no geometry merging |
| `overlaps` | Pairs of rooms with overlapping floor interiors |
| `limitations` | Explicit interpretation limits supplied with every export |
| `modelSha256` | SHA-256 of the full canonical payload excluding this field |

Floor vertices wind toward +Y and ceiling vertices toward -Y. Wall patch winding
faces the room interior. Walls have zero thickness and no renderer extensions.
Each rectangular patch can be split into two triangles; convex floors/ceilings can
be triangulated as fans. Door/window voids are empty: no glass, frames, door leaves
or dynamic hinges are emitted. Shared boundaries are exported once per room, not
welded. Linked openings retain both source sides and a relationship record.

Furniture boxes approximate occupied bounds only. Cabinet cavities and placed
design internals are excluded. `materialId` identifies a source material for
cabinets; placed designs have null because their parts may mix materials. No
material density, thermal, mechanical or combustion properties are inferred.

## Validation and provenance

The UI exports JSON and verifies uploaded exchange files, up to 2 MiB of UTF-8.
The verifier normalizes the embedded source, rebuilds every derived field and
hash, and requires canonical equality. Unsupported versions, extra fields and
altered geometry are rejected. Canonicalization recursively sorts object keys
while preserving array order; hashing uses UTF-8 compact JSON. Source selection
state is included in the snapshot hash, although it does not alter world geometry.

Hashes detect altered payloads; they are not signatures or author authentication.
Successful verification means consistency with TerraTec's source and algorithms,
not structural correctness or suitability for a simulation. Receivers must decide
how to handle overlaps, duplicate boundaries, apertures and bounding-box furniture.

## Receiver follow-up

A TerraFlux adapter still needs coordinate placement, geometry ingestion and
physical-parameter mapping, with fixtures and end-to-end validation in the receiving
application. This increment changes only TerraTec; it does not modify the physics
engine or run environmental, structural, fire or fluid simulation.

## Reference receiver compatibility

`shared/terraflux-receiver.mjs` exports `receiveTerraFluxModel(text, options)`.
It verifies the exchange before converting geometry into a reference scene:

- `surfaces`: indexed floor/ceiling/wall meshes, each with flat XYZ `positions`,
  equally sized unit `normals`, integer triangle `indices`, scoped IDs and bounds.
- `bodies`: triangulated oriented furniture boxes with outward normals and an
  explicit approximation flag; no rigid-body mass or material properties.
- `openings`: aperture metadata with transformed base endpoints and scoped IDs.
- `openingLinks`: source references retained without welding geometry.
- `summary`: room/surface/body/triangle counts and overall min/max bounds.
- `source`: verified model and project hashes; `simulationConnected` is false.

Surface winding follows the model contract; furniture normals face outward. Vertex
arrays use metres; indices address XYZ triples. Shared room boundaries remain
separate. The scene is geometry for an adapter, not running solver state.

Optional `placement: {x,y,z,yaw}` applies one explicit receiver-local rigid transform
in metres/degrees after room placement has already been applied. Defaults are zero.
This is not a geographic anchor. `allowOverlaps: true` is required when room floor
interiors overlap; otherwise conversion rejects the model. No welding or clipping
is performed when overlaps are allowed. Invalid options and degenerate faces fail.

In the Project panel, verify a file and select **Check receiver compatibility**.
Overlaps require the explicit checkbox. Changing or rejecting the file clears its
previous compatibility result. These checks never modify the project.

From a source checkout:

```sh
npm run check:terraflux -- fixtures/terraflux/model-v1.json
npm run check:terraflux -- model.json --allow-overlaps
node scripts/check-terraflux.mjs model.json --scene
```

The default CLI output is a JSON compatibility summary. `--scene` writes the full
reference scene to stdout. Invalid files/options exit with code 1. No files are
created. The CLI itself is not included in the packaged application.

`fixtures/terraflux/model-v1.json` is a frozen v1 exchange file. Its companion
`expected-v1.json` records independently specified triangle counts and transformed
bounds for a 6 × 4 m room, a 1 × 2 m door and a rotated cabinet. Tests consume the
frozen file directly; they do not regenerate it. Contract changes therefore need
an explicit compatibility decision before fixtures are updated. Separate tests
check aperture area, normals, index bounds, overlap policy and CLI behaviour.

## Receiver scene preview

After verifying an exchange file, **Preview receiver scene** opens an isolated 3D
view of its reference receiver meshes. Drag to orbit and use the wheel to zoom.
**Fit receiver scene** frames the last valid scene. Ceilings start hidden for
interior visibility; ceiling and wireframe toggles only affect rendering.

Enter receiver X/Y/Z translations in metres and yaw in degrees, then select
**Apply receiver placement**. This uses the same validated rigid transform as the
reference receiver. Invalid values leave the last valid scene intact. Controls
start at zero on each opening and are not saved to the project or exchange file.
The preview does not modify room placements, source hashes or the main camera.

Rendering recentres verified geometry around its bounds before conversion to
Float32 GPU buffers, preserving local detail at large receiver offsets. The bounds
readout remains in receiver coordinates. Closing the preview releases its GPU
geometry/materials, renderer, controls, resize observer and animation loop. A new
file or overlap-policy change closes an existing preview. This is geometry review;
there is no live physics, material-property mapping or simulation in this view.
