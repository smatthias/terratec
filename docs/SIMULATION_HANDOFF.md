# Reference simulation handoff v1

After verifying a TerraFlux model file, open Simulation material mapping. The panel
accepts explicit JSON mapping data and validates it against the verified geometry.
No material values are populated from TerraTec's visual/planning catalogue.

The template contains null physical values intentionally. Supply your own values
and source notes. These are reference-schema checks, not engineering certification
or confirmation that a particular solver supports the material model.

## Mapping fields

| Field | Meaning |
| --- | --- |
| `version` | 1 |
| `materials` | Up to 64 user-defined target materials |
| `materials[].id`, `name` | Unique ID and readable name |
| `densityKgM3` | Explicit positive density, up to 1000000 kg/m³ |
| `friction` | Explicit reference contact coefficient, 0–10 |
| `restitution` | Explicit reference coefficient, 0–1 |
| `sourceNote` | Required provenance note, up to 500 characters |
| `sourceMaterials` | Source furniture material ID → target registry ID |
| `bodyOverrides` | Scoped `{roomId,furnitureId,materialId}` assignments |
| `surfaceMaterialId` | Target registry ID applied to all static surfaces, or null |
| `acceptBoundingBoxes` | Explicit acknowledgement of furniture approximations |
| `acceptZeroThickness` | Explicit acknowledgement of static surface planes |

All numeric values must be finite numbers. Limits are encoding bounds, not suggested
material values. Unknown fields, duplicate IDs and duplicate scoped overrides are
rejected. The UI accepts at most 32 KiB of mapping JSON. The inventory lists actual
room/furniture/source-material IDs from the verified file.

Scoped overrides take precedence over source-material mappings. Mixed-material
placed designs have no single source material and need an explicit override.
Missing assignments, unknown target IDs and nonexistent override bodies block
export. Unused source mappings are warnings. Target IDs are checked against this
user-defined registry only, not a live engine catalogue.

## Geometry and placement

Static surfaces have zero thickness. Furniture boxes do not represent true solid
volume, so density is carried as metadata without calculating body mass. Explicit
geometry acknowledgements are required when these elements are present. Materials
cannot make the approximate geometry simulation-ready by themselves.

The UI handoff uses verified file coordinates with zero receiver placement. Separate
3D preview transforms are not carried over. Programmatic callers can pass the same
explicit placement and overlap options as `receiveTerraFluxModel`.

## Output

Export requires status `validated-reference`. `terratec-simulation-handoff` v1
contains the verified original `model`, reference receiver `scene`, source hashes,
normalized `mapping`, scoped element/material `bindings`, validation issues and
`simulationConnected: false`. Geometry is rebuilt and mappings are revalidated on
every export. Output is limited to 8 MiB. No model, project or saved material library
is modified. Mapping edits are transient; the exported handoff contains them.

Changing mapping text, verified file or overlap policy invalidates the displayed
validation. No solver is run, and no solver-specific acceptance, thermal/fire model,
rigid-body mass, collision policy or physical boundary conditions are supplied.
A receiving adapter must validate those requirements separately. Read-only round-trip
verification of exported handoffs is the next increment.
