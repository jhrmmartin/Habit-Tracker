// ============================================================
// supabase.js — Cloud Sync Layer for Habit Tracker
// Local-first architecture: localStorage is always primary.
// Supabase provides real-time cross-device background synchronization.
// ============================================================
;(function () {
    'use strict';

    // ── Internal helpers ──
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

    // ── Auth & Sync State ────────────────────────────────────
    let _user = null;
    let _debounceTimer = null;
    let _pullDebounceTimer = null;
    let _realtimeChannel = null;
    let _isSyncing = false;

    function _isNetworkError(err) {
        if (!err) return false;
        const msg = (err.message || String(err)).toLowerCase();
        return msg.includes('failed to fetch') ||
               msg.includes('networkerror') ||
               msg.includes('load failed') ||
               msg.includes('aborted') ||
               msg.includes('net::err');
    }

    async function _getUser(forceFresh = false) {
        const c = _getClient();
        if (!c) return null;
        if (_user && !forceFresh) return _user;
        try {
            const { data, error } = await c.auth.getSession();
            if (error || !data?.session) {
                try {
                    const { data: refData } = await c.auth.refreshSession();
                    _user = refData?.session?.user || null;
                } catch (_) {
                    _user = null;
                }
            } else {
                _user = data.session.user || null;
            }
            return _user;
        } catch (_) {
            return _user;
        }
    }

    // ── PUSH: local → cloud ──────────────────────────────────

    async function _pushHabits(habitsArr) {
        const c = _getClient(), user = await _getUser();
        if (!c || !user || !Array.isArray(habitsArr) || habitsArr.length === 0) return;

        const seenIds = new Set();
        const rows = [];
        habitsArr.forEach((h, i) => {
            if (!h) return;
            const id = String((typeof h === 'object' && h.id) || ('h_' + (i + 1)));
            if (seenIds.has(id)) return;
            seenIds.add(id);
            const name = String((typeof h === 'object' && h.name) || h || 'Habit ' + (i + 1));
            rows.push({ id, user_id: user.id, name, display_order: i });
        });

        if (rows.length === 0) return;

        // Clean up habits removed locally in clean batch queries
        try {
            const { data: cloudHabits } = await c.from('habits').select('id').eq('user_id', user.id);
            if (cloudHabits && cloudHabits.length > 0) {
                const currentIds = new Set(rows.map(r => r.id));
                const removed = cloudHabits.filter(h => !currentIds.has(h.id)).map(h => h.id);
                if (removed.length > 0) {
                    await c.from('habit_logs').delete().eq('user_id', user.id).in('habit_id', removed);
                    await c.from('habits').delete().eq('user_id', user.id).in('id', removed);
                }
            }
        } catch (e) {
            console.warn('[Sync] Habit cleanup check warning:', e.message);
        }

        const { error } = await c.from('habits').upsert(rows, { onConflict: 'id,user_id' });
        if (error) throw error;
    }

    async function _pushMonthData(year, month) {
        const c = _getClient(), user = await _getUser();
        if (!c || !user) return;

        const daysCount = new Date(year, month + 1, 0).getDate();
        const start = _toDate(year, month, 1);
        const end = _toDate(year, month, daysCount);

        const stored = _json(localStorage.getItem(`habitData_${year}_${month}`), { habits: {}, moodSleep: {}, journal: {} });

        // 1. habit_logs rows
        const localCompletedKeys = new Set();
        const logRows = [];
        for (const [key, val] of Object.entries(stored.habits || {})) {
            if (!val) continue;
            const dash = key.lastIndexOf('-');
            const habitId = key.substring(0, dash);
            const day = parseInt(key.substring(dash + 1));
            if (!habitId || isNaN(day) || day < 1 || day > daysCount) continue;
            const logDate = _toDate(year, month, day);
            localCompletedKeys.add(`${habitId}|${logDate}`);
            logRows.push({ user_id: user.id, habit_id: habitId, log_date: logDate, completed: true });
        }

        // Fetch current cloud logs for this month to detect unchecks & batch delete per habit
        try {
            const { data: cloudLogs } = await c.from('habit_logs')
                .select('habit_id, log_date')
                .eq('user_id', user.id)
                .gte('log_date', start)
                .lte('log_date', end);

            if (cloudLogs && cloudLogs.length > 0) {
                const toDeleteByHabit = {};
                for (const cl of cloudLogs) {
                    if (!localCompletedKeys.has(`${cl.habit_id}|${cl.log_date}`)) {
                        if (!toDeleteByHabit[cl.habit_id]) toDeleteByHabit[cl.habit_id] = [];
                        toDeleteByHabit[cl.habit_id].push(cl.log_date);
                    }
                }
                for (const [hId, dates] of Object.entries(toDeleteByHabit)) {
                    if (dates.length > 0) {
                        await c.from('habit_logs').delete()
                            .eq('user_id', user.id)
                            .eq('habit_id', hId)
                            .in('log_date', dates);
                    }
                }
            }
        } catch (delErr) {
            console.warn('[Sync] Non-critical habit log delete cleanup:', delErr?.message);
        }

        // 2. wellness_logs rows (strictly uniform keys for PostgREST upsert)
        const wellMap = {};
        for (const [key, val] of Object.entries(stored.moodSleep || {})) {
            const dash = key.lastIndexOf('-');
            const metric = key.substring(0, dash);
            const day = parseInt(key.substring(dash + 1));
            if (!metric || isNaN(day) || day < 1 || day > daysCount) continue;
            const logDate = _toDate(year, month, day);
            if (!wellMap[logDate]) {
                wellMap[logDate] = {
                    user_id: user.id,
                    log_date: logDate,
                    mood: null,
                    sleep_hours: null
                };
            }
            if (metric === 'Mood' && val !== '' && !isNaN(parseInt(val, 10))) {
                wellMap[logDate].mood = parseInt(val, 10);
            }
            if (metric === 'Hours of Sleep' && val !== '' && !isNaN(parseInt(val, 10))) {
                wellMap[logDate].sleep_hours = parseInt(val, 10);
            }
        }
        const wellRows = Object.values(wellMap).filter(w => w.mood !== null || w.sleep_hours !== null);

        // Fetch current cloud wellness logs to detect removals & delete in single batch
        try {
            const { data: cloudWellness } = await c.from('wellness_logs')
                .select('log_date')
                .eq('user_id', user.id)
                .gte('log_date', start)
                .lte('log_date', end);

            if (cloudWellness && cloudWellness.length > 0) {
                const wellnessDatesToDelete = [];
                for (const cw of cloudWellness) {
                    if (!wellMap[cw.log_date]) {
                        wellnessDatesToDelete.push(cw.log_date);
                    }
                }
                if (wellnessDatesToDelete.length > 0) {
                    await c.from('wellness_logs').delete()
                        .eq('user_id', user.id)
                        .in('log_date', wellnessDatesToDelete);
                }
            }
        } catch (wErr) {
            console.warn('[Sync] Non-critical wellness delete cleanup:', wErr?.message);
        }

        // 3. Upsert active rows (sequential to maintain socket stability)
        if (logRows.length) {
            const { error: logErr } = await c.from('habit_logs').upsert(logRows, { onConflict: 'user_id,habit_id,log_date' });
            if (logErr) throw logErr;
        }
        if (wellRows.length) {
            const { error: wellErr } = await c.from('wellness_logs').upsert(wellRows, { onConflict: 'user_id,log_date' });
            if (wellErr) throw wellErr;
        }

        // 4. journal_logs rows (gracefully handle if table not created yet)
        const journalRows = [];
        for (const [dayKey, entryText] of Object.entries(stored.journal || {})) {
            const day = parseInt(dayKey);
            if (isNaN(day) || day < 1 || day > daysCount || !entryText || !entryText.trim()) continue;
            journalRows.push({
                user_id: user.id,
                log_date: _toDate(year, month, day),
                entry_text: entryText.trim()
            });
        }

        if (journalRows.length) {
            try {
                const jRes = await c.from('journal_logs').upsert(journalRows, { onConflict: 'user_id,log_date' });
                if (jRes.error) {
                    console.warn('[Sync] journal_logs skipped (table may not exist in database):', jRes.error.message);
                }
            } catch (_) {}
        }
    }

    let _lastPreferencesPush = 0;

    async function _pushUserPreferences(force = false) {
        const now = Date.now();
        if (!force && (now - _lastPreferencesPush < 45000)) return;
        const c = _getClient(), user = await _getUser();
        if (!c || !user) return;
        try {
            _lastPreferencesPush = now;
            const theme = window.getTheme ? window.getTheme() : (localStorage.getItem('habitTracker_theme') || 'obsidian');
            const journalTitle = window.getJournalTitle ? window.getJournalTitle() : (localStorage.getItem('habitTracker_journalTitle') || 'Daily Reflection & Win');
            const journalPills = window.getJournalPills ? window.getJournalPills() : _json(localStorage.getItem('habitTracker_journalPills_v1'), null);
            const notionWorkspace = window.getNotionWorkspace ? window.getNotionWorkspace() : _json(localStorage.getItem('notion_workspace_v1'), null);
            const habitIcons = window.getHabitIconsMap ? window.getHabitIconsMap() : null;

            const year = window.getTrackerYear ? window.getTrackerYear() : new Date().getFullYear();
            const month = window.getTrackerMonth ? window.getTrackerMonth() : new Date().getMonth();
            const stored = _json(localStorage.getItem(`habitData_${year}_${month}`), {});

            await c.auth.updateUser({
                data: {
                    theme,
                    journalTitle,
                    journalPills,
                    notionWorkspace,
                    habitIcons,
                    [`journal_${year}_${month}`]: stored.journal || {},
                    lastSyncedAt: new Date().toISOString()
                }
            });
        } catch (e) {
            console.warn('[Sync] Preferences sync skipped:', e.message);
        }
    }

    async function _deleteHabitFromCloud(habitId) {
        const c = _getClient(), user = await _getUser();
        if (!c || !user) return;
        try {
            await c.from('habit_logs').delete().eq('habit_id', habitId).eq('user_id', user.id);
            await c.from('habits').delete().eq('id', habitId).eq('user_id', user.id);
        } catch (e) {
            console.warn('[Sync] Delete habit failed:', e.message);
        }
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
        const daysCount = new Date(year, month + 1, 0).getDate();
        const start = _toDate(year, month, 1);
        const end   = _toDate(year, month, daysCount);

        const [logsRes, wellRes] = await Promise.all([
            c.from('habit_logs').select('habit_id,log_date,completed')
                .eq('user_id', user.id).gte('log_date', start).lte('log_date', end),
            c.from('wellness_logs').select('log_date,mood,sleep_hours')
                .eq('user_id', user.id).gte('log_date', start).lte('log_date', end)
        ]);
        if (logsRes.error) throw logsRes.error;
        if (wellRes.error) throw wellRes.error;

        let journalLogs = [];
        try {
            const jRes = await c.from('journal_logs').select('log_date,entry_text')
                .eq('user_id', user.id).gte('log_date', start).lte('log_date', end);
            if (!jRes.error && jRes.data) {
                journalLogs = jRes.data;
            }
        } catch (_) {}

        return {
            habitLogs: logsRes.data || [],
            wellnessLogs: wellRes.data || [],
            journalLogs
        };
    }

    // ── Apply pulled cloud data → localStorage ───────────────

    function _applyMonthData(year, month, cloud) {
        if (!cloud) return;
        const existing = _json(localStorage.getItem(`habitData_${year}_${month}`), { habits: {}, moodSleep: {}, journal: {} });
        const state = { habits: {}, moodSleep: {}, journal: existing.journal || {} };

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

        for (const j of cloud.journalLogs || []) {
            if (!j.entry_text) continue;
            const day = parseInt(j.log_date.split('-')[2]);
            state.journal[day] = j.entry_text;
        }

        localStorage.setItem(`habitData_${year}_${month}`, JSON.stringify(state));
    }

    function _applyUserPreferences(meta) {
        if (!meta) return;
        if (meta.theme && typeof window.applyTheme === 'function') {
            window.applyTheme(meta.theme);
        }
        if (meta.journalTitle && typeof window.setJournalTitle === 'function') {
            window.setJournalTitle(meta.journalTitle);
        }
        if (meta.journalPills && typeof window.setJournalPills === 'function') {
            window.setJournalPills(meta.journalPills);
        }
        if (meta.notionWorkspace && typeof window.setNotionWorkspace === 'function') {
            window.setNotionWorkspace(meta.notionWorkspace);
        }
        if (meta.habitIcons && typeof window.applyHabitIconsMap === 'function') {
            window.applyHabitIconsMap(meta.habitIcons);
        }

        // Restore journal from metadata if database table journal_logs wasn't available
        const year = window.getTrackerYear ? window.getTrackerYear() : new Date().getFullYear();
        const month = window.getTrackerMonth ? window.getTrackerMonth() : new Date().getMonth();
        const metaJournal = meta[`journal_${year}_${month}`];
        if (metaJournal && typeof metaJournal === 'object' && Object.keys(metaJournal).length > 0) {
            const state = _json(localStorage.getItem(`habitData_${year}_${month}`), { habits: {}, moodSleep: {}, journal: {} });
            if (!state.journal || Object.keys(state.journal).length === 0) {
                state.journal = metaJournal;
                localStorage.setItem(`habitData_${year}_${month}`, JSON.stringify(state));
                if (typeof window.setCurrentMonthJournal === 'function') {
                    window.setCurrentMonthJournal(metaJournal);
                }
            }
        }
    }

    // ── Full Pull / Synchronization ──────────────────────────

    async function _fullSyncFromCloud(year, month, forceReload = true) {
        const c = _getClient(), user = await _getUser();
        if (!c || !user) return;

        _setSyncStatus('syncing');

        year = (typeof year === 'number') ? year : (window.getTrackerYear ? window.getTrackerYear() : new Date().getFullYear());
        month = (typeof month === 'number') ? month : (window.getTrackerMonth ? window.getTrackerMonth() : new Date().getMonth());
        const localHabits = window.getHabits ? window.getHabits() : [];

        try {
            // 1. Habits
            const cloudHabits = await _pullHabits();
            if (cloudHabits && cloudHabits.length > 0) {
                const metaIcons = (user.user_metadata && user.user_metadata.habitIcons) || {};
                const localMap = new Map(localHabits.map(h => [h.id, h]));
                const parsed = cloudHabits.map(h => ({
                    id: h.id,
                    name: h.name,
                    icon: metaIcons[h.id] || (localMap.get(h.id) && localMap.get(h.id).icon) || undefined
                }));
                localStorage.setItem('myCustomHabits_v3', JSON.stringify(parsed));
                if (window.setHabits) window.setHabits(parsed);
            } else if (localHabits.length > 0) {
                await _pushHabits(localHabits);
            }

            // 2. Month data (habit checks, mood, sleep, journal)
            const cloudMonth = await _pullMonthData(year, month);
            const hasCloudData = cloudMonth &&
                ((cloudMonth.habitLogs && cloudMonth.habitLogs.length > 0) ||
                 (cloudMonth.wellnessLogs && cloudMonth.wellnessLogs.length > 0) ||
                 (cloudMonth.journalLogs && cloudMonth.journalLogs.length > 0));

            if (hasCloudData) {
                _applyMonthData(year, month, cloudMonth);
            } else {
                await _pushMonthData(year, month);
            }

            // 3. User preferences (theme, journal archetype, custom tags)
            if (user.user_metadata && Object.keys(user.user_metadata).length > 0) {
                _applyUserPreferences(user.user_metadata);
            } else {
                await _pushUserPreferences();
            }

            // 4. Update UI
            if (forceReload && typeof window.updateDashboard === 'function') {
                window.updateDashboard();
            }

            _setSyncStatus('synced');
        } catch (e) {
            console.warn('[Sync] Full sync notice:', e);
            const msg = e?.message || 'Sync failed';
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
                _setSyncStatus('offline');
            } else if (_isNetworkError(e)) {
                _setSyncStatus('error', msg);
                setTimeout(() => {
                    if (typeof navigator === 'undefined' || navigator.onLine) {
                        _fullSyncFromCloud(year, month, forceReload);
                    }
                }, 3000);
            } else {
                _setSyncStatus('error', msg);
            }
        }
    }

    async function _pullLatestFromCloud() {
        if (_isSyncing) return;
        _isSyncing = true;
        try {
            const user = await _getUser();
            if (!user) return;
            const year = window.getTrackerYear ? window.getTrackerYear() : new Date().getFullYear();
            const month = window.getTrackerMonth ? window.getTrackerMonth() : new Date().getMonth();

            const [cloudHabits, cloudMonth] = await Promise.all([
                _pullHabits(),
                _pullMonthData(year, month)
            ]);

            let changed = false;

            if (cloudHabits && cloudHabits.length > 0) {
                const localHabits = window.getHabits ? window.getHabits() : [];
                const localStr = JSON.stringify(localHabits.map(h => ({ id: h.id, name: h.name })));
                const cloudStr = JSON.stringify(cloudHabits.map(h => ({ id: h.id, name: h.name })));
                if (localStr !== cloudStr) {
                    const parsed = cloudHabits.map(h => ({ id: h.id, name: h.name }));
                    localStorage.setItem('myCustomHabits_v3', JSON.stringify(parsed));
                    if (window.setHabits) window.setHabits(parsed);
                    changed = true;
                }
            }

            if (cloudMonth) {
                _applyMonthData(year, month, cloudMonth);
                changed = true;
            }

            if (user.user_metadata) {
                _applyUserPreferences(user.user_metadata);
            }

            if (changed && typeof window.updateDashboard === 'function') {
                window.updateDashboard();
            }
            _setSyncStatus('synced');
        } catch (e) {
            console.warn('[Sync] Silent pull error:', e.message);
        } finally {
            _isSyncing = false;
        }
    }

    function _debouncedPull() {
        clearTimeout(_pullDebounceTimer);
        _pullDebounceTimer = setTimeout(() => {
            if (typeof navigator !== 'undefined' && !navigator.onLine) return;
            _pullLatestFromCloud();
        }, 800);
    }

    // ── Sign-in Handler ──────────────────────────────────────

    async function _onSignIn(user) {
        _user = user;
        _updateUserBadge(user);
        _setSyncStatus('syncing');

        const year  = window.getTrackerYear  ? window.getTrackerYear()  : new Date().getFullYear();
        const month = window.getTrackerMonth ? window.getTrackerMonth() : new Date().getMonth();

        await _fullSyncFromCloud(year, month, true);
        _subscribeRealtime(user);

        if (typeof window.onTourUserAuthenticated === 'function') {
            try { window.onTourUserAuthenticated(user); } catch (_) {}
        }
    }

    // ── Realtime Multi-Device Sync ───────────────────────────

    function _subscribeRealtime(user) {
        if (!user || _realtimeChannel) return;
        const c = _getClient();
        if (!c || !c.channel) return;

        try {
            _realtimeChannel = c.channel(`habit-tracker-live-${user.id}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'habits', filter: `user_id=eq.${user.id}` }, () => {
                    _debouncedPull();
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'habit_logs', filter: `user_id=eq.${user.id}` }, () => {
                    _debouncedPull();
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'wellness_logs', filter: `user_id=eq.${user.id}` }, () => {
                    _debouncedPull();
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('[Sync] Realtime live cross-device sync active');
                    }
                });
        } catch (err) {
            console.warn('[Sync] Realtime setup warning (falling back to focus sync):', err);
        }
    }

    // ── Debounced background sync (called after data input) ──
    let _syncRetryCount = 0;
    let _lastSyncErrorMsg = '';

    function _triggerSync(year, month) {
        clearTimeout(_debounceTimer);
        _setSyncStatus('syncing');
        _debounceTimer = setTimeout(async () => {
            try {
                if (typeof navigator !== 'undefined' && !navigator.onLine) {
                    _setSyncStatus('offline');
                    return;
                }
                const user = await _getUser();
                if (!user) { _setSyncStatus('offline'); return; }
                const habits = window.getHabits ? window.getHabits() : [];
                await _pushHabits(habits);
                await _pushMonthData(year, month);
                _syncRetryCount = 0;
                _lastSyncErrorMsg = '';
                _setSyncStatus('synced');
            } catch (e) {
                console.warn('[Sync] Background sync notice:', e);
                _lastSyncErrorMsg = e?.message || 'Sync failed';
                if (_isNetworkError(e)) {
                    if (typeof navigator !== 'undefined' && !navigator.onLine) {
                        _setSyncStatus('offline');
                        return;
                    }
                    if (_syncRetryCount < 3) {
                        _syncRetryCount++;
                        const delay = _syncRetryCount * 2500;
                        console.log(`[Sync] Network connection hiccup, auto-retrying in ${delay}ms (attempt ${_syncRetryCount})...`);
                        setTimeout(() => _triggerSync(year, month), delay);
                        return;
                    }
                }
                _setSyncStatus('error', _lastSyncErrorMsg);
            }
        }, 800);
    }

    async function syncNow() {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            _setSyncStatus('offline');
            if (typeof showError === 'function') {
                showError('You appear to be offline. Local changes will auto-sync once reconnected.');
            }
            return;
        }
        const user = await _getUser(true);
        if (!user) {
            _openAuthModal();
            return;
        }
        _setSyncStatus('syncing');
        try {
            const year  = window.getTrackerYear  ? window.getTrackerYear()  : new Date().getFullYear();
            const month = window.getTrackerMonth ? window.getTrackerMonth() : new Date().getMonth();
            const habits = window.getHabits ? window.getHabits() : [];

            await _pushHabits(habits);
            await _pushMonthData(year, month);
            await _pullLatestFromCloud();
            await _pushUserPreferences(true);
            _syncRetryCount = 0;
            _lastSyncErrorMsg = '';
            _setSyncStatus('synced');
            if (typeof showSuccess === 'function') {
                showSuccess('Synced with cloud ✓');
            }
        } catch (e) {
            console.error('[Sync] Manual sync failed:', e);
            _lastSyncErrorMsg = e?.message || 'Sync failed';
            _setSyncStatus('error', _lastSyncErrorMsg);
            if (typeof showError === 'function') {
                if (_isNetworkError(e)) {
                    showError('Sync connection issue. If using Brave Shields or an adblocker, please allow supabase.co or tap to retry.');
                } else {
                    showError(`Sync issue: ${_lastSyncErrorMsg}`);
                }
            }
        }
    }

    // ── Month navigation handler ─────────────────────────────

    async function _onMonthChange(year, month) {
        const user = await _getUser();
        if (!user) return;
        try {
            _setSyncStatus('syncing');
            const cloudMonth = await _pullMonthData(year, month);
            const hasCloudData = cloudMonth &&
                ((cloudMonth.habitLogs && cloudMonth.habitLogs.length > 0) ||
                 (cloudMonth.wellnessLogs && cloudMonth.wellnessLogs.length > 0) ||
                 (cloudMonth.journalLogs && cloudMonth.journalLogs.length > 0));

            if (hasCloudData) {
                _applyMonthData(year, month, cloudMonth);
                if (typeof window.updateDashboard === 'function') window.updateDashboard();
            } else {
                await _pushMonthData(year, month);
            }
            _setSyncStatus('synced');
        } catch (e) {
            console.warn('[Sync] Month change pull failed:', e);
            _setSyncStatus('synced');
        }
    }

    // ── Sync Status UI ───────────────────────────────────────

    const STATUS_MAP = {
        syncing: { cls: 'syncing', text: 'Syncing...' },
        synced:  { cls: 'synced',  text: 'Synced ✓' },
        error:   { cls: 'error',   text: 'Sync error (tap to retry)' },
        offline: { cls: 'offline', text: 'Offline mode' }
    };

    function _setSyncStatus(key, detailMsg = '') {
        const dot  = document.getElementById('syncDot');
        const text = document.getElementById('syncStatusText');
        const wrap = document.getElementById('syncStatusIndicator');
        if (!dot || !text || !wrap) return;
        const { cls, text: label } = STATUS_MAP[key] || STATUS_MAP.offline;
        wrap.classList.remove('hidden');
        dot.className = `sync-dot ${cls}`;
        text.textContent = label;
        if (key === 'error') {
            if (_isNetworkError({ message: detailMsg })) {
                text.textContent = 'Connection issue (retry)';
                wrap.title = 'Connection problem or request blocked (e.g. Brave Shields/adblocker). Tap to retry.';
            } else {
                text.textContent = label;
                wrap.title = detailMsg ? `Sync issue: ${detailMsg}. Tap to retry.` : 'Sync error. Tap to retry.';
            }
        } else if (key === 'synced') {
            wrap.title = 'All changes synced with cloud in real-time.';
        } else if (key === 'syncing') {
            wrap.title = 'Synchronizing with cloud...';
        } else if (key === 'offline') {
            wrap.title = 'Offline mode. Changes saved locally and will auto-sync when online.';
        }
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
            if (initials) initials.textContent = user.email ? user.email.substring(0, 2).toUpperCase() : 'ME';
            if (emailEl)  emailEl.textContent  = user.email || 'Signed In';
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
            _closeAuthModal();
            await _onSignIn(user);
        } catch (e) {
            _setAuthError(e.message || 'Authentication failed. Please try again.');
        }
        _setAuthBusy(false);
    }

    async function signInWithEmail(email, password) {
        const c = _getClient();
        if (!c) throw new Error('Cloud sync is not configured.');
        const { data, error } = await c.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await _onSignIn(data.user);
        return data.user;
    }

    async function signUpWithEmail(email, password) {
        const c = _getClient();
        if (!c) throw new Error('Cloud sync is not configured.');
        const { data, error } = await c.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user && data.session) {
            await _onSignIn(data.user);
        }
        return data;
    }

    // ── Expose public API to window ──────────────────────────

    window.SupaSync = {
        isConfigured:        () => !!_getClient(),
        openAuthModal:       _openAuthModal,
        triggerSync:         _triggerSync,
        onMonthChange:       _onMonthChange,
        deleteHabitFromCloud: _deleteHabitFromCloud,
        syncNow:             syncNow,
        pushHabits:          _pushHabits,
        pushMonthData:       _pushMonthData,
        fullSyncFromCloud:   _fullSyncFromCloud,
        pushUserPreferences: _pushUserPreferences,
        pullLatestFromCloud: _pullLatestFromCloud,
        getUser:             _getUser,
        getCurrentUser:      () => _user,
        signInWithEmail:     signInWithEmail,
        signUpWithEmail:     signUpWithEmail,
        signOutUser: async () => {
            const c = _getClient();
            if (_realtimeChannel && c) {
                try { c.removeChannel(_realtimeChannel); } catch (_) {}
                _realtimeChannel = null;
            }
            if (c) await c.auth.signOut();
            _user = null;
            _updateUserBadge(null);
            _setSyncStatus('offline');
        }
    };

    // ── Bootstrap: wire events + check existing session ──────

    document.addEventListener('DOMContentLoaded', async () => {
        // Wire auth modal buttons
        document.getElementById('authActionBtn')?.addEventListener('click', _handleAuth);
        document.getElementById('authCancelBtn')?.addEventListener('click', _closeAuthModal);
        document.getElementById('authToggleMode')?.addEventListener('click', _toggleAuthMode);
        document.getElementById('authOpenBtn')?.addEventListener('click', () => {
            const c = _getClient();
            if (!c) {
                alert(
                    'Cloud sync is not set up yet.\n\n' +
                    'Open supabase-config.js in your project folder and replace the placeholder values with your Supabase project URL and anon key.\n\n' +
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

        // Wire sync pill click to force manual sync
        document.getElementById('syncStatusIndicator')?.addEventListener('click', () => {
            window.SupaSync.syncNow();
        });

        // Listen for mobile tab focus / visibility changes to auto-pull newest data
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && _user) {
                _debouncedPull();
            }
        });
        window.addEventListener('focus', () => {
            if (_user) {
                _debouncedPull();
            }
        });

        // Listen for online / offline events to seamlessly resume syncing
        window.addEventListener('online', () => {
            console.log('[Sync] Network connection restored. Auto-syncing pending changes...');
            const year  = window.getTrackerYear  ? window.getTrackerYear()  : new Date().getFullYear();
            const month = window.getTrackerMonth ? window.getTrackerMonth() : new Date().getMonth();
            _setSyncStatus('syncing');
            setTimeout(() => {
                _triggerSync(year, month);
            }, 1200);
        });

        window.addEventListener('offline', () => {
            console.log('[Sync] Device went offline.');
            _setSyncStatus('offline');
        });

        // Check for an existing Supabase session (returning user on mobile/desktop)
        const c = _getClient();
        if (!c) return;

        try {
            const { data } = await c.auth.getSession();
            if (data?.session?.user) {
                _user = data.session.user;
                _updateUserBadge(_user);
                _setSyncStatus('syncing');
                // Pull cloud data immediately so laptop changes reflect on mobile!
                await _fullSyncFromCloud(undefined, undefined, true);
                _subscribeRealtime(_user);
            }
        } catch (err) {
            console.warn('[Sync] Session restoration error:', err);
        }

        // Keep badge in sync on auth state change
        c.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_OUT') {
                _user = null;
                _updateUserBadge(null);
                if (_realtimeChannel) {
                    try { c.removeChannel(_realtimeChannel); } catch (_) {}
                    _realtimeChannel = null;
                }
                document.getElementById('syncStatusIndicator')?.classList.add('hidden');
            } else if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
                _user = session.user;
                _updateUserBadge(_user);
                if (typeof window.onTourUserAuthenticated === 'function') {
                    try { window.onTourUserAuthenticated(_user); } catch (_) {}
                }
            }
        });
    });

})();
