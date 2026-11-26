// ============================================================
// DAYMARK — THOROUGH 8-STEP HANDS-ON TOUR & USER GUIDE DIALOG
// Non-coercive, always skippable, uses popover="manual" +
// progressive CSS Anchor Positioning with bottom-sheet fallback.
// ============================================================

import { store } from '../store.js';
import { toast } from './toast.js';

let setViewModeFn = null;
let stepIdx = 0;
let isTourOpen = false;
let highlightedEl = null;
let activeStepCleanup = null;
let modalWatcher = null;
let pausedForModal = false;
let tourOpenerEl = null;

const TOUR_STEPS = [
  {
    id: 'stamp',
    view: 'today',
    badge: 'Daily Check-In',
    title: 'Place your daily Daymark stamp',
    desc: 'Today view groups your habits by Morning, Afternoon, Evening, and Anytime so you only focus on what matters right now. Checking off a habit adds a tactile stamp and updates your streak instantly.',
    tryPrompt: 'Check off any habit box on today’s list.',
    doneText: 'Nice! Your first Daymark stamp is placed.',
    selector: '#todayHabitsHost .habit-card, #todayPanel',
    watch: (onDone) => {
      const handler = (e) => {
        if (e.target.matches('.stamp-checkbox') && e.target.checked) onDone();
      };
      document.addEventListener('change', handler, true);
      return () => document.removeEventListener('change', handler, true);
    }
  },
  {
    id: 'rest',
    view: 'today',
    badge: 'No-Burnout Streaks',
    title: 'Protect momentum with Rest Days',
    desc: 'Sick, traveling, or taking a planned recovery day? Tap the moon icon on any habit card (or Shift+click / right-click in Monthly Grid) to log a Rest Day. Rest Days keep your streak alive without lowering your monthly score.',
    tryPrompt: 'Tap the moon icon on any habit card to test a Rest Day.',
    doneText: 'Rest Day logged — streak stays safely protected!',
    selector: '#todayHabitsHost .habit-card-actions button[aria-pressed], #todayPanel',
    watch: (onDone) => {
      const handler = (e) => {
        if (e.target.closest('.habit-card-actions button[aria-pressed]')) onDone();
      };
      document.addEventListener('click', handler, true);
      return () => document.removeEventListener('click', handler, true);
    }
  },
  {
    id: 'customize-habit',
    view: 'today',
    badge: 'Flexible Schedules',
    title: 'Customize schedules, icons & routines',
    desc: 'Not every habit belongs every day. Click “New Habit” (or any habit’s pencil icon) to choose its icon, routine time, and exact days of the week—like Weekdays or Mon/Wed/Fri. Off-schedule days never count against you.',
    tryPrompt: 'Click “+ New Habit” or any habit’s pencil icon to inspect the editor.',
    doneText: 'Habit editor explored — schedules can be changed anytime.',
    selector: '#newHabitTopBtn',
    watch: (onDone) => {
      const handler = (e) => {
        if (e.target.closest('#newHabitTopBtn') || e.target.closest('button[aria-label^="Edit "]')) {
          onDone();
        }
      };
      document.addEventListener('click', handler, true);
      return () => document.removeEventListener('click', handler, true);
    }
  },
  {
    id: 'wellness-note',
    view: 'today',
    badge: 'Wellness & Journal',
    title: 'Track Mood, Sleep & a 30-second Daily Note',
    desc: 'Log your 1–10 Mood, half-hour Sleep duration, and a quick Daily Note with customizable prompt tags. Your notes auto-save locally and feed your personal Rhythm Insights.',
    tryPrompt: 'Tap a Mood number, pick a Sleep preset, or click a Daily Note tag.',
    doneText: 'Wellness & note check-in tried!',
    selector: '#todayMoodPills',
    watch: (onDone) => {
      const clickHandler = (e) => {
        if (e.target.closest('.mood-pill-btn, [data-sleep-preset], #sleepMinusBtn, #sleepPlusBtn, .prompt-pill-btn')) {
          onDone();
        }
      };
      const inputHandler = (e) => {
        if (e.target.id === 'todayJournalInput') onDone();
      };
      document.addEventListener('click', clickHandler, true);
      document.addEventListener('input', inputHandler, true);
      return () => {
        document.removeEventListener('click', clickHandler, true);
        document.removeEventListener('input', inputHandler, true);
      };
    }
  },
  {
    id: 'grid',
    view: 'grid',
    badge: 'Big Picture',
    title: 'See your whole month in the Monthly Grid',
    desc: 'Monthly Grid displays real calendar weeks (Sunday or Monday start), dashed off-schedule days, and an interactive row menu (⋮) to reorder, archive, or delete with Undo. Click any day number to inspect that date’s note.',
    tryPrompt: 'Click any square in the Monthly Grid (or Shift+click for a Rest Day).',
    doneText: 'Monthly Grid updated — everything stays synced with Today!',
    selector: '#gridPanel .grid-wrapper, #gridPanel',
    watch: (onDone) => {
      const handler = (e) => {
        if (e.target.closest('.grid-cell-btn')) onDone();
      };
      document.addEventListener('click', handler, true);
      return () => document.removeEventListener('click', handler, true);
    }
  },
  {
    id: 'insights',
    view: 'grid',
    badge: 'Momentum & Insights',
    title: 'True cross-month streaks & Rhythm Insights',
    desc: 'The sidebar tracks your Monthly Rhythm, cross-month active and all-time best streaks (never resetting on the 1st of the month!), and plain-English Rhythm Insights showing how sleep and mood lift consistency.',
    tryPrompt: 'Glance at Habit Momentum and Rhythm Insights, then continue.',
    doneText: 'Sidebar reviewed!',
    selector: '#rhythmInsightsPanel',
    watch: null
  },
  {
    id: 'keepsake-prefs',
    view: 'today',
    badge: 'Studio & Keepsake',
    title: 'Print a Monthly Keepsake & tune your studio',
    desc: 'Click Keepsake to generate a letterpress monthly summary PNG you can save or copy. Open ⋯ → Studio Preferences to switch between Linen Paper light mode, Evening Ink dark mode, and three Studio Ink accents.',
    tryPrompt: 'Try clicking “Keepsake” or “⋯” to peek at your options.',
    doneText: 'Keepsake & studio tools discovered!',
    selector: '#openKeepsakeBtn',
    watch: (onDone) => {
      const handler = (e) => {
        if (e.target.closest('#openKeepsakeBtn, #moreMenuBtn')) onDone();
      };
      document.addEventListener('click', handler, true);
      return () => document.removeEventListener('click', handler, true);
    }
  },
  {
    id: 'privacy-backup',
    view: 'today',
    badge: 'Private & Safe',
    title: 'Local-first privacy, backups & optional sync',
    desc: 'Everything saves directly on your device—no account required. Use the eye icon (or press P) for instant Privacy Blur in public, export full JSON backups from ⋯, or connect optional Cloud Sync whenever you want multi-device access.',
    tryPrompt: 'Tap the Privacy Blur eye icon, or click Finish to start tracking!',
    doneText: 'Privacy Blur tested — you’re ready for Daymark!',
    selector: '#privacyToggleBtn',
    watch: (onDone) => {
      const handler = (e) => {
        if (e.target.closest('#privacyToggleBtn, #openAuthBtn')) onDone();
      };
      document.addEventListener('click', handler, true);
      return () => document.removeEventListener('click', handler, true);
    }
  }
];

function clearStepWatch() {
  if (typeof activeStepCleanup === 'function') {
    try { activeStepCleanup(); } catch { /* ignore */ }
  }
  activeStepCleanup = null;
}

function clearHighlight() {
  if (highlightedEl) {
    highlightedEl.classList.remove('tour-highlight-ring', 'tour-anchored-target');
    highlightedEl = null;
  }
}

function findVisibleTarget(selector) {
  const list = document.querySelectorAll(selector);
  for (const el of list) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return list[0] || null;
}

function showPopoverEl(panel) {
  try {
    if (typeof panel.showPopover === 'function') panel.showPopover();
    else panel.classList.add(':popover-open');
  } catch {
    panel.classList.add(':popover-open');
  }
}

function hidePopoverEl(panel) {
  try {
    if (typeof panel.hidePopover === 'function') panel.hidePopover();
    else panel.classList.remove(':popover-open');
  } catch {
    panel.classList.remove(':popover-open');
  }
}

function setTryState(done, message) {
  const box = document.getElementById('tourTryBox');
  const status = document.getElementById('tourTryStatus');
  const text = document.getElementById('tourTryText');
  if (box) box.classList.toggle('is-complete', done);
  if (status) status.textContent = done ? '✓ Tried!' : 'Try it now';
  if (text && message) text.textContent = message;
}

function applyStepTargetHighlight(step, { scroll = true } = {}) {
  const panel = document.getElementById('tourPopover');
  clearHighlight();
  const target = findVisibleTarget(step.selector);
  if (!target) {
    if (panel) panel.dataset.dock = 'corner';
    return;
  }

  const rect = target.getBoundingClientRect();
  const isCompactTopbarControl = Boolean(target.closest('.app-topbar')) && rect.height <= 64;

  target.classList.add('tour-highlight-ring');
  if (isCompactTopbarControl) {
    target.classList.add('tour-anchored-target');
    if (panel) panel.dataset.dock = 'anchored';
  } else {
    if (panel) panel.dataset.dock = 'corner';
  }

  if (scroll) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  highlightedEl = target;
}

function renderStep({ focusCard = false } = {}) {
  const step = TOUR_STEPS[stepIdx];
  const panel = document.getElementById('tourPopover');
  if (!step || !panel) return;

  clearStepWatch();
  clearHighlight();

  // Switch workspace view cleanly if step belongs to Today or Monthly Grid
  if (step.view && typeof setViewModeFn === 'function') {
    setViewModeFn(step.view, false);
  }

  // Defer target measurement by 1 frame so view switch layout completes
  requestAnimationFrame(() => {
    if (!isTourOpen) return;

    applyStepTargetHighlight(step, { scroll: true });

    const countEl = document.getElementById('tourStepCount');
    const tagEl = document.getElementById('tourStepTag');
    const progEl = document.getElementById('tourProgressFill');
    const titleEl = document.getElementById('tourStepTitle');
    const descEl = document.getElementById('tourStepDesc');
    const prevBtn = document.getElementById('tourPrevBtn');
    const nextBtn = document.getElementById('tourNextBtn');

    if (countEl) countEl.textContent = `Step ${stepIdx + 1} of ${TOUR_STEPS.length}`;
    if (tagEl) tagEl.textContent = step.badge;
    if (progEl) progEl.style.width = `${Math.round(((stepIdx + 1) / TOUR_STEPS.length) * 100)}%`;
    if (titleEl) titleEl.textContent = step.title;
    if (descEl) descEl.textContent = step.desc;

    setTryState(false, step.tryPrompt);

    if (prevBtn) prevBtn.disabled = stepIdx === 0;
    if (nextBtn) {
      nextBtn.textContent = stepIdx === TOUR_STEPS.length - 1 ? 'Finish Guide ✓' : 'Next →';
    }

    if (typeof step.watch === 'function') {
      activeStepCleanup = step.watch(() => {
        setTryState(true, step.doneText);
      });
    }

    if (!pausedForModal) {
      showPopoverEl(panel);
      if (focusCard) {
        // Shift programmatic focus into popover when user opens the tour
        nextBtn?.focus();
      }
    }
  });
}

function attachModalPauseWatcher() {
  if (modalWatcher || typeof MutationObserver === 'undefined') return;
  const panel = document.getElementById('tourPopover');
  modalWatcher = new MutationObserver(() => {
    if (!isTourOpen || !panel) return;
    const anyModalOpen = Boolean(document.querySelector('dialog.dm-dialog[open]'));
    if (anyModalOpen && !pausedForModal) {
      pausedForModal = true;
      hidePopoverEl(panel);
    } else if (!anyModalOpen && pausedForModal) {
      pausedForModal = false;
      const step = TOUR_STEPS[stepIdx];
      if (step) applyStepTargetHighlight(step, { scroll: false });
      showPopoverEl(panel);
    }
  });
  document.querySelectorAll('dialog.dm-dialog').forEach((dlg) => {
    modalWatcher.observe(dlg, { attributes: true, attributeFilter: ['open'] });
  });
}

export function startGuidedTour(startStep = 0) {
  const panel = document.getElementById('tourPopover');
  if (!panel) return;
  if (!isTourOpen) {
    tourOpenerEl = document.activeElement;
  }
  stepIdx = Math.max(0, Math.min(TOUR_STEPS.length - 1, startStep));
  isTourOpen = true;
  pausedForModal = false;
  attachModalPauseWatcher();
  store.markOnboardingStep('explored');
  renderStep({ focusCard: true });
}

export function closeGuidedTour({ completed = false } = {}) {
  const opener = tourOpenerEl;
  const returnTarget = highlightedEl;
  tourOpenerEl = null;
  isTourOpen = false;
  pausedForModal = false;
  clearStepWatch();
  clearHighlight();

  const panel = document.getElementById('tourPopover');
  if (panel) hidePopoverEl(panel);

  if (completed) {
    store.markOnboardingStep('tourCompleted');
    toast.success('Walkthrough complete — welcome to Daymark!');
  }

  // Return focus cleanly to the opener control or highlighted control if still focusable
  const focusCandidate = (opener && opener.isConnected && opener !== document.body) ? opener : returnTarget;
  if (focusCandidate && typeof focusCandidate.focus === 'function' && focusCandidate.tabIndex >= 0) {
    focusCandidate.focus();
  }
}

// ── Complete Reference Guide & Shortcuts Dialog ──────────────
export function openGuideDialog(initialTab = 'basics') {
  const dialog = document.getElementById('guideDialog');
  if (!dialog) return;
  store.markOnboardingStep('explored');
  selectGuideTab(initialTab);
  dialog.returnValue = '';
  dialog.showModal();
  document.getElementById('guideCloseBtn')?.focus();
}

function selectGuideTab(tabId) {
  document.querySelectorAll('[data-guide-tab]').forEach((btn) => {
    const active = btn.dataset.guideTab === tabId;
    btn.setAttribute('aria-selected', String(active));
    btn.classList.toggle('active', active);
  });
  document.querySelectorAll('[data-guide-panel]').forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.guidePanel !== tabId);
  });
}

export function wireGuidedTour({ setViewMode } = {}) {
  setViewModeFn = setViewMode || null;

  document.getElementById('tourPrevBtn')?.addEventListener('click', () => {
    if (stepIdx > 0) {
      stepIdx--;
      renderStep({ focusCard: false });
    }
  });

  document.getElementById('tourNextBtn')?.addEventListener('click', () => {
    if (stepIdx < TOUR_STEPS.length - 1) {
      stepIdx++;
      renderStep({ focusCard: false });
    } else {
      closeGuidedTour({ completed: true });
    }
  });

  document.getElementById('tourCloseBtn')?.addEventListener('click', () => closeGuidedTour({ completed: false }));
  document.getElementById('tourSkipBtn')?.addEventListener('click', () => closeGuidedTour({ completed: false }));

  // Re-attach highlight ring cleanly if a live interaction re-renders DOM nodes
  store.subscribe((type) => {
    if (!isTourOpen || pausedForModal) return;
    if (type === 'data-changed' || type === 'habits-changed') {
      requestAnimationFrame(() => {
        if (!isTourOpen) return;
        const step = TOUR_STEPS[stepIdx];
        if (step) applyStepTargetHighlight(step, { scroll: false });
      });
    }
  });

  // Escape exits active walkthrough cleanly
  document.addEventListener('keydown', (e) => {
    if (!isTourOpen) return;
    if (e.key === 'Escape' && !document.querySelector('dialog.dm-dialog[open]')) {
      closeGuidedTour({ completed: false });
    }
  });

  // Reference Guide Dialog wiring
  document.querySelectorAll('[data-guide-tab]').forEach((btn) => {
    btn.addEventListener('click', () => selectGuideTab(btn.dataset.guideTab));
  });

  document.getElementById('guideCloseBtn')?.addEventListener('click', () => {
    document.getElementById('guideDialog')?.close();
  });

  document.getElementById('guideStartTourBtn')?.addEventListener('click', () => {
    document.getElementById('guideDialog')?.close();
    startGuidedTour(0);
  });
}
