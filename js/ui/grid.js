// ============================================================
// DAYMARK — MONTHLY GRID VIEW (Calendar-Aligned & Accessible)
// Incremental cell toggles, touch/keyboard row actions, rest days.
// ============================================================

import { store } from '../store.js';
import {
  getDaysInMonth,
  getCalendarWeeks,
  isHabitScheduledOnDow,
  todayDateKey,
  formatDateKey
} from '../streaks.js';
import { openHabitDialog, confirmAction } from './dialogs.js';
import { openDayNoteDialog, focusGridJournalDay } from './journal.js';
import { toast } from './toast.js';

const MONTH_LONG_FMT = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const DOW_SHORT_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

function renderCellVisual(btn, habitName, day, state, scheduled) {
  btn.dataset.state = state || '';
  btn.classList.toggle('is-off-day', !scheduled);

  if (state === 'done') {
    btn.setAttribute('aria-pressed', 'true');
    btn.setAttribute('aria-label', `${habitName}, day ${day} — Completed`);
    btn.innerHTML = `<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  } else if (state === 'rest') {
    btn.setAttribute('aria-pressed', 'mixed');
    btn.setAttribute('aria-label', `${habitName}, day ${day} — Rest day (streak protected)`);
    btn.innerHTML = `<svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
  } else {
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', `${habitName}, day ${day} — ${scheduled ? 'Not marked' : 'Unscheduled day'}`);
    btn.textContent = '';
  }
}

export function renderMonthlyGrid() {
  const year = store.currentYear;
  const month = store.currentMonth;
  const totalDays = getDaysInMonth(year, month);
  const realToday = todayDateKey();
  const monthData = store.getMonthData(year, month);
  const activeHabits = store.habits.filter((h) => !h.archived);

  const titleEl = document.getElementById('gridPanelTitleText');
  if (titleEl) {
    titleEl.textContent = MONTH_LONG_FMT.format(new Date(year, month, 1));
  }

  const thead = document.getElementById('gridTableHead');
  const tbody = document.getElementById('gridTableBody');
  const wellBody = document.getElementById('gridWellnessBody');
  if (!thead || !tbody || !wellBody) return;

  thead.innerHTML = '';
  tbody.innerHTML = '';
  wellBody.innerHTML = '';

  // ── Row 1: Real Calendar Week Groupings ──
  const trWeeks = document.createElement('tr');
  const thCorner = document.createElement('th');
  thCorner.className = 'sticky-left week-header-cell';
  thCorner.scope = 'col';
  thCorner.textContent = 'Calendar Weeks';
  trWeeks.appendChild(thCorner);

  const weeks = getCalendarWeeks(year, month, store.prefs.weekStartsOn);
  weeks.forEach((wk, i) => {
    const th = document.createElement('th');
    th.colSpan = wk.span;
    th.className = 'week-header-cell';
    th.scope = 'colgroup';
    th.textContent = wk.span >= 3 ? `Wk ${i + 1} · ${wk.startDay}–${wk.endDay}` : `W${i + 1}`;
    trWeeks.appendChild(th);
  });
  thead.appendChild(trWeeks);

  // ── Row 2: Individual Day Headers ──
  const trDays = document.createElement('tr');
  const thHabitCol = document.createElement('th');
  thHabitCol.className = 'sticky-left';
  thHabitCol.scope = 'col';
  thHabitCol.textContent = 'Habit';
  trDays.appendChild(thHabitCol);

  const dayMeta = [];
  for (let d = 1; d <= totalDays; d++) {
    const dt = new Date(year, month, d);
    const dow = dt.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isToday = formatDateKey(year, month, d) === realToday;
    const hasNote = Boolean(monthData.journal[d]?.trim());
    dayMeta.push({ d, dow, isWeekend, isToday, hasNote });

    const th = document.createElement('th');
    th.scope = 'col';
    if (isToday) th.classList.add('today-col');
    if (isWeekend) th.classList.add('weekend-col');

    const dayBtn = document.createElement('button');
    dayBtn.type = 'button';
    dayBtn.className = 'day-header-btn';
    dayBtn.setAttribute('aria-label', `Day ${d}${isToday ? ' (Today)' : ''}${hasNote ? ', has reflection note' : ''}. Open daily note.`);

    const dowEl = document.createElement('span');
    dowEl.className = 'day-dow';
    dowEl.textContent = DOW_SHORT_FMT.format(dt).slice(0, 2);

    const numEl = document.createElement('span');
    numEl.className = 'day-num';
    numEl.textContent = String(d);
    if (hasNote) {
      const dot = document.createElement('span');
      dot.className = 'note-dot';
      dot.setAttribute('aria-hidden', 'true');
      numEl.appendChild(dot);
    }

    dayBtn.append(dowEl, numEl);
    dayBtn.addEventListener('click', () => openDayNoteDialog(d));
    th.appendChild(dayBtn);
    trDays.appendChild(th);
  }
  thead.appendChild(trDays);

  // ── Habit Rows ──
  if (activeHabits.length === 0) {
    const trEmpty = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = totalDays + 1;
    td.className = 'empty-state';
    td.textContent = 'No active habits yet. Add one below to begin your monthly grid.';
    trEmpty.appendChild(td);
    tbody.appendChild(trEmpty);
  } else {
    activeHabits.forEach((habit, idx) => {
      const tr = document.createElement('tr');
      const thRow = document.createElement('th');
      thRow.scope = 'row';
      thRow.className = 'sticky-left';

      const cellWrap = document.createElement('div');
      cellWrap.className = 'grid-habit-row-cell';

      const ident = document.createElement('div');
      ident.className = 'grid-habit-ident';

      const emo = document.createElement('span');
      emo.className = 'grid-habit-emoji';
      emo.textContent = habit.icon || '✦';
      emo.setAttribute('aria-hidden', 'true');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'grid-habit-name privacy-sensitive';
      nameSpan.textContent = habit.name;
      nameSpan.title = habit.name;

      ident.append(emo, nameSpan);

      const tools = document.createElement('div');
      tools.className = 'grid-row-tools';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'icon-btn';
      editBtn.setAttribute('aria-label', `Edit ${habit.name}`);
      editBtn.title = 'Edit habit, icon & schedule';
      editBtn.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
      editBtn.addEventListener('click', () => openHabitDialog(habit.id));

      const menuId = `row-menu-${habit.id}`;
      const moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = 'icon-btn';
      moreBtn.setAttribute('popovertarget', menuId);
      moreBtn.setAttribute('aria-label', `More actions for ${habit.name}`);
      moreBtn.title = `More actions for ${habit.name}`;
      moreBtn.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`;

      const rowPop = document.createElement('div');
      rowPop.id = menuId;
      rowPop.className = 'menu-popover';
      rowPop.setAttribute('popover', 'auto');
      rowPop.setAttribute('aria-label', `Actions for ${habit.name}`);

      const closeRowPop = () => {
        try {
          if (typeof rowPop.hidePopover === 'function') rowPop.hidePopover();
          else rowPop.classList.remove(':popover-open');
        } catch {
          rowPop.classList.remove(':popover-open');
        }
      };

      const makeRowItem = (label, onClick, { disabled = false, danger = false } = {}) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `popover-item${danger ? ' popover-item-danger' : ''}`;
        item.textContent = label;
        item.disabled = disabled;
        item.addEventListener('click', () => {
          closeRowPop();
          onClick();
        });
        return item;
      };

      rowPop.append(
        makeRowItem('Move up', () => store.moveHabit(habit.id, -1), { disabled: idx === 0 }),
        makeRowItem('Move down', () => store.moveHabit(habit.id, 1), { disabled: idx === activeHabits.length - 1 }),
        makeRowItem('Archive habit (keeps history)', () => {
          const snap = store.archiveHabit(habit.id, true);
          if (snap) {
            toast.info(`Archived "${habit.name}"`, {
              actionLabel: 'Undo',
              onAction: () => store.undo(snap.id)
            });
          }
        }),
        makeRowItem(`Delete "${habit.name}"…`, async () => {
          const ok = await confirmAction({
            title: `Delete "${habit.name}"?`,
            message: 'This removes the habit and its check-ins across months. You can also archive it instead to keep your past history.',
            confirmLabel: 'Delete habit',
            destructive: true
          });
          if (!ok) return;
          const snap = store.deleteHabit(habit.id);
          if (snap) {
            toast.info(`Deleted "${habit.name}"`, {
              actionLabel: 'Undo',
              onAction: () => store.undo(snap.id)
            });
          }
        }, { danger: true })
      );

      tools.append(editBtn, moreBtn, rowPop);
      cellWrap.append(ident, tools);
      thRow.appendChild(cellWrap);
      tr.appendChild(thRow);

      for (const meta of dayMeta) {
        const td = document.createElement('td');
        const scheduled = isHabitScheduledOnDow(habit, meta.dow);
        if (meta.isToday) td.classList.add('today-col');
        if (meta.isWeekend) td.classList.add('weekend-col');
        if (!scheduled) td.classList.add('unscheduled-cell');

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'grid-cell-btn';
        btn.dataset.habitId = habit.id;
        btn.dataset.day = String(meta.d);

        const state = monthData.habits[`${habit.id}-${meta.d}`] || null;
        renderCellVisual(btn, habit.name, meta.d, state, scheduled);

        btn.addEventListener('click', (e) => {
          const next = e.shiftKey
            ? store.toggleHabitRest(habit.id, year, month, meta.d)
            : store.toggleHabitDone(habit.id, year, month, meta.d);
          renderCellVisual(btn, habit.name, meta.d, next, scheduled);
        });

        btn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const next = store.toggleHabitRest(habit.id, year, month, meta.d);
          renderCellVisual(btn, habit.name, meta.d, next, scheduled);
          if (next === 'rest') {
            toast.info(`Marked rest day on day ${meta.d} — streak stays protected.`);
          }
        });

        td.appendChild(btn);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
  }

  // ── Wellness Section Divider ──
  const trDiv = document.createElement('tr');
  trDiv.className = 'grid-section-divider';
  const tdDivL = document.createElement('td');
  tdDivL.className = 'sticky-left';
  tdDivL.textContent = 'Wellness & Daily Notes';
  const tdDivR = document.createElement('td');
  tdDivR.colSpan = totalDays;
  trDiv.append(tdDivL, tdDivR);
  wellBody.appendChild(trDiv);

  // Mood Row (1-10) & Sleep Row (3.0 - 12.0 in 0.5h steps — matches Today View!)
  const wellnessRows = [
    {
      label: 'Mood (1–10)',
      key: 'Mood',
      options: Array.from({ length: 10 }, (_, i) => [String(i + 1), String(i + 1)])
    },
    {
      label: 'Sleep (hrs)',
      key: 'Hours of Sleep',
      options: Array.from({ length: 19 }, (_, i) => {
        const val = 3 + i * 0.5;
        return [String(val), String(val)];
      })
    }
  ];

  for (const rowDef of wellnessRows) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.className = 'sticky-left';
    th.style.fontSize = '0.78rem';
    th.style.color = 'var(--text-secondary)';
    th.textContent = rowDef.label;
    tr.appendChild(th);

    for (const meta of dayMeta) {
      const td = document.createElement('td');
      if (meta.isToday) td.classList.add('today-col');
      if (meta.isWeekend) td.classList.add('weekend-col');

      const sel = document.createElement('select');
      sel.className = 'grid-wellness-select';
      sel.setAttribute('aria-label', `${rowDef.label} for day ${meta.d}`);
      sel.add(new Option('·', ''));
      for (const [labelText, val] of rowDef.options) {
        sel.add(new Option(labelText, val));
      }
      const existing = monthData.moodSleep[`${rowDef.key}-${meta.d}`];
      if (existing !== undefined) sel.value = String(existing);

      sel.addEventListener('change', () => {
        store.setWellnessMetric(rowDef.key, year, month, meta.d, sel.value);
      });

      td.appendChild(sel);
      tr.appendChild(td);
    }
    wellBody.appendChild(tr);
  }

  // Daily Note Quick Row
  const trNote = document.createElement('tr');
  const thNote = document.createElement('th');
  thNote.scope = 'row';
  thNote.className = 'sticky-left';
  thNote.style.fontSize = '0.78rem';
  thNote.style.color = 'var(--accent)';
  thNote.textContent = store.prefs.journalTitle || 'Daily Note';
  trNote.appendChild(thNote);

  for (const meta of dayMeta) {
    const td = document.createElement('td');
    if (meta.isToday) td.classList.add('today-col');
    if (meta.isWeekend) td.classList.add('weekend-col');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'grid-cell-btn';
    btn.dataset.state = meta.hasNote ? 'done' : '';
    btn.setAttribute('aria-label', meta.hasNote ? `Edit note for day ${meta.d}` : `Add note for day ${meta.d}`);
    btn.textContent = meta.hasNote ? '✎' : '+';
    btn.style.color = meta.hasNote ? 'var(--accent-text)' : 'var(--text-muted)';
    btn.style.fontSize = '0.75rem';
    btn.addEventListener('click', () => focusGridJournalDay(meta.d));
    td.appendChild(btn);
    trNote.appendChild(td);
  }
  wellBody.appendChild(trNote);
}

export function wireGridAddForm() {
  const form = document.getElementById('gridAddHabitForm');
  const input = document.getElementById('gridNewHabitInput');
  const errEl = document.getElementById('gridAddError');

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const res = store.addHabit({ name: input?.value || '' });
    if (res.error) {
      if (errEl) errEl.textContent = res.error;
      return;
    }
    if (input) input.value = '';
    if (errEl) errEl.textContent = '';
    toast.success(`Added "${res.habit.name}"`);
  });
}
