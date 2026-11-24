// ============================================================
// DAYMARK — APPLICATION ENTRY POINT & ORCHESTRATOR
// Zero inline handlers, live theme tokens, midnight rollover.
// ============================================================

import { store } from './store.js';
import { todayDateKey } from './streaks.js';
import { ensurePopoverSupport, toast } from './ui/toast.js';
import {
  initDialogLightDismissFallback,
  confirmAction,
  openHabitDialog,
  wireHabitEditorDialog,
  openPreferencesDialog,
  wirePreferencesDialog,
  openArchiveDialog,
  wireArchiveDialog
} from './ui/dialogs.js';
import { renderTodayView, wireTodayView } from './ui/today.js';
import { renderMonthlyGrid, wireGridAddForm } from './ui/grid.js';
import { renderAnalyticsAndCharts } from './ui/charts.js';
import { renderJournalUI, wireJournalControls } from './ui/journal.js';
import { wireKeepsakeDialog } from './ui/keepsake.js';
import { startGuidedTour, openGuideDialog, wireGuidedTour } from './ui/tour.js';
import { initSync } from './sync.js';

let currentView = 'today';
let lastKnownDateKey = todayDateKey();

function applyVisualPreferences() {
  const root = document.documentElement;
  const { appearance, ink, paperDots, privacyBlur, motto } = store.prefs;

  if (appearance === 'light' || appearance === 'dark') {
    root.setAttribute('data-appearance', appearance);
  } else {
    root.removeAttribute('data-appearance');
  }

  root.setAttribute('data-ink', ink || 'terracotta');
  document.body.dataset.paperDots = paperDots ? 'true' : 'false';
  document.body.classList.toggle('privacy-active', Boolean(privacyBlur));

  const privacyBtn = document.getElementById('privacyToggleBtn');
  if (privacyBtn) {
    privacyBtn.setAttribute('aria-pressed', String(Boolean(privacyBlur)));
    privacyBtn.title = privacyBlur ? 'Privacy blur ON — click to reveal notes' : 'Blur notes & habit names in public (P)';
  }

  const mottoEl = document.getElementById('mastheadMotto');
  if (mottoEl) {
    if (motto && motto.trim()) {
      mottoEl.textContent = `“${motto.trim()}”`;
      mottoEl.classList.remove('hidden');
    } else {
      mottoEl.classList.add('hidden');
    }
  }

  // Keep <meta name="theme-color"> synced to live canvas color
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    const bg = getComputedStyle(root).getPropertyValue('--bg-canvas').trim();
    if (bg) metaTheme.setAttribute('content', bg);
  }
}

function updateMastheadGreeting() {
  const now = new Date();
  const h = now.getHours();
  const part = h < 12 ? 'Good morning' : (h < 17 ? 'Good afternoon' : 'Good evening');
  const dateText = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }).format(now);

  const kicker = document.getElementById('mastheadKicker');
  const title = document.getElementById('mastheadTitle');
  if (kicker) kicker.textContent = dateText;
  if (title) title.textContent = `${part} — here is your rhythm.`;
}

function populateMonthYearControls() {
  const mSelect = document.getElementById('monthSelect');
  const ySelect = document.getElementById('yearSelect');
  if (!mSelect || !ySelect) return;

  const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long' });
  mSelect.innerHTML = '';
  for (let m = 0; m < 12; m++) {
    mSelect.add(new Option(monthFmt.format(new Date(2026, m, 1)), String(m)));
  }
  mSelect.value = String(store.currentMonth);

  const baseYear = new Date().getFullYear();
  ySelect.innerHTML = '';
  for (let y = baseYear - 3; y <= baseYear + 3; y++) {
    ySelect.add(new Option(String(y), String(y)));
  }
  ySelect.value = String(store.currentYear);
}

function syncMonthYearSelectValues() {
  const mSelect = document.getElementById('monthSelect');
  const ySelect = document.getElementById('yearSelect');
  if (mSelect) mSelect.value = String(store.currentMonth);
  if (ySelect) ySelect.value = String(store.currentYear);
}

function setViewMode(mode, persist = true) {
  currentView = mode === 'grid' ? 'grid' : 'today';
  document.body.dataset.view = currentView;
  if (currentView === 'grid') store.markOnboardingStep('explored');
  if (persist) store.updatePrefs({ viewMode: currentView }, false);

  const isToday = currentView === 'today';
  document.getElementById('viewTodayBtn')?.setAttribute('aria-selected', String(isToday));
  document.getElementById('viewGridBtn')?.setAttribute('aria-selected', String(!isToday));

  document.getElementById('todayPanel')?.classList.toggle('hidden', !isToday);
  document.getElementById('chartPanel')?.classList.toggle('hidden', isToday);
  document.getElementById('gridPanel')?.classList.toggle('hidden', isToday);
  document.getElementById('gridJournalPanel')?.classList.toggle('hidden', isToday);

  document.title = isToday
    ? 'Today | Daymark — Small marks, lasting rhythm'
    : 'Monthly Grid | Daymark — Small marks, lasting rhythm';

  renderActiveViews();
}

function renderActiveViews() {
  syncMonthYearSelectValues();
  if (currentView === 'today') {
    renderTodayView();
  } else {
    renderMonthlyGrid();
  }
  renderJournalUI();
  renderAnalyticsAndCharts();
}

function closePopoverById(id) {
  const pop = document.getElementById(id);
  if (!pop) return;
  try {
    if (typeof pop.hidePopover === 'function') pop.hidePopover();
    else pop.classList.remove(':popover-open');
  } catch {
    pop.classList.remove(':popover-open');
  }
}

function closeOverflowPopover() {
  closePopoverById('moreMenuPopover');
}

function downloadBlob(content, mime, filename) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function wireToolbarAndMenus() {
  // View switcher tabs + arrow-key support per ARIA tablist pattern
  const todayBtn = document.getElementById('viewTodayBtn');
  const gridBtn = document.getElementById('viewGridBtn');
  todayBtn?.addEventListener('click', () => setViewMode('today'));
  gridBtn?.addEventListener('click', () => setViewMode('grid'));

  const tablist = document.getElementById('viewModeSwitcher');
  tablist?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = currentView === 'today' ? 'grid' : 'today';
      setViewMode(next);
      (next === 'today' ? todayBtn : gridBtn)?.focus();
    }
  });

  // Month & Year selectors
  document.getElementById('monthSelect')?.addEventListener('change', (e) => {
    store.setViewedMonth(store.currentYear, Number(e.target.value));
  });
  document.getElementById('yearSelect')?.addEventListener('change', (e) => {
    store.setViewedMonth(Number(e.target.value), store.currentMonth);
  });

  // Quick New Habit button
  document.getElementById('newHabitTopBtn')?.addEventListener('click', () => openHabitDialog(null));

  // Privacy Blur quick button
  document.getElementById('privacyToggleBtn')?.addEventListener('click', () => {
    store.updatePrefs({ privacyBlur: !store.prefs.privacyBlur }, false);
  });

  // Overflow & Help Menu Items
  document.getElementById('helpMenuStartTourBtn')?.addEventListener('click', () => {
    closePopoverById('helpMenuPopover');
    startGuidedTour(0);
  });

  document.getElementById('helpMenuOpenGuideBtn')?.addEventListener('click', () => {
    closePopoverById('helpMenuPopover');
    openGuideDialog('basics');
  });

  document.getElementById('helpMenuShowWelcomeBtn')?.addEventListener('click', () => {
    closePopoverById('helpMenuPopover');
    store.updatePrefs({ starterDismissed: false }, false);
    setViewMode('today');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.getElementById('menuPrefsBtn')?.addEventListener('click', () => {
    closeOverflowPopover();
    store.markOnboardingStep('explored');
    openPreferencesDialog();
  });

  document.getElementById('menuArchiveBtn')?.addEventListener('click', () => {
    closeOverflowPopover();
    openArchiveDialog();
  });

  document.getElementById('menuTourBtn')?.addEventListener('click', () => {
    closeOverflowPopover();
    startGuidedTour(0);
  });

  document.getElementById('menuUserGuideBtn')?.addEventListener('click', () => {
    closeOverflowPopover();
    openGuideDialog('basics');
  });

  document.getElementById('menuExportCsvBtn')?.addEventListener('click', () => {
    closeOverflowPopover();
    const csv = store.buildMonthCSV(store.currentYear, store.currentMonth);
    const mStr = String(store.currentMonth + 1).padStart(2, '0');
    downloadBlob(csv, 'text/csv;charset=utf-8;', `Daymark_${store.currentYear}_${mStr}.csv`);
    toast.success('Exported monthly CSV (includes Daily Notes)');
  });

  document.getElementById('menuExportJsonBtn')?.addEventListener('click', () => {
    closeOverflowPopover();
    const json = store.exportBackupJSON();
    downloadBlob(json, 'application/json;charset=utf-8;', `Daymark_Backup_${todayDateKey()}.json`);
    toast.success('Downloaded full Daymark JSON backup');
  });

  const importFile = document.getElementById('importJsonInput');
  document.getElementById('menuImportJsonBtn')?.addEventListener('click', () => {
    closeOverflowPopover();
    importFile?.click();
  });

  importFile?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = store.importBackupJSON(text);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Restored backup (${res.habitCount} habits)`, {
          actionLabel: 'Undo',
          onAction: () => res.snapshot && store.undo(res.snapshot.id)
        });
      }
    } catch {
      toast.error('Could not read the selected backup file.');
    } finally {
      importFile.value = '';
    }
  });

  document.getElementById('menuClearMonthBtn')?.addEventListener('click', async () => {
    closeOverflowPopover();
    const label = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
      .format(new Date(store.currentYear, store.currentMonth, 1));
    const ok = await confirmAction({
      title: `Clear all entries for ${label}?`,
      message: 'This clears habit marks, mood, sleep, and daily notes for this month only. You can undo right afterward.',
      confirmLabel: 'Clear month',
      destructive: true
    });
    if (!ok) return;
    const snap = store.clearMonth(store.currentYear, store.currentMonth);
    toast.info(`Cleared ${label}`, {
      actionLabel: 'Undo',
      onAction: () => snap && store.undo(snap.id)
    });
  });
}

function wireKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog:modal')) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) {
      return;
    }

    const k = e.key.toLowerCase();
    if (k === 't') {
      setViewMode('today');
    } else if (k === 'g') {
      setViewMode('grid');
    } else if (k === 'n') {
      e.preventDefault();
      openHabitDialog(null);
    } else if (k === 'p') {
      store.updatePrefs({ privacyBlur: !store.prefs.privacyBlur }, false);
    } else if (e.key === '/') {
      const search = document.getElementById('gridJournalSearch');
      if (search && currentView === 'grid') {
        e.preventDefault();
        search.focus();
      }
    } else if (e.key === '?') {
      e.preventDefault();
      openGuideDialog('basics');
    }
  });
}

function watchMidnightRollover() {
  setInterval(() => {
    const nowKey = todayDateKey();
    if (nowKey !== lastKnownDateKey) {
      const wasViewingPrevToday = store.activeTodayKey === lastKnownDateKey;
      lastKnownDateKey = nowKey;
      updateMastheadGreeting();
      if (wasViewingPrevToday) {
        store.setActiveTodayKey(nowKey);
      } else {
        renderActiveViews();
      }
    }
  }, 60_000);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Non-fatal in dev / restricted environments
    });
  }
}

function bootstrap() {
  ensurePopoverSupport();
  initDialogLightDismissFallback();

  applyVisualPreferences();
  updateMastheadGreeting();
  populateMonthYearControls();

  wireToolbarAndMenus();
  wireTodayView();
  wireGridAddForm();
  wireJournalControls();
  wireHabitEditorDialog();
  wirePreferencesDialog();
  wireArchiveDialog();
  wireKeepsakeDialog();
  wireGuidedTour({ setViewMode });
  wireKeyboardShortcuts();

  // React to live OS color-scheme switches when appearance === 'system'
  const darkMql = window.matchMedia?.('(prefers-color-scheme: dark)');
  darkMql?.addEventListener?.('change', () => {
    if (store.prefs.appearance === 'system') {
      applyVisualPreferences();
      renderAnalyticsAndCharts();
    }
  });

  // Central Store Reactivity
  store.subscribe((type, detail) => {
    if (type === 'storage-error') {
      toast.error(detail.message);
      return;
    }
    if (type === 'prefs-changed') {
      applyVisualPreferences();
      renderActiveViews();
      return;
    }
    if (type === 'data-changed' || type === 'habits-changed' || type === 'month-changed' || type === 'cloud-applied' || type === 'ui-refresh') {
      renderActiveViews();
    }
  });

  // Default to Today on narrow viewports or first visits for calm general-audience onboarding
  const initialMode = store.prefs.viewMode || (window.innerWidth <= 900 ? 'today' : 'today');
  setViewMode(initialMode, false);

  initSync();
  watchMidnightRollover();
  registerServiceWorker();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
