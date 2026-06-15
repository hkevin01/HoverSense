/**
 * FILE: src/engine/profile-builder.js
 * ID: HS-PROFILE-001
 * Purpose: Central profile aggregation engine. Maintains live session state,
 *          applies rule-engine deltas, runs ML predictions, and emits the
 *          full updated profile to the dashboard via the event bus.
 *
 * Requirement: Profile must update within one animation frame of each hover event.
 * Inputs:      HoverEvent objects via bus('hover:complete')
 * Outputs:     bus.emit('profile:updated', Profile) after each event
 * Side Effects: Maintains mutable session state.
 * Failure Modes: Caps all scores at 100 to prevent overflow.
 * References:   HoverSense profiling spec, sections 3 and 4.
 */

import { bus, clamp, categoryIcon } from '../utils/helpers.js';
import { scoreHoverEvent } from './rule-engine.js';
import { predictFromStats } from './ml-model.js';

// ---------- Ad recommendation database ----------
const AD_DATABASE = {
  travel: [
    { emoji: '✈️',  text: 'Travel Insurance — 30% off',          score: 0.9 },
    { emoji: '🏨',  text: 'Boutique Hotels — Exclusive Rates',    score: 0.8 },
    { emoji: '🎒',  text: 'Premium Travel Gear Bundle',           score: 0.7 },
  ],
  technology: [
    { emoji: '💻',  text: 'Pro Laptop — New Release',             score: 0.9 },
    { emoji: '🎧',  text: 'Noise-Cancelling Headphones',          score: 0.8 },
    { emoji: '📱',  text: 'Flagship Smartphone Pre-Order',        score: 0.7 },
  ],
  outdoors: [
    { emoji: '⛺',  text: 'Ultra-Light Tent Sale',                score: 0.9 },
    { emoji: '🥾',  text: 'Trail Running Shoes — New Season',     score: 0.8 },
    { emoji: '🏕️',  text: 'Campsite Reservations — Book Now',    score: 0.7 },
  ],
  automotive: [
    { emoji: '🏍️',  text: 'Motorcycle Gear Clearance',           score: 0.9 },
    { emoji: '🚗',  text: 'Extended Car Warranty — Save 40%',     score: 0.8 },
    { emoji: '⛽',  text: 'EV Home Charger Installation',         score: 0.7 },
  ],
  health: [
    { emoji: '💊',  text: 'Supplement Bundle — Science-Backed',   score: 0.9 },
    { emoji: '⌚',  text: 'Health Tracker Watch',                  score: 0.8 },
    { emoji: '🥗',  text: 'Meal Planning App — Premium',          score: 0.7 },
  ],
  finance: [
    { emoji: '📊',  text: 'Investment Platform — Zero Fees',      score: 0.9 },
    { emoji: '🏦',  text: 'High-Yield Savings Account',           score: 0.8 },
    { emoji: '📈',  text: 'Crypto Portfolio Tracker',             score: 0.7 },
  ],
  food: [
    { emoji: '🍽️',  text: 'Chef Knife Set — Professional Grade', score: 0.9 },
    { emoji: '📦',  text: 'Gourmet Ingredient Subscription Box',  score: 0.8 },
    { emoji: '🍷',  text: 'Wine Delivery — Curated Selection',    score: 0.7 },
  ],
  fashion: [
    { emoji: '👟',  text: 'Limited Edition Collab Drop — Now Live', score: 0.9 },
    { emoji: '💎',  text: 'Designer Accessories Sale',            score: 0.8 },
    { emoji: '👗',  text: 'Sustainable Wardrobe — 50% Off',       score: 0.7 },
  ],
  sports: [
    { emoji: '🧗',  text: 'Climbing Wall Membership',             score: 0.9 },
    { emoji: '🪂',  text: 'Skydiving Course — First Jump',        score: 0.8 },
    { emoji: '🏄',  text: 'Surf Camp — Weekend Getaway',          score: 0.7 },
  ],
  entertainment: [
    { emoji: '🎮',  text: 'Gaming PC Build — Custom Config',      score: 0.9 },
    { emoji: '🎬',  text: 'Streaming Bundle — All Platforms',     score: 0.8 },
    { emoji: '🎧',  text: 'Studio Headphones — Producer Grade',   score: 0.7 },
  ],
};

// ---------- Session state ----------
const sessionStart = Date.now();

/** @type {Profile} */
const profile = {
  interests:    {},      // category -> raw score (0-200, not capped)
  intent:       {},      // category -> intent score (0-100)
  engagement:   0,       // 0-100
  traits: {
    novelty:    0,
    risk:       0,
    analytical: 0,
    impulsive:  0,
    social:     0,
  },
  mlPredictions: {
    clickProb:     0,
    purchaseProb:  0,
    highValueProb: 0,
    churnRisk:     0.5,
  },
  totalHovers:    0,
  repeatHovers:   0,
  uniqueCards:    new Set(),
  velocitySamples:[],
  lastEvent:      null,
  lastReasons:    [],
};

// ---------- Session stats for ML ----------
/**
 * ID: HS-PROFILE-stats
 * Purpose: Derive normalized ML stats from current profile state.
 * Outputs: sessionStats object for ml-model.extractFeatures()
 */
function buildSessionStats() {
  const totalDuration = Object.values(profile.interests)
    .reduce((s, v) => s + v * 150, 0); // rough ms estimate from score

  const avgVelocity = profile.velocitySamples.length > 0
    ? profile.velocitySamples.reduce((s, v) => s + v, 0) / profile.velocitySamples.length
    : 300;

  const topScore = Math.max(0, ...Object.values(profile.interests));
  const categories = Object.keys(profile.interests).filter(k => profile.interests[k] > 0);

  const repeatHovers = profile.repeatHovers;

  return {
    totalDuration:     Math.min(totalDuration, 60000),
    uniqueCards:       profile.uniqueCards.size,
    avgVelocity,
    repeatHovers,
    totalHovers:       profile.totalHovers,
    categorySpread:    categories.length,
    topCategoryScore:  topScore,
    sessionAgeMs:      Date.now() - sessionStart,
  };
}

// ---------- Update handler ----------
/**
 * ID: HS-PROFILE-update
 * Purpose: Process a completed HoverEvent - apply rules, update state, run ML.
 * Inputs:  HoverEvent
 * Outputs: bus.emit('profile:updated', profile)
 * Logic:
 *   1. Call rule-engine to get deltas
 *   2. Apply deltas to profile state with decay
 *   3. Run ML model
 *   4. Compute profile completeness
 *   5. Generate ad recommendations
 *   6. Emit updated profile
 */
function processHoverEvent(event) {
  const { category, id, avgVelocity, repeatCount } = event;

  // Track stats
  profile.totalHovers++;
  if (repeatCount > 1) profile.repeatHovers++;
  profile.uniqueCards.add(id);
  if (avgVelocity > 0) {
    profile.velocitySamples.push(avgVelocity);
    if (profile.velocitySamples.length > 50) profile.velocitySamples.shift();
  }

  // Get rule-engine scores
  const deltas = scoreHoverEvent(event);

  // Apply interest delta
  if (!profile.interests[category]) profile.interests[category] = 0;
  profile.interests[category] = clamp(
    profile.interests[category] + deltas.interestDelta, 0, 200
  );

  // Apply intent delta
  if (!profile.intent[category]) profile.intent[category] = 0;
  profile.intent[category] = clamp(
    profile.intent[category] + deltas.intentDelta, 0, 100
  );

  // Apply engagement delta (with slow decay toward 50 as baseline)
  profile.engagement = clamp(
    profile.engagement + deltas.engagementDelta, 0, 100
  );

  // Apply trait nudges
  for (const [trait, delta] of Object.entries(deltas.traitDeltas)) {
    if (profile.traits[trait] !== undefined) {
      profile.traits[trait] = clamp(profile.traits[trait] + delta, 0, 100);
    }
  }

  // Run ML model
  const stats = buildSessionStats();
  profile.mlPredictions = predictFromStats(stats);

  // Store for explainability
  profile.lastEvent   = event;
  profile.lastReasons = deltas.reasons;

  // Compute top interests (normalized to percentage)
  const maxScore = Math.max(1, ...Object.values(profile.interests));
  profile.topInterests = Object.entries(profile.interests)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([cat, score]) => ({
      category: cat,
      score,
      pct:  Math.round((score / maxScore) * 100),
      icon: categoryIcon(cat),
    }));

  // Generate ad recommendations from top 3 interests
  profile.adRecommendations = [];
  for (const { category: cat } of profile.topInterests.slice(0, 3)) {
    const ads = AD_DATABASE[cat] || [];
    for (const ad of ads.slice(0, 2)) {
      profile.adRecommendations.push({ ...ad, category: cat });
    }
  }
  profile.adRecommendations = profile.adRecommendations.slice(0, 6);

  // Profile completeness (0-100) based on categories discovered and ML confidence
  const categoriesFound = Object.keys(profile.interests).filter(k => profile.interests[k] > 5).length;
  profile.completeness  = Math.round(
    clamp((categoriesFound / 10) * 50 + (profile.mlPredictions.highValueProb) * 50, 0, 100)
  );

  bus.emit('profile:updated', { ...profile });
}

// ---------- Wire up tracker events ----------
bus.on('hover:complete', processHoverEvent);

// ---------- Public API ----------
/**
 * ID: HS-PROFILE-reset
 * Purpose: Clear all profile data and emit a reset event.
 */
export function resetProfile() {
  profile.interests    = {};
  profile.intent       = {};
  profile.engagement   = 0;
  profile.traits       = { novelty: 0, risk: 0, analytical: 0, impulsive: 0, social: 0 };
  profile.mlPredictions = { clickProb: 0, purchaseProb: 0, highValueProb: 0, churnRisk: 0.5 };
  profile.totalHovers  = 0;
  profile.repeatHovers = 0;
  profile.uniqueCards  = new Set();
  profile.velocitySamples = [];
  profile.lastEvent    = null;
  profile.lastReasons  = [];
  profile.topInterests = [];
  profile.adRecommendations = [];
  profile.completeness = 0;
  bus.emit('profile:reset', {});
}

export { profile };
