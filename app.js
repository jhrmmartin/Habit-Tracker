// ============================================================
// UTILITIES & ANTI-SLOP HELPERS
// ============================================================
const generateUUID = () => Math.random().toString(36).substring(2, 11);

/** Escapes HTML to strictly eliminate XSS injection vectors */
function sanitizeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/** Safe JSON.parse that never throws on corrupt localStorage keys */
function safeJSONParse(str, fallback) {
    try {
        const val = JSON.parse(str);
        return val !== null && val !== undefined ? val : fallback;
    } catch {
        return fallback;
    }
}

// ============================================================
// CUSTOM ACCESSIBLE MODAL (WCAG AA Compliant)
// ============================================================
function showConfirm(message, onConfirm) {
    const overlay = document.getElementById('modalOverlay');
    const msg = document.getElementById('modalMessage');
    const confirmBtn = document.getElementById('modalConfirm');
    const cancelBtn = document.getElementById('modalCancel');

    msg.textContent = message;
    overlay.classList.add('active');
    confirmBtn.focus();

    const cleanup = () => {
        overlay.classList.remove('active');
        confirmBtn.removeEventListener('click', confirmHandler);
        cancelBtn.removeEventListener('click', cancelHandler);
        document.removeEventListener('keydown', keyHandler);
    };

    function confirmHandler() {
        cleanup();
        onConfirm();
    }

    function cancelHandler() {
        cleanup();
    }

    function keyHandler(e) {
        if (e.key === 'Escape') cancelHandler();
    }

    confirmBtn.addEventListener('click', confirmHandler);
    cancelBtn.addEventListener('click', cancelHandler);
    document.addEventListener('keydown', keyHandler);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cancelHandler();
    }, { once: true });
}

// ============================================================
// CORE DATA STATE
// ============================================================
const defaultHabits = [
    { id: 'h1', name: "Wake up at 05:00" },
    { id: 'h2', name: "Stretching & Mobility" },
    { id: 'h3', name: "Resistance Training" },
    { id: 'h4', name: "Daily Priority Planning" },
    { id: 'h5', name: "Deep Work Session" },
    { id: 'h6', name: "No Alcohol" },
    { id: 'h7', name: "Screen-Free Evening" }
];

let habits = safeJSONParse(localStorage.getItem('myCustomHabits_v3'), defaultHabits);
let mixedChart, overallChart;
let currentYear, currentMonth, daysInMonth;

const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];
const dayNamesShort = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// SVG Icon primitives for crisp UI rendering
const SVG_ICONS = {
    arrowUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`,
    arrowDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
};

// ============================================================
// THEME SYSTEM & CHART DYNAMIC PALETTES
// ============================================================
const THEME_CHART_COLORS = {
    obsidian: {
        bar: '#e59838',
        mood: '#10b981',
        sleep: '#9ea1b2',
        grid: 'rgba(255, 255, 255, 0.04)',
        tick: '#646777',
        doughnutBg: 'rgba(255, 255, 255, 0.04)'
    },
    forest: {
        bar: '#22c55e',
        mood: '#10b981',
        sleep: '#86efac',
        grid: 'rgba(255, 255, 255, 0.04)',
        tick: '#5c7f6b',
        doughnutBg: 'rgba(255, 255, 255, 0.04)'
    },
    nordic: {
        bar: '#38bdf8',
        mood: '#34d399',
        sleep: '#94a3b8',
        grid: 'rgba(255, 255, 255, 0.04)',
        tick: '#64748b',
        doughnutBg: 'rgba(255, 255, 255, 0.04)'
    },
    espresso: {
        bar: '#d97706',
        mood: '#10b981',
        sleep: '#c4b5a5',
        grid: 'rgba(255, 255, 255, 0.04)',
        tick: '#7d7065',
        doughnutBg: 'rgba(255, 255, 255, 0.04)'
    },
    dusk: {
        bar: '#f472b6',
        mood: '#34d399',
        sleep: '#d8b4fe',
        grid: 'rgba(255, 255, 255, 0.04)',
        tick: '#806b96',
        doughnutBg: 'rgba(255, 255, 255, 0.04)'
    },
    paper: {
        bar: '#c2410c',
        mood: '#15803d',
        sleep: '#57534e',
        grid: 'rgba(0, 0, 0, 0.06)',
        tick: '#8c857b',
        doughnutBg: 'rgba(0, 0, 0, 0.05)'
    }
};

function initTheme() {
    const savedTheme = localStorage.getItem('habitTracker_theme') || 'obsidian';
    applyTheme(savedTheme);

    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
        themeSelect.value = savedTheme;
        themeSelect.addEventListener('change', (e) => {
            applyTheme(e.target.value);
        });
    }
}

function applyTheme(themeKey) {
    const validTheme = THEME_CHART_COLORS[themeKey] ? themeKey : 'obsidian';
    document.documentElement.setAttribute('data-theme', validTheme);
    localStorage.setItem('habitTracker_theme', validTheme);

    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect && themeSelect.value !== validTheme) {
        themeSelect.value = validTheme;
    }

    updateChartsForTheme(validTheme);
}

function updateChartsForTheme(themeKey) {
    if (!mixedChart || !overallChart) return;
    const c = THEME_CHART_COLORS[themeKey] || THEME_CHART_COLORS.obsidian;

    // Daily Mixed Chart
    mixedChart.data.datasets[0].backgroundColor = c.bar;
    mixedChart.data.datasets[1].borderColor = c.mood;
    mixedChart.data.datasets[1].backgroundColor = c.mood;
    mixedChart.data.datasets[2].borderColor = c.sleep;
    mixedChart.data.datasets[2].backgroundColor = c.sleep;

    mixedChart.options.scales.y.ticks.color = c.tick;
    mixedChart.options.scales.y.grid.color = c.grid;
    mixedChart.options.scales.y1.ticks.color = c.mood;
    mixedChart.options.scales.x.ticks.color = c.tick;
    mixedChart.options.plugins.legend.labels.color = c.sleep;
    mixedChart.update();

    // Overall Doughnut
    overallChart.data.datasets[0].backgroundColor = [c.bar, c.doughnutBg];
    overallChart.update();
}

// ============================================================
// INITIALIZATION
// ============================================================
window.onload = () => {
    initTheme();
    initGreeting();
    initCalendarSettings();
    initCharts();
    initViewMode();
    applyTheme(localStorage.getItem('habitTracker_theme') || 'obsidian');

    const input = document.getElementById('newHabitInput');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addNewHabit();
        });
    }

    const inputToday = document.getElementById('newHabitInputToday');
    if (inputToday) {
        inputToday.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addNewHabitFromToday();
        });
    }

    // Modal dismiss listeners
    document.getElementById('receiptModalOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'receiptModalOverlay') closeReceiptModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeReceiptModal();
    });

    updateDashboard();
};

// ============================================================
// VIEW MODE (MONTH GRID vs TODAY FOCUS)
// ============================================================
let currentViewMode = 'grid';

function setViewMode(mode) {
    currentViewMode = mode;
    localStorage.setItem('habitTracker_viewMode', mode);

    const isToday = mode === 'today';
    document.getElementById('viewGridBtn')?.classList.toggle('active', !isToday);
    document.getElementById('viewTodayBtn')?.classList.toggle('active', isToday);

    document.getElementById('chartPanel')?.classList.toggle('hidden', isToday);
    document.getElementById('gridPanel')?.classList.toggle('hidden', isToday);
    document.getElementById('todayPanel')?.classList.toggle('hidden', !isToday);

    if (isToday) {
        renderTodayFocus();
    }
}

function initViewMode() {
    const saved = localStorage.getItem('habitTracker_viewMode');
    // On small mobile screens (width <= 640px) with no prior saved preference, start in Today Focus mode
    const defaultMode = (window.innerWidth <= 640 && !saved) ? 'today' : (saved || 'grid');
    setViewMode(defaultMode);
}

function renderTodayFocus() {
    const today = new Date();
    const isCurrentMonth = (currentYear === today.getFullYear() && currentMonth === today.getMonth());
    const activeDay = isCurrentMonth ? today.getDate() : 1;

    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const headingDate = isCurrentMonth 
        ? `${days[today.getDay()]}, ${months[today.getMonth()]} ${today.getDate()}`
        : `${months[currentMonth]} 1, ${currentYear}`;
    
    const headingEl = document.getElementById('todayDateHeading');
    if (headingEl) headingEl.textContent = headingDate;

    const listEl = document.getElementById('todayHabitsList');
    if (!listEl) return;

    if (!habits || habits.length === 0) {
        listEl.innerHTML = `
            <div style="text-align:center; padding:32px 16px; color:var(--text-muted); font-size:0.875rem;">
                No habits added yet. Create your first habit below to start your streak!
            </div>
        `;
        document.getElementById('todayScorePill').textContent = '0 / 0 completed';
        document.getElementById('todayProgressFill').style.width = '0%';
        return;
    }

    let completedToday = 0;

    listEl.innerHTML = habits.map(h => {
        const box = document.querySelector(`.habit-checkbox[data-uuid="${h.id}"][data-day="${activeDay}"]`);
        const isCompleted = box ? box.checked : false;
        if (isCompleted) completedToday++;

        // Get active streak from telemetry
        const streakEl = document.getElementById(`ana-curr-${h.id}`);
        const streak = streakEl ? parseInt(streakEl.textContent) || 0 : 0;

        return `
            <div class="today-habit-card ${isCompleted ? 'completed' : ''}" onclick="toggleTodayHabit('${h.id}', ${activeDay})">
                <div class="today-checkbox-touch" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <div class="today-habit-info">
                    <span class="today-habit-title">${sanitizeHTML(h.name)}</span>
                    <div class="today-habit-meta">
                        ${streak > 0 ? `
                            <span class="today-streak-badge">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
                                ${streak} day streak
                            </span>
                        ` : '<span style="font-size:0.6875rem;">Ready to check in</span>'}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Update progress pill and bar
    const total = habits.length;
    const pct = total > 0 ? Math.round((completedToday / total) * 100) : 0;
    const scorePill = document.getElementById('todayScorePill');
    if (scorePill) {
        if (completedToday === total && total > 0) {
            scorePill.textContent = `All ${total} Done! ✨`;
        } else {
            scorePill.textContent = `${completedToday} / ${total} completed (${pct}%)`;
        }
    }
    const progFill = document.getElementById('todayProgressFill');
    if (progFill) progFill.style.width = `${pct}%`;

    // Sync Today Mood & Sleep Selects
    const moodSelectInGrid = document.querySelector(`.mood-sleep-select[data-metric="Mood"][data-day="${activeDay}"]`);
    const sleepSelectInGrid = document.querySelector(`.mood-sleep-select[data-metric="Hours of Sleep"][data-day="${activeDay}"]`);

    const todayMood = document.getElementById('todayMoodSelect');
    const todaySleep = document.getElementById('todaySleepSelect');

    if (todayMood && moodSelectInGrid) {
        todayMood.value = moodSelectInGrid.value || '';
        todayMood.onchange = () => {
            moodSelectInGrid.value = todayMood.value;
            saveState();
            calculateStats();
        };
    }

    if (todaySleep && sleepSelectInGrid) {
        todaySleep.value = sleepSelectInGrid.value || '';
        todaySleep.onchange = () => {
            sleepSelectInGrid.value = todaySleep.value;
            saveState();
            calculateStats();
        };
    }
}

function toggleTodayHabit(habitId, day) {
    const box = document.querySelector(`.habit-checkbox[data-uuid="${habitId}"][data-day="${day}"]`);
    if (box) {
        box.checked = !box.checked;
        saveState();
        calculateStats();
        renderTodayFocus();
    }
}

function addNewHabitFromToday() {
    const input = document.getElementById('newHabitInputToday');
    const msg = document.getElementById('errorMessageToday');
    const newName = input ? input.value.trim() : '';

    if (!newName) return;

    const exists = habits.some(h => h.name.toLowerCase() === newName.toLowerCase());
    if (exists) {
        if (msg) {
            msg.textContent = "A habit with this name already exists.";
            setTimeout(() => msg.textContent = "", 3000);
        }
        return;
    }

    habits.push({ id: generateUUID(), name: newName });
    localStorage.setItem('myCustomHabits_v3', JSON.stringify(habits));
    if (input) input.value = '';
    if (msg) msg.textContent = '';
    updateDashboard();
    renderTodayFocus();
    window.SupaSync?.triggerSync(currentYear, currentMonth);
}

function initGreeting() {
    const now = new Date();
    const hour = now.getHours();
    let timeGreeting = "Good morning";
    if (hour >= 12 && hour < 17) timeGreeting = "Good afternoon";
    else if (hour >= 17) timeGreeting = "Good evening";

    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const formattedDate = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;

    const greetingEl = document.getElementById('greeting');
    if (greetingEl) {
        greetingEl.textContent = `${formattedDate} · ${timeGreeting}`;
    }
}

function getStorageKey() {
    return `habitData_${currentYear}_${currentMonth}`;
}

function updateDashboard() {
    buildGrids();
    loadState();
    calculateStats();
    if (currentViewMode === 'today') {
        renderTodayFocus();
    }
}

// Global hooks for Supabase cloud sync layer
window.getTrackerYear = () => currentYear;
window.getTrackerMonth = () => currentMonth;
window.getHabits = () => habits;
window.setHabits = (newHabits) => { habits = newHabits; };
window.updateDashboard = updateDashboard;

// ============================================================
// HABIT ACTIONS
// ============================================================
function addNewHabit() {
    const input = document.getElementById('newHabitInput');
    const msg = document.getElementById('errorMessage');
    const newName = input.value.trim();

    if (!newName) return;

    const exists = habits.some(h => h.name.toLowerCase() === newName.toLowerCase());
    if (exists) {
        msg.textContent = "A habit with this name already exists.";
        setTimeout(() => msg.textContent = "", 3000);
        return;
    }

    habits.push({ id: generateUUID(), name: newName });
    localStorage.setItem('myCustomHabits_v3', JSON.stringify(habits));
    input.value = '';
    msg.textContent = '';
    updateDashboard();
    window.SupaSync?.triggerSync(currentYear, currentMonth);
}

function deleteHabit(id) {
    const habitIndex = habits.findIndex(h => h.id === id);
    if (habitIndex === -1) return;

    showConfirm(`Delete "${habits[habitIndex].name}"? This will remove its tracking history.`, () => {
        habits.splice(habitIndex, 1);
        localStorage.setItem('myCustomHabits_v3', JSON.stringify(habits));

        // Safe localStorage cleanup (avoid mutating keys during indexing)
        const keysToInspect = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('habitData_')) {
                keysToInspect.push(key);
            }
        }

        keysToInspect.forEach(key => {
            const monthData = safeJSONParse(localStorage.getItem(key), null);
            if (monthData && monthData.habits) {
                const cleanedHabits = {};
                for (const [dataKey, val] of Object.entries(monthData.habits)) {
                    if (!dataKey.startsWith(`${id}-`)) {
                        cleanedHabits[dataKey] = val;
                    }
                }
                monthData.habits = cleanedHabits;
                localStorage.setItem(key, JSON.stringify(monthData));
            }
        });

        updateDashboard();
        window.SupaSync?.deleteHabitFromCloud(id);
        window.SupaSync?.triggerSync(currentYear, currentMonth);
    });
}

function moveHabit(index, direction) {
    if (direction === -1 && index > 0) {
        [habits[index - 1], habits[index]] = [habits[index], habits[index - 1]];
    } else if (direction === 1 && index < habits.length - 1) {
        [habits[index + 1], habits[index]] = [habits[index], habits[index + 1]];
    }
    localStorage.setItem('myCustomHabits_v3', JSON.stringify(habits));
    updateDashboard();
    window.SupaSync?.triggerSync(currentYear, currentMonth);
}

function clearMonth() {
    showConfirm(`Clear all habit checks, mood, and sleep entries for ${monthNames[currentMonth]} ${currentYear}?`, () => {
        localStorage.removeItem(getStorageKey());
        updateDashboard();
        window.SupaSync?.triggerSync(currentYear, currentMonth);
    });
}

// ============================================================
// STATE STORAGE
// ============================================================
function saveState() {
    const state = { habits: {}, moodSleep: {} };
    document.querySelectorAll('.habit-checkbox').forEach(box => {
        if (box.checked) {
            state.habits[`${box.dataset.uuid}-${box.dataset.day}`] = true;
        }
    });
    document.querySelectorAll('.mood-sleep-select').forEach(select => {
        if (select.value !== "") {
            state.moodSleep[`${select.dataset.metric}-${select.dataset.day}`] = select.value;
        }
    });
    localStorage.setItem(getStorageKey(), JSON.stringify(state));
    window.SupaSync?.triggerSync(currentYear, currentMonth);
}

function loadState() {
    const saved = safeJSONParse(localStorage.getItem(getStorageKey()), { habits: {}, moodSleep: {} });
    document.querySelectorAll('.habit-checkbox').forEach(box => {
        box.checked = !!(saved.habits && saved.habits[`${box.dataset.uuid}-${box.dataset.day}`]);
    });
    document.querySelectorAll('.mood-sleep-select').forEach(select => {
        const val = saved.moodSleep && saved.moodSleep[`${select.dataset.metric}-${select.dataset.day}`];
        select.value = val !== undefined ? val : '';
    });
}

// ============================================================
// CALENDAR CONTROLS
// ============================================================
function initCalendarSettings() {
    const date = new Date();
    currentYear = date.getFullYear();
    currentMonth = date.getMonth();

    const mSelect = document.getElementById('monthSelect');
    const ySelect = document.getElementById('yearSelect');

    mSelect.innerHTML = '';
    ySelect.innerHTML = '';

    monthNames.forEach((m, i) => mSelect.add(new Option(m, i)));
    mSelect.value = currentMonth;

    for (let y = currentYear - 3; y <= currentYear + 3; y++) {
        ySelect.add(new Option(y, y));
    }
    ySelect.value = currentYear;

    mSelect.addEventListener('change', (e) => {
        currentMonth = parseInt(e.target.value);
        updateDashboard();
        window.SupaSync?.onMonthChange?.(currentYear, currentMonth);
    });
    ySelect.addEventListener('change', (e) => {
        currentYear = parseInt(e.target.value);
        updateDashboard();
        window.SupaSync?.onMonthChange?.(currentYear, currentMonth);
    });
}

// ============================================================
// GRID DOM BUILDER
// ============================================================
function buildGrids() {
    daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const titleEl = document.getElementById('gridTitle');
    if (titleEl) {
        titleEl.textContent = `${monthNames[currentMonth]} ${currentYear}`;
    }

    const today = new Date();
    const isThisMonth = (today.getFullYear() === currentYear && today.getMonth() === currentMonth);
    const todayDay = isThisMonth ? today.getDate() : -1;

    const header = document.getElementById('tableHeader');
    const body = document.getElementById('tableBody');
    const msBody = document.getElementById('moodSleepBody');
    const analysisBody = document.getElementById('analysisBody');

    header.innerHTML = '';
    body.innerHTML = '';
    msBody.innerHTML = '';
    analysisBody.innerHTML = '';

    // ── Week label grouping row ──
    const trWeeks = document.createElement('tr');
    const thEmptyTop = document.createElement('th');
    thEmptyTop.className = 'sticky-left';
    trWeeks.appendChild(thEmptyTop);

    let weekCounter = 1;
    for (let d = 1; d <= daysInMonth; d += 7) {
        const span = Math.min(7, daysInMonth - d + 1);
        const endDay = d + span - 1;
        const thWeek = document.createElement('th');
        thWeek.colSpan = span;
        thWeek.textContent = `Week ${weekCounter} · ${d}–${endDay}`;
        thWeek.className = 'week-label';
        trWeeks.appendChild(thWeek);
        weekCounter++;
    }
    header.appendChild(trWeeks);

    // ── Days and Dates header row ──
    const trDays = document.createElement('tr');
    const thHabit = document.createElement('th');
    thHabit.className = 'sticky-left';
    thHabit.innerHTML = `<span style="color:var(--text-muted); font-size:0.75rem; font-weight:600; letter-spacing:0.04em;">HABIT</span>`;
    trDays.appendChild(thHabit);

    for (let d = 1; d <= daysInMonth; d++) {
        const th = document.createElement('th');
        const dateObj = new Date(currentYear, currentMonth, d);
        const dow = dateObj.getDay();
        const isWeekend = dow === 0 || dow === 6;
        const isToday = d === todayDay;

        if (isToday) th.classList.add('today-col');
        if (isWeekend) th.classList.add('weekend-col');

        th.innerHTML = `
            <div class="day-label">${dayNamesShort[dow]}</div>
            <div class="date-label">${d}${isToday ? '<span class="today-indicator"></span>' : ''}</div>
        `;
        trDays.appendChild(th);
    }
    header.appendChild(trDays);

    // ── Habit Rows ──
    habits.forEach((habitObj, hIdx) => {
        const tr = document.createElement('tr');
        const tdName = document.createElement('td');
        tdName.className = 'sticky-left';

        const safeName = sanitizeHTML(habitObj.name);
        tdName.innerHTML = `
            <div class="habit-cell-content">
                <span class="habit-name" title="${safeName}">${safeName}</span>
                <div class="habit-row-actions">
                    <button class="icon-btn" onclick="moveHabit(${hIdx}, -1)" ${hIdx === 0 ? 'style="visibility:hidden"' : ''} title="Move up" aria-label="Move up">${SVG_ICONS.arrowUp}</button>
                    <button class="icon-btn" onclick="moveHabit(${hIdx}, 1)" ${hIdx === habits.length - 1 ? 'style="visibility:hidden"' : ''} title="Move down" aria-label="Move down">${SVG_ICONS.arrowDown}</button>
                    <button class="icon-btn delete-btn" onclick="deleteHabit('${habitObj.id}')" title="Delete habit" aria-label="Delete habit">${SVG_ICONS.trash}</button>
                </div>
            </div>
        `;
        tr.appendChild(tdName);

        for (let d = 1; d <= daysInMonth; d++) {
            const td = document.createElement('td');
            if (d === todayDay) td.classList.add('today-col');

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'habit-checkbox';
            cb.dataset.uuid = habitObj.id;
            cb.dataset.day = d;
            cb.setAttribute('aria-label', `${habitObj.name} day ${d}`);
            cb.addEventListener('change', () => {
                saveState();
                calculateStats();
            });
            td.appendChild(cb);
            tr.appendChild(td);
        }
        body.appendChild(tr);

        // Sidebar Telemetry row
        const anaTr = document.createElement('tr');
        anaTr.innerHTML = `
            <td class="text-left" title="${safeName}">${safeName}</td>
            <td id="ana-act-${habitObj.id}" class="tabular">0/${daysInMonth}</td>
            <td>
                <div style="display:flex; align-items:center; gap:6px; justify-content:center;">
                    <div class="progress-container" style="width:28px;">
                        <div class="progress-fill" id="ana-bar-${habitObj.id}"></div>
                    </div>
                    <span id="ana-pct-${habitObj.id}" class="tabular" style="font-size:0.7rem; color:var(--text-muted); width:26px; text-align:right;">0%</span>
                </div>
            </td>
            <td><b id="ana-curr-${habitObj.id}" class="tabular">0</b></td>
            <td id="ana-best-${habitObj.id}" class="tabular" style="color:var(--text-muted)">0</td>
        `;
        analysisBody.appendChild(anaTr);
    });

    // ── Wellness Separator ──
    const trWellnessTitle = document.createElement('tr');
    trWellnessTitle.innerHTML = `
        <td class="sticky-left" style="background:var(--bg-surface-elevated); border-top:1px solid var(--border-subtle);">
            <span style="color:var(--text-muted); font-size:0.6875rem; font-weight:700; letter-spacing:0.06em;">WELLNESS METRICS</span>
        </td>
        <td colspan="${daysInMonth}" style="background:var(--bg-surface-elevated); border-top:1px solid var(--border-subtle);"></td>
    `;
    msBody.appendChild(trWellnessTitle);

    // ── Mood & Sleep Metrics ──
    ['Mood (1-10)', 'Sleep (hrs)'].forEach(metricLabel => {
        const metricKey = metricLabel.startsWith('Mood') ? 'Mood' : 'Hours of Sleep';
        const tr = document.createElement('tr');
        const tdName = document.createElement('td');
        tdName.className = 'sticky-left';
        tdName.innerHTML = `<span class="habit-name" style="color:var(--text-secondary); font-size:0.75rem;">${metricLabel}</span>`;
        tr.appendChild(tdName);

        for (let d = 1; d <= daysInMonth; d++) {
            const td = document.createElement('td');
            if (d === todayDay) td.classList.add('today-col');

            const select = document.createElement('select');
            select.className = 'mood-sleep-select';
            select.add(new Option('·', ''));
            for (let i = 1; i <= 10; i++) select.add(new Option(`${i}`, i));

            select.dataset.metric = metricKey;
            select.dataset.day = d;
            select.setAttribute('aria-label', `${metricKey} on day ${d}`);
            select.addEventListener('change', () => {
                saveState();
                calculateStats();
            });
            td.appendChild(select);
            tr.appendChild(td);
        }
        msBody.appendChild(tr);
    });
}

// ============================================================
// CALCULATIONS & TELEMETRY
// ============================================================
function calculateStats() {
    const totalGoal = habits.length * daysInMonth;
    if (totalGoal === 0) {
        document.getElementById('statGoal').textContent = '0';
        document.getElementById('statCompleted').textContent = '0';
        document.getElementById('statLeft').textContent = '0';
        document.getElementById('topHabitsList').innerHTML =
            '<li><span style="color:var(--text-muted); width:100%; text-align:center;">No habits logged yet.</span></li>';
        return;
    }

    const today = new Date();
    const isCurrentMonth = (currentYear === today.getFullYear() && currentMonth === today.getMonth());
    const countUpTo = isCurrentMonth ? today.getDate() : daysInMonth;

    let totalCompleted = 0;
    const checksPerHabit = {};
    const habitDataGrid = {};
    const checksPerDay = Array(daysInMonth).fill(0);

    habits.forEach(h => {
        checksPerHabit[h.id] = 0;
        habitDataGrid[h.id] = Array(daysInMonth).fill(false);
    });

    document.querySelectorAll('.habit-checkbox').forEach(box => {
        if (box.checked) {
            totalCompleted++;
            const uuid = box.dataset.uuid;
            const dayIdx = parseInt(box.dataset.day) - 1;
            if (checksPerHabit[uuid] !== undefined) {
                checksPerHabit[uuid]++;
                checksPerDay[dayIdx]++;
                habitDataGrid[uuid][dayIdx] = true;
            }
        }
    });

    animateValue("statGoal", parseInt(document.getElementById('statGoal').innerText) || 0, totalGoal, 400);
    animateValue("statCompleted", parseInt(document.getElementById('statCompleted').innerText) || 0, totalCompleted, 400);
    animateValue("statLeft", parseInt(document.getElementById('statLeft').innerText) || 0, Math.max(0, totalGoal - totalCompleted), 400);

    const habitStatsArray = [];

    habits.forEach(h => {
        // Active streak: consecutive completions leading backwards from current active day
        let currStreak = 0;
        for (let d = countUpTo - 1; d >= 0; d--) {
            if (habitDataGrid[h.id][d]) {
                currStreak++;
            } else {
                break;
            }
        }

        // Best streak within valid timeline
        let bestStreak = 0, tempStreak = 0;
        for (let d = 0; d < countUpTo; d++) {
            if (habitDataGrid[h.id][d]) {
                tempStreak++;
                bestStreak = Math.max(bestStreak, tempStreak);
            } else {
                tempStreak = 0;
            }
        }
        bestStreak = Math.max(bestStreak, currStreak);

        const actual = checksPerHabit[h.id];
        const pct = Math.round((actual / daysInMonth) * 100);

        document.getElementById(`ana-act-${h.id}`).textContent = `${actual}/${daysInMonth}`;
        document.getElementById(`ana-pct-${h.id}`).textContent = `${pct}%`;
        document.getElementById(`ana-bar-${h.id}`).style.width = `${pct}%`;
        document.getElementById(`ana-curr-${h.id}`).textContent = currStreak;
        document.getElementById(`ana-best-${h.id}`).textContent = bestStreak;

        habitStatsArray.push({ name: h.name, actual, streak: currStreak });
    });

    // Sort by most completed, tie-breaker active streak
    habitStatsArray.sort((a, b) => b.actual - a.actual || b.streak - a.streak);

    const topList = document.getElementById('topHabitsList');
    if (topList) {
        topList.innerHTML = '';
        habitStatsArray.slice(0, 5).forEach((stat, i) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="rank-num">${i + 1}</span>
                <span class="habit-title" title="${sanitizeHTML(stat.name)}">${sanitizeHTML(stat.name)}</span>
                <span class="score">${stat.actual} <span style="font-size:0.7rem; color:var(--text-muted); font-weight:400;">/ ${daysInMonth}</span></span>
            `;
            topList.appendChild(li);
        });
    }

    // Chart updates
    const moodData = Array(daysInMonth).fill(null);
    const sleepData = Array(daysInMonth).fill(null);

    document.querySelectorAll('.mood-sleep-select').forEach(select => {
        const val = select.value ? parseInt(select.value) : null;
        const dayIdx = parseInt(select.dataset.day) - 1;
        if (select.dataset.metric === 'Mood') moodData[dayIdx] = val;
        if (select.dataset.metric === 'Hours of Sleep') sleepData[dayIdx] = val;
    });

    mixedChart.data.labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    mixedChart.data.datasets[0].data = checksPerDay;
    mixedChart.data.datasets[1].data = moodData;
    mixedChart.data.datasets[2].data = sleepData;
    mixedChart.update();

    overallChart.data.datasets[0].data = [totalCompleted, Math.max(0, totalGoal - totalCompleted)];
    overallChart.update();

    lastStatsData = {
        totalCompleted,
        totalGoal,
        countUpTo,
        checksPerDay,
        checksPerHabit,
        habitStatsArray,
        moodData,
        sleepData
    };

    updateDisciplineIntelligence(lastStatsData);
}

let lastStatsData = null;

// ============================================================
// DISCIPLINE INTELLIGENCE (CORRELATION & PATTERN ENGINE)
// ============================================================
function updateDisciplineIntelligence({ checksPerDay, moodData, sleepData, habitStatsArray, countUpTo, totalCompleted }) {
    const container = document.getElementById('insightsContainer');
    if (!container) return;

    if (!habits || habits.length === 0 || countUpTo < 2 || totalCompleted === 0) {
        container.innerHTML = `
            <div class="insight-empty">
                Log a few days of habits with mood and sleep to reveal your personal behavioral telemetry.
            </div>
        `;
        return;
    }

    const cards = [];

    // 1. Sleep Leverage Correlation
    const sleepHigh = [];
    const sleepLow = [];
    for (let d = 0; d < countUpTo; d++) {
        const sleep = sleepData[d];
        if (sleep !== null && !isNaN(sleep)) {
            const completion = habits.length > 0 ? (checksPerDay[d] / habits.length) : 0;
            if (sleep >= 7) sleepHigh.push(completion);
            else sleepLow.push(completion);
        }
    }

    if (sleepHigh.length > 0 && sleepLow.length > 0) {
        const avgHigh = Math.round((sleepHigh.reduce((a, b) => a + b, 0) / sleepHigh.length) * 100);
        const avgLow = Math.round((sleepLow.reduce((a, b) => a + b, 0) / sleepLow.length) * 100);
        const diff = avgHigh - avgLow;
        if (diff > 0) {
            cards.push({
                icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
                headline: `Sleep Leverage: +${diff}% Discipline`,
                detail: `On nights with 7+ hours of sleep, your habit completion averages ${avgHigh}% compared to ${avgLow}% on shorter nights.`
            });
        }
    } else if (sleepHigh.length + sleepLow.length >= 2) {
        const recorded = sleepData.slice(0, countUpTo).filter(s => s !== null && !isNaN(s));
        if (recorded.length) {
            const avg = (recorded.reduce((a, b) => a + b, 0) / recorded.length).toFixed(1);
            cards.push({
                icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
                headline: `Sleep Baseline: ${avg} hrs/night`,
                detail: `Tracking nightly sleep provides the baseline for sustainable physical and mental discipline.`
            });
        }
    }

    // 2. Mood Correlation
    const highMoods = [];
    const lowMoods = [];
    for (let d = 0; d < countUpTo; d++) {
        const mood = moodData[d];
        if (mood !== null && !isNaN(mood)) {
            const rate = habits.length > 0 ? (checksPerDay[d] / habits.length) : 0;
            if (rate >= 0.5) highMoods.push(mood);
            else lowMoods.push(mood);
        }
    }

    if (highMoods.length > 0 && lowMoods.length > 0) {
        const avgHighMood = (highMoods.reduce((a, b) => a + b, 0) / highMoods.length).toFixed(1);
        const avgLowMood = (lowMoods.reduce((a, b) => a + b, 0) / lowMoods.length).toFixed(1);
        const diffMood = (avgHighMood - avgLowMood).toFixed(1);
        if (parseFloat(diffMood) > 0.2) {
            cards.push({
                icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
                headline: `Mood Elevation: +${diffMood} Pts`,
                detail: `Your mood averages ${avgHighMood}/10 on disciplined days compared to ${avgLowMood}/10 on off days.`
            });
        }
    }

    // 3. Peak Day of the Week
    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    for (let d = 1; d <= countUpTo; d++) {
        const dow = new Date(currentYear, currentMonth, d).getDay();
        dayTotals[dow] += checksPerDay[d - 1];
        dayCounts[dow] += habits.length;
    }

    let bestDow = -1, bestRate = 0;
    for (let dow = 0; dow < 7; dow++) {
        if (dayCounts[dow] > 0) {
            const r = dayTotals[dow] / dayCounts[dow];
            if (r > bestRate && dayTotals[dow] > 0) {
                bestRate = r;
                bestDow = dow;
            }
        }
    }

    const fullDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    if (bestDow !== -1 && bestRate > 0) {
        cards.push({
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
            headline: `Peak Rhythm: ${fullDays[bestDow]}s`,
            detail: `You hit your highest consistency on ${fullDays[bestDow]}s with an average of ${Math.round(bestRate * 100)}% habits checked.`
        });
    }

    // 4. Anchor Habit
    if (habitStatsArray && habitStatsArray.length > 0 && habitStatsArray[0].actual > 0) {
        const anchor = habitStatsArray[0];
        const pct = Math.round((anchor.actual / daysInMonth) * 100);
        cards.push({
            icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
            headline: `Anchor: ${sanitizeHTML(anchor.name)}`,
            detail: `Top-performing habit at ${pct}% completion (${anchor.actual}/${daysInMonth} days) with an active streak of ${anchor.streak} days.`
        });
    }

    if (cards.length === 0) {
        container.innerHTML = `
            <div class="insight-empty">
                Keep tracking daily to unlock deeper wellness and consistency insights.
            </div>
        `;
    } else {
        container.innerHTML = cards.map(c => `
            <div class="insight-card">
                <div class="insight-icon-wrap" aria-hidden="true">${c.icon}</div>
                <div class="insight-content">
                    <div class="insight-headline">${c.headline}</div>
                    <div class="insight-detail">${c.detail}</div>
                </div>
            </div>
        `).join('');
    }
}

// ============================================================
// MONTHLY DISCIPLINE RECEIPT GENERATOR & MODAL
// ============================================================
function openReceiptModal() {
    const overlay = document.getElementById('receiptModalOverlay');
    if (!overlay) return;

    const stats = lastStatsData || {};
    const totalGoal = (habits.length * daysInMonth) || 1;
    const totalDone = stats.totalCompleted || 0;
    const rate = Math.round((totalDone / totalGoal) * 100);

    const mName = monthNames[currentMonth].toUpperCase();
    document.getElementById('receiptMonthYear').textContent = `${mName} ${currentYear}`;
    document.getElementById('rcptRate').textContent = `${rate}%`;
    document.getElementById('rcptLogged').textContent = `${totalDone} / ${totalGoal}`;

    const bestActiveStreak = stats.habitStatsArray?.reduce((max, h) => Math.max(max, h.streak), 0) || 0;
    document.getElementById('rcptStreak').textContent = `${bestActiveStreak} day${bestActiveStreak === 1 ? '' : 's'}`;

    const validSleep = (stats.sleepData || []).filter(v => v !== null && !isNaN(v));
    const avgSleep = validSleep.length ? (validSleep.reduce((a, b) => a + b, 0) / validSleep.length).toFixed(1) + ' hrs' : '--';
    document.getElementById('rcptSleep').textContent = avgSleep;

    const validMood = (stats.moodData || []).filter(v => v !== null && !isNaN(v));
    const avgMood = validMood.length ? (validMood.reduce((a, b) => a + b, 0) / validMood.length).toFixed(1) + ' / 10' : '--';
    document.getElementById('rcptMood').textContent = avgMood;

    const topContainer = document.getElementById('rcptTopHabits');
    if (topContainer) {
        const topHabits = (stats.habitStatsArray || []).slice(0, 3);
        if (topHabits.length === 0) {
            topContainer.innerHTML = '<div style="color:var(--text-muted); font-size:0.7rem; padding:4px 0;">No habits recorded yet.</div>';
        } else {
            topContainer.innerHTML = topHabits.map((h, i) => {
                const pct = Math.round((h.actual / daysInMonth) * 100);
                return `
                    <div class="receipt-row">
                        <span class="receipt-label">#${i + 1} ${sanitizeHTML(h.name)}</span>
                        <span class="receipt-value">${pct}%</span>
                    </div>
                `;
            }).join('');
        }
    }

    overlay.classList.add('active');
}

function closeReceiptModal() {
    document.getElementById('receiptModalOverlay')?.classList.remove('active');
}

function generateReceiptCanvas() {
    const canvas = document.createElement('canvas');
    const width = 440;
    const height = 580;
    const dpr = 2;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const isLight = document.documentElement.getAttribute('data-theme') === 'paper';
    const bg = isLight ? '#f6f5f0' : '#0c0d11';
    const cardBg = isLight ? '#ffffff' : '#14151e';
    const textColor = isLight ? '#1c1917' : '#f2f3f7';
    const textMuted = isLight ? '#78716c' : '#73778c';
    const accent = isLight ? '#c2410c' : '#e59838';
    const borderColor = isLight ? '#e7e5e4' : '#27293a';

    // Canvas background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Card boundary
    const pad = 20;
    const cardW = width - (pad * 2);
    const cardH = height - (pad * 2);

    ctx.fillStyle = cardBg;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.roundRect(pad, pad, cardW, cardH, 10);
    ctx.fill();
    ctx.stroke();

    const left = pad + 20;
    const right = width - pad - 20;
    let y = pad + 36;

    // Header
    ctx.textAlign = 'center';
    ctx.font = '700 13px "JetBrains Mono", monospace';
    ctx.fillStyle = accent;
    ctx.fillText('✦ DISCIPLINE RECEIPT ✦', width / 2, y);

    y += 18;
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillStyle = textMuted;
    ctx.fillText(`${monthNames[currentMonth].toUpperCase()} ${currentYear}`, width / 2, y);

    function drawDashedLine(lineY) {
        ctx.strokeStyle = borderColor;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(left, lineY);
        ctx.lineTo(right, lineY);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    y += 16;
    drawDashedLine(y);

    function drawRow(label, val, isBold = false) {
        y += 22;
        ctx.textAlign = 'left';
        ctx.font = `${isBold ? '700' : '500'} 11px "JetBrains Mono", monospace`;
        ctx.fillStyle = isBold ? textColor : textMuted;
        ctx.fillText(label, left, y);

        ctx.textAlign = 'right';
        ctx.fillStyle = textColor;
        ctx.fillText(val, right, y);
    }

    const stats = lastStatsData || {};
    const totalGoal = (habits.length * daysInMonth) || 1;
    const totalDone = stats.totalCompleted || 0;
    const rate = Math.round((totalDone / totalGoal) * 100);
    const bestActiveStreak = stats.habitStatsArray?.reduce((max, h) => Math.max(max, h.streak), 0) || 0;

    const validSleep = (stats.sleepData || []).filter(v => v !== null && !isNaN(v));
    const avgSleep = validSleep.length ? (validSleep.reduce((a, b) => a + b, 0) / validSleep.length).toFixed(1) + ' hrs' : '--';

    const validMood = (stats.moodData || []).filter(v => v !== null && !isNaN(v));
    const avgMood = validMood.length ? (validMood.reduce((a, b) => a + b, 0) / validMood.length).toFixed(1) + ' / 10' : '--';

    drawRow('DISCIPLINE RATE', `${rate}%`, true);
    drawRow('HABITS LOGGED', `${totalDone} / ${totalGoal}`);
    drawRow('ACTIVE STREAK', `${bestActiveStreak} days`);
    drawRow('AVG SLEEP', avgSleep);
    drawRow('AVG MOOD', avgMood);

    y += 16;
    drawDashedLine(y);

    y += 16;
    ctx.textAlign = 'left';
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.fillStyle = textMuted;
    ctx.fillText('TOP DISCIPLINE HABITS', left, y);

    const topHabits = (stats.habitStatsArray || []).slice(0, 3);
    topHabits.forEach((h, i) => {
        const pct = Math.round((h.actual / daysInMonth) * 100);
        let name = h.name;
        if (name.length > 20) name = name.substring(0, 18) + '…';
        drawRow(`#${i + 1} ${name}`, `${pct}%`);
    });

    y += 18;
    drawDashedLine(y);

    // Barcode
    y += 16;
    const bars = [2, 4, 1, 3, 2, 5, 1, 3, 4, 2, 1, 3, 5, 2, 4, 1, 3, 2, 4, 1, 3];
    const totalBarW = bars.reduce((a, b) => a + b, 0) + (bars.length * 2.5);
    let startX = (width - totalBarW) / 2;

    ctx.fillStyle = textColor;
    bars.forEach(w => {
        ctx.fillRect(startX, y, w, 22);
        startX += w + 2.5;
    });

    // Footer
    y += 38;
    ctx.textAlign = 'center';
    ctx.font = 'italic 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = textMuted;
    ctx.fillText('"We are what we repeatedly do."', width / 2, y);

    y += 16;
    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.fillStyle = textMuted;
    ctx.fillText('habit-tracker · jhrmmartin.github.io', width / 2, y);

    return canvas;
}

function downloadReceiptPNG() {
    const canvas = generateReceiptCanvas();
    canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Habit_Receipt_${monthNames[currentMonth]}_${currentYear}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

async function copyReceiptToClipboard() {
    const btn = document.getElementById('copyReceiptBtn');
    const canvas = generateReceiptCanvas();
    canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            if (btn) {
                const originalHtml = btn.innerHTML;
                btn.textContent = '✓ Copied!';
                setTimeout(() => btn.innerHTML = originalHtml, 2000);
            }
        } catch {
            alert('Could not copy image automatically. You can download the PNG instead!');
        }
    });
}

// Snappy number interpolation with zero spin-lock risk
function animateValue(id, start, end, duration) {
    if (start === end) {
        const el = document.getElementById(id);
        if (el) el.textContent = end;
        return;
    }
    const range = end - start;
    let current = start;
    const increment = end > start ? 1 : -1;
    const stepTime = Math.max(2, Math.abs(Math.floor(duration / range)));
    const obj = document.getElementById(id);
    if (!obj) return;

    const timer = setInterval(() => {
        current += increment;
        obj.textContent = current;
        if (current === end) clearInterval(timer);
    }, stepTime);
}

// ============================================================
// DATA EXPORT (RFC 4180 Compliant Blob)
// ============================================================
function exportCSV() {
    let csvContent = "\uFEFF"; // UTF-8 BOM for accurate Excel parsing

    const headerRow = ["Date", "Day", ...habits.map(h => `"${h.name.replace(/"/g, '""')}"`), "Mood", "SleepHours"];
    csvContent += headerRow.join(",") + "\r\n";

    const saved = safeJSONParse(localStorage.getItem(getStorageKey()), { habits: {}, moodSleep: {} });

    for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(currentYear, currentMonth, d);
        const shortMonth = monthNames[currentMonth].substring(0, 3);
        const formattedDate = `${shortMonth}-${d.toString().padStart(2, '0')}`;
        const row = [formattedDate, dayNamesShort[dateObj.getDay()]];

        habits.forEach(h => {
            row.push(saved.habits && saved.habits[`${h.id}-${d}`] ? "1" : "0");
        });

        row.push(saved.moodSleep ? (saved.moodSleep[`Mood-${d}`] || "") : "");
        row.push(saved.moodSleep ? (saved.moodSleep[`Hours of Sleep-${d}`] || "") : "");

        csvContent += row.join(",") + "\r\n";
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Habits_${monthNames[currentMonth]}_${currentYear}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ============================================================
// CHART CONFIGURATION (Tactile Warm Obsidian Theme)
// ============================================================
function initCharts() {
    const ctxDaily = document.getElementById('dailyMixedChart').getContext('2d');

    mixedChart = new Chart(ctxDaily, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
                {
                    type: 'bar',
                    label: 'Habits Completed',
                    data: [],
                    backgroundColor: '#e59838',
                    borderRadius: 4,
                    yAxisID: 'y',
                    order: 3
                },
                {
                    type: 'line',
                    label: 'Mood (1-10)',
                    data: [],
                    borderColor: '#10b981',
                    backgroundColor: '#10b981',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 2.5,
                    spanGaps: true,
                    yAxisID: 'y1',
                    order: 1
                },
                {
                    type: 'line',
                    label: 'Sleep (hours)',
                    data: [],
                    borderColor: '#9ea1b2',
                    backgroundColor: '#9ea1b2',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    fill: false,
                    tension: 0.3,
                    pointRadius: 2.5,
                    pointStyle: 'rect',
                    spanGaps: true,
                    yAxisID: 'y1',
                    order: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    ticks: { color: '#646777', font: { family: 'JetBrains Mono', size: 10 } },
                    grid: { color: 'rgba(255, 255, 255, 0.04)' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    min: 0,
                    max: 10,
                    ticks: { color: '#10b981', font: { family: 'JetBrains Mono', size: 10 } },
                    grid: { drawOnChartArea: false }
                },
                x: {
                    ticks: { color: '#646777', font: { family: 'JetBrains Mono', size: 10 } },
                    grid: { display: false }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#9ea1b2',
                        usePointStyle: true,
                        boxWidth: 6,
                        font: { family: 'Plus Jakarta Sans', size: 11, weight: '500' }
                    }
                }
            }
        }
    });

    const ctxDoughnut = document.getElementById('overallDoughnutChart').getContext('2d');
    overallChart = new Chart(ctxDoughnut, {
        type: 'doughnut',
        data: {
            labels: ['Done', 'Remaining'],
            datasets: [{
                data: [0, 1],
                backgroundColor: ['#e59838', 'rgba(255, 255, 255, 0.04)'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '82%',
            plugins: {
                legend: { display: false },
                tooltip: { enabled: true }
            }
        }
    });
}
