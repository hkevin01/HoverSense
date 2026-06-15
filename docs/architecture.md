# HoverSense - Architecture Documentation

## System Overview

HoverSense is a pure client-side behavioral profiling simulator. All computation runs in the browser via ES modules. There is no backend, no data persistence, and no external API calls.

## Event Flow

```
User hovers card
      |
      v
hover-tracker.js
  - mouseenter: start timer, sample velocity
  - mouseleave: compute duration, emit hover:complete
      |
      v
profile-builder.js  (listens on bus)
  - calls rule-engine.scoreHoverEvent(event)
  - calls ml-model.predictFromStats(sessionStats)
  - updates in-memory profile state
  - emits profile:updated
      |
      v
dashboard.js  (listens on bus)
  - schedules DOM updates via requestAnimationFrame
  - updates interest bars, ML gauges, traits, ads, timeline
      |
      v
heatmap.js  (listens on bus)
  - accumulates heat scores per element
  - redraws canvas when visible
```

## Module Responsibilities

### helpers.js
- Pure math utilities (sigmoid, clamp, lerp, normalize)
- Global event bus (createEmitter)
- Category metadata (colors, icons)

### hover-tracker.js
- Binds mouseenter/mouseleave to all `.trackable` elements
- Throttled mousemove for velocity sampling (50ms window)
- Tooltip RAF loop for live duration display
- Filters micro-glitch hovers < 80ms
- Exports: resetTracker()

### rule-engine.js
- Stateless - pure function scoreHoverEvent(event) -> deltas
- Thresholds: SHORT=400ms, MEDIUM=1500ms, LONG=3000ms, DEEP=6000ms
- Velocity thresholds: DELIBERATE=80, BROWSING=250, SCANNING=600 px/s
- Transition bonus map for related category pairs
- Exports: scoreHoverEvent(), CATEGORY_TRAITS

### ml-model.js
- Stateless logistic regression inference
- 8 normalized input features -> 4 probability outputs
- Pre-trained weight matrix (synthetic, realistic curves)
- Time-of-day encoded as cyclical sine feature
- Exports: extractFeatures(), predict(), predictFromStats()

### profile-builder.js
- Maintains full mutable session state
- Applies deltas from rule engine to interest/intent/trait scores
- Calls ML model on every update
- Generates ad recommendations from AD_DATABASE
- Computes profile completeness percentage
- Exports: resetProfile(), profile

### dashboard.js
- All DOM updates batched in requestAnimationFrame
- Renders: interests list, ML bars, trait bars, ad list, timeline, explain panel
- Exports nothing (side-effect module)

### heatmap.js
- Canvas element absolutely positioned over content section
- Radial gradient blobs per card, radius = max(width, height) * 0.8
- Heat score: log10(duration+1)*10 + repeat bonus
- Normalized to max score in current session
- Exports: toggleHeatmap(), resetHeatmap()

## Data Structures

### HoverEvent
```
{
  id: string,              // data-id attribute
  category: string,        // e.g. "travel"
  label: string,           // human-readable card title
  subcategory: string,
  duration: number,        // ms
  repeatCount: number,     // visit number for this card
  avgVelocity: number,     // px/s average during hover
  exitDirection: string,   // 'up'|'down'|'left'|'right'
  fromCategory: string,    // previous category (for transitions)
  sessionOffset: number,   // ms since session start
  timestamp: number,       // Date.now() at mouseleave
  element: HTMLElement,
}
```

### Profile
```
{
  interests: { [category]: number },    // 0-200 raw score
  intent: { [category]: number },       // 0-100
  engagement: number,                   // 0-100
  traits: { novelty, risk, analytical, impulsive, social },  // 0-100
  mlPredictions: { clickProb, purchaseProb, highValueProb, churnRisk },
  topInterests: [{ category, score, pct, icon }],
  adRecommendations: [{ emoji, text, score, category }],
  completeness: number,                 // 0-100
  totalHovers: number,
  repeatHovers: number,
  uniqueCards: Set<string>,
  velocitySamples: number[],
  lastEvent: HoverEvent,
  lastReasons: string[],
}
```

## Security Notes

- No PII collected or transmitted
- All data is session-only (lost on page reload)
- innerHTML used for trusted internal template strings only
- No eval() or dynamic script loading
- Content Security Policy compatible (no inline scripts in HTML)
