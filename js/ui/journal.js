// ============================================================
// DAYMARK — UNIFIED DAILY NOTE & REFLECTION ENGINE
// Single controller for Today View, Grid Journal & Day Inspector.
// ============================================================

import { store, DEFAULT_PROMPTS } from '../store.js';
import { getDaysInMonth, parseDateKey, todayDateKey } from '../streaks.js';
import { safeId } from '../security.js';

let todaySaveTimer = null;
let todayPendingSave = null;
let gridSaveTimer = null;
let gridPendingSave = null;
const indicatorTimers = new Map();
let inspectorDay = null;
let searchQuery = '';
let lastRenderedTodayKey = null;
let lastRenderedGridKey = null;

const FULL_DATE_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric'
});

function renderPromptPills(containerId, targetTextareaId, getContextDay) {
  const host = document.getElementById(containerId);
  if (!host) return;
  host.innerHTML = '';

  const pills = store.prefs.journalPills || [];

  for (const pill of pills) {
    const wrap = document.createElement('span');
    wrap.className = 'prompt-pill-wrap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'prompt-pill-btn';
    btn.textContent = pill.label;
    btn.addEventListener('click', () => {
      const ta = document.getElementById(targetTextareaId);
      if (!ta) return;
      const prefix = pill.prefix || `${pill.label}: `;
      ta.value = ta.value && !ta.value.endsWith('\n') ? `${ta.value}\n${prefix}` : `${ta.value}${prefix}`;
      ta.focus();
      ta.selectionStart = ta.selectionEnd = ta.value.length;
      const ctx = getContextDay();
      if (ctx) {
        store.setJournalEntry(ctx.year, ctx.month, ctx.day, ta.value);
        flashSavedIndicator(containerId === 'todayJournalPills' ? 'todayJournalStatus' : 'gridJournalStatus');
      }
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'prompt-pill-del';
    del.textContent = '×';
    del.setAttribute('aria-label', `Remove ${pill.label} prompt`);
    del.addEventListener('click', () => {
      store.updatePrefs({ journalPills: pills.filter((p) => p.id !== pill.id) });
    });

    wrap.append(btn, del);
    host.appendChild(wrap);
  }

  // Inline "+ Prompt" trigger
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'chip-btn';
  addBtn.textContent = '+ Tag';
  addBtn.addEventListener('click', () => {
    addBtn.classList.add('hidden');
    inlineForm.classList.remove('hidden');
    inlineInput.focus();
  });

  const inlineForm = document.createElement('form');
  inlineForm.className = 'hidden';
  inlineForm.style.display = 'inline-flex';
  inlineForm.style.gap = '4px';
  inlineForm.style.alignItems = 'center';

  const inlineInput = document.createElement('input');
  inlineInput.type = 'text';
  inlineInput.className = 'form-input';
  inlineInput.style.width = '135px';
  inlineInput.style.padding = '3px 8px';
  inlineInput.style.minBlockSize = '28px';
  inlineInput.maxLength = 24;
  inlineInput.placeholder = 'e.g. Gratitude…';
  inlineInput.setAttribute('aria-label', 'New reflection tag');

  const okBtn = document.createElement('button');
  okBtn.type = 'submit';
  okBtn.className = 'btn btn-primary';
  okBtn.style.padding = '4px 10px';
  okBtn.style.minBlockSize = '28px';
  okBtn.textContent = 'Add';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-ghost';
  cancelBtn.style.padding = '4px 8px';
  cancelBtn.style.minBlockSize = '28px';
  cancelBtn.textContent = '✕';
  cancelBtn.setAttribute('aria-label', 'Cancel new tag');
  cancelBtn.addEventListener('click', () => {
    inlineForm.classList.add('hidden');
    addBtn.classList.remove('hidden');
  });

  inlineInput.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Escape') {
      inlineForm.classList.add('hidden');
      addBtn.classList.remove('hidden');
    }
  });

  inlineForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = inlineInput.value.trim();
    if (!raw) {
      inlineForm.classList.add('hidden');
      addBtn.classList.remove('hidden');
      return;
    }
    const hasEmoji = /\p{Extended_Pictographic}/u.test(raw);
    const label = hasEmoji ? raw : `✦ ${raw}`;
    store.updatePrefs({
      journalPills: [...pills, { id: safeId('p'), label, prefix: `${label}: ` }]
    });
  });

  inlineForm.append(inlineInput, okBtn, cancelBtn);
  host.append(addBtn, inlineForm);

  if (pills.length === 0) {
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'chip-btn';
    resetBtn.textContent = '↺ Restore defaults';
    resetBtn.addEventListener('click', () => {
      store.updatePrefs({ journalPills: DEFAULT_PROMPTS.map((p) => ({ ...p })) });
    });
    host.appendChild(resetBtn);
  }
}

function flashSavedIndicator(id) {
  const el = document.getElementById(id);
  if (!el) return;
  clearTimeout(indicatorTimers.get(id));
  el.textContent = 'Saved ✓';
  el.style.color = 'var(--success)';
  indicatorTimers.set(id, setTimeout(() => {
    el.textContent = 'Auto-saved';
    el.style.color = '';
  }, 1600));
}

export function renderJournalUI() {
  const title = store.prefs.journalTitle || 'Daily Note';
  const todayTitleEl = document.getElementById('todayJournalTitle');
  const gridTitleEl = document.getElementById('gridJournalTitle');
  if (todayTitleEl) todayTitleEl.textContent = title;
  if (gridTitleEl) gridTitleEl.textContent = title;

  // 1. Today view journal
  const tParsed = parseDateKey(store.activeTodayKey);
  const tMonthData = store.getMonthData(tParsed.year, tParsed.month);
  const todayInput = document.getElementById('todayJournalInput');
  const todayDayChanged = lastRenderedTodayKey !== store.activeTodayKey;
  lastRenderedTodayKey = store.activeTodayKey;
  if (todayInput && (todayDayChanged || document.activeElement !== todayInput)) {
    todayInput.value = tMonthData.journal[tParsed.day] || '';
  }
  renderPromptPills('todayJournalPills', 'todayJournalInput', () => parseDateKey(store.activeTodayKey));

  // 2. Grid view journal
  const y = store.currentYear;
  const m = store.currentMonth;
  const totalDays = getDaysInMonth(y, m);
  if (store.gridJournalDay < 1 || store.gridJournalDay > totalDays) {
    const now = new Date();
    store.gridJournalDay = (now.getFullYear() === y && now.getMonth() === m) ? now.getDate() : 1;
  }

  const gData = store.getMonthData(y, m);
  const daySelect = document.getElementById('gridJournalDaySelect');
  if (daySelect) {
    const realToday = parseDateKey(todayDateKey());
    const isThisMonth = realToday.year === y && realToday.month === m;
    daySelect.innerHTML = '';
    for (let d = 1; d <= totalDays; d++) {
      const hasNote = Boolean(gData.journal[d]?.trim());
      const lbl = `Day ${d}${isThisMonth && d === realToday.day ? ' (Today)' : ''}${hasNote ? ' • ✎' : ''}`;
      const opt = new Option(lbl, String(d));
      if (d === store.gridJournalDay) opt.selected = true;
      daySelect.add(opt);
    }
  }

  const headingEl = document.getElementById('gridJournalDayHeading');
  if (headingEl) {
    headingEl.textContent = FULL_DATE_FMT.format(new Date(y, m, store.gridJournalDay));
  }

  const gridInput = document.getElementById('gridJournalInput');
  const gridKey = `${y}-${m}-${store.gridJournalDay}`;
  const gridDayChanged = lastRenderedGridKey !== gridKey;
  lastRenderedGridKey = gridKey;
  if (gridInput && (gridDayChanged || document.activeElement !== gridInput)) {
    gridInput.value = gData.journal[store.gridJournalDay] || '';
  }

  renderPromptPills('gridJournalPills', 'gridJournalInput', () => ({
    year: store.currentYear,
    month: store.currentMonth,
    day: store.gridJournalDay
  }));

  if (document.getElementById('dayNoteDialog')?.open) {
    renderPromptPills('dayNoteDialogPills', 'dayNoteDialogInput', () => null);
  }

  renderLoggedNotesChips(y, m, gData);
}

function renderLoggedNotesChips(year, month, monthData) {
  const host = document.getElementById('gridJournalChips');
  if (!host) return;
  host.innerHTML = '';

  const totalDays = getDaysInMonth(year, month);
  const q = searchQuery.trim().toLowerCase();
  let matched = 0;

  for (let d = 1; d <= totalDays; d++) {
    const text = monthData.journal[d];
    if (!text?.trim()) continue;
    if (q && !text.toLowerCase().includes(q) && !`day ${d}`.includes(q)) continue;
    matched++;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `journal-chip privacy-sensitive ${d === store.gridJournalDay ? 'active' : ''}`;

    const dayStrong = document.createElement('strong');
    dayStrong.style.color = 'var(--accent)';
    dayStrong.textContent = `Day ${d}:`;

    const snippet = document.createElement('span');
    snippet.textContent = text.replace(/\s+/g, ' ').slice(0, 38);

    btn.append(dayStrong, snippet);
    btn.addEventListener('click', () => focusGridJournalDay(d));
    host.appendChild(btn);
  }

  if (matched === 0) {
    const empty = document.createElement('span');
    empty.className = 'muted';
    empty.style.fontSize = '0.78rem';
    empty.textContent = q ? `No notes matching "${searchQuery}".` : 'No notes logged for this month yet.';
    host.appendChild(empty);
  }
}

export function focusGridJournalDay(day) {
  store.gridJournalDay = day;
  renderJournalUI();
  const panel = document.getElementById('gridJournalPanel');
  panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  document.getElementById('gridJournalInput')?.focus();
}

export function openDayNoteDialog(day) {
  inspectorDay = day;
  const dialog = document.getElementById('dayNoteDialog');
  if (!dialog) return;

  const y = store.currentYear;
  const m = store.currentMonth;
  const data = store.getMonthData(y, m);

  const titleEl = document.getElementById('dayNoteDialogTitle');
  const subEl = document.getElementById('dayNoteDialogSub');
  const ta = document.getElementById('dayNoteDialogInput');

  if (titleEl) titleEl.textContent = store.prefs.journalTitle || 'Daily Note';
  if (subEl) subEl.textContent = FULL_DATE_FMT.format(new Date(y, m, day));
  if (ta) ta.value = data.journal[day] || '';

  renderPromptPills('dayNoteDialogPills', 'dayNoteDialogInput', () => null);
  dialog.returnValue = '';
  dialog.showModal();
  ta?.focus();
}

function flushTodayPendingSave() {
  clearTimeout(todaySaveTimer);
  if (!todayPendingSave) return;
  const { year, month, day, value } = todayPendingSave;
  todayPendingSave = null;
  store.setJournalEntry(year, month, day, value);
  flashSavedIndicator('todayJournalStatus');
}

function flushGridPendingSave() {
  clearTimeout(gridSaveTimer);
  if (!gridPendingSave) return;
  const { year, month, day, value } = gridPendingSave;
  gridPendingSave = null;
  store.setJournalEntry(year, month, day, value);
  flashSavedIndicator('gridJournalStatus');
}

export function flushPendingJournalSaves() {
  flushTodayPendingSave();
  flushGridPendingSave();
}

export function wireJournalControls() {
  const todayInput = document.getElementById('todayJournalInput');
  todayInput?.addEventListener('input', () => {
    const { year, month, day } = parseDateKey(store.activeTodayKey);
    todayPendingSave = { year, month, day, value: todayInput.value };
    clearTimeout(todaySaveTimer);
    todaySaveTimer = setTimeout(flushTodayPendingSave, 350);
  });
  todayInput?.addEventListener('blur', flushTodayPendingSave);

  const gridInput = document.getElementById('gridJournalInput');
  gridInput?.addEventListener('input', () => {
    gridPendingSave = {
      year: store.currentYear,
      month: store.currentMonth,
      day: store.gridJournalDay,
      value: gridInput.value
    };
    clearTimeout(gridSaveTimer);
    gridSaveTimer = setTimeout(flushGridPendingSave, 350);
  });
  gridInput?.addEventListener('blur', flushGridPendingSave);

  document.getElementById('gridJournalDaySelect')?.addEventListener('change', (e) => {
    flushGridPendingSave();
    store.gridJournalDay = Number(e.target.value) || 1;
    renderJournalUI();
  });

  document.getElementById('gridJournalPrevBtn')?.addEventListener('click', () => {
    flushGridPendingSave();
    const max = getDaysInMonth(store.currentYear, store.currentMonth);
    store.gridJournalDay = store.gridJournalDay <= 1 ? max : store.gridJournalDay - 1;
    renderJournalUI();
  });

  document.getElementById('gridJournalNextBtn')?.addEventListener('click', () => {
    flushGridPendingSave();
    const max = getDaysInMonth(store.currentYear, store.currentMonth);
    store.gridJournalDay = store.gridJournalDay >= max ? 1 : store.gridJournalDay + 1;
    renderJournalUI();
  });

  document.getElementById('gridJournalTodayBtn')?.addEventListener('click', () => {
    flushGridPendingSave();
    const now = new Date();
    const isSame = now.getFullYear() === store.currentYear && now.getMonth() === store.currentMonth;
    store.gridJournalDay = isSame ? now.getDate() : 1;
    renderJournalUI();
  });

  document.getElementById('gridJournalSearch')?.addEventListener('input', (e) => {
    searchQuery = e.target.value || '';
    renderLoggedNotesChips(store.currentYear, store.currentMonth, store.getMonthData());
  });

  // Day Note Inspector Dialog
  const dialog = document.getElementById('dayNoteDialog');
  document.getElementById('dayNoteDialogForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (inspectorDay !== null) {
      const val = document.getElementById('dayNoteDialogInput')?.value || '';
      store.setJournalEntry(store.currentYear, store.currentMonth, inspectorDay, val);
    }
    dialog?.close('saved');
  });
  document.getElementById('dayNoteDialogCancel')?.addEventListener('click', () => {
    dialog?.close('cancel');
  });
}
