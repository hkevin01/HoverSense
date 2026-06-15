/**
 * FILE: src/dashboard/dashboard.js
 * ID: HS-DASH-001
 * Purpose: Real-time dashboard UI controller. Subscribes to profile:updated
 *          events and updates all DOM elements with smooth transitions.
 *
 * Requirement: All DOM updates must complete within one rAF after bus event.
 * Inputs:      Profile objects via bus('profile:updated')
 * Outputs:     DOM mutations (interest bars, ML values, trait bars, timeline)
 * Side Effects: Modifies dashboard panel DOM.
 * References:   HoverSense dashboard spec, section 4.
 */

import { bus, formatDuration, categoryColor, clamp, formatPct } from '../utils/helpers.js';

// ---------- DOM references ----------
const interestsList   = document.getElementById('interests-list');
const adsList         = document.getElementById('ads-list');
const timeline        = document.getElementById('timeline');
const explainPanel    = document.getElementById('explain-panel');
const profilePct      = document.getElementById('profile-pct');
const completenessFill= document.getElementById('completeness-fill');
const profileAvatar   = document.getElementById('profile-avatar');
const engScore        = document.getElementById('eng-score');
const engCircle       = document.getElementById('eng-circle');
const eventCount      = document.getElementById('session-event-count');

const mlClick         = document.getElementById('ml-click');
const mlClickBar      = document.getElementById('ml-click-bar');
const mlPurchase      = document.getElementById('ml-purchase');
const mlPurchaseBar   = document.getElementById('ml-purchase-bar');
const mlHighval       = document.getElementById('ml-highval');
const mlHighvalBar    = document.getElementById('ml-highval-bar');
const mlChurn         = document.getElementById('ml-churn');
const mlChurnBar      = document.getElementById('ml-churn-bar');

// Trait elements map
const TRAITS = ['novelty', 'risk', 'analytical', 'impulsive', 'social'];

let eventCounter = 0;
let timelineItems = [];

// ---------- Helpers ----------
/**
 * ID: HS-DASH-pct
 * Purpose: Format probability float to XX% string for display.
 */
function pct(val) {
  return Math.round(clamp(val, 0, 1) * 100) + '%';
}

/**
 * ID: HS-DASH-renderInterests
 * Purpose: Render sorted interest bars with smooth width transitions.
 * Inputs:  topInterests array from profile
 */
function renderInterests(topInterests) {
  if (!topInterests || topInterests.length === 0) {
    interestsList.innerHTML = '<div class="empty-state">Start hovering to reveal interests…</div>';
    return;
  }

  interestsList.innerHTML = topInterests.map(({ category, pct: p, icon }) => `
    <div class="interest-row" title="Hover more ${category} content to increase this score">
      <span class="interest-icon">${icon}</span>
      <span class="interest-name">${category.charAt(0).toUpperCase() + category.slice(1)}</span>
      <div class="interest-pct-wrap">
        <div class="interest-bar-bg">
          <div class="interest-bar-fill bar-${category}" style="width:${p}%"></div>
        </div>
        <span class="interest-pct">${p}%</span>
      </div>
    </div>
  `).join('');
}

/**
 * ID: HS-DASH-renderML
 * Purpose: Update ML prediction values and progress bars.
 * Inputs:  mlPredictions object
 */
function renderML(mlPredictions) {
  const { clickProb, purchaseProb, highValueProb, churnRisk } = mlPredictions;

  mlClick.textContent       = pct(clickProb);
  mlClickBar.style.width    = pct(clickProb);
  mlPurchase.textContent    = pct(purchaseProb);
  mlPurchaseBar.style.width = pct(purchaseProb);
  mlHighval.textContent     = pct(highValueProb);
  mlHighvalBar.style.width  = pct(highValueProb);
  mlChurn.textContent       = pct(churnRisk);
  mlChurnBar.style.width    = pct(churnRisk);
}

/**
 * ID: HS-DASH-renderTraits
 * Purpose: Update personality trait bars with capped values.
 * Inputs:  traits object from profile
 */
function renderTraits(traits) {
  for (const trait of TRAITS) {
    const val = Math.round(clamp(traits[trait] || 0, 0, 100));
    const fill = document.getElementById(`trait-${trait}`);
    const valEl= document.getElementById(`trait-${trait}-val`);
    if (fill)  fill.style.width = val + '%';
    if (valEl) valEl.textContent = val;
  }
}

/**
 * ID: HS-DASH-renderAds
 * Purpose: Render generated ad recommendations list.
 * Inputs:  adRecommendations array
 */
function renderAds(adRecommendations) {
  if (!adRecommendations || adRecommendations.length === 0) {
    adsList.innerHTML = '<div class="empty-state">Profile too sparse for targeting…</div>';
    return;
  }

  adsList.innerHTML = adRecommendations.map((ad, i) => `
    <div class="ad-item">
      <span class="ad-emoji">${ad.emoji}</span>
      <span class="ad-text">${ad.text}</span>
      <span class="ad-score">${Math.round(ad.score * 100)}%</span>
      ${i === 0 ? '<span class="ad-badge">TOP</span>' : ''}
    </div>
  `).join('');
}

/**
 * ID: HS-DASH-renderTimeline
 * Purpose: Prepend a new timeline entry for the latest hover event.
 * Inputs:  HoverEvent
 */
function addTimelineItem(event) {
  if (!event) return;
  const color = categoryColor(event.category);
  const time  = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  timelineItems.unshift({ event, color, time });
  if (timelineItems.length > 30) timelineItems.pop();

  timeline.innerHTML = timelineItems.slice(0, 12).map(item => `
    <div class="timeline-item">
      <div class="tl-dot" style="background:${item.color}"></div>
      <div class="tl-content">
        <div class="tl-label">${item.event.label}</div>
        <div class="tl-meta">
          <span>${item.event.category}</span>
          <span>${formatDuration(item.event.duration)}</span>
          <span>v=${Math.round(item.event.avgVelocity)}px/s</span>
        </div>
      </div>
      <div class="tl-time">${item.time}</div>
    </div>
  `).join('');
}

/**
 * ID: HS-DASH-renderExplain
 * Purpose: Show human-readable reasoning for the current profile state.
 * Inputs:  lastEvent, lastReasons array
 */
function renderExplain(lastEvent, lastReasons) {
  if (!lastEvent || !lastReasons || lastReasons.length === 0) return;

  const color = categoryColor(lastEvent.category);
  explainPanel.innerHTML = `
    <div class="explain-title" style="color:${color}">
      Last signal: ${lastEvent.label}
    </div>
    ${lastReasons.map(r => `<div>• ${r}</div>`).join('')}
  `;
}

/**
 * ID: HS-DASH-renderEngagement
 * Purpose: Update engagement ring SVG arc and score display.
 * Inputs:  engagement (0-100)
 */
function renderEngagement(engagement) {
  const val  = Math.round(clamp(engagement, 0, 100));
  const dash = (val / 100) * 100; // stroke-dasharray uses 100 total
  engScore.textContent         = val;
  engCircle.setAttribute('stroke-dasharray', `${dash} 100`);
  // Color shifts from blue to green as engagement increases
  const color = engagement > 60 ? '#00e5a0' : engagement > 30 ? '#4cc9f0' : '#7c3aed';
  engCircle.setAttribute('stroke', color);
}

/**
 * ID: HS-DASH-updateAvatar
 * Purpose: Set profile avatar emoji to top interest category icon.
 * Inputs:  topInterests array
 */
function updateAvatar(topInterests) {
  if (!topInterests || topInterests.length === 0) {
    profileAvatar.textContent = '?';
    return;
  }
  profileAvatar.textContent = topInterests[0].icon;
}

// ---------- Main update handler ----------
/**
 * ID: HS-DASH-onProfileUpdated
 * Purpose: Master handler - triggered on every profile:updated event.
 *          Orchestrates all sub-render functions in correct order.
 * Inputs:  Profile snapshot
 */
function onProfileUpdated(profile) {
  eventCounter++;
  eventCount.textContent = eventCounter;

  // Schedule all DOM updates in one rAF batch
  requestAnimationFrame(() => {
    renderInterests(profile.topInterests);
    renderML(profile.mlPredictions);
    renderTraits(profile.traits);
    renderAds(profile.adRecommendations);
    renderEngagement(profile.engagement);
    updateAvatar(profile.topInterests);
    addTimelineItem(profile.lastEvent);
    renderExplain(profile.lastEvent, profile.lastReasons);

    profilePct.textContent       = profile.completeness + '%';
    completenessFill.style.width = profile.completeness + '%';
  });
}

/**
 * ID: HS-DASH-onProfileReset
 * Purpose: Reset all dashboard display elements to initial empty state.
 */
function onProfileReset() {
  eventCounter = 0;
  timelineItems = [];
  eventCount.textContent       = '0';
  profilePct.textContent       = '0%';
  completenessFill.style.width = '0%';
  profileAvatar.textContent    = '?';
  engScore.textContent         = '0';
  engCircle.setAttribute('stroke-dasharray', '0 100');

  interestsList.innerHTML   = '<div class="empty-state">Start hovering to reveal interests…</div>';
  adsList.innerHTML         = '<div class="empty-state">Profile too sparse for targeting…</div>';
  timeline.innerHTML        = '<div class="empty-state">No interactions yet…</div>';
  explainPanel.innerHTML    = '<div class="empty-state">Hover over a card to see reasoning…</div>';

  mlClick.textContent      = '—';
  mlClickBar.style.width   = '0%';
  mlPurchase.textContent   = '—';
  mlPurchaseBar.style.width= '0%';
  mlHighval.textContent    = '—';
  mlHighvalBar.style.width = '0%';
  mlChurn.textContent      = '—';
  mlChurnBar.style.width   = '0%';

  for (const trait of TRAITS) {
    const fill = document.getElementById(`trait-${trait}`);
    const valEl= document.getElementById(`trait-${trait}-val`);
    if (fill)  fill.style.width = '0%';
    if (valEl) valEl.textContent = '0';
  }
}

// ---------- Subscribe to bus events ----------
bus.on('profile:updated', onProfileUpdated);
bus.on('profile:reset', onProfileReset);
