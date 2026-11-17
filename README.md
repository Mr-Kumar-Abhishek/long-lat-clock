# GeoSolar Clock — Longitude & Latitude Based Clock (PWA)

An offline-capable, zero-dependency Progressive Web App that computes true geographical solar time from your **longitude** and diurnal solar geometry from your **latitude**.

See [SRS.md](./SRS.md) for the complete Software Requirements Specification and astronomical equations.

## Features

- **Longitude Timekeeping:** Computes **Local Mean Time (LMT)** ($\text{UTC} + 4\lambda\text{ min}$) and **Apparent Solar Time (AST)** (sundial time adjusted by the Equation of Time).
- **Latitude Solar Geometry:** Computes Solar Declination, Solar Elevation, Solar Azimuth, Sunrise, Solar Noon, Sunset, and Daylight Duration (including Midnight Sun and Polar Night edge cases).
- **24-Hour Solar Horizon Dial:** Live SVG clock face with a latitude-driven daylight sector and solar position hand.
- **Privacy-First & Offline PWA:** 100% client-side computation using `manifest.webmanifest` and `sw.js`; coordinates never leave your browser.

## Project Structure

- [SRS.md](./SRS.md) — Software Requirements Specification
- [index.html](./index.html) — PWA shell and semantic dashboard
- [manifest.webmanifest](./manifest.webmanifest) — Web App Manifest
- [sw.js](./sw.js) — Offline-first Service Worker
- [css/styles.css](./css/styles.css) — Responsive celestial dark UI
- [js/solar.js](./js/solar.js) — Pure ES module for astronomical & solar calculations
- [js/app.js](./js/app.js) — UI controller, SVG dial updater, Geolocation, and PWA lifecycle
- [icons/](./icons/) — SVG and PNG (`192x192`, `512x512`) app icons
- [LICENSE](./LICENSE) — MIT License

## Local Preview

Because Service Workers and ES Modules require an HTTP(S) origin (`localhost` or HTTPS), serve the directory with any static server:

```sh
npx serve .
```

Then open the displayed `http://localhost:...` URL in your browser.
