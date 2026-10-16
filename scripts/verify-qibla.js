/**
 * Verification harness for lib/qibla.ts — run with:  node scripts/verify-qibla.js
 *
 * Checks the great-circle qibla bearing + haversine distance against
 * published values for known cities, and cross-checks every bearing
 * against the `adhan` package's own Qibla() implementation (adhan is
 * already an app dependency and is an independent implementation).
 *
 * NOTE on San Jose: the great-circle bearing is ~19.5° (published by
 * multiple qibla calculators: 19.5–19.54°). Figures of ~24° sometimes
 * quoted for "California" match Los Angeles (23.85°) / San Diego
 * (25.29°), not San Jose — do not "fix" the formula to hit 24°.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// Transpile the real lib/qibla.ts and load it — no copied formula here.
const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'qibla.ts'), 'utf8');
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { qiblaBearing, distanceToKaabaKm, cardinalDirection, relativeBearing, normalizeDegrees } = mod.exports;

let adhan = null;
try { adhan = require('adhan'); } catch { /* cross-check skipped if not installed */ }

let pass = 0, fail = 0;
function check(name, actual, expected, tol) {
  const ok = Math.abs(actual - expected) <= tol;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${actual.toFixed(2)}, expected ${expected} ±${tol}`);
  ok ? pass++ : fail++;
}
function checkEq(name, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  ok ? pass++ : fail++;
}

const CITIES = [
  // name, lat, lon, published bearing, published distance km
  ['San Jose, CA', 37.3387, -121.8853, 19.5, 13206],
  ['New York, NY', 40.7128, -74.0060, 58.5, 10306],
  ['London, UK', 51.5074, -0.1278, 119.0, 4794],
  ['Dubai, UAE', 25.2048, 55.2708, 258.2, 1631],
  ['Toronto, CA', 43.6532, -79.3832, 54.6, 10496],
  ['Jakarta, ID', -6.2088, 106.8456, 295.1, 7920],
  ['Karachi, PK', 24.8608, 67.0011, 267.7, 2800],
];

for (const [name, lat, lon, expBearing, expDist] of CITIES) {
  check(`${name} bearing`, qiblaBearing(lat, lon), expBearing, 1.5);
  check(`${name} distance`, distanceToKaabaKm(lat, lon), expDist, 60);
  if (adhan && typeof adhan.Qibla === 'function') {
    const theirs = adhan.Qibla(new adhan.Coordinates(lat, lon));
    check(`${name} bearing vs adhan Qibla()`, qiblaBearing(lat, lon), theirs, 0.6);
  }
}

// Edge cases
check('At the Kaaba distance', distanceToKaabaKm(21.4225, 39.8262), 0, 0.001);
checkEq('normalizeDegrees(-90)', normalizeDegrees(-90), 270);
checkEq('normalizeDegrees(450)', normalizeDegrees(450), 90);
checkEq('cardinalDirection(19.5)', cardinalDirection(19.5), 'NNE');
checkEq('cardinalDirection(119)', cardinalDirection(119), 'ESE');
checkEq('cardinalDirection(258.2)', cardinalDirection(258.2), 'WSW');
checkEq('relativeBearing facing qibla', relativeBearing(19.5, 19.5), 0);
checkEq('relativeBearing turn right', relativeBearing(90, 10), 80);
checkEq('relativeBearing turn left (wrap)', relativeBearing(10, 350), 20);
checkEq('relativeBearing behind (wrap)', relativeBearing(350, 10), -20);
for (const [, lat, lon] of CITIES) {
  const b = qiblaBearing(lat, lon);
  if (!(b >= 0 && b < 360)) { console.log(`FAIL  bearing range for ${lat},${lon}: ${b}`); fail++; }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
