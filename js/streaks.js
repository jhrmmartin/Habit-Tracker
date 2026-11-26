// ============================================================
// DAYMARK — CROSS-MONTH STREAK, SCHEDULE & INSIGHTS ENGINE
// Pure functions for high reliability and easy unit testing.
// ============================================================

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export function formatDateKey(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return { year: y, month: m - 1, day: d };
}

export function shiftDateKey(key, deltaDays) {
  const { year, month, day } = parseDateKey(key);
  const dt = new Date(year, month, day + deltaDays);
  return formatDateKey(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

export function getDayOfWeekFromKey(key) {
  const { year, month, day } = parseDateKey(key);
  return new Date(year, month, day).getDay();
}

export function todayDateKey(now = new Date()) {
  return formatDateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Computes calendar week key ('YYYY-MM-DD' of the week's start day) for a date key.
 */
export function getWeekStartKey(dateKeyStr, weekStartsOn = 0) {
  const { year, month, day } = parseDateKey(dateKeyStr);
  const dt = new Date(year, month, day);
  const diff = (dt.getDay() - weekStartsOn + 7) % 7;
  dt.setDate(dt.getDate() - diff);
  return formatDateKey(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/**
 * Counts how many 'done' marks a habit has in the calendar week containing dateKeyStr.
 */
export function getWeekProgressForDate(habit, habitLogsByDate = {}, dateKeyStr = todayDateKey(), weekStartsOn = 0) {
  const startKey = getWeekStartKey(dateKeyStr, weekStartsOn);
  let done = 0;
  for (let offset = 0; offset < 7; offset++) {
    const k = shiftDateKey(startKey, offset);
    if (habitLogsByDate[k] === 'done') done++;
  }
  const target = habit?.weeklyTarget || 7;
  return { done, target, met: done >= target };
}

/**
 * Checks if a habit is scheduled for a given JS day of week (0=Sun..6=Sat).
 * Weekly-target habits can be logged any day of the week.
 */
export function isHabitScheduledOnDow(habit, dow) {
  if (habit && Number.isInteger(habit.weeklyTarget) && habit.weeklyTarget > 0) {
    return true;
  }
  if (!habit || !Array.isArray(habit.schedule) || habit.schedule.length === 0) {
    return true;
  }
  return habit.schedule.includes(dow);
}

/**
 * Groups days of a month into real calendar weeks respecting Sunday (0) or Monday (1) start.
 */
export function getCalendarWeeks(year, month, weekStartsOn = 0) {
  const total = getDaysInMonth(year, month);
  const weeks = [];
  let startDay = 1;

  for (let d = 1; d <= total; d++) {
    const dow = new Date(year, month, d).getDay();
    const isWeekBoundary = d > 1 && dow === weekStartsOn;
    if (isWeekBoundary) {
      weeks.push({ startDay, endDay: d - 1, span: d - startDay });
      startDay = d;
    }
  }
  weeks.push({ startDay, endDay: total, span: total - startDay + 1 });
  return weeks;
}

/**
 * Computes true cross-month active streak and all-time best streak for one habit.
 *
 * Rules:
 * - 'done' increments streak.
 * - 'rest' (skip/recovery day) or an unscheduled weekday bridges the streak without breaking or inflating it.
 * - Mid-day grace: if today is scheduled and not yet completed, checks starting from yesterday
 *   so streaks don't drop to 0 in the morning before check-in.
 */
export function computeHabitStreaks(habit, habitLogsByDate = {}, referenceTodayKey = todayDateKey(), weekStartsOn = 0) {
  const loggedKeys = Object.keys(habitLogsByDate).filter(
    (k) => habitLogsByDate[k] === 'done' || habitLogsByDate[k] === 'rest'
  );

  // Weekly-target mode (e.g. 3x/week): streak counts completed weeks or bridges unlogged days in met/active weeks
  const weeklyTarget = Number.isInteger(habit?.weeklyTarget) && habit.weeklyTarget > 0 ? habit.weeklyTarget : null;
  const weekCounts = new Map();
  if (weeklyTarget) {
    for (const k of loggedKeys) {
      if (habitLogsByDate[k] === 'done' || habitLogsByDate[k] === 'rest') {
        const wk = getWeekStartKey(k, weekStartsOn);
        weekCounts.set(wk, (weekCounts.get(wk) || 0) + 1);
      }
    }
  }
  const currentWeekKey = weeklyTarget ? getWeekStartKey(referenceTodayKey, weekStartsOn) : null;

  // 1. Current Active Streak (walking backward from referenceTodayKey)
  let currentStreak = 0;
  let cursor = referenceTodayKey;
  const todayState = habitLogsByDate[cursor];

  // Mid-day grace: if today isn't logged yet, start evaluation at yesterday
  if (todayState !== 'done' && todayState !== 'rest') {
    cursor = shiftDateKey(cursor, -1);
  }

  // Cap backward walk safely at 3660 days (~10 years)
  const earliestLogged = loggedKeys.length > 0 ? loggedKeys.reduce((a, b) => (a < b ? a : b)) : null;

  if (earliestLogged) {
    let steps = 0;
    while (cursor >= earliestLogged && steps < 3660) {
      const state = habitLogsByDate[cursor];
      const dow = getDayOfWeekFromKey(cursor);
      const scheduled = isHabitScheduledOnDow(habit, dow);
      const wkKey = weeklyTarget ? getWeekStartKey(cursor, weekStartsOn) : null;
      const weeklyBridged = Boolean(
        weeklyTarget && (wkKey === currentWeekKey || (weekCounts.get(wkKey) || 0) >= weeklyTarget)
      );

      if (state === 'done') {
        currentStreak++;
      } else if (state === 'rest' || !scheduled || weeklyBridged) {
        // Compassionate bridge: rest days, unscheduled days, and satisfied weekly-target weeks don't break streaks
      } else {
        break;
      }

      cursor = shiftDateKey(cursor, -1);
      steps++;
    }
  }

  // 2. All-Time Best Streak across all stored history
  let bestStreak = currentStreak;
  if (earliestLogged) {
    const latestLogged = loggedKeys.reduce((a, b) => (a > b ? a : b));
    let running = 0;
    let walk = earliestLogged;
    let guard = 0;

    while (walk <= latestLogged && guard < 3660) {
      const state = habitLogsByDate[walk];
      const dow = getDayOfWeekFromKey(walk);
      const scheduled = isHabitScheduledOnDow(habit, dow);
      const wkKey = weeklyTarget ? getWeekStartKey(walk, weekStartsOn) : null;
      const weeklyBridged = Boolean(weeklyTarget && (weekCounts.get(wkKey) || 0) >= weeklyTarget);

      if (state === 'done') {
        running++;
        if (running > bestStreak) bestStreak = running;
      } else if (state === 'rest' || !scheduled || weeklyBridged) {
        // Preserve running streak across rest / unscheduled / satisfied weekly-target days
      } else {
        running = 0;
      }

      walk = shiftDateKey(walk, 1);
      guard++;
    }
  }

  return { currentStreak, bestStreak };
}

/**
 * Computes monthly rhythm stats, chart series, and plain-English Rhythm Insights.
 */
export function computeMonthAnalytics({
  habits = [],
  monthData = { habits: {}, moodSleep: {}, journal: {} },
  allLogsByHabit = {},
  year,
  month,
  weekStartsOn = 0,
  sleepGoal = 7,
  now = new Date()
}) {
  const activeHabits = habits.filter((h) => !h.archived);
  const totalDays = getDaysInMonth(year, month);
  const todayKey = todayDateKey(now);
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month;
  const isFutureMonth = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth());
  const elapsedDays = isFutureMonth ? 0 : (isCurrentMonth ? now.getDate() : totalDays);
  const calWeeks = getCalendarWeeks(year, month, weekStartsOn);

  let totalScheduledTarget = 0;
  let totalCompleted = 0;
  let totalRestDays = 0;

  const checksPerDay = Array(totalDays).fill(0);
  const scheduledPerDay = Array(totalDays).fill(0);
  const habitStats = [];

  for (const habit of activeHabits) {
    let actual = 0;
    let restCount = 0;
    let habitMonthTarget = 0;
    const weeklyTarget = Number.isInteger(habit.weeklyTarget) && habit.weeklyTarget > 0 ? habit.weeklyTarget : null;

    if (weeklyTarget) {
      for (const wk of calWeeks) {
        let nonRestDays = 0;
        for (let d = wk.startDay; d <= wk.endDay; d++) {
          const rawState = monthData.habits?.[`${habit.id}-${d}`];
          const state = rawState === true ? 'done' : rawState;
          if (state === 'done') {
            actual++;
            totalCompleted++;
            checksPerDay[d - 1]++;
            nonRestDays++;
          } else if (state === 'rest') {
            restCount++;
            totalRestDays++;
          } else {
            nonRestDays++;
          }
          if (state !== 'rest') scheduledPerDay[d - 1]++;
        }
        const wkTarget = Math.min(nonRestDays, Math.max(1, Math.round((weeklyTarget * wk.span) / 7)));
        habitMonthTarget += wkTarget;
        totalScheduledTarget += wkTarget;
      }
    } else {
      for (let d = 1; d <= totalDays; d++) {
        const dow = new Date(year, month, d).getDay();
        const scheduled = isHabitScheduledOnDow(habit, dow);
        const rawState = monthData.habits?.[`${habit.id}-${d}`];
        const state = rawState === true ? 'done' : rawState;

        if (state === 'done') {
          actual++;
          totalCompleted++;
          checksPerDay[d - 1]++;
        } else if (state === 'rest') {
          restCount++;
          totalRestDays++;
        }

        // Scheduled target excludes marked rest days (compassionate denominator)
        if (scheduled && state !== 'rest') {
          habitMonthTarget++;
          totalScheduledTarget++;
          scheduledPerDay[d - 1]++;
        } else if (!scheduled && state === 'done') {
          // Bonus check-in on an unscheduled day still counts cleanly
          scheduledPerDay[d - 1]++;
        }
      }
    }

    const { currentStreak, bestStreak } = computeHabitStreaks(
      habit,
      allLogsByHabit[habit.id] || {},
      todayKey,
      weekStartsOn
    );

    const effectiveDenom = Math.max(habitMonthTarget, actual);
    const rate = effectiveDenom > 0 ? Math.min(100, Math.round((actual / effectiveDenom) * 100)) : 0;

    habitStats.push({
      id: habit.id,
      name: habit.name,
      icon: habit.icon || '✦',
      routine: habit.routine || 'anytime',
      actual,
      target: habitMonthTarget,
      restCount,
      rate,
      currentStreak,
      bestStreak
    });
  }

  // Sort copy for top habits ranking
  const topHabits = [...habitStats].sort((a, b) => b.rate - a.rate || b.actual - a.actual || b.currentStreak - a.currentStreak);

  const moodData = Array(totalDays).fill(null);
  const sleepData = Array(totalDays).fill(null);
  for (let d = 1; d <= totalDays; d++) {
    const mRaw = monthData.moodSleep?.[`Mood-${d}`];
    const sRaw = monthData.moodSleep?.[`Hours of Sleep-${d}`];
    if (mRaw !== undefined && mRaw !== '' && !Number.isNaN(Number(mRaw))) {
      moodData[d - 1] = Number(mRaw);
    }
    if (sRaw !== undefined && sRaw !== '' && !Number.isNaN(Number(sRaw))) {
      sleepData[d - 1] = Number(sRaw);
    }
  }

  const validMoods = moodData.filter((v) => v !== null);
  const validSleeps = sleepData.filter((v) => v !== null);
  const avgMood = validMoods.length ? Number((validMoods.reduce((a, b) => a + b, 0) / validMoods.length).toFixed(1)) : null;
  const avgSleep = validSleeps.length ? Number((validSleeps.reduce((a, b) => a + b, 0) / validSleeps.length).toFixed(1)) : null;

  const overallRate = totalScheduledTarget > 0
    ? Math.min(100, Math.round((totalCompleted / totalScheduledTarget) * 100))
    : 0;

  const insights = buildRhythmInsights({
    activeHabits,
    checksPerDay,
    scheduledPerDay,
    moodData,
    sleepData,
    topHabits,
    elapsedDays,
    totalCompleted,
    sleepGoal,
    year,
    month
  });

  return {
    totalDays,
    elapsedDays,
    totalGoal: totalScheduledTarget,
    totalCompleted,
    totalRemaining: Math.max(0, totalScheduledTarget - totalCompleted),
    totalRestDays,
    overallRate,
    checksPerDay,
    scheduledPerDay,
    habitStats,
    topHabits,
    moodData,
    sleepData,
    avgMood,
    avgSleep,
    insights
  };
}

function buildRhythmInsights({
  activeHabits,
  checksPerDay,
  scheduledPerDay,
  moodData,
  sleepData,
  topHabits,
  elapsedDays,
  totalCompleted,
  sleepGoal = 7,
  year,
  month
}) {
  if (activeHabits.length === 0 || elapsedDays < 2 || totalCompleted === 0) {
    return [];
  }

  const cards = [];

  // 1. Sleep & Rhythm lift
  const wellRested = [];
  const shortRest = [];
  for (let d = 0; d < elapsedDays; d++) {
    if (sleepData[d] !== null && scheduledPerDay[d] > 0) {
      const ratio = Math.min(1, checksPerDay[d] / scheduledPerDay[d]);
      if (sleepData[d] >= sleepGoal) wellRested.push(ratio);
      else shortRest.push(ratio);
    }
  }
  if (wellRested.length > 0 && shortRest.length > 0) {
    const highAvg = Math.round((wellRested.reduce((a, b) => a + b, 0) / wellRested.length) * 100);
    const lowAvg = Math.round((shortRest.reduce((a, b) => a + b, 0) / shortRest.length) * 100);
    const lift = highAvg - lowAvg;
    if (lift >= 5) {
      cards.push({
        icon: 'moon',
        headline: `Rested mornings lift completion by +${lift}%`,
        detail: `After ${sleepGoal}+ hours of sleep, you complete ${highAvg}% of scheduled habits versus ${lowAvg}% on shorter nights.`
      });
    }
  } else if (wellRested.length + shortRest.length >= 2) {
    const allSleep = sleepData.slice(0, elapsedDays).filter((v) => v !== null);
    const avg = (allSleep.reduce((a, b) => a + b, 0) / allSleep.length).toFixed(1);
    cards.push({
      icon: 'moon',
      headline: `Averaging ${avg} hours of sleep`,
      detail: 'Logging both sleep and mood helps reveal what fuels your easiest days.'
    });
  }

  // 2. Mood connection
  const activeDayMoods = [];
  const quietDayMoods = [];
  for (let d = 0; d < elapsedDays; d++) {
    if (moodData[d] !== null && scheduledPerDay[d] > 0) {
      const ratio = checksPerDay[d] / scheduledPerDay[d];
      if (ratio >= 0.5) activeDayMoods.push(moodData[d]);
      else quietDayMoods.push(moodData[d]);
    }
  }
  if (activeDayMoods.length > 0 && quietDayMoods.length > 0) {
    const hi = activeDayMoods.reduce((a, b) => a + b, 0) / activeDayMoods.length;
    const lo = quietDayMoods.reduce((a, b) => a + b, 0) / quietDayMoods.length;
    const diff = Number((hi - lo).toFixed(1));
    if (diff >= 0.3) {
      cards.push({
        icon: 'smile',
        headline: `Mood rises +${diff} pts on steady days`,
        detail: `Your mood averages ${hi.toFixed(1)}/10 when you complete at least half your daily marks, compared to ${lo.toFixed(1)}/10 on slower days.`
      });
    }
  }

  // 3. Strongest Day of the Week
  const dowDone = Array(7).fill(0);
  const dowTarget = Array(7).fill(0);
  for (let d = 1; d <= elapsedDays; d++) {
    const dow = new Date(year, month, d).getDay();
    dowDone[dow] += checksPerDay[d - 1];
    dowTarget[dow] += scheduledPerDay[d - 1];
  }
  let bestDow = -1;
  let bestRatio = 0;
  for (let dow = 0; dow < 7; dow++) {
    if (dowTarget[dow] > 0 && dowDone[dow] > 0) {
      const r = Math.min(1, dowDone[dow] / dowTarget[dow]);
      if (r > bestRatio) {
        bestRatio = r;
        bestDow = dow;
      }
    }
  }
  if (bestDow !== -1) {
    const dayName = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(new Date(2026, 10, 1 + bestDow));
    cards.push({
      icon: 'pulse',
      headline: `Strongest rhythm: ${dayName}s`,
      detail: `You average ${Math.round(bestRatio * 100)}% completion on ${dayName}s this month.`
    });
  }

  // 4. Anchor Habit
  if (topHabits.length > 0 && topHabits[0].actual > 0) {
    const anchor = topHabits[0];
    cards.push({
      icon: 'anchor',
      headline: `Anchor habit: ${anchor.name}`,
      detail: `${anchor.rate}% consistency (${anchor.actual} marks) with a ${anchor.currentStreak}-day active streak.`
    });
  }

  return cards;
}
