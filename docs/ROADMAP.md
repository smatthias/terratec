# TerraTec progress

Overall: **88%** of the current delivery plan, estimated by effort and verified capabilities. Percentages are planning estimates, not test coverage or a claim of a finished CAD product. The wider roadmap includes future assisted design and TerraFlux work.

| Milestone | Done | Current capability / improvement | Next step |
| --- | ---: | --- | --- |
| Project foundation | 93% | C++17 core, Node API, Vue/Three.js workspace, project persistence and CI | Configuration diagnostics |
| Design workspace | 95% | Selection, snapping, editing, history and clearance feedback | Interaction refinements |
| Parametric geometry | 63% | Editable room outlines and cabinet parameters | Persistent constraints |
| Building design | 35% | Wall openings and door clearance checks | Multiple rooms |
| Interiors and furniture | 84% | Cabinet bays, fronts, joinery and edge banding | More furniture types |
| Drawings and exchange | 67% | Printable sheets and manufacturing exports | More exchange formats |
| Manufacturing | 88% | Parts, nesting, stock pricing and handoff validation | Machine-specific constraints |
| Distributed production | 75% | Workshop assignment and fulfilment tracking | Workshop capacity planning |
| Customer and business tools | 70% | Customers, quotes, pricing presets and backups | Billing exchange |
| Assisted design | 0% | Not implemented | Structured design commands |
| TerraFlux integration | 0% | Not implemented | Model exchange contract |
| Release readiness | 36% | Portable local archive, one-server launcher and extracted-installation checks | Upgrade and recovery verification |

This iteration adds a platform archive containing the production frontend, API and native executable. Node.js is required on the target; npm dependencies, Vite and a compiler are not. CI uploads a Linux x64 archive. Other operating systems and Linux distributions remain unverified.

Validation: 125 Node tests, production build, bundle budgets and extracted-package smoke checks pass locally. The package check runs outside the installation directory and verifies frontend assets, native geometry and project data written to an external directory. CI also runs CMake/CTest and the production browser suite; see PR #1 for live results.

Next iteration: verify restart and upgrade recovery using external project/job/customer data.
