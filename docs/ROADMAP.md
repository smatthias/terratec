# TerraTec progress

Overall: **3%** of the planned functional scope, estimated by effort and verified
capabilities. Percentages are planning estimates, not test coverage. This first
foundation is not equivalent to a finished CAD application.

| Milestone | Done | Improved in this iteration | Next step |
| --- | ---: | --- | --- |
| Project foundation | 65% | C++ core, Node API, Vue/Three.js application, versioned project contract, atomic save/load, CI configuration | Verify browser interaction, add project selection and configuration checks |
| Design workspace | 20% | Orthographic plan, stable surface selection, ray picking, Fit room, keyboard deselection | Grid snapping and editable wall endpoints |
| Parametric geometry | 3% | Rectangular room dimensions and native area/volume/perimeter | Shared geometry representation and constraints |
| Building design | 2% | Single-room cutaway preview | Editable walls and openings |
| Interiors and furniture | 0% | — | Parametric furniture component |
| Drawings and exchange | 0% | — | Drawings and quantities from shared model |
| Manufacturing | 0% | — | Validated manufacturing job |
| Distributed production | 0% | — | Workshop profiles and handoff |
| Customer and business tools | 0% | — | Quantity-based quotes |
| Assisted design | 0% | — | Structured design commands |
| TerraFlux integration | 0% | — | Model exchange contract |
| Release readiness | 3% | Automated browser smoke workflow and screenshot artifacts | Installation and recovery |

Next iteration: add grid snapping and editable wall endpoints on a shared plan/3D model.

Validation: six Node test groups and the Vite production build pass locally.
The preceding foundation passed CMake/CTest in GitHub Actions. Browser smoke checks
cover save/load, native quantities, selection across views and edits, ray picking,
pan versus click, deselection, keyboard interaction, and mobile overflow. Local
browser installation failed because the browser archive download was invalid;
the smoke workflow runs in GitHub Actions and uploads desktop/mobile screenshots.
