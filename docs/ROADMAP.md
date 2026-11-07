# TerraTec progress

Overall: **71%** of the planned functional scope, estimated by effort and verified
capabilities. Percentages are planning estimates, not test coverage. This first
foundation is not equivalent to a finished CAD application.

| Milestone | Done | Improved in this iteration | Next step |
| --- | ---: | --- | --- |
| Project foundation | 90% | C++ core, Node API, Vue/Three.js application, schema 6 furniture/presets with older-project migration, UUID-backed project collection, atomic save/load, CI configuration | Configuration checks and installation |
| Design workspace | 95% | Nearest-wall feedback and optional preview clearance enforcement | Clearance overlay controls |
| Parametric geometry | 30% | Rotated placement guides and exact post-grid alignment | Persistent constraints and arbitrary outlines |
| Building design | 34% | Door/window planning zones and height-aware furniture checks | True door sweep geometry and multiple rooms |
| Interiors and furniture | 67% | Wall gaps, opening-zone warnings and optional insertion enforcement | More furniture types and room layout rules |
| Drawings and exchange | 43% | A4/A3 sheets, orientation, margins, fit feedback and blocked oversized exports | Pagination and more exchange formats |
| Manufacturing | 58% | Snapshot manifests, derived layout verification and blocking handoff checks | Costing and workshop cutting constraints |
| Distributed production | 55% | Searchable job register, workflow filters, due-date sorting and latest-revision summaries | Workshop contacts and assignment presets |
| Customer and business tools | 44% | Customer search and copy-safe backups; cross-job quote register with snapshot navigation | Quote CSV exchange and customer archiving |
| Assisted design | 0% | — | Structured design commands |
| TerraFlux integration | 0% | — | Model exchange contract |
| Release readiness | 12% | Recovery snapshots, storage-failure feedback and import validation | Installation and recovery |

Next iteration: true hinge-aware door sweep checks and clearance overlays.

Validation: eighty-five Node test groups and the Vite production build pass locally.
The preceding foundation passed CMake/CTest in GitHub Actions. Browser smoke checks
cover save/load, native quantities, selection across views and edits, ray picking,
pan versus click, deselection, keyboard interaction, and mobile overflow, snapped/unsnapped endpoint edits, invalid-shape rejection, edited-outline persistence, corner dragging, single-gesture undo, redo, cancellation keyboard history, opening CRUD/undo/persistence and opening-aware wall/height validation. Local
browser installation failed because the browser archive download was invalid;
the smoke workflow runs in GitHub Actions and uploads desktop/mobile screenshots.
