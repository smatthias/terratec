# Structured design commands v1

Open Assisted design commands in the Project panel. This is a deterministic local
command interface for furniture, intended as a bounded target for future proposal
adapters. No language model, natural-language parser or external service is used.

## Request

```json
{
  "version": 1,
  "units": "m",
  "roomId": "room-1",
  "commands": [
    {
      "op": "add-cabinet",
      "item": {
        "id": "proposed-cabinet",
        "name": "Storage",
        "width": 0.6,
        "depth": 0.4,
        "height": 1.2,
        "x": 0,
        "z": 0
      }
    },
    {"op": "move", "id": "proposed-cabinet", "x": 1, "z": 0},
    {"op": "rotate", "id": "proposed-cabinet", "rotation": 90}
  ]
}
```

Use the active room ID shown in the panel. Existing furniture IDs are listed.
Input is limited to 32 KiB of UTF-8 JSON and 1–20 commands. Unknown operations
and fields are rejected; no command content is evaluated as code.

| Operation | Fields besides `op` | Meaning |
| --- | --- | --- |
| `add-cabinet` | `item` | Add a cabinet with a unique ID |
| `move` | `id`, `x`, `z` | Absolute position in metres; no grid snapping |
| `rotate` | `id`, `rotation` | Absolute rotation in degrees, 0 ≤ value < 360 |
| `rename` | `id`, `name` | Set a 1–60 character name |
| `remove` | `id` | Remove an existing furniture item |

`item` requires `id`, `name`, `width`, `depth`, `height`, `x`, `z`. Optional fields
are `rotation` (default 0), `thickness` (0.018 m), `shelves` (1), `material` (oak).
Existing cabinet validation applies. Placement, names and rotation of placed
furniture designs can be edited, but their definitions cannot be rewritten here.
Room geometry, openings, constraints, files and manufacturing are outside v1.

## Preview, apply and undo

Preview displays before/after furniture states without changing the project.
All commands run on a detached room copy. References are resolved in order, so an
added ID can be used later in the same batch. The final project must satisfy
room fit, non-overlap, height, model schema, locked-shell and constraint checks.
A new cabinet must also be individually valid at its insertion position. Existing
furniture can swap positions atomically without requiring an intermediate gap.
Invalid commands reject the whole batch. No-op batches are rejected.

Apply recomputes and validates the prepared request, checks that neither the
project nor the proposed result changed after preview, then commits through the
editor's normal room history. The batch is one undo step; redo restores the whole
batch. Editing the command text clears its preview. Switching rooms or changing
the project makes the preview stale until it is prepared again.

Commands only target the active room. Other rooms, project-level furniture design
libraries, links and saved presets remain intact. The project is not saved to disk
automatically by this panel; normal save/recovery/version-history behaviour applies.
