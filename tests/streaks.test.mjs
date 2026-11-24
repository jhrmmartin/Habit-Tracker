import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeHabitStreaks,
  computeMonthAnalytics,
  getCalendarWeeks
} from '../js/streaks.js';

test('cross-month streaks stay intact across month boundaries', () => {
  const habit = { id: 'h1', name: 'Read', schedule: [0, 1, 2, 3, 4, 5, 6] };
  const logs = {
    '2026-10-29': 'done',
    '2026-10-30': 'done',
    '2026-10-31': 'done',
    '2026-11-01': 'done',
    '2026-11-02': 'done'
  };
  const { currentStreak, bestStreak } = computeHabitStreaks(habit, logs, '2026-11-02');
  assert.equal(currentStreak, 5);
  assert.equal(bestStreak, 5);
});

test('mid-day grace preserves active streak before today check-in', () => {
  const habit = { id: 'h1', name: 'Walk', schedule: [0, 1, 2, 3, 4, 5, 6] };
  const logs = {
    '2026-11-01': 'done',
    '2026-11-02': 'done',
    '2026-11-03': 'done'
  };
  // On 2026-11-04 morning before checking in, streak from Nov 1-3 is still alive!
  const { currentStreak } = computeHabitStreaks(habit, logs, '2026-11-04');
  assert.equal(currentStreak, 3);
});

test('rest days and unscheduled weekdays bridge streaks without inflating count', () => {
  // Mon/Wed/Fri gym schedule (1, 3, 5)
  const gym = { id: 'gym', name: 'Gym', schedule: [1, 3, 5] };
  // 2026-11-02 Mon (done), Nov 4 Wed (rest), Nov 6 Fri (done), Nov 9 Mon (done)
  const logs = {
    '2026-11-02': 'done',
    '2026-11-04': 'rest',
    '2026-11-06': 'done',
    '2026-11-09': 'done'
  };
  const { currentStreak, bestStreak } = computeHabitStreaks(gym, logs, '2026-11-09');
  assert.equal(currentStreak, 3);
  assert.equal(bestStreak, 3);
});

test('all-time best streak tracks historical peak across older months', () => {
  const habit = { id: 'h1', name: 'Water', schedule: [0, 1, 2, 3, 4, 5, 6] };
  const logs = {
    '2026-09-01': 'done',
    '2026-09-02': 'done',
    '2026-09-03': 'done',
    '2026-09-04': 'done',
    '2026-09-05': 'done',
    '2026-09-06': 'done',
    // gap
    '2026-11-01': 'done',
    '2026-11-02': 'done'
  };
  const { currentStreak, bestStreak } = computeHabitStreaks(habit, logs, '2026-11-02');
  assert.equal(currentStreak, 2);
  assert.equal(bestStreak, 6);
});

test('calendar weeks respect Sunday vs Monday start preferences', () => {
  // Nov 2026 starts on Sunday (Nov 1 = Sun, 30 days)
  const sunWeeks = getCalendarWeeks(2026, 10, 0);
  assert.equal(sunWeeks[0].startDay, 1);
  assert.equal(sunWeeks[0].endDay, 7);

  const monWeeks = getCalendarWeeks(2026, 10, 1);
  assert.equal(monWeeks[0].startDay, 1);
  assert.equal(monWeeks[0].endDay, 1); // Sunday Nov 1 is its own tail day before Mon Nov 2
  assert.equal(monWeeks[1].startDay, 2);
  assert.equal(monWeeks[1].endDay, 8);
});

test('month analytics excludes rest days & unscheduled days from target denominator and computes sleep lift insight', () => {
  const habits = [
    { id: 'h1', name: 'Read', icon: '📚', routine: 'evening', schedule: [1, 2, 3, 4, 5], archived: false }
  ];
  // Nov 2026 has 21 weekdays
  const monthData = {
    habits: {
      'h1-2': 'done',  // Mon
      'h1-3': 'rest',  // Tue (excluded from target)
      'h1-4': 'done'   // Wed
    },
    moodSleep: {
      'Hours of Sleep-2': '8',
      'Hours of Sleep-4': '8',
      'Hours of Sleep-5': '5',
      'Mood-2': '8',
      'Mood-5': '5'
    },
    journal: {}
  };
  const allLogs = {
    h1: { '2026-11-02': 'done', '2026-11-03': 'rest', '2026-11-04': 'done' }
  };

  const res = computeMonthAnalytics({
    habits,
    monthData,
    allLogsByHabit: allLogs,
    year: 2026,
    month: 10,
    now: new Date(2026, 10, 6)
  });

  // 21 weekdays minus 1 rest day = 20 target
  assert.equal(res.totalGoal, 20);
  assert.equal(res.totalCompleted, 2);
  assert.equal(res.totalRestDays, 1);
  assert.ok(res.insights.some((i) => i.headline.includes('Rested mornings')));
});
