# Software Development Life Cycle (SDLC) & Agile Sprint Plan
## Longitude & Latitude Based Clock (GeoSolar Clock PWA)

**Version:** 1.0.0  
**Methodology:** Iterative Agile (Scrum / Sprint-Based Delivery)  
**Repository:** `Mr-Kumar-Abhishek/long-lat-clock` (`master` branch)  
**Specification Reference:** [SRS.md](./SRS.md) · **License:** [LICENSE](./LICENSE)

---

## 1. SDLC Overview & Methodology

The **GeoSolar Clock PWA** follows an **Iterative Agile SDLC** tailored for a zero-dependency, offline-first scientific web application. Each sprint produces a self-contained, verified, deployable increment committed and pushed to `origin/master`:

1. **Small, Verifiable Increments:** Mathematical precision in `js/solar.js` is built and tested before visual instrumentation in `index.html` / `js/app.js`.
2. **Zero Runtime Dependencies:** All astronomical geometry, SVG visualizations, and PWA caching run natively on browser standards.
3. **Continuous Integration Readiness:** Every sprint must pass Node syntax checks (`node --check`) and automated tests (`node --test`) prior to commit and push.

---

## 2. SDLC Phases

### Phase 1: Requirement Engineering & Astronomical Modeling
- **Deliverable:** [SRS.md](./SRS.md)
- **Activities:** Define functional/non-functional requirements (`FR-1`..`FR-5`, `NFR-1`..`NFR-4`), Spencer/NOAA Equation of Time harmonics, solar declination, hour angle, altitude/azimuth equations, and acceptance test cases (`AC-1`..`AC-5`).

### Phase 2: Architecture & UI/UX System Design
- **Deliverables:** App shell (`index.html`, `css/styles.css`), PWA manifest (`manifest.webmanifest`), offline Service Worker (`sw.js`), vector/raster icon assets (`icons/`).
- **Design Choices:**
  - Pure ES Modules (`js/solar.js`, `js/app.js`) without bundlers.
  - Tabular monospace typography (`tabular-nums`) for jitter-free ticking displays.
  - Relative asset paths (`./`) so the PWA works from root or any subdirectory host (including GitHub Pages).

### Phase 3: Iterative Agile Sprint Implementation
- Execution of **Sprint 0** through **Sprint 4** (detailed below), delivering tested features incrementally with atomic sprint commits pushed to GitHub.

### Phase 4: Verification, Validation & Automated QA
- **Deliverables:** `tests/solar.test.js`, `package.json`.
- **Checks:**
  - Astronomical unit tests verifying equinox/solstice behavior, meridian offsets, twilight ordering, subsolar coordinates, Haversine distance, and DMS parsing.
  - Static DOM & PWA contract tests confirming all `sw.js` `PRECACHE_ASSETS` exist and all DOM IDs referenced by `js/app.js` exist in `index.html`.

### Phase 5: Release, Deployment & Offline PWA Maintenance
- Versioned Service Worker cache (`geosolar-clock-v1` -> `geosolar-clock-v2`) with automated stale-cache eviction during `activate`.
- Release ready for static hosting (GitHub Pages, Netlify, Cloudflare Pages, or local HTTP server).

---

## 3. Agile Sprint Roadmap & Backlog

| Sprint | Goal | Key Deliverables | Status | Commit |
| :--- | :--- | :--- | :--- | :--- |
| **Sprint 0** | Foundation, License, SRS & Core PWA Boilerplate | `LICENSE`, `SRS.md`, `index.html`, `css/styles.css`, `js/solar.js`, `js/app.js`, `manifest.webmanifest`, `sw.js`, `icons/*` | Completed | `fa0fe0b`, `5206dc0` |
| **Sprint 1** | Extended Astronomical & Twilight Precision Engine | Multi-threshold `computeHorizonCrossings` (Civil/Nautical/Astronomical twilight & Golden Hour), `classifySkyPhase`, Subsolar Zenith Point & Haversine distance, `dayProgressPercent`, `parseCoordinateInput` | Planned | — |
| **Sprint 2** | Multi-Band Twilight Dial, Time-Travel Simulator & Twilight Schedule | Concentric twilight wedges on 24h SVG dial, Live vs. Simulation date/time scrubber & solstice/equinox presets, Twilight & Subsolar telemetry panel | Planned | — |
| **Sprint 3** | Interactive Solar Terminator World Map, Saved Locations & URL Sharing | Click-to-set equirectangular SVG world map with live day/night terminator curve, subsolar & observer pins, `localStorage` location bookmarks, `?lat=&lon=&mode=` URL sharing | Planned | — |
| **Sprint 4** | Automated QA Suite, PWA Cache v2 & Release Polish | `package.json`, `tests/solar.test.js` (`node --test`), `sw.js` cache bump (`geosolar-clock-v2`), updated `SDLC.md` & `README.md` | Planned | — |

---

## 4. Definition of Done (DoD) & Commit Convention

A sprint is considered **Done** only when:
1. All backlog items for the sprint are implemented cleanly with no duplicated logic or dead code.
2. JavaScript modules pass `node --check` and sprint verification assertions pass without warnings or errors.
3. PWA offline cache lists (`sw.js`) stay synchronized with project assets.
4. Changes are committed using Conventional Commits (`docs(...)`, `feat(sprint-N): ...`, `test(sprint-N): ...`) and pushed to `origin/master`.

---

## 5. Requirement Traceability Matrix (RTM)

| SRS Requirement | Description | Sprint(s) | Implementation Artifact(s) | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **FR-1** | Coordinate acquisition (GPS, manual decimal/DMS, presets, bookmarks, URL params) | Sprint 0, 1, 3 | `js/app.js`, `js/solar.js`, `index.html` | `parseCoordinateInput` unit tests, DOM contract check |
| **FR-2** | Dual solar time modes (`LMT` / `AST`), Civil Time & UTC readouts | Sprint 0, 2 | `js/solar.js`, `js/app.js`, `index.html` | `calculateSolarState` AC-1..AC-3 tests |
| **FR-3** | Latitude-driven 24h Solar Horizon Dial with twilight bands | Sprint 0, 2 | `index.html`, `js/app.js`, `css/styles.css` | SVG path verification & DOM ID integrity check |
| **FR-4** | Solar telemetry, twilight schedule, subsolar point & terminator map | Sprint 0, 1, 2, 3 | `js/solar.js`, `js/app.js`, `index.html` | Twilight ordering & Haversine distance tests |
| **FR-5** | PWA manifest, Service Worker offline caching & install prompt | Sprint 0, 4 | `manifest.webmanifest`, `sw.js`, `icons/*` | JSON validation & `PRECACHE_ASSETS` disk verification |
| **NFR-1..4** | 60fps loop, zero tracking, offline reliability, responsive accessible UI | Sprint 0–4 | `css/styles.css`, `js/app.js`, `sw.js` | Manual/automated inspection & zero external requests |
