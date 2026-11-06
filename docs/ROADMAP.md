# TerraTec progress

Overall: **52%** of the planned functional scope, estimated by effort and verified
capabilities. Percentages are planning estimates, not test coverage. This first
foundation is not equivalent to a finished CAD application.

| Milestone | Done | Improved in this iteration | Next step |
| --- | ---: | --- | --- |
| Project foundation | 90% | C++ core, Node API, Vue/Three.js application, schema 6 furniture/presets with older-project migration, UUID-backed project collection, atomic save/load, CI configuration | Configuration checks and installation |
| Design workspace | 78% | Independent project duplication, fresh history and recovery of source edits | Placement alignment and editing polish |
| Parametric geometry | 12% | Validated opening bounds and overlap checks; segmented wall voids | More constraints and arbitrary outlines |
| Building design | 27% | A/B hinge and inward/outward swing, consistent in Plan/3D, undo and saves | Swing clearance checks and multiple rooms |
| Interiors and furniture | 30% | Oak, birch and white board appearance with persistent material selection | More furniture types and material detail |
| Drawings and exchange | 43% | A4/A3 sheets, orientation, margins, fit feedback and blocked oversized exports | Pagination and more exchange formats |
| Manufacturing | 58% | Snapshot manifests, derived layout verification and blocking handoff checks | Costing and workshop cutting constraints |
| Distributed production | 55% | Searchable job register, workflow filters, due-date sorting and latest-revision summaries | Workshop contacts and assignment presets |
| Customer and business tools | 26% | Saved customer/reference/notes and printable quotes with cost/material breakdown | Customer records and quote lifecycle |
| Assisted design | 0% | — | Structured design commands |
| TerraFlux integration | 0% | — | Model exchange contract |
| Release readiness | 12% | Recovery snapshots, storage-failure feedback and import validation | Installation and recovery |

Next iteration: customer records and draft/sent/accepted quote lifecycle metadata.

Validation: sixty-seven Node test groups and the Vite production build pass locally.
The preceding foundation passed CMake/CTest in GitHub Actions. Browser smoke checks
cover save/load, native quantities, selection across views and edits, ray picking,
pan versus click, deselection, keyboard interaction, and mobile overflow, snapped/unsnapped endpoint edits, invalid-shape rejection, edited-outline persistence, corner dragging, single-gesture undo, redo, cancellation keyboard history, opening CRUD/undo/persistence and opening-aware wall/height validation. Local
browser installation failed because the browser archive download was invalid;
the smoke workflow runs in GitHub Actions and uploads desktop/mobile screenshots.
