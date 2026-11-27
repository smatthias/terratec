# TerraTec progress

Overall: **working design and machining prototype; toolset release verification in progress**. The previous 91% estimate described the foundation delivery plan and is not a completion estimate for the expanded toolset. Milestone percentages below are historical planning estimates pending a scope review, not test coverage. The wider roadmap includes future assisted design and TerraFlux work.

| Milestone | Done | Current capability / improvement | Next step |
| --- | ---: | --- | --- |
| Project foundation | 95% | Storage write probes, record checks and actionable project errors | Startup configuration diagnostics |
| Design workspace | 95% | Desktop panels, fullscreen, selection, snapping, editing, version history and clearance feedback | Production browser verification |
| Parametric geometry | 63% | Editable room outlines and cabinet parameters | Persistent constraints |
| Building design | 35% | Convex 3–32-wall rooms, stable wall/corner IDs, wall construction, wall locking and openings | Multiple rooms |
| Interiors and furniture | 84% | Cabinet editing, furniture designer, placement tools, cutting/drilling benches, workbench and material rendering | Verify complete editing workflows |
| Drawings and exchange | 67% | Printable sheets and manufacturing exports | More exchange formats |
| Manufacturing | 88% | Parts, nesting, stock pricing, handoff validation and a simulated CNC machine that runs the exported NC programs with a tool rack | Machine-specific constraints |
| Distributed production | 75% | Workshop assignment and fulfilment tracking | Workshop capacity planning |
| Customer and business tools | 70% | Customers, quotes, pricing presets and backups | Billing exchange |
| Assisted design | 0% | Not implemented | Structured design commands |
| TerraFlux integration | 0% | Not implemented | Model exchange contract |
| Release readiness | 60% | Packaged storage diagnostics and overwrite protection for unreadable projects | Startup checks and configuration validation |

This iteration adds a platform archive containing the production frontend, API and native executable. Node.js is required on the target; npm dependencies, Vite and a compiler are not. CI uploads a Linux x64 archive. Other operating systems and Linux distributions remain unverified.

Validation on `feature/toolset` at `c827e47` (27 November 2026):

- 364 Node tests passed, with no failures or skips.
- All 5 CMake/CTest checks passed; the native core linked statically.
- Production build and configured bundle budgets passed.
- Release archive creation and extracted-package checks passed: fresh installation, restart, replacement with external data, and offline backup recovery.
- Production browser verification remains pending. The system Chromium launcher points to a missing executable, and the Playwright browser download returned HTTP 403 in this environment. No browser workflow pass is claimed for this revision. The suite includes furniture designer, workshop benches and CNC playback checks.

Next verification step: run `npm run test:browser:production` with an installed, working Chromium (install using `npm run test:browser:install`, or set `TERRATEC_CHROMIUM`). Keep development on `feature/toolset`. Then review milestone scope and implement persistent locked-point/fixed-length constraints.

Release follow-up: startup checks and configuration validation. Storage diagnostics now probe writes and validate project files, and unreadable project records return actionable HTTP 422 feedback without being overwritten. Synthetic schema 1–6 fixtures now verify normalization without rewriting source files, explicit-save upgrade preserving IDs and rejected future-version overwrites. Historical release binaries and job/customer cross-version migrations remain unverified.
