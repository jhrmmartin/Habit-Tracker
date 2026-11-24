import test from 'node:test';
import assert from 'node:assert/strict';
import { DaymarkStore, monthStorageKey } from '../js/store.js';

function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); }
  };
}

test('migrates legacy v3 habits, boolean month logs, and paper theme without data loss', () => {
  const mem = createMemoryStorage({
    myCustomHabits_v3: JSON.stringify([{ id: 'h1', name: 'Read 20 mins' }]),
    habitData_2026_10: JSON.stringify({
      habits: { 'h1-1': true, 'h1-2': true },
      moodSleep: { 'Mood-1': '8', 'Hours of Sleep-1': '7' },
      journal: { '1': 'Great day' }
    }),
    habitTracker_theme: 'paper',
    habitTracker_journalTitle: 'Gratitude Log'
  });

  const s = new DaymarkStore(mem, () => new Date(2026, 10, 10));
  assert.equal(s.prefs.appearance, 'light');
  assert.equal(s.prefs.journalTitle, 'Gratitude Log');
  assert.equal(s.prefs.starterDismissed, true);
  assert.equal(s.habits.length, 1);
  assert.equal(s.habits[0].icon, '📚');

  const md = s.getMonthData(2026, 10);
  assert.equal(md.habits['h1-1'], 'done');
  assert.equal(md.habits['h1-2'], 'done');
  assert.equal(md.journal[1], 'Great day');
});

test('REGRESSION: editing habit icon or name NEVER wipes month checkmarks', () => {
  const mem = createMemoryStorage();
  const s = new DaymarkStore(mem, () => new Date(2026, 10, 10));
  const { habit } = s.addHabit({ name: 'Drink water', icon: '💧' });
  s.setHabitDayState(habit.id, 2026, 10, 1, 'done');
  s.setHabitDayState(habit.id, 2026, 10, 2, 'done');

  // Update icon and name
  s.updateHabit(habit.id, { name: 'Hydrate 2L', icon: '🌊' });

  const md = s.getMonthData(2026, 10);
  assert.equal(md.habits[`${habit.id}-1`], 'done');
  assert.equal(md.habits[`${habit.id}-2`], 'done');
});

test('deleteHabit + undo restores habit and historical check-ins cleanly', () => {
  const mem = createMemoryStorage();
  const s = new DaymarkStore(mem, () => new Date(2026, 10, 10));
  const { habit } = s.addHabit({ name: 'Meditate' });
  s.setHabitDayState(habit.id, 2026, 10, 5, 'done');

  const snap = s.deleteHabit(habit.id);
  assert.equal(s.habits.some((h) => h.id === habit.id), false);
  assert.equal(s.getMonthData(2026, 10).habits[`${habit.id}-5`], undefined);

  assert.equal(s.undo(snap.id), true);
  assert.equal(s.habits.some((h) => h.id === habit.id), true);
  assert.equal(s.getMonthData(2026, 10).habits[`${habit.id}-5`], 'done');
});

test('REGRESSION: cloud union merge preserves offline local check-ins and custom icons', () => {
  const mem = createMemoryStorage();
  const s = new DaymarkStore(mem, () => new Date(2026, 10, 10));
  const { habit } = s.addHabit({ name: 'Walk', icon: '🥾', routine: 'morning', schedule: [1, 3, 5] });

  // Local offline check-in on day 3
  s.setHabitDayState(habit.id, 2026, 10, 3, 'done');

  // Cloud has day 1 completed, and cloud habits row lacks icon
  s.mergeCloudHabits([{ id: habit.id, name: 'Walk', display_order: 0 }], {}, {});
  assert.equal(s.habits[0].icon, '🥾');
  assert.deepEqual(s.habits[0].schedule, [1, 3, 5]);

  s.mergeCloudMonth(2026, 10, {
    habitLogs: [{ habit_id: habit.id, log_date: '2026-11-01', completed: true }],
    wellnessLogs: [{ log_date: '2026-11-01', mood: 9, sleep_hours: 8 }],
    journalLogs: [{ log_date: '2026-11-01', entry_text: 'Cloud note' }]
  }, { preferCloud: false });

  const md = s.getMonthData(2026, 10);
  assert.equal(md.habits[`${habit.id}-1`], 'done'); // from cloud
  assert.equal(md.habits[`${habit.id}-3`], 'done'); // preserved from offline local!
  assert.equal(md.journal[1], 'Cloud note');
});

test('JSON backup export/import round-trips full state and CSV neutralizes formulas & includes notes', () => {
  const mem = createMemoryStorage();
  const s = new DaymarkStore(mem, () => new Date(2026, 10, 10));
  const { habit } = s.addHabit({ name: '=EVIL_FORMULA()' });
  s.setHabitDayState(habit.id, 2026, 10, 1, 'done');
  s.setJournalEntry(2026, 10, 1, 'Felt calm today');

  const csv = s.buildMonthCSV(2026, 10);
  assert.ok(csv.includes('"\'=EVIL_FORMULA()"'));
  assert.ok(csv.includes('"Felt calm today"'));

  const backup = s.exportBackupJSON();
  s.clearAllLocalData();
  assert.equal(s.getMonthData(2026, 10).journal[1], undefined);

  const restored = s.importBackupJSON(backup);
  assert.equal(restored.ok, true);
  assert.equal(s.getMonthData(2026, 10).journal[1], 'Felt calm today');
});

test('storage QuotaExceededError is caught gracefully without throwing', () => {
  let storageErrorEmitted = false;
  const throwingStorage = {
    length: 0,
    key: () => null,
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {}
  };
  const s = new DaymarkStore(throwingStorage, () => new Date(2026, 10, 10));
  s.subscribe((type) => {
    if (type === 'storage-error') storageErrorEmitted = true;
  });
  s.saveMonthData(2026, 10, { habits: { 'a-1': 'done' }, moodSleep: {}, journal: {} }, true);
  assert.equal(storageErrorEmitted, true);
  assert.equal(monthStorageKey(2026, 10), 'habitData_2026_10');
});

test('onboarding checklist milestones advance automatically as new user explores features', () => {
  const mem = createMemoryStorage();
  const s = new DaymarkStore(mem, () => new Date(2026, 10, 10));
  assert.equal(s.prefs.onboarding.stamped, false);
  assert.equal(s.prefs.onboarding.rested, false);
  assert.equal(s.prefs.onboarding.reflected, false);

  const firstId = s.habits[0].id;
  s.setHabitDayState(firstId, 2026, 10, 10, 'done');
  assert.equal(s.prefs.onboarding.stamped, true);

  s.setHabitDayState(firstId, 2026, 10, 11, 'rest');
  assert.equal(s.prefs.onboarding.rested, true);

  s.setJournalEntry(2026, 10, 10, 'First reflection');
  assert.equal(s.prefs.onboarding.reflected, true);

  s.markOnboardingStep('explored');
  assert.equal(s.prefs.onboarding.explored, true);
});
