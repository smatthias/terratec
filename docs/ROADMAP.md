# TerraTec progress

Overall: **2%** of the planned functional scope, estimated by effort and verified
capabilities. Percentages are planning estimates, not test coverage. This first
foundation is not equivalent to a finished CAD application.

| Milestone | Done | Improved in this iteration | Next step |
| --- | ---: | --- | --- |
| Project foundation | 65% | C++ core, Node API, Vue/Three.js application, versioned project contract, atomic save/load, CI configuration | Verify browser interaction, add project selection and configuration checks |
| Design workspace | 10% | Orbit/pan/zoom preview, editable room dimensions, top camera view | True orthographic plan, selection and snapping |
| Parametric geometry | 3% | Rectangular room dimensions and native area/volume/perimeter | Shared geometry representation and constraints |
| Building design | 2% | Single-room cutaway preview | Editable walls and openings |
| Interiors and furniture | 0% | — | Parametric furniture component |
| Drawings and exchange | 0% | — | Drawings and quantities from shared model |
| Manufacturing | 0% | — | Validated manufacturing job |
| Distributed production | 0% | — | Workshop profiles and handoff |
| Customer and business tools | 0% | — | Quantity-based quotes |
| Assisted design | 0% | — | Structured design commands |
| TerraFlux integration | 0% | — | Model exchange contract |
| Release readiness | 1% | Startup instructions and automated foundation checks | Browser smoke checks, installation and recovery |

Next iteration: verify the interactive editor, introduce an orthographic 2D plan,
and establish selectable geometry before adding freeform room drawing.

Validation: native core compiled directly with g++; all three Node test groups
passed, including persistence after a service restart; Vite production build passed.
CMake/CTest and browser interaction remain unverified locally because this environment
does not have CMake or a Playwright browser installed. CI includes the CMake checks.
