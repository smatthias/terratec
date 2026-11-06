# TerraTec progress

Overall: **9%** of the planned functional scope, estimated by effort and verified
capabilities. Percentages are planning estimates, not test coverage. This first
foundation is not equivalent to a finished CAD application.

| Milestone | Done | Improved in this iteration | Next step |
| --- | ---: | --- | --- |
| Project foundation | 72% | C++ core, Node API, Vue/Three.js application, schema 3 opening persistence with schema 1/2 migration, atomic save/load, CI configuration | Verify browser interaction, add project selection and configuration checks |
| Design workspace | 50% | Click-to-place openings on selected walls; opening symbol selection | Live placement preview and dimension lines |
| Parametric geometry | 12% | Validated opening bounds and overlap checks; segmented wall voids | More constraints and arbitrary outlines |
| Building design | 23% | Frames, glazing, fixed open door leaves and Plan symbols | Swing orientation controls and multiple rooms |
| Interiors and furniture | 0% | — | Parametric furniture component |
| Drawings and exchange | 4% | Door swing and window symbols in Plan | Dimension lines and drawing export |
| Manufacturing | 0% | — | Validated manufacturing job |
| Distributed production | 0% | — | Workshop profiles and handoff |
| Customer and business tools | 0% | — | Quantity-based quotes |
| Assisted design | 0% | — | Structured design commands |
| TerraFlux integration | 0% | — | Model exchange contract |
| Release readiness | 3% | Automated browser smoke workflow and screenshot artifacts | Installation and recovery |

Next iteration: add hinge/swing orientation controls and live opening placement previews.

Validation: twenty Node test groups and the Vite production build pass locally.
The preceding foundation passed CMake/CTest in GitHub Actions. Browser smoke checks
cover save/load, native quantities, selection across views and edits, ray picking,
pan versus click, deselection, keyboard interaction, and mobile overflow, snapped/unsnapped endpoint edits, invalid-shape rejection, edited-outline persistence, corner dragging, single-gesture undo, redo, cancellation keyboard history, opening CRUD/undo/persistence and opening-aware wall/height validation. Local
browser installation failed because the browser archive download was invalid;
the smoke workflow runs in GitHub Actions and uploads desktop/mobile screenshots.
