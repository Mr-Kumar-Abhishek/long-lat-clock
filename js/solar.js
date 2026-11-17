/**
 * Astronomical and geographical solar time calculations for the GeoSolar Clock PWA.
 * Implements Local Mean Time (LMT), Apparent Solar Time (AST), Equation of Time (EoT),
 * Solar Declination, Solar Elevation/Azimuth, multi-band Twilight / Golden Hour crossings,
 * Subsolar Zenith Point, and flexible Decimal/DMS coordinate parsing.
 */

export const DAY_MS = 86_400_000;
const RAD_PER_DEG = Math.PI / 180;
const DEG_PER_RAD = 180 / Math.PI;
const EARTH_MEAN_RADIUS_KM = 6371.0088;

export const ALTITUDE_THRESHOLDS = {
  GOLDEN_HOUR: 6.0,
  SUNRISE: -0.833, // Accounts for solar radius + atmospheric refraction
  CIVIL: -6.0,
  NAUTICAL: -12.0,
  ASTRONOMICAL: -18.0,
};

const COMPASS_POINTS = [
  'N', 'NNE', 'NE', 'ENE',
  'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW',
  'W', 'WNW', 'NW', 'NNW',
];

/**
 * Clamp a numeric value to [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Normalize longitude into [-180, 180], preserving exact -180 and +180.
 * @param {number} lon
 * @returns {number}
 */
export function normalizeLongitude(lon) {
  if (!Number.isFinite(lon)) return 0;
  if (lon === 180 || lon === -180) return lon;
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 && lon > 0 ? 180 : wrapped;
}

/**
 * Wrap milliseconds into [0, 86_400_000).
 * @param {number} ms
 * @returns {number}
 */
export function wrapDayMs(ms) {
  return ((ms % DAY_MS) + DAY_MS) % DAY_MS;
}

/**
 * Wrap degrees into [0, 360).
 * @param {number} deg
 * @returns {number}
 */
export function wrapDeg(deg) {
  return ((deg % 360) + 360) % 360;
}

/**
 * Compute sunrise/sunset or twilight crossing times for a given solar altitude threshold.
 * @param {number} latRad Observer latitude in radians
 * @param {number} decRad Solar declination in radians
 * @param {number} targetAltitudeDeg Solar center altitude threshold in degrees
 * @param {number} solarNoonLmtMs Solar noon in LMT milliseconds of day
 * @param {number} solarNoonAstMs Solar noon in AST milliseconds of day
 * @returns {{state: 'normal'|'always-above'|'always-below', hourAngleDeg: number, durationHours: number, riseLmtMs: number|null, setLmtMs: number|null, riseAstMs: number|null, setAstMs: number|null}}
 */
export function computeHorizonCrossings(
  latRad,
  decRad,
  targetAltitudeDeg,
  solarNoonLmtMs,
  solarNoonAstMs
) {
  const targetSinAlt = Math.sin(targetAltitudeDeg * RAD_PER_DEG);
  const cosLat = Math.cos(latRad);
  const cosDec = Math.cos(decRad);

  let state = 'normal';
  let hourAngleDeg = 90;

  if (Math.abs(cosLat) < 1e-10 || Math.abs(cosDec) < 1e-10) {
    const poleSinAlt = Math.sin(latRad) * Math.sin(decRad);
    if (poleSinAlt >= targetSinAlt) {
      state = 'always-above';
      hourAngleDeg = 180;
    } else {
      state = 'always-below';
      hourAngleDeg = 0;
    }
  } else {
    const cosOmega =
      (targetSinAlt - Math.sin(latRad) * Math.sin(decRad)) / (cosLat * cosDec);

    if (cosOmega < -1) {
      state = 'always-above';
      hourAngleDeg = 180;
    } else if (cosOmega > 1) {
      state = 'always-below';
      hourAngleDeg = 0;
    } else {
      hourAngleDeg = Math.acos(cosOmega) * DEG_PER_RAD;
    }
  }

  const durationHours = (2 * hourAngleDeg) / 15;
  let riseLmtMs = null;
  let setLmtMs = null;
  let riseAstMs = null;
  let setAstMs = null;

  if (state === 'normal') {
    const halfSpanMs = (hourAngleDeg / 15) * 3_600_000;
    riseLmtMs = wrapDayMs(solarNoonLmtMs - halfSpanMs);
    setLmtMs = wrapDayMs(solarNoonLmtMs + halfSpanMs);
    riseAstMs = wrapDayMs(solarNoonAstMs - halfSpanMs);
    setAstMs = wrapDayMs(solarNoonAstMs + halfSpanMs);
  }

  return {
    state,
    hourAngleDeg,
    durationHours,
    riseLmtMs,
    setLmtMs,
    riseAstMs,
    setAstMs,
  };
}

/**
 * Classify the sky illumination phase from solar elevation and polar regime.
 * @param {number} elevationDeg
 * @param {'normal'|'midnight-sun'|'polar-night'} polarState
 * @returns {string}
 */
export function classifySkyPhase(elevationDeg, polarState = 'normal') {
  if (polarState === 'midnight-sun') return 'Midnight Sun';
  if (polarState === 'polar-night') return 'Polar Night';
  if (elevationDeg >= ALTITUDE_THRESHOLDS.GOLDEN_HOUR) return 'Daylight';
  if (elevationDeg >= ALTITUDE_THRESHOLDS.SUNRISE) return 'Golden Hour';
  if (elevationDeg >= ALTITUDE_THRESHOLDS.CIVIL) return 'Civil Twilight';
  if (elevationDeg >= ALTITUDE_THRESHOLDS.NAUTICAL) return 'Nautical Twilight';
  if (elevationDeg >= ALTITUDE_THRESHOLDS.ASTRONOMICAL) return 'Astronomical Twilight';
  return 'Night';
}

/**
 * Compute great-circle Haversine distance in kilometers between two coordinates.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number}
 */
export function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const phi1 = lat1 * RAD_PER_DEG;
  const phi2 = lat2 * RAD_PER_DEG;
  const dPhi = (lat2 - lat1) * RAD_PER_DEG;
  const dLambda = (lon2 - lon1) * RAD_PER_DEG;

  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return EARTH_MEAN_RADIUS_KM * c;
}

/**
 * Parse a decimal or DMS coordinate string (e.g., "28.6139" or `28° 36' 50" N`).
 * @param {string|number} input
 * @param {boolean} isLat True for latitude [-90, 90], false for longitude [-180, 180]
 * @returns {{valid: boolean, value: number}}
 */
export function parseCoordinateInput(input, isLat) {
  const maxAbs = isLat ? 90 : 180;
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || Math.abs(input) > maxAbs) {
      return { valid: false, value: NaN };
    }
    return { valid: true, value: input };
  }

  if (typeof input !== 'string') {
    return { valid: false, value: NaN };
  }

  const trimmed = input.trim().toUpperCase();
  if (!trimmed) {
    return { valid: false, value: NaN };
  }

  // Extract optional hemisphere letter
  const hemiMatches = trimmed.match(/[NSEW]/g);
  if (hemiMatches && hemiMatches.length > 1) {
    return { valid: false, value: NaN };
  }
  const hemi = hemiMatches ? hemiMatches[0] : null;
  if (hemi) {
    if (isLat && (hemi === 'E' || hemi === 'W')) return { valid: false, value: NaN };
    if (!isLat && (hemi === 'N' || hemi === 'S')) return { valid: false, value: NaN };
  }

  const cleaned = trimmed.replace(/[NSEW°'"′″]/g, ' ').trim();
  const parts = cleaned.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 3) {
    return { valid: false, value: NaN };
  }

  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n))) {
    return { valid: false, value: NaN };
  }

  const [degRaw, minRaw = 0, secRaw = 0] = nums;
  if (parts.length > 1 && (minRaw < 0 || minRaw >= 60 || secRaw < 0 || secRaw >= 60)) {
    return { valid: false, value: NaN };
  }
  if (parts.length > 1 && !Number.isInteger(degRaw)) {
    // Allow DM (degrees + decimal minutes) when seconds omitted, reject non-integer degrees in DMS
    if (parts.length === 3) return { valid: false, value: NaN };
  }

  const hasNegativeSign = parts[0].startsWith('-');
  if (hasNegativeSign && (hemi === 'N' || hemi === 'E')) {
    return { valid: false, value: NaN };
  }

  const absDeg = Math.abs(degRaw) + minRaw / 60 + secRaw / 3600;
  if (absDeg > maxAbs) {
    return { valid: false, value: NaN };
  }

  const sign = hemi === 'S' || hemi === 'W' || (!hemi && hasNegativeSign) ? -1 : 1;
  const value = absDeg === 0 ? 0 : sign * absDeg;
  return { valid: true, value };
}

/**
 * Compute all longitude- and latitude-based solar parameters for a given UTC instant.
 * @param {Date} date
 * @param {number} rawLat Latitude in decimal degrees [-90, 90]
 * @param {number} rawLon Longitude in decimal degrees [-180, 180]
 * @returns {object}
 */
export function calculateSolarState(date, rawLat, rawLon) {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const lat = clamp(Number(rawLat), -90, 90);
  const lon = normalizeLongitude(Number(rawLon));

  const utcDayMs =
    safeDate.getUTCHours() * 3_600_000 +
    safeDate.getUTCMinutes() * 60_000 +
    safeDate.getUTCSeconds() * 1_000 +
    safeDate.getUTCMilliseconds();
  const utcHours = utcDayMs / 3_600_000;

  // 1 degree of longitude = 4 minutes of solar time (240,000 ms)
  const lmtOffsetMinutes = lon * 4;
  const lmtOffsetMs = lmtOffsetMinutes * 60_000;
  const lmtDayMs = wrapDayMs(utcDayMs + lmtOffsetMs);

  // Spencer / NOAA fractional year gamma (radians)
  const year = safeDate.getUTCFullYear();
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInYear = isLeap ? 366 : 365;
  const startOfYearMs = Date.UTC(year, 0, 1);
  const currentDayStartMs = Date.UTC(year, safeDate.getUTCMonth(), safeDate.getUTCDate());
  const dayOfYear = Math.floor((currentDayStartMs - startOfYearMs) / DAY_MS) + 1;

  const gamma = ((2 * Math.PI) / daysInYear) * (dayOfYear - 1 + (utcHours - 12) / 24);

  // Equation of Time (minutes) and Solar Declination (radians)
  const eotMinutes =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  const declinationRad =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const declinationDeg = declinationRad * DEG_PER_RAD;

  // Apparent Solar Time (sundial time)
  const astDayMs = wrapDayMs(lmtDayMs + eotMinutes * 60_000);
  const astHours = astDayMs / 3_600_000;

  // Solar Hour Angle omega: -180..+180 deg (0 at solar noon, -90 at 06:00 AST, +90 at 18:00 AST)
  const hourAngleDeg = (astHours - 12) * 15;
  const hourAngleRad = hourAngleDeg * RAD_PER_DEG;
  const latRad = lat * RAD_PER_DEG;

  // Solar Altitude / Elevation (alpha)
  const sinAlpha = clamp(
    Math.sin(latRad) * Math.sin(declinationRad) +
      Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad),
    -1,
    1
  );
  const elevationDeg = Math.asin(sinAlpha) * DEG_PER_RAD;

  // Solar Azimuth (degrees clockwise from True North)
  const eastComponent = -Math.cos(declinationRad) * Math.sin(hourAngleRad);
  const northComponent =
    Math.cos(latRad) * Math.sin(declinationRad) -
    Math.sin(latRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad);
  const azimuthDeg = wrapDeg(Math.atan2(eastComponent, northComponent) * DEG_PER_RAD);

  // Solar Noon & Multi-threshold Horizon Crossings
  const solarNoonAstMs = 12 * 3_600_000;
  const solarNoonLmtMs = wrapDayMs(solarNoonAstMs - eotMinutes * 60_000);

  const sunriseCrossing = computeHorizonCrossings(
    latRad,
    declinationRad,
    ALTITUDE_THRESHOLDS.SUNRISE,
    solarNoonLmtMs,
    solarNoonAstMs
  );
  const civilTwilight = computeHorizonCrossings(
    latRad,
    declinationRad,
    ALTITUDE_THRESHOLDS.CIVIL,
    solarNoonLmtMs,
    solarNoonAstMs
  );
  const nauticalTwilight = computeHorizonCrossings(
    latRad,
    declinationRad,
    ALTITUDE_THRESHOLDS.NAUTICAL,
    solarNoonLmtMs,
    solarNoonAstMs
  );
  const astronomicalTwilight = computeHorizonCrossings(
    latRad,
    declinationRad,
    ALTITUDE_THRESHOLDS.ASTRONOMICAL,
    solarNoonLmtMs,
    solarNoonAstMs
  );
  const goldenHour = computeHorizonCrossings(
    latRad,
    declinationRad,
    ALTITUDE_THRESHOLDS.GOLDEN_HOUR,
    solarNoonLmtMs,
    solarNoonAstMs
  );

  let polarState = 'normal';
  if (sunriseCrossing.state === 'always-above') polarState = 'midnight-sun';
  if (sunriseCrossing.state === 'always-below') polarState = 'polar-night';

  const skyPhase = classifySkyPhase(elevationDeg, polarState);

  // Subsolar Zenith Point (where Sun is directly overhead at 90° elevation)
  const subsolarLat = declinationDeg;
  const subsolarLon = normalizeLongitude(-15 * (utcHours - 12 + eotMinutes / 60));
  const subsolarDistanceKm = haversineDistanceKm(lat, lon, subsolarLat, subsolarLon);

  // Elapsed Daylight Progress [0, 100]
  let dayProgressPercent;
  if (
    polarState === 'normal' &&
    astDayMs >= sunriseCrossing.riseAstMs &&
    astDayMs <= sunriseCrossing.setAstMs
  ) {
    dayProgressPercent = clamp(
      ((astDayMs - sunriseCrossing.riseAstMs) /
        (sunriseCrossing.setAstMs - sunriseCrossing.riseAstMs)) *
        100,
      0,
      100
    );
  } else {
    dayProgressPercent = clamp((astDayMs / DAY_MS) * 100, 0, 100);
  }

  // Device civil timezone offset in minutes east of UTC (note JS getTimezoneOffset is inverted)
  const civilTzOffsetMinutes = -safeDate.getTimezoneOffset();
  const civilOffsetMinutes = lmtOffsetMinutes - civilTzOffsetMinutes;
  const civilDayMs =
    safeDate.getHours() * 3_600_000 +
    safeDate.getMinutes() * 60_000 +
    safeDate.getSeconds() * 1_000 +
    safeDate.getMilliseconds();

  return {
    lat,
    lon,
    utcDayMs,
    civilDayMs,
    lmtDayMs,
    astDayMs,
    lmtOffsetMinutes,
    civilTzOffsetMinutes,
    civilOffsetMinutes,
    eotMinutes,
    declinationDeg,
    hourAngleDeg,
    elevationDeg,
    azimuthDeg,
    isDaylight: elevationDeg >= ALTITUDE_THRESHOLDS.SUNRISE,
    polarState,
    skyPhase,
    sunriseHourAngleDeg: sunriseCrossing.hourAngleDeg,
    daylightHours: sunriseCrossing.durationHours,
    dayProgressPercent,
    solarNoonLmtMs,
    sunriseLmtMs: sunriseCrossing.riseLmtMs,
    sunsetLmtMs: sunriseCrossing.setLmtMs,
    solarNoonAstMs,
    sunriseAstMs: sunriseCrossing.riseAstMs,
    sunsetAstMs: sunriseCrossing.setAstMs,
    twilight: {
      civil: civilTwilight,
      nautical: nauticalTwilight,
      astronomical: astronomicalTwilight,
      goldenHour,
    },
    subsolarLat,
    subsolarLon,
    subsolarDistanceKm,
  };
}

/**
 * Format milliseconds within a day into HH:MM:SS or HH:MM:SS.d.
 * @param {number|null} dayMs
 * @param {boolean} includeTenths
 * @returns {string}
 */
export function formatDayMs(dayMs, includeTenths = false) {
  if (dayMs === null || !Number.isFinite(dayMs)) return '--:--:--';
  const wrapped = wrapDayMs(dayMs);
  const totalTenths = Math.floor(wrapped / 100);
  const tenths = totalTenths % 10;
  const totalSeconds = Math.floor(totalTenths / 10);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60) % 24;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return includeTenths ? `${hh}:${mm}:${ss}.${tenths}` : `${hh}:${mm}:${ss}`;
}

/**
 * Format a signed duration in minutes (e.g. "+14m 22s" or "-1h 05m 12s").
 * @param {number} totalMinutes
 * @returns {string}
 */
export function formatOffsetMinutes(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return '+0m 00s';
  const totalSeconds = Math.round(totalMinutes * 60);
  const sign = totalSeconds >= 0 ? '+' : '-';
  const absSeconds = Math.abs(totalSeconds);
  const hours = Math.floor(absSeconds / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);
  const seconds = absSeconds % 60;

  if (hours > 0) {
    return `${sign}${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${sign}${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/**
 * Format decimal degrees to Degrees Minutes Seconds (e.g. 28° 36' 50.0" N).
 * @param {number} deg
 * @param {boolean} isLat
 * @returns {string}
 */
export function formatDMS(deg, isLat) {
  if (!Number.isFinite(deg)) return '--';
  const hemi = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  const abs = Math.abs(deg);
  let d = Math.floor(abs);
  const remMin = (abs - d) * 60;
  let m = Math.floor(remMin);
  let s = (remMin - m) * 60;

  if (s >= 59.95) {
    s = 0;
    m += 1;
  }
  if (m >= 60) {
    m = 0;
    d += 1;
  }

  return `${d}° ${String(m).padStart(2, '0')}' ${s.toFixed(1).padStart(4, '0')}" ${hemi}`;
}

/**
 * Format daylight duration in decimal hours to "HHh MMm".
 * @param {number} hours
 * @returns {string}
 */
export function formatDurationHours(hours) {
  if (!Number.isFinite(hours)) return '--';
  const totalMinutes = Math.round(clamp(hours, 0, 24) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Convert azimuth degrees [0, 360) into a 16-point compass label.
 * @param {number} azimuthDeg
 * @returns {string}
 */
export function getCompassDirection(azimuthDeg) {
  const index = Math.round(wrapDeg(azimuthDeg) / 22.5) % 16;
  return COMPASS_POINTS[index];
}
