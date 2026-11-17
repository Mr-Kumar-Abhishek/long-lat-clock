# Software Requirements Specification (SRS)
## Longitude & Latitude Based Clock (GeoSolar Clock PWA)

**Version:** 1.0.0  
**Date:** 2026-11-18  
**License:** MIT (see [LICENSE](./LICENSE))

---

## 1. Introduction

### 1.1 Purpose
This document specifies the functional, mathematical, architectural, and non-functional requirements for the **Longitude & Latitude Based Clock** Progressive Web Application (PWA). The application restores geography-driven timekeeping by computing solar time directly from an observer's longitude and modeling the diurnal daylight geometry from their latitude.

### 1.2 Scope
The product is a zero-backend, offline-capable, installable Progressive Web App running entirely in a web browser. Given a geographic coordinate pair $(\phi, \lambda)$—acquired via device GPS or manual input—and the system UTC clock, the software calculates:
- **Local Mean Solar Time (LMT)** and **Apparent Solar Time (AST)** from **longitude** ($\lambda$).
- **Solar Declination ($\delta$), Solar Elevation ($\alpha$), Solar Azimuth ($A$), Sunrise/Sunset times, Solar Noon, and Daylight Duration** from **latitude** ($\phi$).
- A live **24-hour Solar Horizon Dial** showing the observer's current position along the day/night arc.

### 1.3 Definitions, Acronyms, and Abbreviations
| Term | Meaning |
| :--- | :--- |
| **AST** | Apparent Solar Time (sundial time, incorporating the Equation of Time) |
| **Civil Time** | Standard political/device wall-clock time governed by statutory time zones and DST |
| **DST** | Daylight Saving Time |
| **EoT** | Equation of Time ($\text{AST} - \text{LMT}$, in minutes) |
| **LMT** | Local Mean Solar Time (continuous time derived purely from longitude vs. UTC) |
| **PWA** | Progressive Web Application |
| **UTC** | Coordinated Universal Time |
| **$\phi$ (Phi)** | Geographic Latitude in decimal degrees ($\phi \in [-90^\circ, +90^\circ]$, North positive) |
| **$\lambda$ (Lambda)** | Geographic Longitude in decimal degrees ($\lambda \in [-180^\circ, +180^\circ]$, East positive) |
| **$\delta$ (Delta)** | Solar Declination angle |
| **$\omega$ (Omega)** | Solar Hour Angle ($0^\circ$ at solar noon, $15^\circ/\text{hour}$) |

---

## 2. Overall Description

### 2.1 Product Perspective
Modern civil clocks partition the globe into ~15° political strips (with jagged borders and statutory offsets such as +05:30 or DST shifts), divorcing clock readings from the actual position of the Sun in the sky. Because Earth rotates $360^\circ$ relative to the mean Sun in 24 hours ($15^\circ\text{/hour}$):
- Every $1^\circ$ of longitude corresponds to **$4$ minutes** of Local Mean Time.
- Every $1'$ (arcminute) of longitude corresponds to **$4$ seconds** of Local Mean Time.

While **longitude** shifts *when* solar noon occurs, **latitude** determines *how long* the Sun remains above the horizon and *how high* it climbs across seasons. This application pairs both coordinates into one unified timepiece.

### 2.2 User Classes and Characteristics
- **General / Curious Users:** Exploring the difference between statutory civil time and true solar time at their location.
- **Astronomers, Photographers & Outdoor Planners:** Checking solar elevation, azimuth, solar noon, sunrise/sunset, and golden-hour geometry offline.
- **Educators & Students:** Visualizing the Equation of Time, hour angles, and polar day/night phenomena across latitudes.

### 2.3 Operating Environment
- Modern evergreen desktop and mobile browsers supporting ES Modules, SVG, Geolocation API, `localStorage`, Web App Manifest, and Service Workers.
- Installable as a standalone PWA on Android, iOS, Windows, macOS, and Linux.

### 2.4 Design and Implementation Constraints
- **Zero External Runtime Dependencies:** Pure vanilla HTML5, CSS3, and ES2022 JavaScript (`js/solar.js`, `js/app.js`).
- **Offline-First:** Must function 100% offline after the initial visit using a versioned Service Worker cache.
- **Privacy by Architecture:** Coordinates are stored solely in browser `localStorage` and never transmitted over the network.

---

## 3. Mathematical & Astronomical Specification

### 3.1 Longitude Time (Local Mean Time)
Let $\text{UTC}_{\text{ms}}$ be milliseconds elapsed since `00:00:00.000 UTC` on the current UTC date. For longitude $\lambda \in [-180^\circ, 180^\circ]$:

$$\Delta t_{\text{LMT}} = \lambda \times 4\text{ minutes} = \lambda \times 240{,}000\text{ ms}$$

$$\text{LMT} = (\text{UTC}_{\text{ms}} + \Delta t_{\text{LMT}}) \bmod 86{,}400{,}000\text{ ms}$$

The **Meridian Offset vs. Civil Time** compares $\Delta t_{\text{LMT}}$ against the device's active civil timezone offset (`-date.getTimezoneOffset()` minutes).

### 3.2 Equation of Time & Apparent Solar Time
Using Spencer's / NOAA's fractional year $\gamma$ (in radians) for day-of-year $N \in [1, 366]$ and UTC hour $h$:

$$\gamma = \frac{2\pi}{D_{\text{year}}} \left(N - 1 + \frac{h - 12}{24}\right)$$

where $D_{\text{year}}$ is $366$ in leap years and $365$ otherwise.

The **Equation of Time** ($\text{EoT}$, in minutes) and **Solar Declination** ($\delta$, in radians) are:

$$\text{EoT} = 229.18 \bigl(0.000075 + 0.001868\cos\gamma - 0.032077\sin\gamma - 0.014615\cos 2\gamma - 0.040849\sin 2\gamma\bigr)$$

$$\delta = 0.006918 - 0.399912\cos\gamma + 0.070257\sin\gamma - 0.006758\cos 2\gamma + 0.000907\sin 2\gamma - 0.002697\cos 3\gamma + 0.00148\sin 3\gamma$$

**Apparent Solar Time (AST)** adds the Equation of Time to LMT:

$$\text{AST} = (\text{LMT} + \text{EoT} \times 60{,}000\text{ ms}) \bmod 86{,}400{,}000\text{ ms}$$

### 3.3 Latitude & Diurnal Solar Arc
Using the standard solar zenith angle at sunrise/sunset of $90.833^\circ$ (accounting for $0.5^\circ$ solar disc radius and $0.333^\circ$ atmospheric refraction, i.e., solar center elevation $\alpha_0 = -0.833^\circ$):

$$\cos\omega_0 = \frac{\sin(-0.833^\circ) - \sin\phi\sin\delta}{\cos\phi\cos\delta}$$

Three regimes arise from $\phi$ and $\delta$:
1. **Normal Diurnal Cycle ($|\cos\omega_0| \le 1$):**
   - Sunrise Hour Angle: $\omega_0 = \arccos(\cos\omega_0)$ (in degrees)
   - Daylight Duration: $T_{\text{day}} = \frac{2\omega_0}{15^\circ}\text{ hours}$
   - Solar Noon (LMT): $12{:}00{:}00 - \text{EoT}$
   - Sunrise (LMT): $\text{Noon}_{\text{LMT}} - \frac{\omega_0}{15^\circ}\text{ hours}$
   - Sunset (LMT): $\text{Noon}_{\text{LMT}} + \frac{\omega_0}{15^\circ}\text{ hours}$
2. **Midnight Sun / Polar Day ($\cos\omega_0 < -1$, or pole with $\sin\phi\sin\delta \ge \sin(-0.833^\circ)$):**
   - $T_{\text{day}} = 24\text{ hours}$; no sunrise or sunset occurs on this date.
3. **Polar Night ($\cos\omega_0 > 1$, or pole with $\sin\phi\sin\delta < \sin(-0.833^\circ)$):**
   - $T_{\text{day}} = 0\text{ hours}$; the Sun remains below the horizon all day.

### 3.4 Real-Time Solar Position
From Apparent Solar Time in decimal hours $t_{\text{AST}} \in [0, 24)$, the instantaneous Solar Hour Angle is:

$$\omega = (t_{\text{AST}} - 12) \times 15^\circ$$

- **Solar Altitude / Elevation ($\alpha$):**

$$\sin\alpha = \sin\phi\sin\delta + \cos\phi\cos\delta\cos\omega$$

- **Solar Azimuth ($A$, degrees clockwise from True North):**

$$A = \operatorname{atan2}\bigl(-\cos\delta\sin\omega,\; \cos\phi\sin\delta - \sin\phi\cos\delta\cos\omega\bigr) \bmod 360^\circ$$

---

## 4. Functional Requirements

### FR-1: Coordinate Acquisition & Persistence
- **FR-1.1:** Provide a one-click **"Use My GPS Location"** button invoking `navigator.geolocation.getCurrentPosition`.
- **FR-1.2:** Provide manual decimal inputs for Latitude ($\phi \in [-90, 90]$) and Longitude ($\lambda \in [-180, 180]$) with live validation and DMS formatting display.
- **FR-1.3:** Provide curated quick-select presets (e.g., Prime Meridian Greenwich, New Delhi, Tokyo, Reykjavik, Tromsø Arctic Circle, New York, Sydney, Ushuaia).
- **FR-1.4:** Persist active coordinates and preferred time mode (`LMT` or `AST`) in `localStorage`.

### FR-2: Dual Solar Time Modes & Reference Clocks
- **FR-2.1:** Allow toggling the primary digital clock and dial hand between **Local Mean Time (LMT)** (pure longitude time) and **Apparent Solar Time (AST)** (sundial time with Equation of Time).
- **FR-2.2:** Display secondary comparative readouts simultaneously: Local Mean Time, Apparent Solar Time, Device Civil Time, and UTC.
- **FR-2.3:** Display tenths-of-a-second or smooth live seconds ticking with tabular numerals (`font-variant-numeric: tabular-nums`).

### FR-3: Latitude-Driven 24-Hour Solar Horizon Dial
- **FR-3.1:** Render an interactive SVG 24-hour astronomical dial with **12:00 (Solar Noon)** at the top ($0^\circ$), **18:00** on the right, **00:00 (Midnight)** at the bottom, and **06:00** on the left.
- **FR-3.2:** Dynamically draw the **Daylight Arc** and **Night Sector** around the 24-hour ring based on the observer's latitude and current solar declination, visually expanding in summer and shrinking in winter (or filling/clearing entirely during Midnight Sun / Polar Night).
- **FR-3.3:** Rotate the Sun indicator hand smoothly to match the active solar time (`LMT` or `AST`) and adjust dial horizon styling when the Sun is above vs. below the horizon.

### FR-4: Solar Telemetry Dashboard
Display real-time computed telemetry cards:
- Solar Elevation ($\alpha$) and Day/Night phase badge
- Solar Azimuth ($A$) with 16-point compass cardinal label
- Equation of Time ($\text{EoT}$)
- Meridian Drift vs. Civil Timezone
- Sunrise, Solar Noon, Sunset (in the active solar mode), and Total Daylight Duration

### FR-5: Progressive Web App (PWA) Capabilities
- **FR-5.1:** Include a valid `manifest.webmanifest` with `standalone` display mode, theme colors, SVG icon, and `192x192` / `512x512` PNG icons.
- **FR-5.2:** Register an offline-first Service Worker (`sw.js`) that precaches all core app-shell assets and serves cached assets cleanly offline.
- **FR-5.3:** Handle `beforeinstallprompt` to present an in-app **Install App** button when installable.

---

## 5. Non-Functional Requirements

- **NFR-1 Performance:** UI tick updates via `requestAnimationFrame` must execute well within a 16 ms frame budget without layout thrashing.
- **NFR-2 Privacy:** Zero external API calls, analytics, or coordinate transmission.
- **NFR-3 Offline Reliability:** Reloading the installed PWA with network disabled must launch and tick normally.
- **NFR-4 Accessibility & Responsiveness:** Semantic landmarks, keyboard-accessible controls, ARIA live status feedback for GPS requests, WCAG AA contrast in dark celestial theme, and responsive layout from 320px mobile screens to widescreen desktops.

---

## 6. Verification & Acceptance Criteria

| ID | Scenario | Input / Condition | Expected Output |
| :--- | :--- | :--- | :--- |
| **AC-1** | Prime Meridian Identity | $\phi = 0^\circ,\; \lambda = 0^\circ$ | `LMT === UTC` exactly at all times; equinox daylight $\approx 12\text{h }06\text{m}$ (refraction). |
| **AC-2** | IST Reference Meridian | $\phi = 25.15^\circ\text{N},\; \lambda = 82.5^\circ\text{E}$ | LMT offset is $+5\text{h }30\text{m}$ ahead of UTC; Meridian Drift vs. IST (`UTC+05:30`) is `0m 00s`. |
| **AC-3** | Longitude Sensitivity | Shift $\lambda$ by $+1^\circ$ East | LMT and AST both advance by exactly $+4\text{m }00\text{s}$. |
| **AC-4** | Arctic Solstice Edge Case | $\phi = 80^\circ\text{N}$, June 21 vs. Dec 21 | June 21 reports `Midnight Sun` ($24\text{h }00\text{m}$ daylight); Dec 21 reports `Polar Night` ($0\text{h }00\text{m}$ daylight). |
| **AC-5** | Offline PWA Operation | Load app once, disable network, reload | App loads from Service Worker cache and continues computing live solar telemetry. |
