/**
 * FILE: src/engine/ml-model.js
 * ID: HS-ML-001
 * Purpose: Lightweight logistic regression ML model that predicts behavioral
 *          probabilities from aggregated hover session features.
 *          Simulates the inference layer used by real ad-network bidding systems.
 *
 * Requirement: Produce 4 probability outputs from 8 normalized feature inputs.
 * Algorithm:   Logistic regression with pre-trained synthetic weight matrix.
 *              Weights simulate a model trained on behavioral interaction data.
 * Inputs:      Feature vector (float[8]) - normalized to [0,1]
 * Outputs:     Predictions { clickProb, purchaseProb, highValueProb, churnRisk }
 *              all in [0, 1]
 * Preconditions: Feature vector must have exactly 8 elements.
 * Postconditions: All output values guaranteed to be in [0, 1].
 * Constraints:   Pure computation - no I/O, no side effects.
 * Verification:  Unit tested in tests/ml-model.test.js
 * References:    Bishop, "Pattern Recognition and Machine Learning" Ch. 4
 */

import { sigmoid, dotProduct, clamp } from '../utils/helpers.js';

/**
 * Feature vector indices (documentation contract):
 *
 * [0] normTotalDuration   - total hover time across session, norm to [0,1] at 60s cap
 * [1] normFrequency       - unique cards hovered / total cards (18)
 * [2] normAvgVelocity     - mean cursor speed norm to [0,1] at 800 px/s cap (inverted)
 * [3] normRepeatRate      - proportion of hovers that were revisits
 * [4] normCategorySpread  - unique categories / 10 (breadth of interest)
 * [5] normTopIntensity    - top category raw score / 100 (depth of top interest)
 * [6] normTimeOfDay       - sin encoding of hour-of-day (cyclical feature)
 * [7] normSessionLength   - session age / 300s cap
 */

// ---------- Weight matrices (4 outputs x 8 inputs + bias) ----------
// These are synthetic pre-trained weights producing realistic behavioral curves.
// Positive weights increase the output; negative weights decrease it.
const WEIGHTS = {
  // Click probability: driven by duration, frequency, and repeat rate
  clickProb: {
    w: [0.82, 1.10, 0.45, 1.30, 0.60, 0.95, 0.10, 0.30],
    b: -2.20,
  },

  // Purchase probability: high duration + repeat + top intensity + low churn
  purchaseProb: {
    w: [0.70, 0.80, 0.30, 1.50, 0.40, 1.20, 0.05, 0.20],
    b: -2.60,
  },

  // High-value user: broad interests + deep engagement + long session
  highValueProb: {
    w: [0.90, 1.30, 0.50, 0.90, 1.40, 0.80, 0.15, 0.70],
    b: -2.80,
  },

  // Churn risk: high velocity (scanning), low repeat, low session length
  churnRisk: {
    w: [-0.40, -0.70, 0.90, -1.20, -0.50, -0.80, -0.05, -0.60],
    b: 0.80,
  },
};

/**
 * ID: HS-ML-extract
 * Purpose: Extract and normalize the feature vector from raw session stats.
 * Inputs:  sessionStats {
 *            totalDuration (ms),
 *            uniqueCards (int),
 *            avgVelocity (px/s),
 *            repeatHovers (int),
 *            totalHovers (int),
 *            categorySpread (int 0-10),
 *            topCategoryScore (int 0-200),
 *            sessionAgeMs (ms),
 *          }
 * Outputs: float[8] normalized feature vector
 */
export function extractFeatures(stats) {
  const {
    totalDuration,
    uniqueCards,
    avgVelocity,
    repeatHovers,
    totalHovers,
    categorySpread,
    topCategoryScore,
    sessionAgeMs,
  } = stats;

  const TOTAL_CARDS     = 18;
  const MAX_DURATION_MS = 60_000;
  const MAX_VELOCITY    = 800;
  const MAX_AGE_MS      = 300_000;

  const normTotalDuration = clamp(totalDuration / MAX_DURATION_MS, 0, 1);
  const normFrequency     = clamp(uniqueCards / TOTAL_CARDS, 0, 1);
  // Invert velocity: slow cursor = high engagement score
  const normAvgVelocity   = clamp(1 - (avgVelocity / MAX_VELOCITY), 0, 1);
  const normRepeatRate    = totalHovers > 0
    ? clamp(repeatHovers / totalHovers, 0, 1) : 0;
  const normCategorySpread  = clamp(categorySpread / 10, 0, 1);
  const normTopIntensity    = clamp(topCategoryScore / 100, 0, 1);
  // Cyclical time-of-day encoding using sine (maps 0-23h to -1..1)
  const hour              = new Date().getHours();
  const normTimeOfDay     = (Math.sin((hour / 24) * 2 * Math.PI) + 1) / 2;
  const normSessionLength = clamp(sessionAgeMs / MAX_AGE_MS, 0, 1);

  return [
    normTotalDuration,
    normFrequency,
    normAvgVelocity,
    normRepeatRate,
    normCategorySpread,
    normTopIntensity,
    normTimeOfDay,
    normSessionLength,
  ];
}

/**
 * ID: HS-ML-predict
 * Purpose: Run the logistic regression model on a feature vector.
 * Inputs:  features (float[8]) from extractFeatures()
 * Outputs: { clickProb, purchaseProb, highValueProb, churnRisk } all in [0,1]
 * Algorithm:
 *   For each output: P = sigmoid( dot(weights, features) + bias )
 */
export function predict(features) {
  const results = {};
  for (const [outputName, { w, b }] of Object.entries(WEIGHTS)) {
    const logit = dotProduct(w, features) + b;
    results[outputName] = clamp(sigmoid(logit), 0, 1);
  }
  return results;
}

/**
 * ID: HS-ML-predictFromStats
 * Purpose: Convenience wrapper - extract features then predict in one call.
 * Inputs:  sessionStats (see extractFeatures)
 * Outputs: MLPredictions object
 */
export function predictFromStats(stats) {
  const features = extractFeatures(stats);
  return predict(features);
}

/**
 * ID: HS-ML-explainFeatures
 * Purpose: Generate human-readable explanations of which features drove output.
 * Inputs:  features (float[8]), modelName (string)
 * Outputs: string[] explanations
 */
export function explainFeatures(features) {
  const labels = [
    'Total hover time',
    'Breadth of exploration',
    'Cursor deliberateness',
    'Repeat-visit rate',
    'Category diversity',
    'Top interest intensity',
    'Time-of-day signal',
    'Session depth',
  ];
  return features.map((val, i) => ({
    label: labels[i],
    value: val,
    pct:   Math.round(val * 100),
  }));
}
