# TerraTec progress

Overall: **5%** of the planned functional scope, estimated by effort and verified
capabilities. Percentages are planning estimates, not test coverage. This first
foundation is not equivalent to a finished CAD application.

| Milestone | Done | Improved in this iteration | Next step |
| --- | ---: | --- | --- |
| Project foundation | 70% | C++ core, Node API, Vue/Three.js application, schema 2 outline persistence with schema 1 migration, atomic save/load, CI configuration | Verify browser interaction, add project selection and configuration checks |
| Design workspace | 30% | Visible plan grid, optional snapping and numeric wall endpoint inspector | Drag handles and undo/redo |
| Parametric geometry | 10% | Shared convex outline, connected corners, validation and native polygon quantities | More constraints and arbitrary outlines |
| Building design | 8% | Connected editable walls and polygon floor in both views | Openings and multiple rooms |
| Interiors and furniture | 0% | — | Parametric furniture component |
| Drawings and exchange | 0% | — | Drawings and quantities from shared model |
| Manufacturing | 0% | — | Validated manufacturing job |
| Distributed production | 0% | — | Workshop profiles and handoff |
| Customer and business tools | 0% | — | Quantity-based quotes |
| Assisted design | 0% | — | Structured design commands |
| TerraFlux integration | 0% | — | Model exchange contract |
| Release readiness | 3% | Automated browser smoke workflow and screenshot artifacts | Installation and recovery |

Next iteration: add direct corner dragging in Plan and undo/redo for geometry edits.

Validation: eleven Node test groups and the Vite production build pass locally.
The preceding foundation passed CMake/CTest in GitHub Actions. Browser smoke checks
cover save/load, native quantities, selection across views and edits, ray picking,
pan versus click, deselection, keyboard interaction, and mobile overflow, snapped/unsnapped endpoint edits, invalid-shape rejection, and edited-outline persistence. Local
browser installation failed because the browser archive download was invalid;
the smoke workflow runs in GitHub Actions and uploads desktop/mobile screenshots.
