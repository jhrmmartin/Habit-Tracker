// ============================================================
// DAYMARK — TODAY VIEW (Calm Daily Check-In Deck)
// ============================================================

import { store, ROUTINES, STARTER_PACKS } from '../store.js';
import {
  parseDateKey,
  shiftDateKey,
  todayDateKey,
  getDayOfWeekFromKey,
  isHabitScheduledOnDow,
  computeHabitStreaks
} from '../streaks.js';
import { openHabitDialog } from './dialogs.js';
import { startGuidedTour, openGuideDialog } from './tour.js';
import { toast } from './toast.js';

const MOOD_LABELS = {
  1: 'Drained',
  2: 'Heavy',
  3: 'Low',
  4: 'Tender',
  5: 'Steady',
  6: 'Okay',
  7: 'Good',
  8: 'Bright',
  9: 'Energized',
  10: 'Peak'
};

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric'
});

const CHECKLIST_ITEMS = [
  { key: 'stamped', label: 'Stamp your first habit on today’s deck' },
  { key: 'rested', label: 'Try a streak-safe Rest Day (moon icon)' },
  { key: 'reflected', label: 'Log Mood, Sleep, or a quick Daily Note' },
  { key: 'explored', label: 'Explore Monthly Grid, Guide, or Preferences' }
];

function renderStarterBanner() {
  const host = document.getElementById('starterBannerSlot');
  if (!host) return;
  host.innerHTML = '';

  if (store.prefs.starterDismissed) {
    host.classList.add('hidden');
    return;
  }
  host.classList.remove('hidden');

  const progress = store.prefs.onboarding || {};
  const doneCount = CHECKLIST_ITEMS.filter((item) => progress[item.key]).length;
  const allDone = doneCount === CHECKLIST_ITEMS.length;

  const banner = document.createElement('section');
  banner.className = 'starter-banner';
  banner.setAttribute('aria-label', 'Getting started with Daymark');

  const top = document.createElement('div');
  top.className = 'starter-banner-top';

  const copy = document.createElement('div');
  const h2 = document.createElement('h2');
  h2.textContent = allDone
    ? 'You’ve explored Daymark — your rhythm is ready'
    : 'Welcome to Daymark — start at your own pace';
  const p = document.createElement('p');
  p.textContent = allDone
    ? 'Everything saves privately on your device. Hide this welcome card anytime—the Guide stays in the ? menu.'
    : 'No account needed. Take a 2-minute interactive walkthrough, follow the quick checklist, or swap starter habits below.';
  copy.append(h2, p);

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.className = 'icon-btn';
  dismissBtn.setAttribute('aria-label', 'Dismiss welcome guide');
  dismissBtn.title = 'Hide welcome card';
  dismissBtn.textContent = '✕';
  dismissBtn.addEventListener('click', () => {
    store.updatePrefs({ starterDismissed: true }, false);
    renderStarterBanner();
  });

  top.append(copy, dismissBtn);

  // Action row: Hands-On Interactive Guide + Complete Reference Manual
  const ctaRow = document.createElement('div');
  ctaRow.className = 'welcome-cta-row';

  const tourBtn = document.createElement('button');
  tourBtn.type = 'button';
  tourBtn.id = 'welcomeStartTourBtn';
  tourBtn.className = 'btn btn-primary';
  tourBtn.textContent = 'Start 2-Minute Hands-On Guide';
  tourBtn.addEventListener('click', () => startGuidedTour(0));

  const manualBtn = document.createElement('button');
  manualBtn.type = 'button';
  manualBtn.id = 'welcomeOpenGuideBtn';
  manualBtn.className = 'btn';
  manualBtn.textContent = 'Read User Guide & Shortcuts';
  manualBtn.addEventListener('click', () => openGuideDialog('basics'));

  ctaRow.append(tourBtn, manualBtn);

  if (allDone) {
    const hideBtn = document.createElement('button');
    hideBtn.type = 'button';
    hideBtn.className = 'btn btn-soft';
    hideBtn.textContent = 'All set — hide welcome card';
    hideBtn.addEventListener('click', () => {
      store.updatePrefs({ starterDismissed: true }, false);
      renderStarterBanner();
    });
    ctaRow.appendChild(hideBtn);
  }

  // Live 4-Step Getting-Started Checklist
  const checklistBox = document.createElement('div');
  checklistBox.className = 'onboarding-checklist-box';

  const checkHead = document.createElement('div');
  checkHead.className = 'onboarding-checklist-head';
  const checkTitle = document.createElement('span');
  checkTitle.className = 'form-label';
  checkTitle.textContent = 'Getting Started Checklist';
  const checkBadge = document.createElement('span');
  checkBadge.className = 'today-score-badge';
  checkBadge.textContent = `${doneCount} / ${CHECKLIST_ITEMS.length} explored`;
  checkHead.append(checkTitle, checkBadge);

  const checkList = document.createElement('ul');
  checkList.className = 'onboarding-checklist';
  for (const item of CHECKLIST_ITEMS) {
    const li = document.createElement('li');
    const checked = Boolean(progress[item.key]);
    li.className = checked ? 'is-done' : '';
    const mark = document.createElement('span');
    mark.className = 'onboarding-check-dot';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = checked ? '✓' : '';
    const text = document.createElement('span');
    text.textContent = item.label;
    li.append(mark, text);
    checkList.appendChild(li);
  }
  checklistBox.append(checkHead, checkList);

  // Starter Pack Picker
  const packLabel = document.createElement('div');
  packLabel.className = 'form-label';
  packLabel.textContent = 'Or switch your starter habits in 1 click:';

  const grid = document.createElement('div');
  grid.className = 'starter-packs-grid';

  for (const [packId, pack] of Object.entries(STARTER_PACKS)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'starter-pack-btn';
    const isSelected = (store.prefs.activeStarterPack || 'everyday') === packId;
    btn.setAttribute('aria-pressed', String(isSelected));

    const title = document.createElement('span');
    title.className = 'starter-pack-title';
    title.textContent = pack.title;

    const desc = document.createElement('span');
    desc.className = 'starter-pack-desc';
    desc.textContent = pack.desc;

    btn.append(title, desc);
    btn.addEventListener('click', () => {
      const snap = store.applyStarterPack(packId);
      toast.success(`Loaded "${pack.title}"`, {
        actionLabel: 'Undo',
        onAction: () => {
          if (snap) store.undo(snap.id);
        }
      });
    });
    grid.appendChild(btn);
  }

  banner.append(top, ctaRow, checklistBox, packLabel, grid);
  host.appendChild(banner);
}

export function renderTodayView() {
  renderStarterBanner();

  const activeKey = store.activeTodayKey;
  const realTodayKey = todayDateKey();
  const { year, month, day } = parseDateKey(activeKey);
  const dow = getDayOfWeekFromKey(activeKey);
  const dt = new Date(year, month, day);
  const isRealToday = activeKey === realTodayKey;

  // Date label & Jump to Today button
  const dateLabel = document.getElementById('todayDateLabel');
  if (dateLabel) {
    dateLabel.textContent = isRealToday ? `Today · ${DATE_FMT.format(dt)}` : DATE_FMT.format(dt);
  }
  const jumpBtn = document.getElementById('todayJumpNowBtn');
  if (jumpBtn) {
    jumpBtn.classList.toggle('hidden', isRealToday);
  }

  const listHost = document.getElementById('todayHabitsHost');
  if (!listHost) return;
  listHost.innerHTML = '';

  const activeHabits = store.habits.filter((h) => !h.archived);
  const monthData = store.getMonthData(year, month);
  const allLogs = store.getAllLogsByHabit();

  if (activeHabits.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const strong = document.createElement('strong');
    strong.textContent = 'Your studio page is open';
    const msg = document.createTextNode('Add your first small daily mark below — even a 5-minute ritual counts.');
    empty.append(strong, msg);
    listHost.appendChild(empty);
    updateTodayProgress(0, 0, 0);
  } else {
    let scheduledTotal = 0;
    let doneCount = 0;
    let restCount = 0;

    // Group active habits by routine
    const groups = new Map();
    for (const r of ROUTINES) groups.set(r.id, []);
    for (const h of activeHabits) {
      const rId = groups.has(h.routine) ? h.routine : 'anytime';
      groups.get(rId).push(h);
    }

    const nonEmptyGroups = [...groups.entries()].filter(([, arr]) => arr.length > 0);
    const showGroupHeaders = nonEmptyGroups.length > 1;

    for (const [routineId, groupHabits] of nonEmptyGroups) {
      const section = document.createElement('div');
      section.className = 'routine-group';

      if (showGroupHeaders) {
        const heading = document.createElement('h3');
        heading.className = 'routine-heading';
        heading.textContent = ROUTINES.find((r) => r.id === routineId)?.label || 'Anytime';
        section.appendChild(heading);
      }

      const stack = document.createElement('div');
      stack.className = 'today-habits-stack';

      for (const h of groupHabits) {
        const scheduled = isHabitScheduledOnDow(h, dow);
        const state = monthData.habits[`${h.id}-${day}`] || null;
        const isDone = state === 'done';
        const isRest = state === 'rest';

        if (isDone) doneCount++;
        if (isRest) restCount++;
        if (scheduled && !isRest) scheduledTotal++;
        else if (!scheduled && isDone) scheduledTotal++;

        const { currentStreak } = computeHabitStreaks(h, allLogs[h.id] || {}, realTodayKey);

        const card = document.createElement('div');
        card.className = 'habit-card';
        if (isDone) card.classList.add('is-done');
        if (isRest) card.classList.add('is-rest');
        if (!scheduled && !isDone) card.classList.add('is-unscheduled');

        const cbId = `today-cb-${h.id}`;

        const label = document.createElement('label');
        label.className = 'habit-card-label';
        label.htmlFor = cbId;

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = cbId;
        cb.className = 'stamp-checkbox';
        cb.checked = isDone;
        cb.addEventListener('change', () => {
          store.setHabitDayState(h.id, year, month, day, cb.checked ? 'done' : null);
        });

        const emo = document.createElement('span');
        emo.className = 'habit-card-emoji';
        emo.textContent = h.icon || '✦';
        emo.setAttribute('aria-hidden', 'true');

        const meta = document.createElement('span');
        meta.className = 'habit-card-meta';

        const nameEl = document.createElement('span');
        nameEl.className = 'habit-card-name privacy-sensitive';
        nameEl.textContent = h.name;

        const sub = document.createElement('span');
        sub.className = 'habit-card-sub';

        if (isRest) {
          const restBadge = document.createElement('span');
          restBadge.className = 'rest-pill';
          restBadge.textContent = 'Rest day · streak protected';
          sub.appendChild(restBadge);
        } else if (currentStreak > 0) {
          const streakBadge = document.createElement('span');
          streakBadge.className = 'streak-pill';
          streakBadge.textContent = `● ${currentStreak}-day rhythm`;
          sub.appendChild(streakBadge);
        } else {
          const hint = document.createElement('span');
          hint.textContent = scheduled ? 'Ready to mark' : 'Off-schedule day (optional)';
          sub.appendChild(hint);
        }

        meta.append(nameEl, sub);
        label.append(cb, emo, meta);

        // Card secondary actions: Rest Day toggle + Edit habit
        const actions = document.createElement('div');
        actions.className = 'habit-card-actions';

        const restBtn = document.createElement('button');
        restBtn.type = 'button';
        restBtn.className = 'icon-btn';
        restBtn.setAttribute('aria-pressed', String(isRest));
        restBtn.setAttribute('aria-label', isRest ? `Clear rest day for ${h.name}` : `Mark rest day for ${h.name} (keeps streak safe)`);
        restBtn.title = isRest ? 'Clear rest day' : 'Mark Rest / Skip day (protects streak)';
        restBtn.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
        restBtn.addEventListener('click', () => {
          const next = store.toggleHabitRest(h.id, year, month, day);
          if (next === 'rest') {
            toast.info(`Marked rest day for "${h.name}" — streak stays protected.`);
          }
        });

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'icon-btn';
        editBtn.setAttribute('aria-label', `Edit ${h.name}`);
        editBtn.title = `Edit ${h.name}`;
        editBtn.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`;
        editBtn.addEventListener('click', () => openHabitDialog(h.id));

        actions.append(restBtn, editBtn);
        card.append(label, actions);
        stack.appendChild(card);
      }

      section.appendChild(stack);
      listHost.appendChild(section);
    }

    updateTodayProgress(doneCount, scheduledTotal, restCount);
  }

  renderTodayWellness(year, month, day, monthData);
}

function updateTodayProgress(done, target, restCount) {
  const pill = document.getElementById('todayScoreBadge');
  const fill = document.getElementById('todayProgressFill');
  const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;

  if (fill) fill.style.width = `${pct}%`;
  if (pill) {
    if (target === 0 && restCount > 0) {
      pill.textContent = 'Rest day';
    } else if (target > 0 && done >= target) {
      pill.textContent = `All ${done} marked ✦`;
    } else {
      pill.textContent = `${done} / ${target} (${pct}%)`;
    }
  }
}

function renderTodayWellness(year, month, day, monthData) {
  // Mood 1–10 tactile pills
  const moodRow = document.getElementById('todayMoodPills');
  const moodReadout = document.getElementById('todayMoodReadout');
  const currentMood = Number(monthData.moodSleep[`Mood-${day}`]) || null;

  if (moodReadout) {
    moodReadout.textContent = currentMood ? `${currentMood}/10 · ${MOOD_LABELS[currentMood]}` : 'Not logged';
  }

  if (moodRow) {
    moodRow.innerHTML = '';
    for (let v = 1; v <= 10; v++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mood-pill-btn';
      btn.textContent = String(v);
      btn.setAttribute('aria-pressed', String(currentMood === v));
      btn.setAttribute('aria-label', `Mood ${v} out of 10, ${MOOD_LABELS[v]}`);
      btn.addEventListener('click', () => {
        store.setWellnessMetric('Mood', year, month, day, currentMood === v ? '' : v);
      });
      moodRow.appendChild(btn);
    }
  }

  // Sleep 0.5 hr stepper (3.0 - 12.0 hrs)
  const sleepDisplay = document.getElementById('todaySleepDisplay');
  const sleepReadout = document.getElementById('todaySleepReadout');
  const rawSleep = monthData.moodSleep[`Hours of Sleep-${day}`];
  const currentSleep = rawSleep !== undefined && rawSleep !== '' ? Number(rawSleep) : null;

  if (sleepDisplay) {
    sleepDisplay.textContent = currentSleep !== null ? `${currentSleep} hrs` : '-- hrs';
  }
  if (sleepReadout) {
    sleepReadout.textContent = currentSleep !== null
      ? (currentSleep >= 7 ? 'Rested' : 'Short night')
      : 'Not logged';
  }

  document.querySelectorAll('[data-sleep-preset]').forEach((btn) => {
    const val = btn.dataset.sleepPreset;
    const isPressed = val === '' ? currentSleep === null : currentSleep === Number(val);
    btn.setAttribute('aria-pressed', String(isPressed));
  });
}

export function wireTodayView() {
  document.getElementById('todayPrevDayBtn')?.addEventListener('click', () => {
    store.setActiveTodayKey(shiftDateKey(store.activeTodayKey, -1));
  });
  document.getElementById('todayNextDayBtn')?.addEventListener('click', () => {
    store.setActiveTodayKey(shiftDateKey(store.activeTodayKey, 1));
  });
  document.getElementById('todayJumpNowBtn')?.addEventListener('click', () => {
    store.setActiveTodayKey(todayDateKey());
  });

  // Sleep stepper buttons
  const stepSleep = (delta) => {
    const { year, month, day } = parseDateKey(store.activeTodayKey);
    const data = store.getMonthData(year, month);
    const cur = data.moodSleep[`Hours of Sleep-${day}`];
    const base = cur !== undefined && cur !== '' ? Number(cur) : 7.5;
    const next = Math.max(3, Math.min(12, Math.round((base + delta) * 2) / 2));
    store.setWellnessMetric('Hours of Sleep', year, month, day, next);
  };

  document.getElementById('sleepMinusBtn')?.addEventListener('click', () => stepSleep(-0.5));
  document.getElementById('sleepPlusBtn')?.addEventListener('click', () => stepSleep(0.5));

  document.querySelectorAll('[data-sleep-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const { year, month, day } = parseDateKey(store.activeTodayKey);
      store.setWellnessMetric('Hours of Sleep', year, month, day, btn.dataset.sleepPreset);
    });
  });

  // Quick Add Habit Form inside Today view
  const form = document.getElementById('todayAddHabitForm');
  const input = document.getElementById('todayNewHabitInput');
  const errEl = document.getElementById('todayAddError');

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
