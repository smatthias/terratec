# TerraTec progress

Overall: **approximately 69% across the full roadmap** (equal-weight mean of milestone estimates, rounded). These percentages are planning estimates, not test coverage or production readiness. The wider roadmap includes future assisted design and TerraFlux work.

| Milestone | Done | Current capability / improvement | Next step |
| --- | ---: | --- | --- |
| Project foundation | 97% | Shared startup configuration, native-core and storage diagnostics | Broader platform validation |
| Design workspace | 95% | Desktop panels, fullscreen, room switching, saved constraint list and Plan indicators | Production browser verification |
| Parametric geometry | 75% | Locked points, fixed lengths and parallel/perpendicular wall relationships with bounded solving and schema-9 persistence | Constraint UI browser verification |
| Building design | 75% | Shared floor plan, linked openings and whole-building quantities with overlap handling | Building-level drawings and export |
| Interiors and furniture | 88% | Cabinet editing, furniture designer, placement tools, cutting/drilling benches, workbench and material rendering | Verify complete editing workflows |
| Drawings and exchange | 88% | Combined SVG, A4/A3 sheets and numbered tiled HTML with 10 mm overlaps | Browser verification of tiled output and alignment |
| Manufacturing | 90% | Persisted machine limits block incompatible panel and combined NC exports | Machine setup and fixture validation |
| Distributed production | 75% | Workshop assignment and fulfilment tracking | Workshop capacity planning |
| Customer and business tools | 70% | Customers, quotes, pricing presets and backups | Billing exchange |
| Assisted design | 0% | Not implemented | Structured design commands |
| TerraFlux integration | 0% | Not implemented | Model exchange contract |
| Release readiness | 70% | Startup checks shared by development and packaged releases, recovery-safe warnings and configuration validation | Broader platform validation |

This iteration adds a platform archive containing the production frontend, API and native executable. Node.js is required on the target; npm dependencies, Vite and a compiler are not. CI uploads a Linux x64 archive. Other operating systems and Linux distributions remain unverified.

Validation on `feature/toolset` with printable building-sheet snapshots (27 November 2026):

- 471 Node tests passed, with no failures or skips.
- Standalone printable HTML/SVG structure checks passed for A4/A3 portrait/landscape.
- All 5 CMake/CTest checks passed; the native core linked statically.
- Production build and configured bundle budgets passed. The lazy print-preview component and document generator use a 1060 kB total JavaScript allowance; the 195 kB entry and 880 kB initial-load limits are unchanged. Per-chunk and lazy workspace limits are unchanged.
- Release archive creation and extracted-package checks passed: fresh installation, restart, replacement with external data, and offline backup recovery.
- The preceding CI revision passed the production browser suite on Ubuntu 22.04. Tiled output adds a Chromium physical-size and PDF-generation check; verification for this revision is pending. Local browser verification remains unavailable. The system Chromium launcher points to a missing executable, and the Playwright browser download returned HTTP 403 in this environment. No browser workflow pass is claimed for this revision. The suite includes furniture designer, workshop benches and CNC playback checks.

Next verification step: run `npm run test:browser:production` with an installed, working Chromium (install using `npm run test:browser:install`, or set `TERRATEC_CHROMIUM`). Keep development on `feature/toolset`. Then verify preview loading, browser print/Save PDF, HTML downloads and print scale in a browser. This increment adds multi-sheet tiling at the selected scale with 10 mm overlaps, row/column page labels and a 64-page limit. The next increment is startup configuration diagnostics. Browser printing remains unverified; there is no custom PDF renderer. Boundary-line deduplication and linked-opening counts are planning summaries; wall-face areas retain both room-facing surfaces. Shared meshes and material take-offs remain unimplemented. UI browser verification remains pending.

Release follow-up: startup checks and configuration validation. Storage diagnostics now probe writes and validate project files, and unreadable project records return actionable HTTP 422 feedback without being overwritten. Synthetic schema 1–12 fixtures now verify normalization without rewriting source files, explicit-save upgrade preserving IDs and rejected future-version overwrites. Historical release binaries and job/customer cross-version migrations remain unverified.

Startup diagnostics increment (27 November 2026): 471 Node tests and all extracted-package recovery checks passed locally. Corrected a duplicate variable declaration in the new tiled-output browser test; `node --check scripts/browser-smoke.mjs` now passes. Remote browser verification of this revision is pending. Startup validates port/path configuration, runs a bounded native-core sample, checks the production entry and probes storage. Corrupt records warn without preventing recovery. Next: machine-specific manufacturing constraints after CI verification.

Machine-limit increment: 475 Node tests pass, production build and bundle checks pass. Machine settings load in a separate lazy component. Designer budget is 85 kB (actual 83.5 kB); total allowance is 1065 kB (actual 1060.1 kB). Entry and initial limits remain 195/880 kB (actual 193.8/879.9 kB). Browser coverage enables limits, verifies blocked NC export and disables them again. CI verification is pending. The preceding startup/tiled-output revision passed both complete CI runs. Next increment: workshop capacity planning.
