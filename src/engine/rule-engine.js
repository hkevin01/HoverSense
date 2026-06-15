/**
 * FILE: src/engine/rule-engine.js
 * ID: HS-ENGINE-001
 * Purpose: Rule-based profiling engine that scores hover events using
 *          heuristics modeled after real ad-tech interest inference systems.
 *
 * Requirement: Produce deterministic interest, intent, and engagement deltas
 *              for every HoverEvent without external dependencies.
 * Inputs:      HoverEvent object (from hover-tracker)
 * Outputs:     ScoreDeltas { interestDelta, intentDelta, engagementDelta,
 *                           traitDeltas, reasons[] }
 * Preconditions: category must be a valid key from CATEGORY list.
 * References:   Ad-tech heuristics literature, OWASP-safe (no PII stored).
 */

// ---------- Thresholds (ms) ----------
const DURATION_SHORT   =  400;   // glance
const DURATION_MEDIUM  = 1500;   // interest signal
const DURATION_LONG    = 3000;   // strong interest
const DURATION_DEEP    = 6000;   // very high interest

// ---------- Velocity thresholds (px/s) ----------
const VEL_SCANNING    = 600;   // fast scan - low engagement
const VEL_BROWSING    = 250;   // normal browsing
const VEL_DELIBERATE  =  80;   // slow/deliberate - high engagement

// ---------- Trait influence map ----------
// Maps category -> which personality traits are nudged
const CATEGORY_TRAITS = {
  travel:        { novelty: 0.8, risk: 0.4,  social: 0.5, analytical: 0.1, impulsive: 0.3 },
  technology:    { novelty: 0.7, risk: 0.2,  social: 0.1, analytical: 0.9, impulsive: 0.2 },
  outdoors:      { novelty: 0.6, risk: 0.6,  social: 0.3, analytical: 0.2, impulsive: 0.2 },
  automotive:    { novelty: 0.5, risk: 0.5,  social: 0.2, analytical: 0.4, impulsive: 0.4 },
  health:        { novelty: 0.3, risk: 0.1,  social: 0.4, analytical: 0.7, impulsive: 0.1 },
  finance:       { novelty: 0.2, risk: 0.5,  social: 0.1, analytical: 0.9, impulsive: 0.1 },
  food:          { novelty: 0.4, risk: 0.2,  social: 0.8, analytical: 0.2, impulsive: 0.6 },
  fashion:       { novelty: 0.6, risk: 0.3,  social: 0.8, analytical: 0.1, impulsive: 0.7 },
  sports:        { novelty: 0.5, risk: 0.7,  social: 0.5, analytical: 0.3, impulsive: 0.4 },
  entertainment: { novelty: 0.6, risk: 0.2,  social: 0.7, analytical: 0.2, impulsive: 0.5 },
};

// ---------- Transition bonus map ----------
// If the user goes from category A to category B, grant a bonus (cross-interest)
const TRANSITION_BONUS = {
  'travel->outdoors':      8,
  'outdoors->travel':      8,
  'outdoors->sports':      6,
  'sports->outdoors':      6,
  'travel->automotive':    5,
  'automotive->travel':    5,
  'technology->finance':   5,
  'finance->technology':   5,
  'health->sports':        6,
  'sports->health':        6,
  'fashion->food':         4,
  'food->fashion':         4,
  'entertainment->fashion':4,
};

/**
 * ID: HS-ENGINE-score
 * Purpose: Apply all scoring rules to a single HoverEvent.
 * Inputs:  event (HoverEvent)
 * Outputs: ScoreDeltas object
 * Logic:
 *   1. Validate inputs
 *   2. Compute duration-based interest delta
 *   3. Compute velocity-based engagement delta
 *   4. Apply repeat-visit intent boost
 *   5. Apply category transition bonus
 *   6. Compute trait nudges
 *   7. Return deltas + human-readable reasons
 */
export function scoreHoverEvent(event) {
  const { category, duration, avgVelocity, repeatCount, fromCategory } = event;
  const reasons = [];
  let interestDelta  = 0;
  let intentDelta    = 0;
  let engagementDelta = 0;

  // --- Rule 1: Duration-based interest scoring ---
  if (duration >= DURATION_DEEP) {
    interestDelta += 25;
    reasons.push(`Deep focus hover (${(duration/1000).toFixed(1)}s) → strong interest +25`);
  } else if (duration >= DURATION_LONG) {
    interestDelta += 15;
    reasons.push(`Long hover (${(duration/1000).toFixed(1)}s) → clear interest +15`);
  } else if (duration >= DURATION_MEDIUM) {
    interestDelta += 8;
    reasons.push(`Medium hover (${(duration/1000).toFixed(1)}s) → mild interest +8`);
  } else if (duration >= DURATION_SHORT) {
    interestDelta += 3;
    reasons.push(`Short glance (${(duration/1000).toFixed(1)}s) → weak interest +3`);
  }

  // --- Rule 2: Cursor velocity -> engagement ---
  if (avgVelocity < VEL_DELIBERATE && avgVelocity > 0) {
    engagementDelta += 10;
    reasons.push(`Very slow cursor (${avgVelocity.toFixed(0)}px/s) → deliberate viewing +10`);
  } else if (avgVelocity < VEL_BROWSING) {
    engagementDelta += 5;
    reasons.push(`Relaxed cursor speed → engaged browsing +5`);
  } else if (avgVelocity > VEL_SCANNING) {
    engagementDelta -= 5;
    reasons.push(`Fast cursor scan (${avgVelocity.toFixed(0)}px/s) → low engagement -5`);
  }

  // --- Rule 3: Repeat visit intent boost ---
  if (repeatCount >= 3) {
    intentDelta += 20;
    reasons.push(`3rd+ visit to this card → high purchase intent +20`);
  } else if (repeatCount === 2) {
    intentDelta += 12;
    reasons.push(`Return hover (2nd visit) → elevated intent +12`);
  }

  // --- Rule 4: Category transition bonus ---
  if (fromCategory && fromCategory !== category) {
    const key   = `${fromCategory}->${category}`;
    const bonus = TRANSITION_BONUS[key] || 0;
    if (bonus > 0) {
      interestDelta += bonus;
      reasons.push(`Transition ${fromCategory} → ${category} (related topics) +${bonus}`);
    }
  }

  // --- Rule 5: Long + deliberate = very high value signal ---
  if (duration >= DURATION_LONG && avgVelocity < VEL_BROWSING) {
    interestDelta  += 5;
    intentDelta    += 8;
    reasons.push(`Deliberate long view → intent amplifier applied`);
  }

  // --- Trait deltas ---
  const traitWeights = CATEGORY_TRAITS[category] || {};
  const traitMultiplier = Math.min(duration / DURATION_LONG, 2.0);
  const traitDeltas = {};
  for (const [trait, weight] of Object.entries(traitWeights)) {
    traitDeltas[trait] = weight * traitMultiplier * 5;
  }

  return { interestDelta, intentDelta, engagementDelta, traitDeltas, reasons };
}

export { CATEGORY_TRAITS };
