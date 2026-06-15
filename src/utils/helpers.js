/**
 * FILE: src/utils/helpers.js
 * ID: HS-UTIL-001
 * Purpose: Shared utility functions for the HoverSense application.
 * Requirement: Provide pure helper functions with no side effects.
 * References: HoverSense architecture spec
 */

/**
 * ID: HS-UTIL-clamp
 * Purpose: Clamp a numeric value within [min, max].
 * Inputs:  val (number), min (number), max (number)
 * Outputs: number in [min, max]
 */
export function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

/**
 * ID: HS-UTIL-lerp
 * Purpose: Linear interpolation between a and b by factor t.
 * Inputs:  a (number), b (number), t (number) in [0,1]
 * Outputs: number
 */
export function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

/**
 * ID: HS-UTIL-sigmoid
 * Purpose: Logistic sigmoid activation function.
 * Inputs:  x (number) - any real number
 * Outputs: number in (0, 1)
 */
export function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

/**
 * ID: HS-UTIL-normalize
 * Purpose: Normalize a value within a known range to [0, 1].
 * Inputs:  val (number), min (number), max (number)
 * Outputs: number in [0, 1]
 * Failure: Returns 0 if max === min (degenerate range).
 */
export function normalize(val, min, max) {
  if (max === min) return 0;
  return clamp((val - min) / (max - min), 0, 1);
}

/**
 * ID: HS-UTIL-formatDuration
 * Purpose: Format milliseconds into a human-readable string.
 * Inputs:  ms (number) - duration in milliseconds
 * Outputs: string e.g. "1.2s" or "420ms"
 */
export function formatDuration(ms) {
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
  return Math.round(ms) + 'ms';
}

/**
 * ID: HS-UTIL-formatPct
 * Purpose: Format a 0-1 float into a percentage string.
 * Inputs:  val (number) in [0, 1]
 * Outputs: string e.g. "72%"
 */
export function formatPct(val) {
  return Math.round(clamp(val, 0, 1) * 100) + '%';
}

/**
 * ID: HS-UTIL-getHourOfDay
 * Purpose: Return the current hour (0-23) for time-of-day ML features.
 * Outputs: integer in [0, 23]
 */
export function getHourOfDay() {
  return new Date().getHours();
}

/**
 * ID: HS-UTIL-dotProduct
 * Purpose: Compute dot product of two equal-length numeric arrays.
 * Inputs:  a (number[]), b (number[])
 * Outputs: number
 * Failure: Returns 0 if lengths differ.
 */
export function dotProduct(a, b) {
  if (a.length !== b.length) return 0;
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

/**
 * ID: HS-UTIL-categoryColor
 * Purpose: Map a category name to its accent hex color.
 * Inputs:  category (string)
 * Outputs: string (hex color)
 */
export const CATEGORY_COLORS = {
  travel:        '#2ec4b6',
  technology:    '#4cc9f0',
  outdoors:      '#74c69d',
  automotive:    '#ff6b8a',
  health:        '#f72585',
  finance:       '#f7931a',
  food:          '#ff758f',
  fashion:       '#ef233c',
  sports:        '#00b4d8',
  entertainment: '#c77dff',
};

export const CATEGORY_ICONS = {
  travel:        '✈️',
  technology:    '💻',
  outdoors:      '🌿',
  automotive:    '🚗',
  health:        '🩺',
  finance:       '💰',
  food:          '🍴',
  fashion:       '👗',
  sports:        '⚡',
  entertainment: '🎭',
};

export function categoryColor(cat) {
  return CATEGORY_COLORS[cat] || '#8892b0';
}

export function categoryIcon(cat) {
  return CATEGORY_ICONS[cat] || '•';
}

/**
 * ID: HS-UTIL-throttle
 * Purpose: Throttle a function to execute at most once per interval.
 * Inputs:  fn (function), interval (number ms)
 * Outputs: throttled function
 */
export function throttle(fn, interval) {
  let lastTime = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastTime >= interval) {
      lastTime = now;
      return fn.apply(this, args);
    }
  };
}

/**
 * ID: HS-UTIL-emitter
 * Purpose: Minimal event emitter for decoupled module communication.
 * Outputs: { on, emit, off } object
 */
export function createEmitter() {
  const listeners = {};
  return {
    on(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
    off(event, fn) {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(f => f !== fn);
    },
    emit(event, data) {
      (listeners[event] || []).forEach(fn => fn(data));
    },
  };
}

/** Global application event bus - imported by all modules. */
export const bus = createEmitter();
