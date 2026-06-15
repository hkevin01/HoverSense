/**
 * FILE: src/tracker/hover-tracker.js
 * ID: HS-TRACKER-001
 * Purpose: Capture all hover micro-interactions on trackable DOM elements.
 *          Measures duration, cursor velocity, repeat count, and transition
 *          sequences. Emits structured HoverEvent objects via the global bus.
 *
 * Requirement: Track all .trackable elements without blocking the main thread.
 * Inputs:      DOM elements with class "trackable" and data attributes.
 * Outputs:     bus.emit('hover:complete', HoverEvent) per completed hover.
 *              bus.emit('hover:active', {element, duration}) during hover.
 * Side Effects: Modifies card CSS class, updates tooltip DOM.
 * Failure Modes: Gracefully handles elements removed from DOM mid-hover.
 * References: HoverSense architecture spec, section 2.1
 */

import { bus, throttle, formatDuration } from '../utils/helpers.js';

// ---------- State ----------
const sessionStart = Date.now();
const visitCounts  = {};      // elementId -> integer
const lastCategory = { value: null };  // tracks previous category for transitions
const tooltip      = document.getElementById('hover-tooltip');
const ttCat        = document.getElementById('tt-cat');
const ttDur        = document.getElementById('tt-dur');
const ttCnt        = document.getElementById('tt-cnt');

// Per-hover mutable state
let activeEl      = null;
let enterTime     = 0;
let enterX        = 0;
let enterY        = 0;
let velocityBuf   = [];    // rolling window of speed samples
let mouseMoveRAF  = null;
let prevMouseX    = 0;
let prevMouseY    = 0;
let prevMouseTime = 0;
let tooltipRAF    = null;
let curMouseX     = 0;
let curMouseY     = 0;

// ---------- Velocity sampling ----------
/**
 * ID: HS-TRACKER-velocity
 * Purpose: Record instantaneous cursor speed from consecutive mousemove events.
 * Inputs:  MouseEvent
 * Outputs: pushes speed (px/s) into velocityBuf
 * Constraints: Throttled to prevent buffer overflow.
 */
function recordVelocity(e) {
  const now = Date.now();
  const dt  = now - prevMouseTime;
  if (dt > 0 && prevMouseTime > 0) {
    const dx    = e.clientX - prevMouseX;
    const dy    = e.clientY - prevMouseY;
    const speed = Math.sqrt(dx * dx + dy * dy) / (dt / 1000); // px/s
    velocityBuf.push(speed);
    if (velocityBuf.length > 20) velocityBuf.shift(); // keep last 20
  }
  prevMouseX    = e.clientX;
  prevMouseY    = e.clientY;
  prevMouseTime = now;
  curMouseX     = e.clientX;
  curMouseY     = e.clientY;
}

const throttledVelocity = throttle(recordVelocity, 50);
document.addEventListener('mousemove', throttledVelocity);

// ---------- Tooltip RAF loop ----------
function updateTooltip() {
  if (!activeEl) return;
  const dur = Date.now() - enterTime;
  ttDur.textContent = formatDuration(dur);
  const tx = curMouseX + 14;
  const ty = curMouseY - 10;
  tooltip.style.left = tx + 'px';
  tooltip.style.top  = ty + 'px';
  tooltipRAF = requestAnimationFrame(updateTooltip);
}

// ---------- Enter handler ----------
/**
 * ID: HS-TRACKER-enter
 * Purpose: Start a hover session for a trackable element.
 * Preconditions: element has data-category, data-id attributes.
 * Side Effects:  Applies .hovering CSS class, shows tooltip, starts RAF loop.
 */
function onEnter(e) {
  const el       = e.currentTarget;
  const id       = el.dataset.id;
  const category = el.dataset.category;

  // Initialize visit count
  if (!visitCounts[id]) visitCounts[id] = 0;
  visitCounts[id]++;

  activeEl      = el;
  enterTime     = Date.now();
  enterX        = e.clientX;
  enterY        = e.clientY;
  velocityBuf   = [];
  prevMouseTime = 0;

  el.classList.add('hovering');

  // Tooltip
  ttCat.textContent = category.toUpperCase();
  ttDur.textContent = '0ms';
  ttCnt.textContent = `Visit #${visitCounts[id]}`;
  tooltip.classList.remove('hidden');

  // Start duration display loop
  if (tooltipRAF) cancelAnimationFrame(tooltipRAF);
  tooltipRAF = requestAnimationFrame(updateTooltip);

  // Emit live start event for heatmap
  bus.emit('hover:start', { id, category, element: el, time: enterTime });
}

// ---------- Leave handler ----------
/**
 * ID: HS-TRACKER-leave
 * Purpose: Finalize hover session, compute all metrics, emit HoverEvent.
 * Outputs: HoverEvent object with duration, velocity, transition, repeatCount.
 * Postconditions: lastCategory updated, .hovering removed from element.
 */
function onLeave(e) {
  if (!activeEl) return;
  const el        = e.currentTarget;
  if (el !== activeEl) return;

  const leaveTime = Date.now();
  const duration  = leaveTime - enterTime;
  const id        = el.dataset.id;
  const category  = el.dataset.category;
  const label     = el.dataset.label;

  // Compute average velocity during hover
  const avgVelocity = velocityBuf.length > 0
    ? velocityBuf.reduce((s, v) => s + v, 0) / velocityBuf.length
    : 0;

  // Compute exit direction
  const dx        = e.clientX - enterX;
  const dy        = e.clientY - enterY;
  const exitDir   = getDirection(dx, dy);

  // Build HoverEvent
  /** @type {HoverEvent} */
  const event = {
    id,
    category,
    label,
    subcategory:   el.dataset.subcategory || '',
    duration,                          // ms
    repeatCount:   visitCounts[id],
    avgVelocity,                       // px/s
    exitDirection: exitDir,
    fromCategory:  lastCategory.value,  // previous hovered category
    sessionOffset: leaveTime - sessionStart,  // ms from session start
    timestamp:     leaveTime,
    element:       el,
  };

  lastCategory.value = category;
  activeEl           = null;

  el.classList.remove('hovering');
  tooltip.classList.add('hidden');
  if (tooltipRAF) { cancelAnimationFrame(tooltipRAF); tooltipRAF = null; }

  // Filter out micro-glitches (< 80ms = accidental pass-through)
  if (duration >= 80) {
    bus.emit('hover:complete', event);
  }
}

// ---------- Direction helper ----------
/**
 * ID: HS-TRACKER-direction
 * Purpose: Classify a displacement vector into 4-way compass direction.
 * Inputs:  dx, dy (numbers, pixels)
 * Outputs: string 'left'|'right'|'up'|'down'
 */
function getDirection(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

// ---------- Attach to all trackable elements ----------
/**
 * ID: HS-TRACKER-attach
 * Purpose: Bind hover listeners to all current .trackable elements.
 * Preconditions: DOM must be ready. Called once at module init.
 */
function attachTrackers() {
  document.querySelectorAll('.trackable').forEach(el => {
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
  });
}

attachTrackers();

// ---------- Public API ----------
/**
 * ID: HS-TRACKER-reset
 * Purpose: Clear all visit counts and reset session state.
 * Side Effects: Resets visitCounts map and lastCategory.
 */
export function resetTracker() {
  Object.keys(visitCounts).forEach(k => delete visitCounts[k]);
  lastCategory.value = null;
  if (activeEl) {
    activeEl.classList.remove('hovering');
    activeEl = null;
  }
  tooltip.classList.add('hidden');
}

export { visitCounts };
