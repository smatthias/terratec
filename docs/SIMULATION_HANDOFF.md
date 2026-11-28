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
verification is available as described below.

## Round-trip verification

New v1 exports include `handoffSha256`, a SHA-256 digest of canonical compact UTF-8
JSON for the whole payload excluding the checksum field. Object keys sort
recursively; array order remains significant. This covers primary material values
as well as geometry and derived bindings. It is not a signature or authentication.

`verifySimulationHandoff(text, {requireChecksum: false})` checks the embedded model,
rebuilds the receiver using the file's declared placement and overlap geometry,
revalidates mappings and compares every derived field and validation issue. It
rejects blocked payloads, unsupported versions/fields, invalid sizes and changed
execution flags. Overlapping geometry retains the explicit warning from the
reference scene; verification does not grant new production approval.

The result is `{handoff, integrity}`. Integrity is `checksum-and-derived` for new
files, or `derived-only` for pre-checksum v1. Legacy files cannot detect edits to
otherwise valid primary material inputs; the UI reports this limitation. Set
`requireChecksum: true` or select **Require handoff checksum** to reject legacy or
stripped-checksum files instead. A checksum does not prevent deliberate edits
followed by recomputation.

Use **Verify simulation handoff file** to check an archived file without applying
its materials, model or placement. The UI reports whether its source model hash
matches the currently loaded model. A different model is a valid archive, not an
import request. Failed verification clears the previous verification result while
leaving the current mapping and workspace unchanged. Maximum file size is 8 MiB.

From the source checkout:

```sh
npm run check:handoff -- handoff.json
npm run check:handoff -- handoff.json --require-checksum
```

The CLI writes a JSON summary to stdout, creates no files and exits with code 1
for invalid files or policy failures. It is not bundled with the packaged app.
The frozen `fixtures/terraflux/handoff-legacy-v1.json` exercises compatibility with
actual pre-checksum structure. Tests also cover checksummed roundtrips, altered
material values/bindings/geometry, strict policy, placement and overlap handling.
