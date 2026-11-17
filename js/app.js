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

const appState = loadSettings();
let deferredInstallPrompt = null;

const el = {
  swStatus: document.getElementById('sw-status'),
  swStatusText: document.getElementById('sw-status-text'),
  installBtn: document.getElementById('install-btn'),

  dialTicks: document.getElementById('dial-ticks'),
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
};

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch {
    // Ignore storage quota or private mode failures
  }
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
  const sunriseDeg = dialDegFromDayMs(sunriseMs);
  const sunsetDeg = dialDegFromDayMs(sunsetMs);
  const spanDeg = (solar.daylightHours / 24) * 360;
  const largeArc = spanDeg > 180 ? 1 : 0;

  const pRise = polarToCartesian(sunriseDeg, DIAL_RADIUS);
  const pSet = polarToCartesian(sunsetDeg, DIAL_RADIUS);

  el.dialDaylightArc.setAttribute(
    'd',
    `M ${DIAL_CENTER} ${DIAL_CENTER} L ${pRise.x.toFixed(2)} ${pRise.y.toFixed(2)} A ${DIAL_RADIUS} ${DIAL_RADIUS} 0 ${largeArc} 1 ${pSet.x.toFixed(2)} ${pSet.y.toFixed(2)} Z`
  );

  el.dialSunriseLine.setAttribute('opacity', '1');
  el.dialSunriseLine.setAttribute('x2', pRise.x.toFixed(2));
  el.dialSunriseLine.setAttribute('y2', pRise.y.toFixed(2));

  el.dialSunsetLine.setAttribute('opacity', '1');
  el.dialSunsetLine.setAttribute('x2', pSet.x.toFixed(2));
  el.dialSunsetLine.setAttribute('y2', pSet.y.toFixed(2));
}

function renderTick() {
  const now = new Date();
  const solar = calculateSolarState(now, appState.lat, appState.lon);
  const isLmt = appState.timeMode === 'LMT';

  // Primary & secondary digital clocks
  el.primaryTime.textContent = formatDayMs(isLmt ? solar.lmtDayMs : solar.astDayMs, true);
  el.readoutLmt.textContent = formatDayMs(solar.lmtDayMs);
  el.readoutAst.textContent = formatDayMs(solar.astDayMs);
  el.readoutCivil.textContent = formatDayMs(solar.civilDayMs);
  el.readoutUtc.textContent = formatDayMs(solar.utcDayMs);

  // Day/Night badge
  let phaseLabel = solar.isDaylight ? 'Daylight' : 'Night';
  if (solar.polarState === 'midnight-sun') phaseLabel = 'Midnight Sun';
  if (solar.polarState === 'polar-night') phaseLabel = 'Polar Night';
  el.phaseBadge.textContent = phaseLabel;
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
  const parsedLat = Number.parseFloat(el.latInput.value);
  const parsedLon = Number.parseFloat(el.lonInput.value);

  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLon)) {
    if (commit) syncCoordinateInputs(true);
    return;
  }

  if (parsedLat < -90 || parsedLat > 90 || parsedLon < -180 || parsedLon > 180) {
    setGeoStatus('Latitude must be between -90° and +90°; Longitude between -180° and +180°.', 'error');
    if (!commit) return;
  } else {
    setGeoStatus('');
  }

  appState.lat = clamp(parsedLat, -90, 90);
  appState.lon = normalizeLongitude(parsedLon);
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
  syncCoordinateInputs(true);
  bindEvents();
  initPwa();
  requestAnimationFrame(renderTick);
}

init();
