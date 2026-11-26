// ============================================================
// DAYMARK — CONFLICT-SAFE SUPABASE CLOUD SYNC LAYER
// Local-first: merges offline edits safely, preserves icons &
// schedules, deletes cleared notes & empty lists, honest status.
// ============================================================

import { store } from './store.js';
import { formatDateKey, getDaysInMonth } from './streaks.js';
import { toast } from './ui/toast.js';
import { openSignOutChoiceDialog } from './ui/dialogs.js';

let client = null;
let currentUser = null;
let realtimeChannel = null;
let pushTimer = null;
let pullTimer = null;
let prefTimer = null;
let isPulling = false;
let retryCount = 0;
let activeFullSync = null;
let isAuthFlowRunning = false;
const pendingPushMonths = new Set();
const pendingPrefMonths = new Set();

function getClientStatus() {
  const cfg = window.SUPABASE_CONFIG;
  if (!cfg?.url || !cfg?.anonKey || cfg.url.includes('YOUR_PROJECT') || cfg.anonKey.includes('YOUR_ANON')) {
    return 'not_configured';
  }
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    return 'sdk_missing';
  }
  return 'ready';
}

function getConfiguredHost() {
  try {
    return new URL(window.SUPABASE_CONFIG?.url || '').hostname;
  } catch {
    return '';
  }
}

function getClient() {
  if (client) return client;
  if (getClientStatus() !== 'ready') return null;
  const cfg = window.SUPABASE_CONFIG;
  try {
    client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    return client;
  } catch (err) {
    console.warn('[Daymark Sync] Init failed:', err?.message);
    return null;
  }
}

function isNetworkError(err) {
  if (!err) return false;
  const name = String(err.name || '');
  const msg = String(err.message || err || '').toLowerCase();
  return name === 'AuthRetryableFetchError'
    || err.status === 0
    || msg.includes('failed to fetch')
    || msg.includes('networkerror')
    || msg.includes('load failed')
    || msg.includes('net::err')
    || msg.includes('name_not_resolved')
    || msg === '{}'
    || msg === '';
}

function formatAuthError(err) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'You appear to be offline. Reconnect to sign in, or continue using Daymark locally.';
  }
  const raw = String(err?.message || '').trim();
  const lower = raw.toLowerCase();

  if (isNetworkError(err)) {
    const host = getConfiguredHost();
    const hostNote = host ? ` (${host})` : '';
    return `Could not reach the Supabase cloud server${hostNote}. Free-tier Supabase projects pause after 7 days of inactivity — restore your project at supabase.com/dashboard or update supabase-config.js.`;
  }
  if (lower.includes('invalid login credentials')) {
    return "Incorrect email or password. If you haven't created an account yet, click \"Don't have an account? Create one\" below.";
  }
  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email address first — check your inbox (and spam folder) for the verification link.';
  }
  if (lower.includes('user already registered')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests') || err?.status === 429) {
    return 'Too many attempts in a short time. Please wait a minute and try again.';
  }
  return raw || 'Authentication failed. Please check your email and password and try again.';
}

async function resolveUser(forceFresh = false) {
  const c = getClient();
  if (!c) return null;
  if (currentUser && !forceFresh) return currentUser;
  try {
    const { data, error } = await c.auth.getSession();
    if (error || !data?.session) {
      currentUser = null;
    } else {
      currentUser = data.session.user || null;
    }
    return currentUser;
  } catch {
    return currentUser;
  }
}

// ── UI Status Badge ──
function setSyncStatus(state, detail = '') {
  const dot = document.getElementById('syncDot');
  const text = document.getElementById('syncStatusText');
  const btn = document.getElementById('syncNowBtn');
  if (!dot || !text || !btn) return;

  const labels = {
    syncing: 'Syncing…',
    synced: 'Synced',
    error: 'Retry sync',
    offline: 'Offline'
  };
  dot.className = `sync-dot ${state}`;
  text.textContent = labels[state] || 'Offline';
  btn.title = detail || (state === 'synced' ? 'Synced across your devices. Click to sync now.' : labels[state]);
}

function updateAccountUI(user) {
  const pill = document.getElementById('accountPill');
  const signInBtn = document.getElementById('openAuthBtn');
  if (user) {
    pill?.classList.remove('hidden');
    signInBtn?.classList.add('hidden');
    const initials = document.getElementById('userInitials');
    const emailEl = document.getElementById('userEmailText');
    if (initials) initials.textContent = (user.email || 'ME').slice(0, 2).toUpperCase();
    if (emailEl) emailEl.textContent = user.email || 'Signed in';
  } else {
    pill?.classList.add('hidden');
    signInBtn?.classList.remove('hidden');
  }
}

// ── Push Helpers ──
async function pushHabits() {
  const c = getClient();
  const user = await resolveUser();
  if (!c || !user) return;

  const habits = store.habits;
  const rows = habits.map((h, i) => ({
    id: h.id,
    user_id: user.id,
    name: h.name,
    display_order: i
  }));

  // Clean up removed habits even if user deleted their very last habit!
  try {
    const { data: cloudHabits } = await c.from('habits').select('id').eq('user_id', user.id);
    if (Array.isArray(cloudHabits) && cloudHabits.length > 0) {
      const localIds = new Set(rows.map((r) => r.id));
      const removed = cloudHabits.filter((h) => !localIds.has(h.id)).map((h) => h.id);
      if (removed.length > 0) {
        await c.from('habit_logs').delete().eq('user_id', user.id).in('habit_id', removed);
        await c.from('habits').delete().eq('user_id', user.id).in('id', removed);
      }
    }
  } catch (err) {
    console.warn('[Daymark Sync] Habit cleanup notice:', err?.message);
  }

  if (rows.length > 0) {
    const { error } = await c.from('habits').upsert(rows, { onConflict: 'id,user_id' });
    if (error) throw error;
  }
}

async function pushMonth(year, month) {
  const c = getClient();
  const user = await resolveUser();
  if (!c || !user) return;

  const totalDays = getDaysInMonth(year, month);
  const start = formatDateKey(year, month, 1);
  const end = formatDateKey(year, month, totalDays);
  const data = store.getMonthData(year, month);

  // 1. Habit logs
  const activeLogKeys = new Set();
  const logRows = [];
  for (const [key, state] of Object.entries(data.habits || {})) {
    if (state !== 'done') continue; // Rest days stored safely in user_metadata fallback + optional column
    const dash = key.lastIndexOf('-');
    const habitId = key.slice(0, dash);
    const day = Number(key.slice(dash + 1));
    if (!habitId || Number.isNaN(day) || day < 1 || day > totalDays) continue;
    const logDate = formatDateKey(year, month, day);
    activeLogKeys.add(`${habitId}|${logDate}`);
    logRows.push({ user_id: user.id, habit_id: habitId, log_date: logDate, completed: true });
  }

  // Delete unchecked habit logs in cloud
  const { data: cloudLogs } = await c.from('habit_logs')
    .select('habit_id, log_date')
    .eq('user_id', user.id)
    .gte('log_date', start)
    .lte('log_date', end);

  if (Array.isArray(cloudLogs) && cloudLogs.length > 0) {
    const deleteMap = {};
    for (const cl of cloudLogs) {
      if (!activeLogKeys.has(`${cl.habit_id}|${cl.log_date}`)) {
        if (!deleteMap[cl.habit_id]) deleteMap[cl.habit_id] = [];
        deleteMap[cl.habit_id].push(cl.log_date);
      }
    }
    for (const [hId, dates] of Object.entries(deleteMap)) {
      await c.from('habit_logs').delete().eq('user_id', user.id).eq('habit_id', hId).in('log_date', dates);
    }
  }

  if (logRows.length > 0) {
    const { error } = await c.from('habit_logs').upsert(logRows, { onConflict: 'user_id,habit_id,log_date' });
    if (error) throw error;
  }

  // 2. Wellness logs (round sleep cleanly for integer legacy columns while storing decimal in metadata if needed)
  const wellByDate = {};
  for (const [key, val] of Object.entries(data.moodSleep || {})) {
    const dash = key.lastIndexOf('-');
    const metric = key.slice(0, dash);
    const day = Number(key.slice(dash + 1));
    if (!metric || Number.isNaN(day) || day < 1 || day > totalDays) continue;
    const logDate = formatDateKey(year, month, day);
    if (!wellByDate[logDate]) {
      wellByDate[logDate] = { user_id: user.id, log_date: logDate, mood: null, sleep_hours: null };
    }
    if (metric === 'Mood' && !Number.isNaN(Number(val))) {
      wellByDate[logDate].mood = Math.round(Number(val));
    }
    if (metric === 'Hours of Sleep' && !Number.isNaN(Number(val))) {
      wellByDate[logDate].sleep_hours = Number(val);
    }
  }

  const { data: cloudWell } = await c.from('wellness_logs')
    .select('log_date')
    .eq('user_id', user.id)
    .gte('log_date', start)
    .lte('log_date', end);

  if (Array.isArray(cloudWell)) {
    const removedDates = cloudWell.filter((w) => !wellByDate[w.log_date]).map((w) => w.log_date);
    if (removedDates.length > 0) {
      await c.from('wellness_logs').delete().eq('user_id', user.id).in('log_date', removedDates);
    }
  }

  const wellRows = Object.values(wellByDate).filter((w) => w.mood !== null || w.sleep_hours !== null);
  if (wellRows.length > 0) {
    let { error } = await c.from('wellness_logs').upsert(wellRows, { onConflict: 'user_id,log_date' });
    // Graceful fallback if user's existing Supabase wellness_logs.sleep_hours column is still integer
    if (error && (error.code === '22P02' || String(error.message || '').toLowerCase().includes('invalid input syntax for type integer'))) {
      const roundedRows = wellRows.map((w) => ({
        ...w,
        sleep_hours: w.sleep_hours !== null ? Math.round(w.sleep_hours) : null
      }));
      ({ error } = await c.from('wellness_logs').upsert(roundedRows, { onConflict: 'user_id,log_date' }));
    }
    if (error) throw error;
  }

  // 3. Journal logs (including deletion of cleared days!)
  const journalRows = [];
  const activeJournalDates = new Set();
  for (const [dayKey, text] of Object.entries(data.journal || {})) {
    const day = Number(dayKey);
    if (Number.isNaN(day) || day < 1 || day > totalDays || !text?.trim()) continue;
    const logDate = formatDateKey(year, month, day);
    activeJournalDates.add(logDate);
    journalRows.push({ user_id: user.id, log_date: logDate, entry_text: text.trim() });
  }

  try {
    const { data: cloudJ, error: jSelErr } = await c.from('journal_logs')
      .select('log_date')
      .eq('user_id', user.id)
      .gte('log_date', start)
      .lte('log_date', end);

    if (!jSelErr && Array.isArray(cloudJ)) {
      const clearedDates = cloudJ.filter((j) => !activeJournalDates.has(j.log_date)).map((j) => j.log_date);
      if (clearedDates.length > 0) {
        await c.from('journal_logs').delete().eq('user_id', user.id).in('log_date', clearedDates);
      }
    }
    if (journalRows.length > 0) {
      await c.from('journal_logs').upsert(journalRows, { onConflict: 'user_id,log_date' });
    }
  } catch {
    // Graceful degradation if journal_logs table isn't created yet
  }

  store.markMonthSynced(year, month);
}

async function pushPreferences() {
  const c = getClient();
  const user = await resolveUser();
  if (!c || !user) return;

  // Compact metadata only — never base64 images (keeps JWT headers tiny and safe!)
  const habitExtras = {};
  const habitIcons = {};
  for (const h of store.habits) {
    habitIcons[h.id] = h.icon;
    habitExtras[h.id] = {
      icon: h.icon,
      routine: h.routine,
      schedule: h.schedule,
      archived: h.archived
    };
  }

  // Preserve rest-day markers for current month and any recently edited months
  const monthsToInclude = new Set([`${store.currentYear}_${store.currentMonth}`, ...pendingPrefMonths]);
  pendingPrefMonths.clear();
  const restUpdates = {};
  for (const ym of monthsToInclude) {
    const [yStr, mStr] = ym.split('_');
    const monthData = store.getMonthData(Number(yStr), Number(mStr));
    restUpdates[`rest_${yStr}_${mStr}`] = Object.entries(monthData.habits || {})
      .filter(([, v]) => v === 'rest')
      .map(([k]) => k);
  }

  try {
    const res = await c.auth.updateUser({
      data: {
        daymarkPrefs: {
          appearance: store.prefs.appearance,
          ink: store.prefs.ink,
          weekStartsOn: store.prefs.weekStartsOn,
          paperDots: store.prefs.paperDots,
          motto: store.prefs.motto,
          journalTitle: store.prefs.journalTitle,
          journalPills: store.prefs.journalPills
        },
        habitIcons,
        habitExtras,
        ...restUpdates,
        lastSyncedAt: new Date().toISOString()
      }
    });
    if (res?.data?.user) {
      currentUser = res.data.user;
    }
  } catch (err) {
    console.warn('[Daymark Sync] Preferences sync skipped:', err?.message);
  }
}

// ── Pull Helpers ──
async function pullHabits() {
  const c = getClient();
  const user = await resolveUser();
  if (!c || !user) return null;
  const { data, error } = await c.from('habits')
    .select('id, name, display_order')
    .eq('user_id', user.id)
    .order('display_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function pullMonth(year, month) {
  const c = getClient();
  const user = await resolveUser();
  if (!c || !user) return null;

  const totalDays = getDaysInMonth(year, month);
  const start = formatDateKey(year, month, 1);
  const end = formatDateKey(year, month, totalDays);

  const [logsRes, wellRes] = await Promise.all([
    c.from('habit_logs').select('habit_id, log_date, completed').eq('user_id', user.id).gte('log_date', start).lte('log_date', end),
    c.from('wellness_logs').select('log_date, mood, sleep_hours').eq('user_id', user.id).gte('log_date', start).lte('log_date', end)
  ]);

  if (logsRes.error) throw logsRes.error;
  if (wellRes.error) throw wellRes.error;

  let journalLogs = [];
  let journalTableAvailable = false;
  try {
    const jRes = await c.from('journal_logs')
      .select('log_date, entry_text')
      .eq('user_id', user.id)
      .gte('log_date', start)
      .lte('log_date', end);
    if (!jRes.error && Array.isArray(jRes.data)) {
      journalLogs = jRes.data;
      journalTableAvailable = true;
    }
  } catch {
    // ignore missing optional table
  }

  // Restore any rest markers saved in metadata for this month
  const restEntries = user.user_metadata?.[`rest_${year}_${month}`];
  const habitLogs = [...(logsRes.data || [])];
  if (Array.isArray(restEntries)) {
    for (const rk of restEntries) {
      const dash = rk.lastIndexOf('-');
      const hId = rk.slice(0, dash);
      const day = Number(rk.slice(dash + 1));
      if (hId && day >= 1 && day <= totalDays) {
        habitLogs.push({ habit_id: hId, log_date: formatDateKey(year, month, day), status: 'rest', completed: false });
      }
    }
  }

  return { habitLogs, wellnessLogs: wellRes.data || [], journalLogs, journalTableAvailable };
}

function applyCloudMetadataPrefs(meta) {
  if (!meta) return;
  if (meta.daymarkPrefs && typeof meta.daymarkPrefs === 'object') {
    store.updatePrefs(meta.daymarkPrefs, false);
  }
}

// ── Orchestration ──
async function fullSync({ preferCloud = false } = {}) {
  if (activeFullSync) return activeFullSync;

  activeFullSync = (async () => {
    const user = await resolveUser();
    if (!user) return;
    if (!navigator.onLine) {
      setSyncStatus('offline', 'Offline — changes stay saved locally');
      return;
    }

    setSyncStatus('syncing');
    const y = store.currentYear;
    const m = store.currentMonth;

    try {
      const [cloudHabits, cloudMonth] = await Promise.all([
        pullHabits(),
        pullMonth(y, m)
      ]);

      const meta = user.user_metadata || {};
      applyCloudMetadataPrefs(meta);

      if (cloudHabits && cloudHabits.length > 0) {
        store.mergeCloudHabits(cloudHabits, meta.habitIcons || {}, meta.habitExtras || {}, { preferCloud });
      }

      if (cloudMonth) {
        store.mergeCloudMonth(y, m, cloudMonth, { preferCloud });
      }

      // Push any locally merged offline changes back up cleanly
      await pushHabits();
      await pushMonth(y, m);
      await pushPreferences();
      retryCount = 0;
      setSyncStatus('synced');
    } catch (err) {
      console.warn('[Daymark Sync] Full sync issue:', err?.message);
      if (!navigator.onLine) {
        setSyncStatus('offline');
      } else {
        setSyncStatus('error', err?.message || 'Sync error — click to retry');
      }
    } finally {
      activeFullSync = null;
    }
  })();

  return activeFullSync;
}

function schedulePush(year, month) {
  if (!currentUser) return;
  pendingPushMonths.add(`${year}_${month}`);
  clearTimeout(pushTimer);
  setSyncStatus('syncing');

  pushTimer = setTimeout(async () => {
    if (!navigator.onLine) {
      setSyncStatus('offline');
      return;
    }
    const monthsSnapshot = Array.from(pendingPushMonths);
    pendingPushMonths.clear();
    try {
      await pushHabits();
      for (const ym of monthsSnapshot) {
        const [yStr, mStr] = ym.split('_');
        await pushMonth(Number(yStr), Number(mStr));
      }
      retryCount = 0;
      setSyncStatus('synced');
    } catch (err) {
      for (const ym of monthsSnapshot) pendingPushMonths.add(ym);
      console.warn('[Daymark Sync] Background push failed:', err?.message);
      if (isNetworkError(err) && retryCount < 3) {
        retryCount++;
        setTimeout(() => schedulePush(year, month), retryCount * 2500);
        return;
      }
      setSyncStatus('error', err?.message || 'Sync error — click to retry');
    }
  }, 800);
}

function schedulePrefsPush(year = null, month = null) {
  if (!currentUser) return;
  if (year !== null && month !== null) {
    pendingPrefMonths.add(`${year}_${month}`);
  }
  clearTimeout(prefTimer);
  prefTimer = setTimeout(() => {
    if (navigator.onLine) pushPreferences();
  }, 1500);
}

function schedulePull() {
  if (!currentUser || isPulling || !navigator.onLine) return;
  clearTimeout(pullTimer);
  pullTimer = setTimeout(async () => {
    if (isPulling || !currentUser) return;
    isPulling = true;
    try {
      const y = store.currentYear;
      const m = store.currentMonth;
      const [cloudHabits, cloudMonth] = await Promise.all([pullHabits(), pullMonth(y, m)]);
      const meta = currentUser.user_metadata || {};
      if (cloudHabits && cloudHabits.length > 0) {
        store.mergeCloudHabits(cloudHabits, meta.habitIcons || {}, meta.habitExtras || {}, { preferCloud: true });
      }
      if (cloudMonth) {
        store.mergeCloudMonth(y, m, cloudMonth, { preferCloud: true });
      }
      setSyncStatus('synced');
    } catch (err) {
      setSyncStatus('error', err?.message || 'Pull failed');
    } finally {
      isPulling = false;
    }
  }, 700);
}

function subscribeRealtime(user) {
  const c = getClient();
  if (!c || !user || realtimeChannel) return;
  try {
    realtimeChannel = c.channel(`daymark-live-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habits', filter: `user_id=eq.${user.id}` }, schedulePull)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habit_logs', filter: `user_id=eq.${user.id}` }, schedulePull)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wellness_logs', filter: `user_id=eq.${user.id}` }, schedulePull)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journal_logs', filter: `user_id=eq.${user.id}` }, schedulePull)
      .subscribe();
  } catch (err) {
    console.warn('[Daymark Sync] Realtime unavailable, using focus sync:', err?.message);
  }
}

function unsubscribeRealtime() {
  const c = getClient();
  if (realtimeChannel && c) {
    try { c.removeChannel(realtimeChannel); } catch { /* ignore */ }
  }
  realtimeChannel = null;
}

export async function manualSyncNow() {
  if (!navigator.onLine) {
    setSyncStatus('offline');
    toast.info('You are offline — changes stay safe locally and will sync when you reconnect.');
    return;
  }
  const user = await resolveUser(true);
  if (!user) {
    openAuthDialog('signin');
    return;
  }
  await fullSync({ preferCloud: false });
  await pushPreferences();
  toast.success('Synced across devices');
}

// ── Auth Dialog (Sign In / Sign Up / Forgot Password / Recovery) ──
let authMode = 'signin'; // 'signin' | 'signup' | 'reset' | 'update-password'

function getSubmitLabel(mode) {
  if (mode === 'signup') return 'Create Account';
  if (mode === 'reset') return 'Send Reset Link';
  if (mode === 'update-password') return 'Update Password';
  return 'Sign In';
}

export function openAuthDialog(mode = 'signin') {
  const dialog = document.getElementById('authDialog');
  if (!dialog) return;

  const status = getClientStatus();
  if (status === 'not_configured') {
    toast.error('Cloud sync is not configured yet. Add your Supabase URL and anon key in supabase-config.js.');
    return;
  }
  if (status === 'sdk_missing' || !getClient()) {
    toast.error('Could not load the cloud sync library. Check your internet connection or ad blocker and reload.');
    return;
  }

  setAuthMode(mode);
  dialog.returnValue = '';
  if (!dialog.open) dialog.showModal();
  if (mode === 'update-password') {
    document.getElementById('authPasswordField')?.focus();
  } else {
    document.getElementById('authEmailField')?.focus();
  }
}

function setAuthMode(mode) {
  authMode = mode;
  const title = document.getElementById('authDialogTitle');
  const subtitle = document.getElementById('authDialogSubtitle');
  const emailGroup = document.getElementById('authEmailGroup');
  const emailInput = document.getElementById('authEmailField');
  const pwGroup = document.getElementById('authPasswordGroup');
  const pwInput = document.getElementById('authPasswordField');
  const submitBtn = document.getElementById('authSubmitBtn');
  const switchBtn = document.getElementById('authSwitchModeBtn');
  const forgotBtn = document.getElementById('authForgotBtn');
  const errEl = document.getElementById('authFormError');
  const noticeEl = document.getElementById('authFormNotice');

  if (errEl) errEl.textContent = '';
  if (noticeEl) noticeEl.textContent = '';

  if (mode === 'signup') {
    if (title) title.textContent = 'Create a Daymark account';
    if (subtitle) subtitle.textContent = 'Back up your habits and sync across phone and computer.';
    emailGroup?.classList.remove('hidden');
    if (emailInput) { emailInput.disabled = false; emailInput.required = true; }
    pwGroup?.classList.remove('hidden');
    if (pwInput) {
      pwInput.disabled = false;
      pwInput.required = true;
      pwInput.setAttribute('autocomplete', 'new-password');
    }
    if (submitBtn) submitBtn.textContent = getSubmitLabel('signup');
    if (switchBtn) {
      switchBtn.classList.remove('hidden');
      switchBtn.textContent = 'Already have an account? Sign in';
    }
    forgotBtn?.classList.add('hidden');
  } else if (mode === 'reset') {
    if (title) title.textContent = 'Reset your password';
    if (subtitle) subtitle.textContent = 'Enter your email and we will send a password reset link.';
    emailGroup?.classList.remove('hidden');
    if (emailInput) { emailInput.disabled = false; emailInput.required = true; }
    pwGroup?.classList.add('hidden');
    if (pwInput) { pwInput.disabled = true; pwInput.required = false; }
    if (submitBtn) submitBtn.textContent = getSubmitLabel('reset');
    if (switchBtn) {
      switchBtn.classList.remove('hidden');
      switchBtn.textContent = 'Back to sign in';
    }
    forgotBtn?.classList.add('hidden');
  } else if (mode === 'update-password') {
    if (title) title.textContent = 'Choose a new password';
    if (subtitle) subtitle.textContent = 'Enter a new password (at least 6 characters) for your Daymark account.';
    emailGroup?.classList.add('hidden');
    if (emailInput) { emailInput.disabled = true; emailInput.required = false; }
    pwGroup?.classList.remove('hidden');
    if (pwInput) {
      pwInput.disabled = false;
      pwInput.required = true;
      pwInput.value = '';
      pwInput.setAttribute('autocomplete', 'new-password');
    }
    if (submitBtn) submitBtn.textContent = getSubmitLabel('update-password');
    switchBtn?.classList.add('hidden');
    forgotBtn?.classList.add('hidden');
  } else {
    if (title) title.textContent = 'Sign in to sync';
    if (subtitle) subtitle.textContent = 'Access your Daymark rhythm from any device.';
    emailGroup?.classList.remove('hidden');
    if (emailInput) { emailInput.disabled = false; emailInput.required = true; }
    pwGroup?.classList.remove('hidden');
    if (pwInput) {
      pwInput.disabled = false;
      pwInput.required = true;
      pwInput.setAttribute('autocomplete', 'current-password');
    }
    if (submitBtn) submitBtn.textContent = getSubmitLabel('signin');
    if (switchBtn) {
      switchBtn.classList.remove('hidden');
      switchBtn.textContent = "Don't have an account? Create one";
    }
    forgotBtn?.classList.remove('hidden');
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const c = getClient();
  const errEl = document.getElementById('authFormError');
  const noticeEl = document.getElementById('authFormNotice');
  const submitBtn = document.getElementById('authSubmitBtn');
  const email = document.getElementById('authEmailField')?.value?.trim() || '';
  const password = document.getElementById('authPasswordField')?.value || '';

  if (errEl) errEl.textContent = '';
  if (noticeEl) noticeEl.textContent = '';

  if (!c) {
    if (errEl) errEl.textContent = 'Cloud sync is unavailable right now.';
    return;
  }
  if (authMode !== 'update-password') {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (errEl) errEl.textContent = 'Please enter a valid email address.';
      document.getElementById('authEmailField')?.focus();
      return;
    }
  }
  if (authMode !== 'reset' && password.length < 6) {
    if (errEl) errEl.textContent = 'Password must be at least 6 characters.';
    document.getElementById('authPasswordField')?.focus();
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Please wait…';
  }

  const redirectUrl = window.location.origin + window.location.pathname;
  isAuthFlowRunning = true;

  try {
    if (authMode === 'reset') {
      const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
      if (error) throw error;
      if (noticeEl) noticeEl.textContent = 'Password reset link sent — check your inbox (and spam folder).';
      toast.success('Password reset link sent — check your inbox.');
    } else if (authMode === 'update-password') {
      const { data, error } = await c.auth.updateUser({ password });
      if (error) throw error;
      if (data?.user) {
        currentUser = data.user;
        updateAccountUI(currentUser);
      }
      document.getElementById('authDialog')?.close('password-updated');
      toast.success('Password updated! You are signed in.');
    } else if (authMode === 'signup') {
      const { data, error } = await c.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectUrl }
      });
      if (error) throw error;
      // Supabase returns empty identities when an account already exists and email confirmation is enabled
      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        if (errEl) errEl.textContent = 'An account with this email already exists. Try signing in or using "Forgot password?".';
      } else if (!data?.session) {
        if (noticeEl) noticeEl.textContent = 'Account created! Check your email inbox (and spam folder) for a confirmation link, then sign in.';
        toast.success('Account created! Check your email to confirm.');
      } else {
        currentUser = data.user;
        updateAccountUI(currentUser);
        document.getElementById('authDialog')?.close('signed-in');
        await fullSync({ preferCloud: false });
        subscribeRealtime(currentUser);
        toast.success(`Cloud sync active for ${currentUser.email}`);
      }
    } else {
      const { data, error } = await c.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUser = data.user;
      updateAccountUI(currentUser);
      document.getElementById('authDialog')?.close('signed-in');
      await fullSync({ preferCloud: false });
      subscribeRealtime(currentUser);
      toast.success(`Signed in as ${currentUser.email}`);
    }
  } catch (err) {
    if (errEl) errEl.textContent = formatAuthError(err);
  } finally {
    isAuthFlowRunning = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = getSubmitLabel(authMode);
    }
    const pwField = document.getElementById('authPasswordField');
    if (pwField && document.getElementById('authDialog')?.open === false) {
      pwField.value = '';
    }
  }
}

export async function handleSignOut() {
  const email = currentUser?.email;
  const choice = await openSignOutChoiceDialog(email);
  if (choice === 'cancel') return;

  unsubscribeRealtime();
  const c = getClient();
  if (c) {
    try { await c.auth.signOut(); } catch { /* ignore */ }
  }
  currentUser = null;
  updateAccountUI(null);
  setSyncStatus('offline');

  if (choice === 'clear') {
    store.clearAllLocalData();
    toast.info('Signed out and cleared local data on this device.');
  } else {
    toast.info('Signed out. Your local copy remains saved on this device.');
  }
}

export async function initSync() {
  // Wire Auth Dialog controls
  document.getElementById('openAuthBtn')?.addEventListener('click', () => openAuthDialog('signin'));
  document.getElementById('authForm')?.addEventListener('submit', handleAuthSubmit);
  document.getElementById('authCancelBtn')?.addEventListener('click', () => document.getElementById('authDialog')?.close());
  document.getElementById('authSwitchModeBtn')?.addEventListener('click', () => {
    setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
  });
  document.getElementById('authForgotBtn')?.addEventListener('click', () => setAuthMode('reset'));

  // Password visibility toggle
  const pwToggle = document.getElementById('authPwToggle');
  const pwInput = document.getElementById('authPasswordField');
  pwToggle?.addEventListener('click', () => {
    if (!pwInput) return;
    const nextType = pwInput.type === 'password' ? 'text' : 'password';
    pwInput.type = nextType;
    pwToggle.setAttribute('aria-pressed', String(nextType === 'text'));
    pwToggle.setAttribute('aria-label', nextType === 'text' ? 'Hide password' : 'Show password');
  });

  document.getElementById('syncNowBtn')?.addEventListener('click', manualSyncNow);
  document.getElementById('signOutBtn')?.addEventListener('click', handleSignOut);

  // React to store changes
  store.subscribe((type, detail) => {
    if (!currentUser) return;
    if (type === 'data-changed') {
      schedulePush(detail.year, detail.month);
      const md = store.getMonthData(detail.year, detail.month);
      const hasRest = Object.values(md.habits || {}).includes('rest');
      const hadCloudRest = Array.isArray(currentUser.user_metadata?.[`rest_${detail.year}_${detail.month}`])
        && currentUser.user_metadata[`rest_${detail.year}_${detail.month}`].length > 0;
      if (hasRest || hadCloudRest) {
        schedulePrefsPush(detail.year, detail.month);
      }
    } else if (type === 'habits-changed' && !detail.fromCloud) {
      schedulePush(store.currentYear, store.currentMonth);
      schedulePrefsPush();
    } else if (type === 'prefs-changed' && detail.triggerSync) {
      schedulePrefsPush();
    } else if (type === 'month-changed') {
      (async () => {
        if (!navigator.onLine) {
          setSyncStatus('offline');
          return;
        }
        setSyncStatus('syncing');
        try {
          const cloudMonth = await pullMonth(detail.year, detail.month);
          if (cloudMonth) store.mergeCloudMonth(detail.year, detail.month, cloudMonth, { preferCloud: false });
          setSyncStatus('synced');
        } catch (err) {
          // Honest status on failure!
          setSyncStatus('error', err?.message || 'Could not fetch this month');
        }
      })();
    }
  });

  // Auto-resume on focus / reconnect
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentUser) schedulePull();
  });
  window.addEventListener('online', () => {
    if (currentUser) fullSync({ preferCloud: false });
  });
  window.addEventListener('offline', () => {
    if (currentUser) setSyncStatus('offline');
  });

  // Restore existing Supabase session silently
  const c = getClient();
  if (!c) return;

  try {
    const { data } = await c.auth.getSession();
    if (data?.session?.user) {
      currentUser = data.session.user;
      updateAccountUI(currentUser);
      await fullSync({ preferCloud: false });
      subscribeRealtime(currentUser);
    }
  } catch (err) {
    console.warn('[Daymark Sync] Session restore skipped:', err?.message);
  }

  c.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      unsubscribeRealtime();
      updateAccountUI(null);
    } else if (event === 'PASSWORD_RECOVERY' && session?.user) {
      currentUser = session.user;
      updateAccountUI(currentUser);
      openAuthDialog('update-password');
    } else if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.user) {
      const wasSignedOut = !currentUser;
      currentUser = session.user;
      updateAccountUI(currentUser);
      if (wasSignedOut && event === 'SIGNED_IN' && !isAuthFlowRunning) {
        fullSync({ preferCloud: false });
        subscribeRealtime(currentUser);
      }
    }
  });
}
