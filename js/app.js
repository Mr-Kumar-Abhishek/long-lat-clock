import {
  DAY_MS,
  calculateSolarState,
  clamp,
  formatDMS,
  formatDayMs,
  formatDurationHours,
  formatOffsetMinutes,
  getCompassDirection,
  normalizeLongitude,
  parseCoordinateInput,
  wrapDayMs,
} from './solar.js';

const STORAGE_KEY = 'geosolar-clock-settings-v1';
const DIAL_CENTER = 180;
const DIAL_RADIUS = 136;
const SVG_NS = 'http://www.w3.org/2000/svg';

const DEFAULT_STATE = {
  lat: 28.6139,
  lon: 77.209,
  timeMode: 'LMT',
};

const appState = {
  ...loadSettings(),
  simEnabled: false,
  simDateStr: toUtcDateString(new Date()),
  simMinutes: getUtcMinutesOfDay(new Date()),
};

let deferredInstallPrompt = null;

const el = {
  swStatus: document.getElementById('sw-status'),
  swStatusText: document.getElementById('sw-status-text'),
  installBtn: document.getElementById('install-btn'),

  dialTicks: document.getElementById('dial-ticks'),
  dialAstroArc: document.getElementById('dial-astro-arc'),
  dialNauticalArc: document.getElementById('dial-nautical-arc'),
  dialCivilArc: document.getElementById('dial-civil-arc'),
  dialDaylightArc: document.getElementById('dial-daylight-arc'),
  dialFullDay: document.getElementById('dial-full-day'),
  dialSunriseLine: document.getElementById('dial-sunrise-line'),
  dialSunsetLine: document.getElementById('dial-sunset-line'),
  dialSunHand: document.getElementById('dial-sun-hand'),
  dialSunOrb: document.getElementById('dial-sun-orb'),
  dialCenterElevation: document.getElementById('dial-center-elevation'),

  modeLmtBtn: document.getElementById('mode-lmt'),
  modeAstBtn: document.getElementById('mode-ast'),
  phaseBadge: document.getElementById('phase-badge'),
  primaryModeLabel: document.getElementById('primary-mode-label'),
  primaryTime: document.getElementById('primary-time'),
  coordsDmsDisplay: document.getElementById('coords-dms-display'),

  readoutLmt: document.getElementById('readout-lmt'),
  readoutAst: document.getElementById('readout-ast'),
  readoutCivil: document.getElementById('readout-civil'),
  readoutUtc: document.getElementById('readout-utc'),

  simActiveBadge: document.getElementById('sim-active-badge'),
  simLiveBtn: document.getElementById('sim-live-btn'),
  simSimBtn: document.getElementById('sim-sim-btn'),
  simResetBtn: document.getElementById('sim-reset-btn'),
  simDateInput: document.getElementById('sim-date-input'),
  simTimeSlider: document.getElementById('sim-time-slider'),
  simTimeReadout: document.getElementById('sim-time-readout'),
  seasonBtns: document.querySelectorAll('[data-season]'),

  gpsBtn: document.getElementById('gps-btn'),
  presetSelect: document.getElementById('preset-select'),
  latInput: document.getElementById('lat-input'),
  lonInput: document.getElementById('lon-input'),
  latDmsHint: document.getElementById('lat-dms-hint'),
  lonDmsHint: document.getElementById('lon-dms-hint'),
  geoStatus: document.getElementById('geo-status'),

  metricElevation: document.getElementById('metric-elevation'),
  metricDeclination: document.getElementById('metric-declination'),
  metricAzimuth: document.getElementById('metric-azimuth'),
  metricCompass: document.getElementById('metric-compass'),
  metricEot: document.getElementById('metric-eot'),
  metricCivilDrift: document.getElementById('metric-civil-drift'),
  metricUtcOffset: document.getElementById('metric-utc-offset'),
  metricSunrise: document.getElementById('metric-sunrise'),
  metricNoon: document.getElementById('metric-noon'),
  metricSunset: document.getElementById('metric-sunset'),
  metricDaylight: document.getElementById('metric-daylight'),
  metricPolarNote: document.getElementById('metric-polar-note'),
  metricModeLabels: document.querySelectorAll('.metric-time-mode'),

  daylightProgress: document.getElementById('daylight-progress'),
  daylightProgressBar: document.getElementById('daylight-progress-bar'),
  twilightCivil: document.getElementById('twilight-civil'),
  twilightNautical: document.getElementById('twilight-nautical'),
  twilightAstro: document.getElementById('twilight-astro'),
  twilightGolden: document.getElementById('twilight-golden'),
  subsolarCoords: document.getElementById('subsolar-coords'),
  subsolarDistance: document.getElementById('subsolar-distance'),
};

function toUtcDateString(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getUtcMinutesOfDay(date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function formatUtcMinutes(totalMinutes) {
  const m = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm} UTC`;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return {
      lat: Number.isFinite(Number(parsed.lat)) ? clamp(Number(parsed.lat), -90, 90) : DEFAULT_STATE.lat,
      lon: Number.isFinite(Number(parsed.lon)) ? normalizeLongitude(Number(parsed.lon)) : DEFAULT_STATE.lon,
      timeMode: parsed.timeMode === 'AST' ? 'AST' : 'LMT',
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        lat: appState.lat,
        lon: appState.lon,
        timeMode: appState.timeMode,
      })
    );
  } catch {
    // Ignore storage quota or private mode failures
  }
}

function getActiveInstant() {
  if (!appState.simEnabled) return new Date();
  const parts = appState.simDateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return new Date();
  }
  const [year, month, day] = parts;
  const hours = Math.floor(appState.simMinutes / 60);
  const minutes = appState.simMinutes % 60;
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
}

function dialDegFromDayMs(dayMs) {
  return ((wrapDayMs(dayMs) / DAY_MS) * 360 + 180) % 360;
}

function polarToCartesian(degClockwiseFromTop, radius) {
  const rad = ((degClockwiseFromTop - 90) * Math.PI) / 180;
  return {
    x: DIAL_CENTER + radius * Math.cos(rad),
    y: DIAL_CENTER + radius * Math.sin(rad),
  };
}

function buildSectorPath(riseMs, setMs, durationHours, state) {
  if (state === 'always-below' || durationHours <= 0.01) return '';
  if (state === 'always-above' || durationHours >= 23.99) {
    const r = DIAL_RADIUS;
    return `M ${DIAL_CENTER - r} ${DIAL_CENTER} A ${r} ${r} 0 1 0 ${DIAL_CENTER + r} ${DIAL_CENTER} A ${r} ${r} 0 1 0 ${DIAL_CENTER - r} ${DIAL_CENTER} Z`;
  }

  const riseDeg = dialDegFromDayMs(riseMs);
  const setDeg = dialDegFromDayMs(setMs);
  const spanDeg = (durationHours / 24) * 360;
  const largeArc = spanDeg > 180 ? 1 : 0;

  const pRise = polarToCartesian(riseDeg, DIAL_RADIUS);
  const pSet = polarToCartesian(setDeg, DIAL_RADIUS);
  return `M ${DIAL_CENTER} ${DIAL_CENTER} L ${pRise.x.toFixed(2)} ${pRise.y.toFixed(2)} A ${DIAL_RADIUS} ${DIAL_RADIUS} 0 ${largeArc} 1 ${pSet.x.toFixed(2)} ${pSet.y.toFixed(2)} Z`;
}

function buildDialTicks() {
  if (!el.dialTicks) return;
  const frag = document.createDocumentFragment();

  for (let hour = 0; hour < 24; hour += 1) {
    const deg = (hour * 15 + 180) % 360;
    const isCardinal = hour % 6 === 0;
    const isQuarter = hour % 3 === 0;
    const innerR = isCardinal ? DIAL_RADIUS - 12 : isQuarter ? DIAL_RADIUS - 9 : DIAL_RADIUS - 5;
    const p1 = polarToCartesian(deg, innerR);
    const p2 = polarToCartesian(deg, DIAL_RADIUS);

    const tick = document.createElementNS(SVG_NS, 'line');
    tick.setAttribute('x1', p1.x.toFixed(2));
    tick.setAttribute('y1', p1.y.toFixed(2));
    tick.setAttribute('x2', p2.x.toFixed(2));
    tick.setAttribute('y2', p2.y.toFixed(2));
    tick.setAttribute(
      'stroke',
      isCardinal ? 'rgba(248, 250, 252, 0.7)' : isQuarter ? 'rgba(203, 213, 225, 0.55)' : 'rgba(148, 163, 184, 0.3)'
    );
    tick.setAttribute('stroke-width', isCardinal ? '2' : isQuarter ? '1.5' : '1');
    frag.appendChild(tick);

    if (isQuarter && !isCardinal) {
      const labelPt = polarToCartesian(deg, DIAL_RADIUS - 22);
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', labelPt.x.toFixed(2));
      label.setAttribute('y', (labelPt.y + 3.5).toFixed(2));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', '#64748b');
      label.setAttribute('font-size', '10');
      label.setAttribute('font-family', 'ui-monospace, monospace');
      label.textContent = String(hour).padStart(2, '0');
      frag.appendChild(label);
    }
  }

  el.dialTicks.appendChild(frag);
}

function setGeoStatus(message, tone = '') {
  el.geoStatus.textContent = message;
  el.geoStatus.className = 'geo-status' + (tone ? ` is-${tone}` : '');
}

function syncModeUI() {
  const isLmt = appState.timeMode === 'LMT';
  el.modeLmtBtn.classList.toggle('is-active', isLmt);
  el.modeLmtBtn.setAttribute('aria-pressed', String(isLmt));
  el.modeAstBtn.classList.toggle('is-active', !isLmt);
  el.modeAstBtn.setAttribute('aria-pressed', String(!isLmt));

  el.primaryModeLabel.textContent = isLmt
    ? 'Local Mean Solar Time (Longitude)'
    : 'Apparent Solar Time (Sundial / EoT)';

  const modeSubLabel = isLmt ? 'Local Mean Time' : 'Apparent Solar Time';
  el.metricModeLabels.forEach((node) => {
    node.textContent = modeSubLabel;
  });
}

function syncSimulatorUI() {
  const sim = appState.simEnabled;
  el.simLiveBtn.classList.toggle('is-active', !sim);
  el.simLiveBtn.setAttribute('aria-pressed', String(!sim));
  el.simSimBtn.classList.toggle('is-active', sim);
  el.simSimBtn.setAttribute('aria-pressed', String(sim));

  el.simActiveBadge.textContent = sim ? 'Simulated Instant' : 'Live Clock';
  el.simActiveBadge.classList.toggle('is-simulating', sim);

  el.simDateInput.value = appState.simDateStr;
  el.simTimeSlider.value = String(appState.simMinutes);
  el.simTimeReadout.textContent = formatUtcMinutes(appState.simMinutes);
}

function syncCoordinateInputs(syncSelect = true) {
  el.latInput.value = Number(appState.lat.toFixed(4));
  el.lonInput.value = Number(appState.lon.toFixed(4));
  el.latDmsHint.textContent = formatDMS(appState.lat, true);
  el.lonDmsHint.textContent = formatDMS(appState.lon, false);
  el.coordsDmsDisplay.textContent = `${formatDMS(appState.lat, true)} · ${formatDMS(appState.lon, false)}`;

  if (syncSelect) {
    let matched = 'custom';
    for (const option of el.presetSelect.options) {
      if (option.value === 'custom') continue;
      const [pLat, pLon] = option.value.split(',').map(Number);
      if (Math.abs(pLat - appState.lat) < 0.001 && Math.abs(pLon - appState.lon) < 0.001) {
        matched = option.value;
        break;
      }
    }
    el.presetSelect.value = matched;
  }
}

function updateDial(solar) {
  const isLmt = appState.timeMode === 'LMT';
  const activeDayMs = isLmt ? solar.lmtDayMs : solar.astDayMs;
  const handDeg = dialDegFromDayMs(activeDayMs);

  el.dialSunHand.setAttribute('transform', `rotate(${handDeg.toFixed(2)} ${DIAL_CENTER} ${DIAL_CENTER})`);
  el.dialSunOrb.setAttribute('fill', solar.isDaylight ? '#fde68a' : '#1e293b');
  el.dialSunOrb.setAttribute('stroke', solar.isDaylight ? '#f59e0b' : '#38bdf8');

  const elevSign = solar.elevationDeg >= 0 ? '+' : '';
  el.dialCenterElevation.textContent = `${elevSign}${solar.elevationDeg.toFixed(1)}°`;

  // Multi-band twilight sectors
  const { astronomical, nautical, civil } = solar.twilight;
  el.dialAstroArc.setAttribute(
    'd',
    buildSectorPath(
      isLmt ? astronomical.riseLmtMs : astronomical.riseAstMs,
      isLmt ? astronomical.setLmtMs : astronomical.setAstMs,
      astronomical.durationHours,
      astronomical.state
    )
  );
  el.dialNauticalArc.setAttribute(
    'd',
    buildSectorPath(
      isLmt ? nautical.riseLmtMs : nautical.riseAstMs,
      isLmt ? nautical.setLmtMs : nautical.setAstMs,
      nautical.durationHours,
      nautical.state
    )
  );
  el.dialCivilArc.setAttribute(
    'd',
    buildSectorPath(
      isLmt ? civil.riseLmtMs : civil.riseAstMs,
      isLmt ? civil.setLmtMs : civil.setAstMs,
      civil.durationHours,
      civil.state
    )
  );

  if (solar.polarState === 'midnight-sun') {
    el.dialDaylightArc.setAttribute('d', '');
    el.dialFullDay.hidden = false;
    el.dialSunriseLine.setAttribute('opacity', '0');
    el.dialSunsetLine.setAttribute('opacity', '0');
    return;
  }

  if (solar.polarState === 'polar-night') {
    el.dialDaylightArc.setAttribute('d', '');
    el.dialFullDay.hidden = true;
    el.dialSunriseLine.setAttribute('opacity', '0');
    el.dialSunsetLine.setAttribute('opacity', '0');
    return;
  }

  el.dialFullDay.hidden = true;
  const sunriseMs = isLmt ? solar.sunriseLmtMs : solar.sunriseAstMs;
  const sunsetMs = isLmt ? solar.sunsetLmtMs : solar.sunsetAstMs;

  el.dialDaylightArc.setAttribute(
    'd',
    buildSectorPath(sunriseMs, sunsetMs, solar.daylightHours, 'normal')
  );

  const pRise = polarToCartesian(dialDegFromDayMs(sunriseMs), DIAL_RADIUS);
  const pSet = polarToCartesian(dialDegFromDayMs(sunsetMs), DIAL_RADIUS);

  el.dialSunriseLine.setAttribute('opacity', '1');
  el.dialSunriseLine.setAttribute('x2', pRise.x.toFixed(2));
  el.dialSunriseLine.setAttribute('y2', pRise.y.toFixed(2));

  el.dialSunsetLine.setAttribute('opacity', '1');
  el.dialSunsetLine.setAttribute('x2', pSet.x.toFixed(2));
  el.dialSunsetLine.setAttribute('y2', pSet.y.toFixed(2));
}

function formatCrossingPair(crossing, isLmt) {
  if (crossing.state === 'always-above') return 'Continuous';
  if (crossing.state === 'always-below') return 'None';
  const riseMs = isLmt ? crossing.riseLmtMs : crossing.riseAstMs;
  const setMs = isLmt ? crossing.setLmtMs : crossing.setAstMs;
  return `${formatDayMs(riseMs)} / ${formatDayMs(setMs)}`;
}

function renderTick() {
  const now = getActiveInstant();
  const solar = calculateSolarState(now, appState.lat, appState.lon);
  const isLmt = appState.timeMode === 'LMT';

  if (!appState.simEnabled) {
    const liveMinutes = getUtcMinutesOfDay(now);
    const liveDateStr = toUtcDateString(now);
    if (el.simDateInput.value !== liveDateStr) {
      appState.simDateStr = liveDateStr;
      el.simDateInput.value = liveDateStr;
    }
    if (Number(el.simTimeSlider.value) !== liveMinutes) {
      appState.simMinutes = liveMinutes;
      el.simTimeSlider.value = String(liveMinutes);
      el.simTimeReadout.textContent = formatUtcMinutes(liveMinutes);
    }
  }

  // Primary & secondary digital clocks
  el.primaryTime.textContent = formatDayMs(isLmt ? solar.lmtDayMs : solar.astDayMs, !appState.simEnabled);
  el.readoutLmt.textContent = formatDayMs(solar.lmtDayMs);
  el.readoutAst.textContent = formatDayMs(solar.astDayMs);
  el.readoutCivil.textContent = formatDayMs(solar.civilDayMs);
  el.readoutUtc.textContent = formatDayMs(solar.utcDayMs);

  // Sky illumination badge
  el.phaseBadge.textContent = solar.skyPhase;
  el.phaseBadge.classList.toggle('is-night', !solar.isDaylight);

  // Telemetry cards
  const elevSign = solar.elevationDeg >= 0 ? '+' : '';
  const decSign = solar.declinationDeg >= 0 ? '+' : '';
  el.metricElevation.textContent = `${elevSign}${solar.elevationDeg.toFixed(2)}°`;
  el.metricDeclination.textContent = `Declination: ${decSign}${solar.declinationDeg.toFixed(2)}°`;

  el.metricAzimuth.textContent = `${solar.azimuthDeg.toFixed(1)}°`;
  el.metricCompass.textContent = `Bearing: ${getCompassDirection(solar.azimuthDeg)}`;

  el.metricEot.textContent = formatOffsetMinutes(solar.eotMinutes);
  el.metricCivilDrift.textContent = formatOffsetMinutes(solar.civilOffsetMinutes);
  el.metricUtcOffset.textContent = `LMT vs UTC: ${formatOffsetMinutes(solar.lmtOffsetMinutes)}`;

  if (solar.polarState === 'normal') {
    el.metricSunrise.textContent = formatDayMs(isLmt ? solar.sunriseLmtMs : solar.sunriseAstMs);
    el.metricNoon.textContent = formatDayMs(isLmt ? solar.solarNoonLmtMs : solar.solarNoonAstMs);
    el.metricSunset.textContent = formatDayMs(isLmt ? solar.sunsetLmtMs : solar.sunsetAstMs);
    el.metricPolarNote.textContent = 'Normal diurnal cycle';
  } else if (solar.polarState === 'midnight-sun') {
    el.metricSunrise.textContent = 'No Sunrise';
    el.metricNoon.textContent = formatDayMs(isLmt ? solar.solarNoonLmtMs : solar.solarNoonAstMs);
    el.metricSunset.textContent = 'No Sunset';
    el.metricPolarNote.textContent = 'Circumpolar Midnight Sun (24h light)';
  } else {
    el.metricSunrise.textContent = 'No Sunrise';
    el.metricNoon.textContent = formatDayMs(isLmt ? solar.solarNoonLmtMs : solar.solarNoonAstMs);
    el.metricSunset.textContent = 'No Sunset';
    el.metricPolarNote.textContent = 'Polar Night (0h sunlight)';
  }

  el.metricDaylight.textContent = formatDurationHours(solar.daylightHours);

  // Twilight & Subsolar Zenith Schedule
  el.twilightCivil.textContent = formatCrossingPair(solar.twilight.civil, isLmt);
  el.twilightNautical.textContent = formatCrossingPair(solar.twilight.nautical, isLmt);
  el.twilightAstro.textContent = formatCrossingPair(solar.twilight.astronomical, isLmt);

  const gh = solar.twilight.goldenHour;
  if (solar.polarState === 'polar-night') {
    el.twilightGolden.textContent = 'None';
  } else if (gh.state === 'always-below') {
    el.twilightGolden.textContent = 'All Daylight (< +6°)';
  } else if (gh.state === 'always-above') {
    el.twilightGolden.textContent = 'None (> +6°)';
  } else {
    el.twilightGolden.textContent = formatCrossingPair(gh, isLmt);
  }

  el.subsolarCoords.textContent = `${formatDMS(solar.subsolarLat, true)} · ${formatDMS(solar.subsolarLon, false)}`;
  el.subsolarDistance.textContent = `${Math.round(solar.subsolarDistanceKm).toLocaleString('en-US')} km`;

  const pctText = `${solar.dayProgressPercent.toFixed(1)}%`;
  el.daylightProgress.textContent = pctText;
  el.daylightProgressBar.style.width = pctText;

  updateDial(solar);
  requestAnimationFrame(renderTick);
}

function applyCoordinates(lat, lon, sourceMessage = '') {
  appState.lat = clamp(lat, -90, 90);
  appState.lon = normalizeLongitude(lon);
  saveSettings();
  syncCoordinateInputs(true);
  if (sourceMessage) {
    setGeoStatus(sourceMessage, 'success');
  }
}

function handleManualInput(commit) {
  const latParsed = parseCoordinateInput(el.latInput.value, true);
  const lonParsed = parseCoordinateInput(el.lonInput.value, false);

  if (!latParsed.valid || !lonParsed.valid) {
    if (commit) {
      setGeoStatus('Enter valid Latitude (-90..+90 or DMS) and Longitude (-180..+180 or DMS).', 'error');
      syncCoordinateInputs(true);
    }
    return;
  }

  setGeoStatus('');
  appState.lat = clamp(latParsed.value, -90, 90);
  appState.lon = normalizeLongitude(lonParsed.value);
  saveSettings();

  if (commit) {
    syncCoordinateInputs(true);
  } else {
    el.latDmsHint.textContent = formatDMS(appState.lat, true);
    el.lonDmsHint.textContent = formatDMS(appState.lon, false);
    el.coordsDmsDisplay.textContent = `${formatDMS(appState.lat, true)} · ${formatDMS(appState.lon, false)}`;
    el.presetSelect.value = 'custom';
  }
}

function handleGpsRequest() {
  if (!('geolocation' in navigator)) {
    setGeoStatus('Geolocation API is not supported by this browser.', 'error');
    return;
  }

  el.gpsBtn.disabled = true;
  el.gpsBtn.textContent = 'Acquiring GPS…';
  setGeoStatus('Requesting device location (processed locally, never uploaded)…');

  navigator.geolocation.getCurrentPosition(
    (position) => {
      el.gpsBtn.disabled = false;
      el.gpsBtn.textContent = 'Use My GPS Location';
      const { latitude, longitude, accuracy } = position.coords;
      applyCoordinates(
        latitude,
        longitude,
        `GPS locked (±${Math.round(accuracy)} m). Coordinates stored locally.`
      );
    },
    (error) => {
      el.gpsBtn.disabled = false;
      el.gpsBtn.textContent = 'Use My GPS Location';
      setGeoStatus(`Unable to acquire GPS location: ${error.message}`, 'error');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function updateNetworkBadge() {
  const online = navigator.onLine;
  el.swStatus.classList.toggle('is-offline', !online);
  el.swStatusText.textContent = online ? 'Online · Offline Ready' : 'Offline Mode Active';
}

function initPwa() {
  updateNetworkBadge();
  window.addEventListener('online', updateNetworkBadge);
  window.addEventListener('offline', updateNetworkBadge);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    el.installBtn.hidden = false;
  });

  el.installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    el.installBtn.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    el.installBtn.hidden = true;
  });
}

function setSeasonPreset(seasonKey) {
  const year = new Date().getUTCFullYear();
  const dates = {
    'mar-eq': `${year}-03-20`,
    'jun-sol': `${year}-06-21`,
    'sep-eq': `${year}-09-22`,
    'dec-sol': `${year}-12-21`,
  };
  if (!dates[seasonKey]) return;
  appState.simEnabled = true;
  appState.simDateStr = dates[seasonKey];
  syncSimulatorUI();
}

function resetToLive() {
  const now = new Date();
  appState.simEnabled = false;
  appState.simDateStr = toUtcDateString(now);
  appState.simMinutes = getUtcMinutesOfDay(now);
  syncSimulatorUI();
}

function bindEvents() {
  el.modeLmtBtn.addEventListener('click', () => {
    appState.timeMode = 'LMT';
    saveSettings();
    syncModeUI();
  });

  el.modeAstBtn.addEventListener('click', () => {
    appState.timeMode = 'AST';
    saveSettings();
    syncModeUI();
  });

  el.simLiveBtn.addEventListener('click', resetToLive);
  el.simResetBtn.addEventListener('click', resetToLive);

  el.simSimBtn.addEventListener('click', () => {
    appState.simEnabled = true;
    syncSimulatorUI();
  });

  el.simDateInput.addEventListener('change', () => {
    if (!el.simDateInput.value) return;
    appState.simEnabled = true;
    appState.simDateStr = el.simDateInput.value;
    syncSimulatorUI();
  });

  el.simTimeSlider.addEventListener('input', () => {
    appState.simEnabled = true;
    appState.simMinutes = Number(el.simTimeSlider.value);
    syncSimulatorUI();
  });

  el.seasonBtns.forEach((btn) => {
    btn.addEventListener('click', () => setSeasonPreset(btn.dataset.season));
  });

  el.presetSelect.addEventListener('change', () => {
    const val = el.presetSelect.value;
    if (val === 'custom') return;
    const [lat, lon] = val.split(',').map(Number);
    const label = el.presetSelect.options[el.presetSelect.selectedIndex].textContent;
    applyCoordinates(lat, lon, `Location set to ${label}.`);
  });

  el.latInput.addEventListener('input', () => handleManualInput(false));
  el.lonInput.addEventListener('input', () => handleManualInput(false));
  el.latInput.addEventListener('change', () => handleManualInput(true));
  el.lonInput.addEventListener('change', () => handleManualInput(true));

  el.gpsBtn.addEventListener('click', handleGpsRequest);
}

function init() {
  buildDialTicks();
  syncModeUI();
  syncSimulatorUI();
  syncCoordinateInputs(true);
  bindEvents();
  initPwa();
  requestAnimationFrame(renderTick);
}

init();
