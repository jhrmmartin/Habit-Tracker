// ============================================================
// DAYMARK — NATIVE <dialog> CONTROLLERS & FORM DIALOGS
// Uses showModal(), safe Cancel autofocus, returnValue reset,
// and pointerdown/pointerup closedby="any" fallback for Safari.
// ============================================================

import { store, ROUTINES } from '../store.js';
import { EMOJI_CATEGORIES, searchEmojis, suggestHabitIcon } from '../emojis.js';
import { sanitizeEmoji } from '../security.js';
import { toast } from './toast.js';

const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Safari fallback for <dialog closedby="any"> using pointerdown + pointerup outside bounds.
 */
export function initDialogLightDismissFallback() {
  if (typeof HTMLDialogElement === 'undefined' || 'closedBy' in HTMLDialogElement.prototype) {
    return;
  }
  const isOutside = (e, dialog) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  document.querySelectorAll('dialog[closedby="any"]').forEach((dialog) => {
    let pressedOutside = false;
    dialog.addEventListener('pointerdown', (e) => {
      pressedOutside = isOutside(e, dialog);
    });
    dialog.addEventListener('pointerup', (e) => {
      if (pressedOutside && isOutside(e, dialog) && dialog.open) {
        dialog.close('');
      }
      pressedOutside = false;
    });
  });
}

/**
 * Shows a native accessible confirmation dialog.
 * Safe action (Cancel) always receives initial autofocus to prevent accidental data loss.
 */
export function confirmAction({
  title = 'Confirm action',
  message = '',
  confirmLabel = 'Confirm',
  destructive = true
}) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('confirmDialog');
    if (!dialog) {
      resolve(false);
      return;
    }

    const titleEl = document.getElementById('confirmDialogTitle');
    const msgEl = document.getElementById('confirmDialogMsg');
    const confirmBtn = document.getElementById('confirmDialogOk');
    const cancelBtn = document.getElementById('confirmDialogCancel');

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (confirmBtn) {
      confirmBtn.textContent = confirmLabel;
      confirmBtn.className = destructive ? 'btn btn-danger' : 'btn btn-primary';
    }

    const onClose = () => {
      const val = dialog.returnValue;
      dialog.returnValue = ''; // Mandatory reset so stale values never leak
      resolve(val === 'confirm');
    };

    dialog.addEventListener('close', onClose, { once: true });
    dialog.returnValue = '';
    dialog.showModal();
    // Explicitly focus safe Cancel button for destructive actions
    if (destructive && cancelBtn) {
      cancelBtn.focus();
    }
  });
}

// ── Habit Add / Edit Dialog ──────────────────────────────────
let editingHabitId = null;
let selectedHabitIcon = '✦';
let selectedSchedule = [0, 1, 2, 3, 4, 5, 6];
let activeEmojiCat = 'all';

function renderHabitEmojiGrid(query = '') {
  const grid = document.getElementById('habitDialogEmojiGrid');
  if (!grid) return;
  const list = searchEmojis(query, activeEmojiCat);
  grid.innerHTML = '';

  for (const em of list) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-cell';
    btn.textContent = em;
    btn.setAttribute('aria-label', `Select icon ${em}`);
    btn.setAttribute('aria-pressed', String(em === selectedHabitIcon));
    btn.addEventListener('click', () => {
      selectedHabitIcon = em;
      const preview = document.getElementById('habitDialogIconPreview');
      if (preview) preview.textContent = em;
      renderHabitEmojiGrid(document.getElementById('habitDialogEmojiSearch')?.value || '');
    });
    grid.appendChild(btn);
  }
}

function renderScheduleButtons() {
  const wrap = document.getElementById('habitSchedulePicker');
  if (!wrap) return;
  wrap.innerHTML = '';

  WEEKDAY_SHORT.forEach((lbl, dow) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'weekday-toggle';
    btn.textContent = lbl;
    btn.setAttribute('aria-label', WEEKDAY_FULL[dow]);
    btn.setAttribute('aria-pressed', String(selectedSchedule.includes(dow)));
    btn.addEventListener('click', () => {
      if (selectedSchedule.includes(dow)) {
        if (selectedSchedule.length > 1) {
          selectedSchedule = selectedSchedule.filter((d) => d !== dow);
        }
      } else {
        selectedSchedule = [...selectedSchedule, dow].sort();
      }
      renderScheduleButtons();
    });
    wrap.appendChild(btn);
  });
}

export function openHabitDialog(habitId = null) {
  const dialog = document.getElementById('habitEditorDialog');
  if (!dialog) return;

  const habit = habitId ? store.habits.find((h) => h.id === habitId) : null;
  editingHabitId = habit ? habit.id : null;

  const titleEl = document.getElementById('habitEditorTitle');
  const nameInput = document.getElementById('habitNameField');
  const routineSelect = document.getElementById('habitRoutineField');
  const iconPreview = document.getElementById('habitDialogIconPreview');
  const errorEl = document.getElementById('habitEditorError');
  const searchInput = document.getElementById('habitDialogEmojiSearch');
  const customEmojiInput = document.getElementById('habitCustomEmojiField');

  if (titleEl) titleEl.textContent = habit ? 'Edit habit' : 'New habit';
  if (nameInput) nameInput.value = habit ? habit.name : '';
  if (routineSelect) routineSelect.value = habit ? habit.routine : 'morning';
  selectedHabitIcon = habit ? habit.icon : '✦';
  selectedSchedule = habit ? [...habit.schedule] : [0, 1, 2, 3, 4, 5, 6];
  if (iconPreview) iconPreview.textContent = selectedHabitIcon;
  if (errorEl) errorEl.textContent = '';
  if (searchInput) searchInput.value = '';
  if (customEmojiInput) customEmojiInput.value = '';
  activeEmojiCat = 'all';

  renderScheduleButtons();
  renderEmojiCategoryTabs();
  renderHabitEmojiGrid('');

  dialog.returnValue = '';
  dialog.showModal();
  nameInput?.focus();
}

function renderEmojiCategoryTabs() {
  const bar = document.getElementById('habitEmojiCatBar');
  if (!bar) return;
  bar.innerHTML = '';
  const cats = [{ id: 'all', label: 'All' }, ...EMOJI_CATEGORIES];
  for (const cat of cats) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-btn';
    btn.textContent = cat.label;
    btn.setAttribute('aria-pressed', String(cat.id === activeEmojiCat));
    btn.addEventListener('click', () => {
      activeEmojiCat = cat.id;
      renderEmojiCategoryTabs();
      renderHabitEmojiGrid(document.getElementById('habitDialogEmojiSearch')?.value || '');
    });
    bar.appendChild(btn);
  }
}

export function wireHabitEditorDialog() {
  const dialog = document.getElementById('habitEditorDialog');
  const form = document.getElementById('habitEditorForm');
  const nameInput = document.getElementById('habitNameField');
  const searchInput = document.getElementById('habitDialogEmojiSearch');
  const customEmojiInput = document.getElementById('habitCustomEmojiField');
  const autoIconBtn = document.getElementById('habitAutoIconBtn');

  // Populate routine select
  const routineSelect = document.getElementById('habitRoutineField');
  if (routineSelect && routineSelect.options.length === 0) {
    for (const r of ROUTINES) {
      routineSelect.add(new Option(r.label, r.id));
    }
  }

  // Schedule presets
  document.querySelectorAll('[data-schedule-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.dataset.schedulePreset;
      if (preset === 'daily') selectedSchedule = [0, 1, 2, 3, 4, 5, 6];
      else if (preset === 'weekdays') selectedSchedule = [1, 2, 3, 4, 5];
      else if (preset === 'weekends') selectedSchedule = [0, 6];
      else if (preset === 'mwf') selectedSchedule = [1, 3, 5];
      renderScheduleButtons();
    });
  });

  searchInput?.addEventListener('input', () => {
    renderHabitEmojiGrid(searchInput.value);
  });

  customEmojiInput?.addEventListener('input', () => {
    const val = sanitizeEmoji(customEmojiInput.value, '');
    if (val) {
      selectedHabitIcon = val;
      const preview = document.getElementById('habitDialogIconPreview');
      if (preview) preview.textContent = val;
    }
  });

  autoIconBtn?.addEventListener('click', () => {
    selectedHabitIcon = suggestHabitIcon(nameInput?.value || '');
    const preview = document.getElementById('habitDialogIconPreview');
    if (preview) preview.textContent = selectedHabitIcon;
    renderHabitEmojiGrid(searchInput?.value || '');
  });

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('habitEditorError');
    const name = nameInput?.value?.trim() || '';
    const routine = routineSelect?.value || 'anytime';
    const icon = sanitizeEmoji(selectedHabitIcon || suggestHabitIcon(name), '✦');

    const res = editingHabitId
      ? store.updateHabit(editingHabitId, { name, icon, routine, schedule: selectedSchedule })
      : store.addHabit({ name, icon, routine, schedule: selectedSchedule });

    if (res.error) {
      if (errorEl) errorEl.textContent = res.error;
      nameInput?.focus();
      return;
    }

    dialog?.close('saved');
    toast.success(editingHabitId ? `Updated "${res.habit.name}"` : `Added "${res.habit.name}"`);
  });

  document.getElementById('habitEditorCancel')?.addEventListener('click', () => {
    dialog?.close('cancel');
  });
  document.getElementById('habitEditorCancelFooter')?.addEventListener('click', () => {
    dialog?.close('cancel');
  });
}

// ── Studio Preferences Dialog ────────────────────────────────
export function openPreferencesDialog() {
  const dialog = document.getElementById('prefsDialog');
  if (!dialog) return;
  syncPrefsDialogUI();
  dialog.returnValue = '';
  dialog.showModal();
}

function syncPrefsDialogUI() {
  const p = store.prefs;
  document.querySelectorAll('[data-pref-appearance]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.prefAppearance === p.appearance));
  });
  document.querySelectorAll('[data-pref-ink]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.prefInk === p.ink));
  });
  document.querySelectorAll('[data-pref-week]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(Number(btn.dataset.prefWeek) === Number(p.weekStartsOn)));
  });

  const dotsCb = document.getElementById('prefPaperDots');
  if (dotsCb) dotsCb.checked = Boolean(p.paperDots);

  const mottoInput = document.getElementById('prefMottoInput');
  if (mottoInput) mottoInput.value = p.motto || '';

  const jTitleInput = document.getElementById('prefJournalTitleInput');
  if (jTitleInput) jTitleInput.value = p.journalTitle || 'Daily Note';
}

export function wirePreferencesDialog() {
  const dialog = document.getElementById('prefsDialog');

  document.querySelectorAll('[data-pref-appearance]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.updatePrefs({ appearance: btn.dataset.prefAppearance });
      syncPrefsDialogUI();
    });
  });

  document.querySelectorAll('[data-pref-ink]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.updatePrefs({ ink: btn.dataset.prefInk });
      syncPrefsDialogUI();
    });
  });

  document.querySelectorAll('[data-pref-week]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.updatePrefs({ weekStartsOn: Number(btn.dataset.prefWeek) });
      syncPrefsDialogUI();
    });
  });

  document.getElementById('prefPaperDots')?.addEventListener('change', (e) => {
    store.updatePrefs({ paperDots: Boolean(e.target.checked) });
  });

  document.getElementById('prefsForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const motto = (document.getElementById('prefMottoInput')?.value || '').trim().slice(0, 140);
    const journalTitle = (document.getElementById('prefJournalTitleInput')?.value || '').trim().slice(0, 40) || 'Daily Note';
    store.updatePrefs({ motto, journalTitle });
    dialog?.close('saved');
    toast.success('Studio preferences saved');
  });

  document.getElementById('prefsCloseBtn')?.addEventListener('click', () => {
    dialog?.close('cancel');
  });
}

// ── Archive Manager Dialog ───────────────────────────────────
export function openArchiveDialog() {
  const dialog = document.getElementById('archiveDialog');
  if (!dialog) return;
  renderArchiveList();
  dialog.returnValue = '';
  dialog.showModal();
}

function renderArchiveList() {
  const list = document.getElementById('archiveList');
  if (!list) return;
  const archived = store.habits.filter((h) => h.archived);
  list.innerHTML = '';

  if (archived.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No archived habits. Archiving hides a habit from today while preserving all past marks and streaks.';
    list.appendChild(empty);
    return;
  }

  for (const h of archived) {
    const row = document.createElement('div');
    row.className = 'habit-card';

    const info = document.createElement('div');
    info.className = 'habit-card-label';
    info.style.cursor = 'default';

    const emo = document.createElement('span');
    emo.className = 'habit-card-emoji';
    emo.textContent = h.icon;
    emo.setAttribute('aria-hidden', 'true');

    const title = document.createElement('span');
    title.className = 'habit-card-name';
    title.textContent = h.name;

    info.append(emo, title);

    const actions = document.createElement('div');
    actions.className = 'habit-card-actions';

    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'btn btn-soft';
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', () => {
      store.archiveHabit(h.id, false);
      renderArchiveList();
      toast.success(`Restored "${h.name}"`);
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-danger-outline';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      const ok = await confirmAction({
        title: `Delete "${h.name}" permanently?`,
        message: 'This will remove the habit and all of its historical check-ins.',
        confirmLabel: 'Delete permanently',
        destructive: true
      });
      if (!ok) return;
      const snap = store.deleteHabit(h.id);
      renderArchiveList();
      if (snap) {
        toast.info(`Deleted "${h.name}"`, {
          actionLabel: 'Undo',
          onAction: () => {
            store.undo(snap.id);
            renderArchiveList();
          }
        });
      }
    });

    actions.append(restoreBtn, delBtn);
    row.append(info, actions);
    list.appendChild(row);
  }
}

export function wireArchiveDialog() {
  const dialog = document.getElementById('archiveDialog');
  document.getElementById('archiveCloseBtn')?.addEventListener('click', () => dialog?.close());
}

// ── Safe Sign-Out Choice Dialog (Shared-Device Safety) ───────
export function openSignOutChoiceDialog(email) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('signOutDialog');
    if (!dialog) {
      resolve('keep');
      return;
    }
    const emailEl = document.getElementById('signOutEmailLabel');
    if (emailEl) emailEl.textContent = email || 'your account';

    dialog.addEventListener('close', () => {
      const val = dialog.returnValue;
      dialog.returnValue = '';
      resolve(val || 'cancel');
    }, { once: true });

    dialog.returnValue = '';
    dialog.showModal();
    document.getElementById('signOutCancelBtn')?.focus();
  });
}
