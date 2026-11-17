import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateSolarState,
  classifySkyPhase,
  formatDayMs,
  haversineDistanceKm,
  parseCoordinateInput,
} from '../js/solar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

test('AC-1: Prime Meridian (0, 0) equinox identity', () => {
  const eq = new Date('2026-03-20T12:00:00.000Z');
  const state = calculateSolarState(eq, 0, 0);
  assert.equal(state.lmtDayMs, state.utcDayMs);
  assert.equal(formatDayMs(state.lmtDayMs), '12:00:00');
  assert.equal(state.polarState, 'normal');
  assert.ok(state.daylightHours > 12.0 && state.daylightHours < 12.2);
  assert.ok(state.elevationDeg > 80);
});

test('AC-2: IST Reference Meridian (82.5° E) offset matches UTC+05:30', () => {
  const eq = new Date('2026-03-20T12:00:00.000Z');
  const state = calculateSolarState(eq, 25.15, 82.5);
  assert.ok(Math.abs(state.lmtOffsetMinutes - 330) < 1e-9);
  assert.equal(formatDayMs(state.lmtDayMs), '17:30:00');
});

test('AC-3: Shifting +1° East advances LMT and AST by exactly 4 minutes', () => {
  const instant = new Date('2026-06-15T08:00:00.000Z');
  const base = calculateSolarState(instant, 20, 10);
  const shifted = calculateSolarState(instant, 20, 11);
  assert.equal(shifted.lmtDayMs - base.lmtDayMs, 240_000);
  assert.equal(shifted.astDayMs - base.astDayMs, 240_000);
});

test('AC-4: Arctic (80° N) summer midnight sun and winter polar night', () => {
  const summer = calculateSolarState(new Date('2026-06-21T12:00:00.000Z'), 80, 15);
  const winter = calculateSolarState(new Date('2026-12-21T12:00:00.000Z'), 80, 15);
  assert.equal(summer.polarState, 'midnight-sun');
  assert.equal(summer.daylightHours, 24);
  assert.equal(summer.skyPhase, 'Midnight Sun');

  assert.equal(winter.polarState, 'polar-night');
  assert.equal(winter.daylightHours, 0);
  assert.equal(winter.skyPhase, 'Polar Night');
});

test('Multi-band twilight & golden hour hierarchy is strictly ordered', () => {
  const s = calculateSolarState(new Date('2026-03-20T12:00:00.000Z'), 28.6139, 77.209);
  assert.ok(s.twilight.astronomical.riseAstMs < s.twilight.nautical.riseAstMs);
  assert.ok(s.twilight.nautical.riseAstMs < s.twilight.civil.riseAstMs);
  assert.ok(s.twilight.civil.riseAstMs < s.sunriseAstMs);
  assert.ok(s.sunriseAstMs < s.twilight.goldenHour.riseAstMs);
  assert.ok(s.twilight.goldenHour.riseAstMs < s.solarNoonAstMs);
  assert.ok(s.solarNoonAstMs < s.twilight.goldenHour.setAstMs);
  assert.ok(s.twilight.goldenHour.setAstMs < s.sunsetAstMs);
  assert.ok(s.sunsetAstMs < s.twilight.civil.setAstMs);
  assert.ok(s.twilight.civil.setAstMs < s.twilight.nautical.setAstMs);
  assert.ok(s.twilight.nautical.setAstMs < s.twilight.astronomical.setAstMs);
});

test('Subsolar zenith point and Haversine great-circle distance', () => {
  const instant = new Date('2026-06-21T12:00:00.000Z');
  const s = calculateSolarState(instant, 0, 0);
  const atZenith = calculateSolarState(instant, s.subsolarLat, s.subsolarLon);
  assert.ok(atZenith.elevationDeg > 89.9);
  assert.ok(atZenith.subsolarDistanceKm < 0.01);
  assert.ok(haversineDistanceKm(0, 0, 0, 180) > 20_000);
});

test('Sky phase classifier and DMS/decimal coordinate parser', () => {
  assert.equal(classifySkyPhase(25, 'normal'), 'Daylight');
  assert.equal(classifySkyPhase(2, 'normal'), 'Golden Hour');
  assert.equal(classifySkyPhase(-3, 'normal'), 'Civil Twilight');
  assert.equal(classifySkyPhase(-9, 'normal'), 'Nautical Twilight');
  assert.equal(classifySkyPhase(-15, 'normal'), 'Astronomical Twilight');
  assert.equal(classifySkyPhase(-25, 'normal'), 'Night');

  assert.deepEqual(parseCoordinateInput('28.6139', true), { valid: true, value: 28.6139 });
  const dmsLat = parseCoordinateInput(`28° 36' 50" N`, true);
  assert.equal(dmsLat.valid, true);
  assert.ok(Math.abs(dmsLat.value - 28.6138889) < 1e-4);

  const dmsLon = parseCoordinateInput(`74° 00' 21.6" W`, false);
  assert.equal(dmsLon.valid, true);
  assert.ok(Math.abs(dmsLon.value - -74.006) < 1e-4);

  assert.equal(parseCoordinateInput('95', true).valid, false);
  assert.equal(parseCoordinateInput('28 N', false).valid, false);
});

test('PWA manifest, Service Worker precache assets, and DOM ID integrity', () => {
  const manifestPath = path.join(ROOT_DIR, 'manifest.webmanifest');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 3);

  const swContent = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
  const assetListMatch = swContent.match(/PRECACHE_ASSETS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(assetListMatch, 'PRECACHE_ASSETS array should exist in sw.js');

  const assets = [...assetListMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  for (const rel of assets) {
    const resolved = rel === './' ? path.join(ROOT_DIR, 'index.html') : path.join(ROOT_DIR, rel);
    assert.ok(fs.existsSync(resolved), `Missing precache asset on disk: ${rel}`);
  }

  const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(ROOT_DIR, 'js', 'app.js'), 'utf8');
  const domIds = [...appJs.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(domIds.length > 0);
  for (const id of domIds) {
    assert.ok(html.includes(`id="${id}"`), `Missing DOM id in index.html: ${id}`);
  }
});
