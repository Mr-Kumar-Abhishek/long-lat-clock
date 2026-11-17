# GeoSolar Clock — Longitude & Latitude Based Clock (PWA)

An offline-capable, zero-dependency Progressive Web App that computes true geographical solar time from your **longitude** and diurnal solar geometry from your **latitude**.

- **Live GitHub Pages (`gh-pages` branch):** `https://mr-kumar-abhishek.github.io/long-lat-clock/`
- **Specification & Lifecycle:** [SRS.md](./SRS.md) · [SDLC.md](./SDLC.md) · [LICENSE](./LICENSE)

## Features

- **Longitude Timekeeping:** Computes **Local Mean Time (LMT)** ($\text{UTC} + 4\lambda\text{ min}$) and **Apparent Solar Time (AST)** (sundial time adjusted by the Equation of Time).
- **Multi-Band Twilight & Latitude Geometry:** Computes Solar Declination, Elevation, Azimuth, Golden Hour, Civil/Nautical/Astronomical Twilight, Sunrise/Solar Noon/Sunset, Daylight Duration (including Midnight Sun & Polar Night), and Subsolar Zenith distance.
- **24-Hour Solar Horizon Dial:** Live SVG clock face showing latitude-scaled daylight and layered twilight sectors.
- **Solar Time-Travel Simulator:** Scrub across any UTC date and time of day or jump to equinoxes and solstices.
- **Interactive Solar Terminator Map:** Click or drag anywhere on the equirectangular globe to inspect coordinates alongside the live day/night terminator curve and subsolar zenith marker.
- **Saved Bookmarks & Shareable Links:** Store favorite coordinates in `localStorage`, enter decimal or DMS formats, or share exact setups via `?lat=...&lon=...&mode=...` URLs.
- **Privacy-First & Offline PWA:** 100% client-side computation using `manifest.webmanifest` and `sw.js`; coordinates never leave your browser.

## Agile Branches

- `master` — Production mainline
- `develop` — Agile sprint integration branch
- `gh-pages` — Dedicated GitHub Pages static deployment branch
- `sprint-0/pwa-boilerplate` through `sprint-4/qa-tests-release` — Incremental Agile sprint branches

## Project Structure

- [SRS.md](./SRS.md) — Software Requirements Specification
- [SDLC.md](./SDLC.md) — Agile Software Development Life Cycle, branching model, and sprint roadmap
- [index.html](./index.html) — PWA shell and semantic dashboard
- [manifest.webmanifest](./manifest.webmanifest) — Web App Manifest
- [sw.js](./sw.js) — Offline-first Service Worker (`geosolar-clock-v2`)
- [css/styles.css](./css/styles.css) — Responsive celestial dark UI
- [js/solar.js](./js/solar.js) — Pure ES module for astronomical & solar calculations
- [js/app.js](./js/app.js) — UI controller, SVG dial & terminator map updater, Geolocation, and PWA lifecycle
- [tests/solar.test.js](./tests/solar.test.js) — Automated `node:test` verification suite
- [icons/](./icons/) — SVG and PNG (`192x192`, `512x512`) app icons
- [LICENSE](./LICENSE) — MIT License

## Automated Tests & Local Preview

Run the automated test suite with Node.js:

```sh
npm test
```

Serve locally over HTTP(S) so Service Workers and ES Modules load properly:

```sh
npx serve .
```
