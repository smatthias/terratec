# TerraTec progress

Overall: **approximately 65% across the full roadmap** (equal-weight mean of milestone estimates, rounded). These percentages are planning estimates, not test coverage or production readiness. The wider roadmap includes future assisted design and TerraFlux work.

| Milestone | Done | Current capability / improvement | Next step |
| --- | ---: | --- | --- |
| Project foundation | 95% | Storage write probes, record checks and actionable project errors | Startup configuration diagnostics |
| Design workspace | 95% | Desktop panels, fullscreen, room switching, saved constraint list and Plan indicators | Production browser verification |
| Parametric geometry | 75% | Locked points, fixed lengths and parallel/perpendicular wall relationships with bounded solving and schema-9 persistence | Constraint UI browser verification |
| Building design | 60% | Shared floor-plan overview, room placement/rotation, advisory overlap checks and schema-11 persistence | Shared-wall adjacency and connected openings |
| Interiors and furniture | 88% | Cabinet editing, furniture designer, placement tools, cutting/drilling benches, workbench and material rendering | Verify complete editing workflows |
| Drawings and exchange | 67% | Printable sheets and manufacturing exports | More exchange formats |
| Manufacturing | 88% | Parts, nesting, stock pricing, handoff validation and a simulated CNC machine that runs the exported NC programs with a tool rack | Machine-specific constraints |
| Distributed production | 75% | Workshop assignment and fulfilment tracking | Workshop capacity planning |
| Customer and business tools | 70% | Customers, quotes, pricing presets and backups | Billing exchange |
| Assisted design | 0% | Not implemented | Structured design commands |
| TerraFlux integration | 0% | Not implemented | Model exchange contract |
| Release readiness | 65% | Packaged storage diagnostics and overwrite protection for unreadable projects | Startup checks and configuration validation |

This iteration adds a platform archive containing the production frontend, API and native executable. Node.js is required on the target; npm dependencies, Vite and a compiler are not. CI uploads a Linux x64 archive. Other operating systems and Linux distributions remain unverified.

Validation on `feature/toolset` with shared floor-plan placement (27 November 2026):

- 413 Node tests passed, with no failures or skips.
- All 5 CMake/CTest checks passed; the native core linked statically.
- Production build and configured bundle budgets passed. Room placement and the lazy floor-plan overview use a 190 kB entry, 875 kB initial-load and 1020 kB total JavaScript allowance. Per-chunk and lazy workspace limits are unchanged.
- Release archive creation and extracted-package checks passed: fresh installation, restart, replacement with external data, and offline backup recovery.
- Production browser verification remains pending. The system Chromium launcher points to a missing executable, and the Playwright browser download returned HTTP 403 in this environment. No browser workflow pass is claimed for this revision. The suite includes furniture designer, workshop benches and CNC playback checks.

Next verification step: run `npm run test:browser:production` with an installed, working Chromium (install using `npm run test:browser:install`, or set `TERRATEC_CHROMIUM`). Keep development on `feature/toolset`. Then verify room selection, placement, overview navigation and constraint editing in a browser. The next building-design increment is shared-wall adjacency, followed by connected openings and aggregate quantities. Shared floor-plan persistence and overlap checks are implemented; UI browser verification remains pending.

Release follow-up: startup checks and configuration validation. Storage diagnostics now probe writes and validate project files, and unreadable project records return actionable HTTP 422 feedback without being overwritten. Synthetic schema 1–11 fixtures now verify normalization without rewriting source files, explicit-save upgrade preserving IDs and rejected future-version overwrites. Historical release binaries and job/customer cross-version migrations remain unverified.
