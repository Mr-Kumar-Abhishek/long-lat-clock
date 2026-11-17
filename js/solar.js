/**
 * Astronomical and geographical solar time calculations for the GeoSolar Clock PWA.
 * Implements Local Mean Time (LMT), Apparent Solar Time (AST), Equation of Time (EoT),
 * Solar Declination, Solar Elevation/Azimuth, and Sunrise/Sunset geometry.
 */

export const DAY_MS = 86_400_000;
const RAD_PER_DEG = Math.PI / 180;
const DEG_PER_RAD = 180 / Math.PI;
const SUNRISE_ALTITUDE_DEG = -0.833; // Accounts for solar radius + atmospheric refraction

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

  // Sunrise / Sunset geometry driven by latitude & declination
  const sunriseSinAlt = Math.sin(SUNRISE_ALTITUDE_DEG * RAD_PER_DEG);
  const cosLat = Math.cos(latRad);
  const cosDec = Math.cos(declinationRad);

  let polarState = 'normal';
  let sunriseHourAngleDeg = 90;
  let daylightHours = 12;

  if (Math.abs(cosLat) < 1e-10 || Math.abs(cosDec) < 1e-10) {
    const poleSinAlt = Math.sin(latRad) * Math.sin(declinationRad);
    if (poleSinAlt >= sunriseSinAlt) {
      polarState = 'midnight-sun';
      sunriseHourAngleDeg = 180;
      daylightHours = 24;
    } else {
      polarState = 'polar-night';
      sunriseHourAngleDeg = 0;
      daylightHours = 0;
    }
  } else {
    const cosOmega0 =
      (sunriseSinAlt - Math.sin(latRad) * Math.sin(declinationRad)) / (cosLat * cosDec);

    if (cosOmega0 < -1) {
      polarState = 'midnight-sun';
      sunriseHourAngleDeg = 180;
      daylightHours = 24;
    } else if (cosOmega0 > 1) {
      polarState = 'polar-night';
      sunriseHourAngleDeg = 0;
      daylightHours = 0;
    } else {
      sunriseHourAngleDeg = Math.acos(cosOmega0) * DEG_PER_RAD;
      daylightHours = (2 * sunriseHourAngleDeg) / 15;
    }
  }

  const solarNoonAstMs = 12 * 3_600_000;
  const solarNoonLmtMs = wrapDayMs(solarNoonAstMs - eotMinutes * 60_000);

  let sunriseLmtMs = null;
  let sunsetLmtMs = null;
  let sunriseAstMs = null;
  let sunsetAstMs = null;

  if (polarState === 'normal') {
    const halfDayMs = (sunriseHourAngleDeg / 15) * 3_600_000;
    sunriseLmtMs = wrapDayMs(solarNoonLmtMs - halfDayMs);
    sunsetLmtMs = wrapDayMs(solarNoonLmtMs + halfDayMs);
    sunriseAstMs = wrapDayMs(solarNoonAstMs - halfDayMs);
    sunsetAstMs = wrapDayMs(solarNoonAstMs + halfDayMs);
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
    isDaylight: elevationDeg >= SUNRISE_ALTITUDE_DEG,
    polarState,
    sunriseHourAngleDeg,
    daylightHours,
    solarNoonLmtMs,
    sunriseLmtMs,
    sunsetLmtMs,
    solarNoonAstMs,
    sunriseAstMs,
    sunsetAstMs,
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
