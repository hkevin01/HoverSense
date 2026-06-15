/**
 * FILE: src/dashboard/heatmap.js
 * ID: HS-HEATMAP-001
 * Purpose: Canvas-based heat overlay that visualizes hover frequency and
 *          intensity across all content cards. Renders Gaussian blobs per
 *          card weighted by total hover duration and visit count.
 *
 * Requirement: Heatmap must update without blocking UI thread.
 * Inputs:      hover:complete events and toggle commands via bus.
 * Outputs:     Canvas overlay painted on top of content grid.
 * Constraints: Canvas is positioned absolute over content section.
 * References:  HoverSense heatmap spec, section 4.3
 */

import { bus, clamp } from '../utils/helpers.js';

const canvas  = document.getElementById('heatmap-canvas');
const ctx     = canvas ? canvas.getContext('2d') : null;
let isVisible = false;

// Card heat data: elementId -> { element, heatScore, visitCount }
const heatData = {};

// ---------- Update heat on hover complete ----------
/**
 * ID: HS-HEATMAP-record
 * Purpose: Accumulate heat score for each completed hover event.
 * Inputs:  HoverEvent
 * Side Effects: Updates heatData map.
 */
function recordHeat(event) {
  const { id, duration, repeatCount, element } = event;
  if (!heatData[id]) {
    heatData[id] = { element, heatScore: 0, visitCount: 0 };
  }
  // Heat score: log-scale duration + repeat bonus
  heatData[id].heatScore += Math.log10(duration + 1) * 10 + (repeatCount > 1 ? 5 : 0);
  heatData[id].visitCount++;
}

// ---------- Draw heatmap ----------
/**
 * ID: HS-HEATMAP-draw
 * Purpose: Paint all heat blobs onto the canvas.
 * Algorithm: For each card with heat > 0, draw a radial gradient centered on
 *            the card's midpoint, scaled by normalized heat score.
 */
function drawHeatmap() {
  if (!ctx || !isVisible) return;

  // Match canvas size to content section
  const section = document.querySelector('.content-section');
  if (!section) return;

  canvas.width  = section.offsetWidth;
  canvas.height = section.scrollHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const sectionRect = section.getBoundingClientRect();

  const scores = Object.values(heatData).map(d => d.heatScore);
  const maxScore = scores.length > 0 ? Math.max(...scores) : 1;

  for (const [, data] of Object.entries(heatData)) {
    if (data.heatScore <= 0 || !data.element) continue;

    const rect       = data.element.getBoundingClientRect();
    const cx         = rect.left - sectionRect.left + rect.width  / 2;
    const cy         = rect.top  - sectionRect.top  + section.scrollTop + rect.height / 2;
    const radius     = Math.max(rect.width, rect.height) * 0.8;
    const intensity  = clamp(data.heatScore / maxScore, 0, 1);
    const alpha      = intensity * 0.7;

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0,   `rgba(255, 60, 60, ${alpha})`);
    gradient.addColorStop(0.4, `rgba(255, 165, 0, ${alpha * 0.6})`);
    gradient.addColorStop(0.7, `rgba(76, 201, 240, ${alpha * 0.3})`);
    gradient.addColorStop(1,   `rgba(0, 0, 0, 0)`);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------- Toggle visibility ----------
/**
 * ID: HS-HEATMAP-toggle
 * Purpose: Show or hide the heatmap overlay canvas.
 */
export function toggleHeatmap() {
  isVisible = !isVisible;
  if (isVisible) {
    canvas.classList.remove('hidden');
    drawHeatmap();
  } else {
    canvas.classList.add('hidden');
  }
  return isVisible;
}

// ---------- Reset ----------
/**
 * ID: HS-HEATMAP-reset
 * Purpose: Clear all heat data and redraw blank canvas.
 */
export function resetHeatmap() {
  Object.keys(heatData).forEach(k => delete heatData[k]);
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ---------- Subscribe to events ----------
bus.on('hover:complete', (event) => {
  recordHeat(event);
  if (isVisible) drawHeatmap();
});

bus.on('profile:reset', resetHeatmap);

// Redraw on scroll (canvas is absolute positioned)
document.querySelector('.content-section')?.addEventListener('scroll', () => {
  if (isVisible) drawHeatmap();
});
