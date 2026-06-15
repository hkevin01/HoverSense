/**
 * FILE: src/main.js
 * ID: HS-MAIN-001
 * Purpose: Application entry point. Wires together all modules,
 *          binds UI control buttons, and initializes the application.
 *
 * Requirement: All modules must be initialized before any user interaction.
 * Inputs:      User clicks on Reset and Heatmap buttons.
 * Side Effects: Imports all modules (which register their own bus listeners).
 * References:   HoverSense architecture spec
 */

// Import modules to ensure they register their bus listeners and DOM handlers.
// Order matters: helpers -> tracker -> engines -> dashboard
import './utils/helpers.js';
import './tracker/hover-tracker.js';
import './engine/rule-engine.js';
import './engine/ml-model.js';
import './engine/profile-builder.js';
import './dashboard/heatmap.js';
import './dashboard/dashboard.js';

import { resetTracker }  from './tracker/hover-tracker.js';
import { resetProfile }  from './engine/profile-builder.js';
import { toggleHeatmap, resetHeatmap } from './dashboard/heatmap.js';

// ---------- Control buttons ----------
/**
 * ID: HS-MAIN-reset
 * Purpose: Reset entire session - tracker, profile, heatmap, and dashboard.
 */
document.getElementById('btn-reset').addEventListener('click', () => {
  resetTracker();
  resetProfile();
  resetHeatmap();
});

/**
 * ID: HS-MAIN-heatmap
 * Purpose: Toggle heatmap overlay visibility.
 */
const btnHeatmap = document.getElementById('btn-heatmap');
btnHeatmap.addEventListener('click', () => {
  const isOn = toggleHeatmap();
  btnHeatmap.textContent = isOn ? 'Hide Heatmap' : 'Toggle Heatmap';
});

// ---------- Startup log ----------
console.log(
  '%c⬡ HoverSense Loaded%c\nBehavioral profiling simulator active. Hover over content cards to begin.',
  'color:#4cc9f0;font-size:1.1em;font-weight:bold',
  'color:#8892b0'
);
