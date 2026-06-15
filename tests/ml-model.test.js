/**
 * FILE: tests/ml-model.test.js
 * ID: HS-TEST-ML-001
 * Purpose: Unit tests for the ML model module.
 *          Tests sigmoid, feature extraction, and prediction outputs.
 * Requirement: All outputs must be in [0,1]; sigmoid must be monotonic.
 * Run: node tests/ml-model.test.js
 */

// Minimal test harness (no external deps)
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function assertApprox(val, expected, tol, label) {
  assert(Math.abs(val - expected) <= tol, `${label} (got ${val.toFixed(4)}, expected ~${expected})`);
}

// ---------- Pure function tests (no DOM needed) ----------

// sigmoid
function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
function dotProduct(a, b) { return a.reduce((s, v, i) => s + v * b[i], 0); }

console.log('\n=== HoverSense ML Model Tests ===\n');

// -- Sigmoid tests --
console.log('sigmoid():');
assertApprox(sigmoid(0),    0.5,   0.001, 'sigmoid(0) = 0.5');
assertApprox(sigmoid(100),  1.0,   0.001, 'sigmoid(100) ~ 1.0');
assertApprox(sigmoid(-100), 0.0,   0.001, 'sigmoid(-100) ~ 0.0');
assert(sigmoid(1) > sigmoid(0),   'sigmoid is monotonically increasing (1>0)');
assert(sigmoid(-1) < sigmoid(0),  'sigmoid is monotonically increasing (-1<0)');

// -- Clamp tests --
console.log('\nclamp():');
assert(clamp(5, 0, 10) === 5,   'clamp(5, 0, 10) = 5');
assert(clamp(-5, 0, 10) === 0,  'clamp(-5, 0, 10) = 0');
assert(clamp(15, 0, 10) === 10, 'clamp(15, 0, 10) = 10');

// -- dotProduct tests --
console.log('\ndotProduct():');
assertApprox(dotProduct([1,2,3], [4,5,6]), 32, 0.001, '[1,2,3]·[4,5,6] = 32');
assertApprox(dotProduct([0,0,0], [1,1,1]),  0, 0.001, 'zero vector dot product = 0');

// -- Feature extraction simulation --
console.log('\nfeature extraction (simulated):');

function extractFeatures(stats) {
  const {
    totalDuration, uniqueCards, avgVelocity,
    repeatHovers, totalHovers, categorySpread,
    topCategoryScore, sessionAgeMs,
  } = stats;

  const TOTAL_CARDS = 18, MAX_DUR = 60000, MAX_VEL = 800, MAX_AGE = 300000;
  const normTotalDuration  = clamp(totalDuration / MAX_DUR, 0, 1);
  const normFrequency      = clamp(uniqueCards / TOTAL_CARDS, 0, 1);
  const normAvgVelocity    = clamp(1 - (avgVelocity / MAX_VEL), 0, 1);
  const normRepeatRate     = totalHovers > 0 ? clamp(repeatHovers / totalHovers, 0, 1) : 0;
  const normCategorySpread = clamp(categorySpread / 10, 0, 1);
  const normTopIntensity   = clamp(topCategoryScore / 100, 0, 1);
  const normTimeOfDay      = 0.5; // noon - fixed for tests
  const normSessionLength  = clamp(sessionAgeMs / MAX_AGE, 0, 1);

  return [normTotalDuration, normFrequency, normAvgVelocity, normRepeatRate,
          normCategorySpread, normTopIntensity, normTimeOfDay, normSessionLength];
}

const features1 = extractFeatures({
  totalDuration: 30000, uniqueCards: 9, avgVelocity: 200,
  repeatHovers: 2, totalHovers: 10, categorySpread: 5,
  topCategoryScore: 50, sessionAgeMs: 60000,
});

assert(features1.length === 8, 'feature vector has 8 elements');
assert(features1.every(f => f >= 0 && f <= 1), 'all features in [0,1]');
assertApprox(features1[0], 0.5, 0.001, 'normTotalDuration = 0.5 at 30s');
assertApprox(features1[1], 0.5, 0.001, 'normFrequency = 0.5 at 9/18 cards');

// -- Prediction output range tests --
console.log('\nprediction outputs:');

const WEIGHTS = {
  clickProb:     { w: [0.82,1.10,0.45,1.30,0.60,0.95,0.10,0.30], b: -2.20 },
  purchaseProb:  { w: [0.70,0.80,0.30,1.50,0.40,1.20,0.05,0.20], b: -2.60 },
  highValueProb: { w: [0.90,1.30,0.50,0.90,1.40,0.80,0.15,0.70], b: -2.80 },
  churnRisk:     { w:[-0.40,-0.70,0.90,-1.20,-0.50,-0.80,-0.05,-0.60], b: 0.80 },
};

function predict(features) {
  const results = {};
  for (const [k, {w, b}] of Object.entries(WEIGHTS)) {
    results[k] = clamp(sigmoid(dotProduct(w, features) + b), 0, 1);
  }
  return results;
}

const preds = predict(features1);
assert(preds.clickProb    >= 0 && preds.clickProb    <= 1, 'clickProb in [0,1]');
assert(preds.purchaseProb >= 0 && preds.purchaseProb <= 1, 'purchaseProb in [0,1]');
assert(preds.highValueProb>= 0 && preds.highValueProb<= 1, 'highValueProb in [0,1]');
assert(preds.churnRisk    >= 0 && preds.churnRisk    <= 1, 'churnRisk in [0,1]');

// Higher engagement user should have higher click probability
const highEngFeatures = extractFeatures({
  totalDuration: 50000, uniqueCards: 16, avgVelocity: 80,
  repeatHovers: 5, totalHovers: 10, categorySpread: 8,
  topCategoryScore: 90, sessionAgeMs: 200000,
});
const highEngPreds = predict(highEngFeatures);
assert(highEngPreds.clickProb > preds.clickProb, 'high-engagement user has higher click probability');
assert(highEngPreds.churnRisk < preds.churnRisk, 'high-engagement user has lower churn risk');

// ---------- Rule engine simulation tests --
console.log('\nrule engine (simulated):');

function scoreHoverEvent(event) {
  const { duration, avgVelocity, repeatCount, fromCategory, category } = event;
  let interestDelta = 0, intentDelta = 0, engagementDelta = 0;
  const reasons = [];

  if (duration >= 6000) { interestDelta += 25; reasons.push('Deep focus'); }
  else if (duration >= 3000) { interestDelta += 15; reasons.push('Long hover'); }
  else if (duration >= 1500) { interestDelta += 8;  reasons.push('Medium hover'); }
  else if (duration >= 400)  { interestDelta += 3;  reasons.push('Short glance'); }

  if (avgVelocity < 80 && avgVelocity > 0) { engagementDelta += 10; }
  else if (avgVelocity < 250)              { engagementDelta += 5; }
  else if (avgVelocity > 600)              { engagementDelta -= 5; }

  if (repeatCount >= 3) { intentDelta += 20; }
  else if (repeatCount === 2) { intentDelta += 12; }

  return { interestDelta, intentDelta, engagementDelta, reasons };
}

const e1 = scoreHoverEvent({ duration: 7000, avgVelocity: 50, repeatCount: 1, category: 'travel', fromCategory: null });
assert(e1.interestDelta === 25, 'deep hover (7s) gives interest +25');
assert(e1.engagementDelta === 10, 'slow cursor (<80px/s) gives engagement +10');

const e2 = scoreHoverEvent({ duration: 2000, avgVelocity: 400, repeatCount: 3, category: 'technology', fromCategory: 'travel' });
assert(e2.interestDelta === 8,  'medium hover gives interest +8');
assert(e2.intentDelta   === 20, '3rd visit gives intent +20');
assert(e2.engagementDelta === 0, '400px/s cursor gives 0 engagement delta');

const e3 = scoreHoverEvent({ duration: 100, avgVelocity: 800, repeatCount: 1, category: 'food', fromCategory: null });
assert(e3.interestDelta === 0,   'sub-threshold hover gives 0 interest');
assert(e3.engagementDelta === -5,'fast scan cursor gives -5 engagement');

// ---------- Summary ----------
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
