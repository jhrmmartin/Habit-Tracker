// ============================================================
// DAYMARK — SINGLE SOURCE OF TRUTH STORE & DATA LAYER
// Safe localStorage, legacy migration, Undo stack, JSON/CSV IO.
// ============================================================

import { safeId, safeJSONParse, sanitizeCSVCell, sanitizeEmoji } from './security.js';
import { suggestHabitIcon } from './emojis.js';
import { formatDateKey, getDaysInMonth, todayDateKey } from './streaks.js';

export const ROUTINES = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
  { id: 'anytime', label: 'Anytime' }
];

export const DEFAULT_PROMPTS = [
  { id: 'win', label: '✨ Highlight', prefix: '✨ Highlight: ' },
  { id: 'grateful', label: '🌿 Grateful', prefix: '🌿 Grateful for: ' },
  { id: 'lesson', label: '💭 Note', prefix: '💭 Note: ' },
  { id: 'tomorrow', label: '🎯 Tomorrow', prefix: '🎯 Tomorrow: ' }
];

export const STARTER_PACKS = {
  everyday: {
    title: 'Everyday Balance',
    desc: 'Gentle daily anchors for water, movement, reading, and rest.',
    habits: [
      { name: 'Drink 8 glasses of water', icon: '💧', routine: 'anytime', schedule: [0, 1, 2, 3, 4, 5, 6] },
      { name: '20-minute walk outside', icon: '🚶', routine: 'morning', schedule: [0, 1, 2, 3, 4, 5, 6] },
      { name: 'Read for 15 minutes', icon: '📚', routine: 'evening', schedule: [0, 1, 2, 3, 4, 5, 6] },
      { name: 'Tidy one small space', icon: '🧹', routine: 'afternoon', schedule: [1, 2, 3, 4, 5] },
      { name: 'Screen-free wind-down', icon: '🌙', routine: 'evening', schedule: [0, 1, 2, 3, 4, 5, 6] }
    ]
  },
  wellness: {
    title: 'Mind & Body',
    desc: 'Sustainable energy, movement, nutrition, and calm.',
    habits: [
      { name: 'Morning stretch & breath', icon: '🧘', routine: 'morning', schedule: [0, 1, 2, 3, 4, 5, 6] },
      { name: 'Step into morning light', icon: '☀️', routine: 'morning', schedule: [0, 1, 2, 3, 4, 5, 6] },
      { name: 'Strength or cardio session', icon: '🏋️', routine: 'afternoon', schedule: [1, 3, 5] },
      { name: 'Eat one nourishing meal', icon: '🥗', routine: 'afternoon', schedule: [0, 1, 2, 3, 4, 5, 6] },
      { name: 'Lights out on schedule', icon: '😴', routine: 'evening', schedule: [0, 1, 2, 3, 4, 5, 6] }
    ]
  },
  focus: {
    title: 'Study & Focus',
    desc: 'Clear priorities and calm deep work without burnout.',
    habits: [
      { name: 'Pick top 3 priorities', icon: '🎯', routine: 'morning', schedule: [1, 2, 3, 4, 5] },
      { name: 'Focused deep-work block', icon: '💻', routine: 'morning', schedule: [1, 2, 3, 4, 5] },
      { name: 'Review & organize notes', icon: '🔖', routine: 'afternoon', schedule: [1, 2, 3, 4, 5] },
      { name: 'Afternoon movement break', icon: '🚶', routine: 'afternoon', schedule: [1, 2, 3, 4, 5] },
      { name: 'Close tabs & log tomorrow', icon: '📅', routine: 'evening', schedule: [1, 2, 3, 4, 5] }
    ]
  },
  blank: {
    title: 'Start Blank',
    desc: 'Begin with a clean slate and add your own rituals.',
    habits: []
  }
};

const KEYS = {
  HABITS: 'myCustomHabits_v3',
  PREFS: 'daymark_prefs_v1',
  LEGACY_THEME: 'habitTracker_theme',
  LEGACY_JOURNAL_TITLE: 'habitTracker_journalTitle',
  LEGACY_JOURNAL_PILLS: 'habitTracker_journalPills_v1',
  LEGACY_VIEW_MODE: 'habitTracker_viewMode',
  LEGACY_NOTION: 'notion_workspace_v1'
};

export function monthStorageKey(year, month) {
  return `habitData_${year}_${month}`;
}

function defaultPrefs() {
  return {
    appearance: 'system', // 'system' | 'light' | 'dark'
    ink: 'terracotta',    // 'terracotta' | 'sage' | 'indigo'
    weekStartsOn: 0,      // 0 = Sunday, 1 = Monday
    sleepGoal: 7,         // personalized sleep target in hours
    paperDots: true,
    privacyBlur: false,
    motto: 'Small marks, lasting rhythm.',
    journalTitle: 'Daily Note',
    journalPills: DEFAULT_PROMPTS.map((p) => ({ ...p })),
    starterDismissed: false,
    onboarding: {
      stamped: false,
      rested: false,
      reflected: false,
      explored: false,
      tourCompleted: false
    },
    viewMode: null        // 'today' | 'grid'
  };
}

function normalizeHabit(h, index = 0) {
  const name = String(h?.name || 'Untitled Habit').trim().slice(0, 80);
  const schedule = Array.isArray(h?.schedule) && h.schedule.length > 0
    ? [...new Set(h.schedule.map(Number).filter((d) => d >= 0 && d <= 6))].sort()
    : [0, 1, 2, 3, 4, 5, 6];
  const routine = ROUTINES.some((r) => r.id === h?.routine) ? h.routine : 'anytime';
  const rawWt = Number(h?.weeklyTarget);
  const weeklyTarget = Number.isInteger(rawWt) && rawWt >= 1 && rawWt <= 6 ? rawWt : null;
  return {
    id: String(h?.id || safeId('h')),
    name,
    icon: sanitizeEmoji(h?.icon || suggestHabitIcon(name), '✦'),
    routine,
    schedule,
    weeklyTarget,
    archived: Boolean(h?.archived),
    order: typeof h?.order === 'number' ? h.order : index,
    updatedAt: typeof h?.updatedAt === 'number' ? h.updatedAt : Date.now(),
    ...(h?.isDefaultStarter ? { isDefaultStarter: true } : {})
  };
}

function normalizeMonthData(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const habits = {};
  for (const [k, v] of Object.entries(src.habits || {})) {
    if (v === true || v === 'done') habits[k] = 'done';
    else if (v === 'rest') habits[k] = 'rest';
  }
  const moodSleep = {};
  for (const [k, v] of Object.entries(src.moodSleep || {})) {
    if (v !== '' && v !== null && v !== undefined) {
      moodSleep[k] = String(v);
    }
  }
  const journal = {};
  for (const [k, v] of Object.entries(src.journal || {})) {
    if (typeof v === 'string' && v.trim()) {
      journal[k] = v;
    }
  }
  return {
    habits,
    moodSleep,
    journal,
    updatedAt: typeof src.updatedAt === 'number' ? src.updatedAt : Date.now()
  };
}

export class DaymarkStore {
  constructor(storage = globalThis.localStorage, nowFn = () => new Date()) {
    this.storage = storage;
    this.nowFn = nowFn;
    this.listeners = new Set();
    this.undoStack = [];
    this.monthCache = new Map();
    this.dirtyMonths = new Set();

    const now = this.nowFn();
    this.currentYear = now.getFullYear();
    this.currentMonth = now.getMonth();
    this.activeTodayKey = todayDateKey(now);
    this.gridJournalDay = now.getDate();

    this.prefs = this._loadAndMigratePrefs();
    this.habits = this._loadAndMigrateHabits();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(eventType, detail = {}) {
    for (const fn of this.listeners) {
      try {
        fn(eventType, detail);
      } catch (err) {
        console.error('[DaymarkStore] Listener error:', err);
      }
    }
  }

  _safeGet(key) {
    try {
      return this.storage?.getItem?.(key) ?? null;
    } catch {
      return null;
    }
  }

  _safeSet(key, value) {
    try {
      this.storage?.setItem?.(key, value);
      return true;
    } catch (err) {
      console.warn('[DaymarkStore] Storage write failed:', err?.message || err);
      this.emit('storage-error', {
        message: 'Could not save locally — browser storage may be full or restricted. Export a JSON backup to keep your data safe.'
      });
      return false;
    }
  }

  _safeRemove(key) {
    try {
      this.storage?.removeItem?.(key);
    } catch {
      // ignore
    }
  }

  _listMonthKeys() {
    const keys = [];
    try {
      const len = this.storage?.length || 0;
      for (let i = 0; i < len; i++) {
        const k = this.storage.key(i);
        if (k && /^habitData_\d{4}_\d{1,2}$/.test(k)) {
          keys.push(k);
        }
      }
    } catch {
      // ignore
    }
    return keys;
  }

  _loadAndMigratePrefs() {
    const base = defaultPrefs();
    const saved = safeJSONParse(this._safeGet(KEYS.PREFS), null);
    if (saved && typeof saved === 'object') {
      return {
        ...base,
        ...saved,
        onboarding: { ...base.onboarding, ...(saved.onboarding || {}) },
        journalPills: Array.isArray(saved.journalPills) ? saved.journalPills : base.journalPills
      };
    }

    // Migrate legacy keys seamlessly
    const legacyTheme = this._safeGet(KEYS.LEGACY_THEME);
    if (legacyTheme) {
      if (legacyTheme === 'paper') {
        base.appearance = 'light';
        base.ink = 'terracotta';
      } else if (legacyTheme === 'forest') {
        base.appearance = 'dark';
        base.ink = 'sage';
      } else if (legacyTheme === 'nordic') {
        base.appearance = 'dark';
        base.ink = 'indigo';
      } else {
        base.appearance = 'dark';
        base.ink = 'terracotta';
      }
    }

    const legacyTitle = this._safeGet(KEYS.LEGACY_JOURNAL_TITLE);
    if (legacyTitle && legacyTitle.trim()) {
      base.journalTitle = legacyTitle.trim().slice(0, 40);
    }

    const legacyPills = safeJSONParse(this._safeGet(KEYS.LEGACY_JOURNAL_PILLS), null);
    if (Array.isArray(legacyPills) && legacyPills.length > 0) {
      base.journalPills = legacyPills;
    }

    const legacyView = this._safeGet(KEYS.LEGACY_VIEW_MODE);
    if (legacyView === 'today' || legacyView === 'grid') {
      base.viewMode = legacyView;
    }

    const legacyNotion = safeJSONParse(this._safeGet(KEYS.LEGACY_NOTION), null);
    if (legacyNotion?.pageQuote && typeof legacyNotion.pageQuote === 'string') {
      base.motto = legacyNotion.pageQuote.trim().slice(0, 140);
    }

    // Returning user already had habits -> don't show first-visit Starter Pack banner
    if (this._safeGet(KEYS.HABITS)) {
      base.starterDismissed = true;
    }

    this._safeSet(KEYS.PREFS, JSON.stringify(base));
    return base;
  }

  _loadAndMigrateHabits() {
    const raw = safeJSONParse(this._safeGet(KEYS.HABITS), null);
    if (Array.isArray(raw)) {
      const normalized = raw.map((h, i) => normalizeHabit(h, i));
      this._safeSet(KEYS.HABITS, JSON.stringify(normalized));
      return normalized;
    }

    // Fresh guest: start with warm Everyday Balance pack (and let them swap in 1 click)
    const starter = STARTER_PACKS.everyday.habits.map((h, i) =>
      normalizeHabit({ ...h, isDefaultStarter: true }, i)
    );
    this._safeSet(KEYS.HABITS, JSON.stringify(starter));
    return starter;
  }

  saveHabits() {
    this.habits.forEach((h, i) => { h.order = i; });
    this._safeSet(KEYS.HABITS, JSON.stringify(this.habits));
  }

  savePrefs(triggerSync = true) {
    this._safeSet(KEYS.PREFS, JSON.stringify(this.prefs));
    this.emit('prefs-changed', { prefs: this.prefs, triggerSync });
  }

  updatePrefs(partial, triggerSync = true) {
    this.prefs = { ...this.prefs, ...partial };
    this.savePrefs(triggerSync);
  }

  getMonthData(year = this.currentYear, month = this.currentMonth) {
    const key = monthStorageKey(year, month);
    if (this.monthCache.has(key)) {
      return this.monthCache.get(key);
    }
    const parsed = normalizeMonthData(safeJSONParse(this._safeGet(key), null));
    this.monthCache.set(key, parsed);
    return parsed;
  }

  saveMonthData(year, month, data, triggerSync = true) {
    const key = monthStorageKey(year, month);
    const normalized = normalizeMonthData(data);
    normalized.updatedAt = Date.now();
    this.monthCache.set(key, normalized);
    this._safeSet(key, JSON.stringify(normalized));
    if (triggerSync) {
      this.dirtyMonths.add(key);
      this.emit('data-changed', { year, month });
    }
  }

  /**
   * Aggregates all stored habit logs across EVERY saved month into
   * { [habitId]: { 'YYYY-MM-DD': 'done' | 'rest' } } for true cross-month streaks.
   */
  getAllLogsByHabit() {
    const map = {};
    const keys = new Set([...this._listMonthKeys(), ...this.monthCache.keys()]);

    for (const key of keys) {
      const match = /^habitData_(\d{4})_(\d{1,2})$/.exec(key);
      if (!match) continue;
      const y = Number(match[1]);
      const m = Number(match[2]);
      const maxDay = getDaysInMonth(y, m);
      const data = this.getMonthData(y, m);
      for (const [entryKey, state] of Object.entries(data.habits || {})) {
        if (state !== 'done' && state !== 'rest') continue;
        const dash = entryKey.lastIndexOf('-');
        if (dash <= 0) continue;
        const habitId = entryKey.slice(0, dash);
        const day = Number(entryKey.slice(dash + 1));
        if (!habitId || Number.isNaN(day) || day < 1 || day > maxDay) continue;
        if (!map[habitId]) map[habitId] = {};
        map[habitId][formatDateKey(y, m, day)] = state;
      }
    }
    return map;
  }

  // ── Navigation ──
  setViewedMonth(year, month) {
    this.currentYear = year;
    this.currentMonth = month;
    const total = getDaysInMonth(year, month);
    if (this.gridJournalDay > total) this.gridJournalDay = total;
    this.emit('month-changed', { year, month });
  }

  setActiveTodayKey(dateKeyStr) {
    this.activeTodayKey = dateKeyStr;
    const [y, m] = dateKeyStr.split('-').map(Number);
    if (y !== this.currentYear || (m - 1) !== this.currentMonth) {
      this.currentYear = y;
      this.currentMonth = m - 1;
      this.emit('month-changed', { year: this.currentYear, month: this.currentMonth });
    } else {
      this.emit('ui-refresh');
    }
  }

  // ── Habit Mutations ──
  addHabit({ name, icon, routine = 'anytime', schedule = [0, 1, 2, 3, 4, 5, 6], weeklyTarget = null }) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return { error: 'Please enter a habit name.' };
    if (trimmed.length > 80) return { error: 'Habit name must be 80 characters or fewer.' };
    const dup = this.habits.some((h) => !h.archived && h.name.toLowerCase() === trimmed.toLowerCase());
    if (dup) return { error: 'You already have an active habit with that name.' };

    const habit = normalizeHabit({
      id: safeId('h'),
      name: trimmed,
      icon: icon || suggestHabitIcon(trimmed),
      routine,
      schedule,
      weeklyTarget,
      archived: false,
      order: this.habits.length,
      updatedAt: Date.now()
    }, this.habits.length);

    this.habits.push(habit);
    this.saveHabits();
    this.emit('habits-changed', { reason: 'add', habit });
    return { habit };
  }

  updateHabit(id, updates) {
    const idx = this.habits.findIndex((h) => h.id === id);
    if (idx === -1) return { error: 'Habit not found.' };

    const nextName = updates.name !== undefined ? String(updates.name).trim() : this.habits[idx].name;
    if (!nextName) return { error: 'Habit name cannot be empty.' };
    if (nextName.length > 80) return { error: 'Habit name must be 80 characters or fewer.' };

    const dup = this.habits.some(
      (h) => h.id !== id && !h.archived && h.name.toLowerCase() === nextName.toLowerCase()
    );
    if (dup) return { error: 'Another active habit already has that name.' };

    this.habits[idx] = normalizeHabit({
      ...this.habits[idx],
      ...updates,
      isDefaultStarter: false,
      name: nextName,
      updatedAt: Date.now()
    }, idx);

    this.saveHabits();
    // Safe: never touches or wipes month logs!
    this.emit('habits-changed', { reason: 'update', habit: this.habits[idx] });
    return { habit: this.habits[idx] };
  }

  moveHabit(id, direction) {
    const active = this.habits.filter((h) => !h.archived);
    const pos = active.findIndex((h) => h.id === id);
    if (pos === -1) return;
    const targetPos = pos + direction;
    if (targetPos < 0 || targetPos >= active.length) return;

    const aIdx = this.habits.indexOf(active[pos]);
    const bIdx = this.habits.indexOf(active[targetPos]);
    [this.habits[aIdx], this.habits[bIdx]] = [this.habits[bIdx], this.habits[aIdx]];
    this.saveHabits();
    this.emit('habits-changed', { reason: 'reorder' });
  }

  archiveHabit(id, archived = true) {
    const habit = this.habits.find((h) => h.id === id);
    if (!habit) return null;

    const snapshot = this._createUndoSnapshot(`archive:${id}`, archived ? `Archived "${habit.name}"` : `Restored "${habit.name}"`);
    habit.archived = archived;
    habit.updatedAt = Date.now();
    this.saveHabits();
    this.emit('habits-changed', { reason: archived ? 'archive' : 'unarchive', habit });
    return snapshot;
  }

  deleteHabit(id) {
    const idx = this.habits.findIndex((h) => h.id === id);
    if (idx === -1) return null;
    const removed = this.habits[idx];
    const snapshot = this._createUndoSnapshot(`delete:${id}`, `Deleted "${removed.name}"`);

    this.habits.splice(idx, 1);
    this.saveHabits();

    // Clean habit entries across all stored months safely
    const keys = new Set([...this._listMonthKeys(), ...this.monthCache.keys()]);
    for (const key of keys) {
      const match = /^habitData_(\d{4})_(\d{1,2})$/.exec(key);
      if (!match) continue;
      const y = Number(match[1]);
      const m = Number(match[2]);
      const data = this.getMonthData(y, m);
      let touched = false;
      const nextHabits = {};
      for (const [entryKey, val] of Object.entries(data.habits)) {
        const dash = entryKey.lastIndexOf('-');
        const hId = dash > 0 ? entryKey.slice(0, dash) : '';
        if (hId === id) {
          touched = true;
        } else {
          nextHabits[entryKey] = val;
        }
      }
      if (touched) {
        this.saveMonthData(y, m, { ...data, habits: nextHabits }, false);
      }
    }

    this.emit('habits-changed', { reason: 'delete', deletedId: id, habit: removed });
    return snapshot;
  }

  applyStarterPack(packId) {
    const pack = STARTER_PACKS[packId];
    if (!pack) return null;
    const snapshot = this._createUndoSnapshot(`pack:${packId}`, `Loaded "${pack.title}" pack`);
    this.habits = pack.habits.map((h, i) => normalizeHabit(h, i));
    this.prefs.activeStarterPack = packId;
    this.saveHabits();
    this.savePrefs(true);
    this.emit('habits-changed', { reason: 'starter-pack', packId });
    return snapshot;
  }

  markOnboardingStep(stepKey) {
    if (!this.prefs.onboarding || this.prefs.onboarding[stepKey]) return;
    this.prefs.onboarding = { ...this.prefs.onboarding, [stepKey]: true };
    this._safeSet(KEYS.PREFS, JSON.stringify(this.prefs));
    this.emit('ui-refresh', { reason: 'onboarding', stepKey });
  }

  // ── Day Log, Wellness & Journal Mutations ──
  setHabitDayState(habitId, year, month, day, state) {
    const data = this.getMonthData(year, month);
    const nextHabits = { ...data.habits };
    const k = `${habitId}-${day}`;
    if (state === 'done' || state === 'rest') {
      nextHabits[k] = state;
      if (state === 'done') this.markOnboardingStep('stamped');
      if (state === 'rest') this.markOnboardingStep('rested');
    } else {
      delete nextHabits[k];
    }
    this.saveMonthData(year, month, { ...data, habits: nextHabits }, true);
  }

  toggleHabitDone(habitId, year, month, day) {
    const data = this.getMonthData(year, month);
    const cur = data.habits[`${habitId}-${day}`];
    const next = cur === 'done' ? null : 'done';
    this.setHabitDayState(habitId, year, month, day, next);
    return next;
  }

  toggleHabitRest(habitId, year, month, day) {
    const data = this.getMonthData(year, month);
    const cur = data.habits[`${habitId}-${day}`];
    const next = cur === 'rest' ? null : 'rest';
    this.setHabitDayState(habitId, year, month, day, next);
    return next;
  }

  setWellnessMetric(metric, year, month, day, value) {
    const data = this.getMonthData(year, month);
    const nextMS = { ...data.moodSleep };
    const key = `${metric}-${day}`;
    if (value === '' || value === null || value === undefined) {
      delete nextMS[key];
    } else {
      nextMS[key] = String(value);
      this.markOnboardingStep('reflected');
    }
    this.saveMonthData(year, month, { ...data, moodSleep: nextMS }, true);
  }

  setJournalEntry(year, month, day, text) {
    const data = this.getMonthData(year, month);
    const nextJournal = { ...data.journal };
    const trimmed = String(text || '').trim();
    if (!trimmed) {
      delete nextJournal[day];
    } else {
      nextJournal[day] = trimmed.slice(0, 5000);
      this.markOnboardingStep('reflected');
    }
    this.saveMonthData(year, month, { ...data, journal: nextJournal }, true);
  }

  clearMonth(year = this.currentYear, month = this.currentMonth) {
    const snapshot = this._createUndoSnapshot(`clear:${year}_${month}`, `Cleared ${year}-${month + 1}`);
    this.saveMonthData(year, month, { habits: {}, moodSleep: {}, journal: {} }, true);
    return snapshot;
  }

  // ── Undo System ──
  _createUndoSnapshot(id, label) {
    const months = {};
    const keys = new Set([...this._listMonthKeys(), ...this.monthCache.keys()]);
    for (const key of keys) {
      const match = /^habitData_(\d{4})_(\d{1,2})$/.exec(key);
      if (!match) continue;
      const data = this.getMonthData(Number(match[1]), Number(match[2]));
      months[key] = structuredClone(data);
    }
    const snap = {
      id: `${id}_${Date.now()}`,
      label,
      habits: structuredClone(this.habits),
      prefs: structuredClone(this.prefs),
      months
    };
    this.undoStack.push(snap);
    if (this.undoStack.length > 10) this.undoStack.shift();
    return snap;
  }

  undo(snapshotId) {
    const idx = snapshotId
      ? this.undoStack.findIndex((s) => s.id === snapshotId)
      : this.undoStack.length - 1;
    if (idx === -1) return false;

    const snap = this.undoStack.splice(idx, 1)[0];
    this.habits = snap.habits.map((h, i) => normalizeHabit(h, i));
    this.prefs = { ...defaultPrefs(), ...snap.prefs };
    this.saveHabits();

    this.monthCache.clear();
    for (const [key, data] of Object.entries(snap.months)) {
      const normalized = normalizeMonthData(data);
      this.monthCache.set(key, normalized);
      this._safeSet(key, JSON.stringify(normalized));
    }

    this.savePrefs(true);
    this.emit('habits-changed', { reason: 'undo' });
    this.emit('data-changed', { year: this.currentYear, month: this.currentMonth });
    return true;
  }

  // ── Conflict-Safe Cloud Merge (Fixes Offline Overwrite & Icon Stripping Bugs) ──
  mergeCloudHabits(cloudHabits = [], metaIcons = {}, metaExtras = {}, { preferCloud = false } = {}) {
    if (!Array.isArray(cloudHabits)) return false;
    const localMap = new Map(this.habits.map((h) => [h.id, h]));
    const merged = [];
    const seen = new Set();

    for (let i = 0; i < cloudHabits.length; i++) {
      const ch = cloudHabits[i];
      if (!ch?.id) continue;
      seen.add(ch.id);
      const local = localMap.get(ch.id);
      const extra = metaExtras[ch.id] || {};
      merged.push(normalizeHabit({
        id: ch.id,
        name: ch.name || local?.name || 'Habit',
        icon: ch.icon || metaIcons[ch.id] || extra.icon || local?.icon || suggestHabitIcon(ch.name),
        routine: ch.routine || extra.routine || local?.routine || 'anytime',
        schedule: Array.isArray(ch.schedule) ? ch.schedule : (Array.isArray(extra.schedule) ? extra.schedule : local?.schedule),
        weeklyTarget: ch.weeklyTarget ?? extra.weeklyTarget ?? local?.weeklyTarget ?? null,
        archived: ch.archived !== undefined ? ch.archived : (extra.archived ?? local?.archived ?? false),
        order: typeof ch.display_order === 'number' ? ch.display_order : i,
        updatedAt: Math.max(local?.updatedAt || 0, Date.now())
      }, i));
    }

    // Preserve locally created or logged habits when merging offline/guest data into cloud
    if (!preferCloud) {
      const allLogs = this.getAllLogsByHabit();
      for (const local of this.habits) {
        if (seen.has(local.id)) continue;
        const hasLogs = Boolean(allLogs[local.id] && Object.keys(allLogs[local.id]).length > 0);
        if (!local.isDefaultStarter || hasLogs) {
          merged.push(normalizeHabit({ ...local, order: merged.length }, merged.length));
          seen.add(local.id);
        }
      }
    }

    // Keep any newly created local habits if cloud had none yet
    if (merged.length === 0 && this.habits.length > 0) {
      return false;
    }

    const before = JSON.stringify(this.habits);
    this.habits = merged;
    const after = JSON.stringify(this.habits);
    if (before !== after) {
      this.saveHabits();
      this.emit('habits-changed', { reason: 'cloud-merge', fromCloud: true });
      return true;
    }
    return false;
  }

  mergeCloudMonth(year, month, cloud, { preferCloud = false } = {}) {
    if (!cloud) return false;
    const key = monthStorageKey(year, month);
    const local = this.getMonthData(year, month);
    const isLocallyDirty = this.dirtyMonths.has(key);

    // Build cloud map
    const cloudHabits = {};
    for (const log of cloud.habitLogs || []) {
      const day = Number(String(log.log_date).split('-')[2]);
      if (!day) continue;
      if (log.status === 'rest') cloudHabits[`${log.habit_id}-${day}`] = 'rest';
      else if (log.completed) cloudHabits[`${log.habit_id}-${day}`] = 'done';
    }

    const cloudMS = {};
    for (const w of cloud.wellnessLogs || []) {
      const day = Number(String(w.log_date).split('-')[2]);
      if (!day) continue;
      if (w.mood != null) cloudMS[`Mood-${day}`] = String(w.mood);
      if (w.sleep_hours != null) cloudMS[`Hours of Sleep-${day}`] = String(w.sleep_hours);
    }

    const cloudJournal = {};
    for (const j of cloud.journalLogs || []) {
      const day = Number(String(j.log_date).split('-')[2]);
      if (!day || !j.entry_text) continue;
      cloudJournal[day] = j.entry_text;
    }

    let merged;
    if (preferCloud && !isLocallyDirty) {
      // Realtime update when local has no pending unsynced edits
      merged = {
        habits: cloudHabits,
        moodSleep: cloudMS,
        journal: Object.keys(cloudJournal).length > 0 || (cloud.journalTableAvailable ?? false)
          ? cloudJournal
          : local.journal
      };
    } else {
      // Safe union merge on initial sign-in or when offline local edits exist!
      merged = {
        habits: { ...cloudHabits, ...local.habits },
        moodSleep: { ...cloudMS, ...local.moodSleep },
        journal: { ...cloudJournal, ...local.journal }
      };
    }

    const before = JSON.stringify({ h: local.habits, m: local.moodSleep, j: local.journal });
    const after = JSON.stringify({ h: merged.habits, m: merged.moodSleep, j: merged.journal });
    if (before !== after) {
      this.saveMonthData(year, month, merged, false);
      this.emit('cloud-applied', { year, month });
      return true;
    }
    return false;
  }

  markMonthSynced(year, month) {
    this.dirtyMonths.delete(monthStorageKey(year, month));
  }

  // ── Full JSON Backup & Restore ──
  exportBackupJSON() {
    const months = {};
    const keys = new Set([...this._listMonthKeys(), ...this.monthCache.keys()]);
    for (const key of keys) {
      const match = /^habitData_(\d{4})_(\d{1,2})$/.exec(key);
      if (!match) continue;
      months[key] = this.getMonthData(Number(match[1]), Number(match[2]));
    }
    return JSON.stringify({
      app: 'Daymark',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      prefs: this.prefs,
      habits: this.habits,
      months
    }, null, 2);
  }

  /**
   * Searches Daily Notes across ALL stored months (newest first).
   */
  searchAllNotes(query = '') {
    const q = String(query || '').trim().toLowerCase();
    const keys = new Set([...this._listMonthKeys(), ...this.monthCache.keys()]);
    const months = [];
    for (const key of keys) {
      const m = /^habitData_(\d{4})_(\d{1,2})$/.exec(key);
      if (m) months.push({ key, year: Number(m[1]), month: Number(m[2]) });
    }
    months.sort((a, b) => (b.year - a.year) || (b.month - a.month));

    const results = [];
    for (const { year, month } of months) {
      const totalDays = getDaysInMonth(year, month);
      const data = this.getMonthData(year, month);
      for (let day = totalDays; day >= 1; day--) {
        const text = data.journal[day];
        if (!text?.trim()) continue;
        const dateKey = formatDateKey(year, month, day);
        if (q && !text.toLowerCase().includes(q) && !`day ${day}`.includes(q) && !dateKey.includes(q)) {
          continue;
        }
        results.push({ year, month, day, dateKey, text });
      }
    }
    return results;
  }

  importBackupJSON(jsonString, { mode = 'replace' } = {}) {
    const parsed = safeJSONParse(jsonString, null);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.habits)) {
      return { error: 'Invalid backup file. Please select a valid Daymark JSON export.' };
    }

    const snapshot = this._createUndoSnapshot('import-json', 'Imported JSON backup');

    if (mode === 'merge') {
      const existingById = new Map(this.habits.map((h) => [h.id, h]));
      const existingByName = new Map(this.habits.map((h) => [h.name.toLowerCase(), h]));
      const incomingIdRemap = new Map();
      const mergedHabits = [...this.habits];

      for (const rawH of parsed.habits) {
        const norm = normalizeHabit(rawH, mergedHabits.length);
        const byId = existingById.get(norm.id);
        const byName = existingByName.get(norm.name.toLowerCase());
        if (byId) {
          incomingIdRemap.set(norm.id, byId.id);
        } else if (byName) {
          incomingIdRemap.set(norm.id, byName.id);
        } else {
          mergedHabits.push(norm);
          existingById.set(norm.id, norm);
          existingByName.set(norm.name.toLowerCase(), norm);
        }
      }
      this.habits = mergedHabits.map((h, i) => normalizeHabit(h, i));
      this.saveHabits();

      if (parsed.months && typeof parsed.months === 'object') {
        for (const [key, val] of Object.entries(parsed.months)) {
          const match = /^habitData_(\d{4})_(\d{1,2})$/.exec(key);
          if (!match) continue;
          const y = Number(match[1]);
          const m = Number(match[2]);
          const local = this.getMonthData(y, m);
          const incoming = normalizeMonthData(val);
          const remappedHabits = { ...local.habits };
          for (const [hk, state] of Object.entries(incoming.habits)) {
            const dash = hk.lastIndexOf('-');
            if (dash <= 0) continue;
            const origId = hk.slice(0, dash);
            const dayPart = hk.slice(dash + 1);
            const targetId = incomingIdRemap.get(origId) || origId;
            if (!remappedHabits[`${targetId}-${dayPart}`]) {
              remappedHabits[`${targetId}-${dayPart}`] = state;
            }
          }
          this.saveMonthData(y, m, {
            habits: remappedHabits,
            moodSleep: { ...incoming.moodSleep, ...local.moodSleep },
            journal: { ...incoming.journal, ...local.journal }
          }, false);
        }
      }
    } else {
      // Replace mode: restore exact backup snapshot cleanly
      for (const existingKey of this._listMonthKeys()) {
        this._safeRemove(existingKey);
      }
      this.monthCache.clear();

      this.habits = parsed.habits.map((h, i) => normalizeHabit(h, i));
      this.saveHabits();

      if (parsed.prefs && typeof parsed.prefs === 'object') {
        this.prefs = { ...defaultPrefs(), ...parsed.prefs };
        this.savePrefs(true);
      }

      if (parsed.months && typeof parsed.months === 'object') {
        for (const [key, val] of Object.entries(parsed.months)) {
          const match = /^habitData_(\d{4})_(\d{1,2})$/.exec(key);
          if (!match) continue;
          this.saveMonthData(Number(match[1]), Number(match[2]), val, false);
        }
      }
    }

    this.emit('habits-changed', { reason: 'import' });
    this.emit('data-changed', { year: this.currentYear, month: this.currentMonth });
    return { ok: true, snapshot, habitCount: this.habits.length, mode };
  }

  // ── Formula-Safe CSV Export (Includes Daily Notes) ──
  buildMonthCSV(year = this.currentYear, month = this.currentMonth) {
    const activeHabits = this.habits.filter((h) => !h.archived);
    const totalDays = getDaysInMonth(year, month);
    const data = this.getMonthData(year, month);
    const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

    const headers = [
      'Date',
      'Day',
      ...activeHabits.map((h) => h.name),
      'Mood (1-10)',
      'Sleep (hrs)',
      'Daily Note'
    ].map(sanitizeCSVCell);

    const lines = [headers.join(',')];

    for (let d = 1; d <= totalDays; d++) {
      const dt = new Date(year, month, d);
      const row = [
        formatDateKey(year, month, d),
        dayFmt.format(dt),
        ...activeHabits.map((h) => {
          const st = data.habits[`${h.id}-${d}`];
          return st === 'done' ? '1' : (st === 'rest' ? 'Rest' : '0');
        }),
        data.moodSleep[`Mood-${d}`] || '',
        data.moodSleep[`Hours of Sleep-${d}`] || '',
        data.journal[d] || ''
      ].map(sanitizeCSVCell);
      lines.push(row.join(','));
    }

    return '\uFEFF' + lines.join('\r\n');
  }

  // ── Shared-Device Safe Local Wipe (for Sign-Out Option) ──
  clearAllLocalData() {
    const keys = this._listMonthKeys();
    for (const k of keys) this._safeRemove(k);
    this._safeRemove(KEYS.HABITS);
    this._safeRemove(KEYS.PREFS);
    this._safeRemove(KEYS.LEGACY_THEME);
    this._safeRemove(KEYS.LEGACY_JOURNAL_TITLE);
    this._safeRemove(KEYS.LEGACY_JOURNAL_PILLS);
    this._safeRemove(KEYS.LEGACY_VIEW_MODE);
    this._safeRemove(KEYS.LEGACY_NOTION);
    this._safeRemove('habitTracker_onboarded');

    this.monthCache.clear();
    this.dirtyMonths.clear();
    this.undoStack = [];
    this.prefs = defaultPrefs();
    this.habits = STARTER_PACKS.everyday.habits.map((h, i) => normalizeHabit(h, i));
    this.saveHabits();
    this.savePrefs(false);
    this.emit('habits-changed', { reason: 'local-wipe' });
  }
}

export const store = new DaymarkStore();
