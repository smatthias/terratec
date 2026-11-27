# TerraTec progress

Overall: **approximately 68% across the full roadmap** (equal-weight mean of milestone estimates, rounded). These percentages are planning estimates, not test coverage or production readiness. The wider roadmap includes future assisted design and TerraFlux work.

| Milestone | Done | Current capability / improvement | Next step |
| --- | ---: | --- | --- |
| Project foundation | 95% | Storage write probes, record checks and actionable project errors | Startup configuration diagnostics |
| Design workspace | 95% | Desktop panels, fullscreen, room switching, saved constraint list and Plan indicators | Production browser verification |
| Parametric geometry | 75% | Locked points, fixed lengths and parallel/perpendicular wall relationships with bounded solving and schema-9 persistence | Constraint UI browser verification |
| Building design | 75% | Shared floor plan, linked openings and whole-building quantities with overlap handling | Building-level drawings and export |
| Interiors and furniture | 88% | Cabinet editing, furniture designer, placement tools, cutting/drilling benches, workbench and material rendering | Verify complete editing workflows |
| Drawings and exchange | 85% | Combined SVG, A4/A3 fit checks, printable snapshot preview and standalone HTML | Multi-sheet tiling for oversized plans |
| Manufacturing | 88% | Parts, nesting, stock pricing, handoff validation and a simulated CNC machine that runs the exported NC programs with a tool rack | Machine-specific constraints |
| Distributed production | 75% | Workshop assignment and fulfilment tracking | Workshop capacity planning |
| Customer and business tools | 70% | Customers, quotes, pricing presets and backups | Billing exchange |
| Assisted design | 0% | Not implemented | Structured design commands |
| TerraFlux integration | 0% | Not implemented | Model exchange contract |
| Release readiness | 65% | Packaged storage diagnostics and overwrite protection for unreadable projects | Startup checks and configuration validation |

This iteration adds a platform archive containing the production frontend, API and native executable. Node.js is required on the target; npm dependencies, Vite and a compiler are not. CI uploads a Linux x64 archive. Other operating systems and Linux distributions remain unverified.

Validation on `feature/toolset` with printable building-sheet snapshots (27 November 2026):

- 465 Node tests passed, with no failures or skips.
- Standalone printable HTML/SVG structure checks passed for A4/A3 portrait/landscape.
- All 5 CMake/CTest checks passed; the native core linked statically.
- Production build and configured bundle budgets passed. The lazy print-preview component and document generator use a 1060 kB total JavaScript allowance; the 195 kB entry and 880 kB initial-load limits are unchanged. Per-chunk and lazy workspace limits are unchanged.
- Release archive creation and extracted-package checks passed: fresh installation, restart, replacement with external data, and offline backup recovery.
- Production browser verification remains pending. The system Chromium launcher points to a missing executable, and the Playwright browser download returned HTTP 403 in this environment. No browser workflow pass is claimed for this revision. The suite includes furniture designer, workshop benches and CNC playback checks.

Next verification step: run `npm run test:browser:production` with an installed, working Chromium (install using `npm run test:browser:install`, or set `TERRATEC_CHROMIUM`). Keep development on `feature/toolset`. Then verify preview loading, browser print/Save PDF, HTML downloads and print scale in a browser. The next increment is multi-sheet tiling for oversized building plans at the selected scale. Browser printing remains unverified; there is no custom PDF renderer. Boundary-line deduplication and linked-opening counts are planning summaries; wall-face areas retain both room-facing surfaces. Shared meshes and material take-offs remain unimplemented. UI browser verification remains pending.

Release follow-up: startup checks and configuration validation. Storage diagnostics now probe writes and validate project files, and unreadable project records return actionable HTTP 422 feedback without being overwritten. Synthetic schema 1–12 fixtures now verify normalization without rewriting source files, explicit-save upgrade preserving IDs and rejected future-version overwrites. Historical release binaries and job/customer cross-version migrations remain unverified.
