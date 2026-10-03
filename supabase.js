// ============================================================
// supabase.js — Cloud Sync Layer for Habit Tracker
// Local-first architecture: localStorage is always primary.
// Supabase is a transparent background sync target.
// ============================================================
;(function () {
    'use strict';

    // ── Internal helpers (self-contained, no app.js dependency) ──
    function _json(str, fallback) {
        try { const v = JSON.parse(str); return (v !== null && v !== undefined) ? v : fallback; }
        catch { return fallback; }
    }

    function _pad(n) { return String(n).padStart(2, '0'); }

    function _toDate(year, month, day) {
        return `${year}-${_pad(month + 1)}-${_pad(day)}`;
    }

    // ── Supabase Client ──────────────────────────────────────
    let _client = null;

    function _getClient() {
        if (_client) return _client;
        const cfg = window.SUPABASE_CONFIG;
        if (!cfg || !cfg.url || cfg.url.includes('YOUR_PROJECT') ||
            !cfg.anonKey || cfg.anonKey.includes('YOUR_ANON')) return null;
        try {
            _client = supabase.createClient(cfg.url, cfg.anonKey, {
                auth: { persistSession: true, autoRefreshToken: true }
            });
            return _client;
        } catch (e) {
            console.warn('[Sync] Client init failed:', e.message);
            return null;
        }
    }

    // ── Auth State ───────────────────────────────────────────
    let _user = null;
    let _debounceTimer = null;

    async function _getUser() {
        if (_user) return _user;
        const c = _getClient();
        if (!c) return null;
        const { data } = await c.auth.getSession();
        _user = data?.session?.user || null;
        return _user;
    }

    // ── PUSH: local → cloud ──────────────────────────────────

    async function _pushHabits(habitsArr) {
        const c = _getClient(), user = await _getUser();
        if (!c || !user || !habitsArr?.length) return;
        const rows = habitsArr.map((h, i) => ({
            id: h.id, user_id: user.id, name: h.name, display_order: i
        }));
        const { error } = await c.from('habits').upsert(rows, { onConflict: 'id,user_id' });
        if (error) throw error;
    }

    async function _pushMonthData(year, month) {
        const c = _getClient(), user = await _getUser();
        if (!c || !user) return;

        const stored = _json(localStorage.getItem(`habitData_${year}_${month}`), { habits: {}, moodSleep: {} });

        // ── habit_logs rows ──
        const logRows = [];
        for (const [key, val] of Object.entries(stored.habits || {})) {
            if (!val) continue;
            const dash = key.lastIndexOf('-');
            const habitId = key.substring(0, dash);
            const day = parseInt(key.substring(dash + 1));
            if (!habitId || isNaN(day)) continue;
            logRows.push({ user_id: user.id, habit_id: habitId, log_date: _toDate(year, month, day), completed: true });
        }

        // ── wellness_logs rows ──
        const wellMap = {};
        for (const [key, val] of Object.entries(stored.moodSleep || {})) {
            const dash = key.lastIndexOf('-');
            const metric = key.substring(0, dash);
            const day = parseInt(key.substring(dash + 1));
            if (!metric || isNaN(day)) continue;
            const logDate = _toDate(year, month, day);
            if (!wellMap[logDate]) wellMap[logDate] = { user_id: user.id, log_date: logDate };
            if (metric === 'Mood') wellMap[logDate].mood = parseInt(val);
            if (metric === 'Hours of Sleep') wellMap[logDate].sleep_hours = parseInt(val);
        }
        const wellRows = Object.values(wellMap);

        const tasks = [];
        if (logRows.length)  tasks.push(c.from('habit_logs').upsert(logRows,  { onConflict: 'user_id,habit_id,log_date' }));
        if (wellRows.length) tasks.push(c.from('wellness_logs').upsert(wellRows, { onConflict: 'user_id,log_date' }));

        const results = await Promise.all(tasks);
        for (const r of results) { if (r.error) throw r.error; }
    }

    async function _deleteHabitFromCloud(habitId) {
        const c = _getClient(), user = await _getUser();
        if (!c || !user) return;
        await c.from('habit_logs').delete().eq('habit_id', habitId).eq('user_id', user.id);
        await c.from('habits').delete().eq('id', habitId).eq('user_id', user.id);
    }

    // ── PULL: cloud → local ──────────────────────────────────

    async function _pullHabits() {
        const c = _getClient(), user = await _getUser();
        if (!c || !user) return null;
        const { data, error } = await c.from('habits')
            .select('id, name, display_order')
            .eq('user_id', user.id)
            .order('display_order', { ascending: true });
        if (error) throw error;
        return data;
    }

    async function _pullMonthData(year, month) {
        const c = _getClient(), user = await _getUser();
        if (!c || !user) return null;
        const start = _toDate(year, month, 1);
        const end   = _toDate(year, month, new Date(year, month + 1, 0).getDate());

        const [logsRes, wellRes] = await Promise.all([
            c.from('habit_logs').select('habit_id,log_date,completed')
                .eq('user_id', user.id).gte('log_date', start).lte('log_date', end),
            c.from('wellness_logs').select('log_date,mood,sleep_hours')
                .eq('user_id', user.id).gte('log_date', start).lte('log_date', end)
        ]);
        if (logsRes.error) throw logsRes.error;
        if (wellRes.error) throw wellRes.error;
        return { habitLogs: logsRes.data, wellnessLogs: wellRes.data };
    }

    // ── Apply pulled cloud data → localStorage ───────────────

    function _applyMonthData(year, month, cloud) {
        if (!cloud) return;
        const state = { habits: {}, moodSleep: {} };
        for (const log of cloud.habitLogs || []) {
            if (!log.completed) continue;
            const day = parseInt(log.log_date.split('-')[2]);
            state.habits[`${log.habit_id}-${day}`] = true;
        }
        for (const w of cloud.wellnessLogs || []) {
            const day = parseInt(w.log_date.split('-')[2]);
            if (w.mood != null)        state.moodSleep[`Mood-${day}`]           = String(w.mood);
            if (w.sleep_hours != null) state.moodSleep[`Hours of Sleep-${day}`] = String(w.sleep_hours);
        }
        localStorage.setItem(`habitData_${year}_${month}`, JSON.stringify(state));
    }

    // ── Sign-in full sync (cloud wins if it has data) ────────

    async function _onSignIn(user) {
        _user = user;
        _setSyncStatus('syncing');

        const year  = window.getTrackerYear  ? window.getTrackerYear()  : new Date().getFullYear();
        const month = window.getTrackerMonth ? window.getTrackerMonth() : new Date().getMonth();
        const localHabits = window.getHabits ? window.getHabits() : [];

        try {
            // ── Habits ──
            const cloudHabits = await _pullHabits();
            if (cloudHabits && cloudHabits.length > 0) {
                // Cloud has data → it becomes source of truth
                const parsed = cloudHabits.map(h => ({ id: h.id, name: h.name }));
                localStorage.setItem('myCustomHabits_v3', JSON.stringify(parsed));
                if (window.setHabits) window.setHabits(parsed);
            } else if (localHabits.length > 0) {
                // Cloud empty → upload local habits
                await _pushHabits(localHabits);
            }

            // ── Month Data ──
            const cloudMonth = await _pullMonthData(year, month);
            const hasCloudData = cloudMonth &&
                (cloudMonth.habitLogs.length > 0 || cloudMonth.wellnessLogs.length > 0);

            if (hasCloudData) {
                _applyMonthData(year, month, cloudMonth);
            } else {
                // Cloud month empty → upload local month data
                await _pushMonthData(year, month);
            }

            // Rebuild UI
            if (typeof window.updateDashboard === 'function') window.updateDashboard();
            _setSyncStatus('synced');
        } catch (e) {
            console.error('[Sync] Sign-in sync failed:', e);
            _setSyncStatus('error');
        }
    }

    // ── Debounced background sync (called after every data change) ──

    function _triggerSync(year, month) {
        clearTimeout(_debounceTimer);
        _setSyncStatus('syncing');
        _debounceTimer = setTimeout(async () => {
            try {
                const user = await _getUser();
                if (!user) { _setSyncStatus('offline'); return; }
                const habits = window.getHabits ? window.getHabits() : [];
                await Promise.all([
                    _pushHabits(habits),
                    _pushMonthData(year, month)
                ]);
                _setSyncStatus('synced');
            } catch (e) {
                console.error('[Sync] Background sync failed:', e);
                _setSyncStatus('error');
            }
        }, 900);
    }

    // ── Sync Status UI ───────────────────────────────────────

    const STATUS_MAP = {
        syncing: { cls: 'syncing', text: 'Syncing...' },
        synced:  { cls: 'synced',  text: 'Synced' },
        error:   { cls: 'error',   text: 'Sync error' },
        offline: { cls: 'offline', text: 'Offline mode' }
    };

    function _setSyncStatus(key) {
        const dot  = document.getElementById('syncDot');
        const text = document.getElementById('syncStatusText');
        const wrap = document.getElementById('syncStatusIndicator');
        if (!dot || !text || !wrap) return;
        const { cls, text: label } = STATUS_MAP[key] || STATUS_MAP.offline;
        wrap.classList.remove('hidden');
        dot.className = `sync-dot ${cls}`;
        text.textContent = label;
    }

    // ── Auth UI State ────────────────────────────────────────

    function _updateUserBadge(user) {
        const badge   = document.getElementById('userBadge');
        const openBtn = document.getElementById('authOpenBtn');
        const syncWrap = document.getElementById('syncStatusIndicator');

        if (user) {
            badge?.classList.remove('hidden');
            openBtn?.classList.add('hidden');
            syncWrap?.classList.remove('hidden');
            const initials = document.getElementById('userInitials');
            const emailEl  = document.getElementById('userEmailText');
            if (initials) initials.textContent = user.email.substring(0, 2).toUpperCase();
            if (emailEl)  emailEl.textContent  = user.email;
        } else {
            badge?.classList.add('hidden');
            openBtn?.classList.remove('hidden');
            syncWrap?.classList.add('hidden');
        }
    }

    // ── Auth Modal Logic ─────────────────────────────────────

    let _authMode = 'signin';

    function _openAuthModal() {
        const overlay = document.getElementById('authModalOverlay');
        if (!overlay) return;
        overlay.classList.add('active');
        setTimeout(() => document.getElementById('authEmail')?.focus(), 100);
        _setAuthError('');
    }

    function _closeAuthModal() {
        document.getElementById('authModalOverlay')?.classList.remove('active');
        const pw = document.getElementById('authPassword');
        if (pw) pw.value = '';
        _setAuthError('');
    }

    function _setAuthError(msg) {
        const el = document.getElementById('authError');
        if (el) el.textContent = msg;
    }

    function _setAuthBusy(busy) {
        const btn = document.getElementById('authActionBtn');
        if (!btn) return;
        btn.disabled = busy;
        btn.textContent = busy ? 'Please wait…' : (_authMode === 'signin' ? 'Sign In' : 'Create Account');
    }

    function _toggleAuthMode() {
        _authMode = _authMode === 'signin' ? 'signup' : 'signin';
        const title  = document.getElementById('authModalTitle');
        const action = document.getElementById('authActionBtn');
        const toggle = document.getElementById('authToggleMode');
        if (title)  title.textContent  = _authMode === 'signin' ? 'Sign in to sync' : 'Create an account';
        if (action) action.textContent = _authMode === 'signin' ? 'Sign In' : 'Create Account';
        if (toggle) toggle.textContent = _authMode === 'signin'
            ? "Don't have an account? Sign up"
            : 'Already have an account? Sign in';
        _setAuthError('');
    }

    async function _handleAuth() {
        const email    = document.getElementById('authEmail')?.value?.trim();
        const password = document.getElementById('authPassword')?.value;
        if (!email || !password) { _setAuthError('Please enter both your email and password.'); return; }

        const c = _getClient();
        if (!c) {
            _setAuthError('Supabase is not configured yet. Edit supabase-config.js with your project credentials.');
            return;
        }

        _setAuthBusy(true);
        _setAuthError('');

        try {
            let user;
            if (_authMode === 'signin') {
                const { data, error } = await c.auth.signInWithPassword({ email, password });
                if (error) throw error;
                user = data.user;
            } else {
                const { data, error } = await c.auth.signUp({ email, password });
                if (error) throw error;
                if (!data.user || !data.session) {
                    _setAuthBusy(false);
                    _setAuthError('Account created! Check your email to confirm, then sign in.');
                    return;
                }
                user = data.user;
            }
            _updateUserBadge(user);
            _closeAuthModal();
            await _onSignIn(user);
        } catch (e) {
            _setAuthError(e.message || 'Authentication failed. Please try again.');
        }
        _setAuthBusy(false);
    }

    async function _onMonthChange(year, month) {
        const user = await _getUser();
        if (!user) return;
        try {
            const cloudMonth = await _pullMonthData(year, month);
            if (cloudMonth && (cloudMonth.habitLogs?.length > 0 || cloudMonth.wellnessLogs?.length > 0)) {
                _applyMonthData(year, month, cloudMonth);
                if (typeof window.updateDashboard === 'function') window.updateDashboard();
            }
        } catch (e) {
            console.warn('[Sync] Month change pull failed:', e);
        }
    }

    // ── Expose public API to window ──────────────────────────

    window.SupaSync = {
        isConfigured:        () => !!_getClient(),
        openAuthModal:       _openAuthModal,
        triggerSync:         _triggerSync,
        onMonthChange:       _onMonthChange,
        deleteHabitFromCloud: _deleteHabitFromCloud,
        signOutUser: async () => {
            const c = _getClient();
            if (c) await c.auth.signOut();
            _user = null;
            _updateUserBadge(null);
        }
    };

    // ── Bootstrap: wire events + check existing session ──────

    document.addEventListener('DOMContentLoaded', async () => {
        // ── Wire auth modal buttons ──
        document.getElementById('authActionBtn')?.addEventListener('click', _handleAuth);
        document.getElementById('authCancelBtn')?.addEventListener('click', _closeAuthModal);
        document.getElementById('authToggleMode')?.addEventListener('click', _toggleAuthMode);
        document.getElementById('authOpenBtn')?.addEventListener('click', () => {
            const c = _getClient();
            if (!c) {
                alert(
                    'Cloud sync is not set up yet.\n\n' +
                    'Open  supabase-config.js  in your project folder and replace the placeholder values with your Supabase project URL and anon key.\n\n' +
                    'Get them at:\n  supabase.com → Your Project → Settings → API'
                );
                return;
            }
            _openAuthModal();
        });
        document.getElementById('authSignOutBtn')?.addEventListener('click', () => window.SupaSync.signOutUser());
        document.getElementById('authModalOverlay')?.addEventListener('click', e => {
            if (e.target.id === 'authModalOverlay') _closeAuthModal();
        });
        document.getElementById('authEmail')?.addEventListener('keypress', e => {
            if (e.key === 'Enter') document.getElementById('authPassword')?.focus();
        });
        document.getElementById('authPassword')?.addEventListener('keypress', e => {
            if (e.key === 'Enter') _handleAuth();
        });

        // ── Check for an existing Supabase session (returning user) ──
        const c = _getClient();
        if (!c) return; // not configured, skip

        const { data } = await c.auth.getSession();
        if (data?.session?.user) {
            _user = data.session.user;
            _updateUserBadge(_user);
            _setSyncStatus('synced');
        }

        // ── Keep badge in sync on token refresh / sign-out events ──
        c.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                _user = null;
                _updateUserBadge(null);
                document.getElementById('syncStatusIndicator')?.classList.add('hidden');
            } else if (event === 'TOKEN_REFRESHED' && session) {
                _user = session.user;
            }
        });
    });

})();
