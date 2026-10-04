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
            window.SupaSync?.pushUserPreferences?.();
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
    initNotionWorkspace();
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
    document.getElementById('interactiveTourOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'interactiveTourOverlay') exitInteractiveTour();
    });
    document.getElementById('dayNoteModalOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'dayNoteModalOverlay') closeDayNoteModal();
    });
    document.getElementById('renameJournalModalOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'renameJournalModalOverlay') closeRenameJournalModal();
    });
    document.getElementById('customizeLayoutModalOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'customizeLayoutModalOverlay') closeCustomizeModal();
    });
    document.getElementById('habitIconPickerModalOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'habitIconPickerModalOverlay') closeHabitIconPicker();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeReceiptModal();
            exitInteractiveTour();
            closeDayNoteModal();
            closeRenameJournalModal();
            closeCustomizeModal();
            closeHabitIconPicker();
            closeMoreOptionsMenu();
        } else if (isTourActive) {
            if (e.key === 'ArrowRight') nextTourStep();
            if (e.key === 'ArrowLeft') prevTourStep();
        }
    });

    document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('moreMenuWrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            closeMoreOptionsMenu();
        }
    });

    updateDashboard();
    initJournal();
    initOnboarding();
};

// ============================================================
// TOOLBAR MORE (•••) MENU TOGGLE
// ============================================================
function toggleMoreOptionsMenu(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('moreMenuDropdown');
    const btn = document.getElementById('moreOptionsBtn');
    if (!dropdown) return;
    const isHidden = dropdown.classList.contains('hidden');
    dropdown.classList.toggle('hidden', !isHidden);
    if (btn) btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
}

function closeMoreOptionsMenu() {
    const dropdown = document.getElementById('moreMenuDropdown');
    const btn = document.getElementById('moreOptionsBtn');
    if (dropdown) dropdown.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

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
    document.getElementById('gridJournalPanel')?.classList.toggle('hidden', isToday);
    document.getElementById('todayPanel')?.classList.toggle('hidden', !isToday);

    if (isToday) {
        renderTodayFocus();
    } else {
        renderGridJournal();
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
                <button type="button" class="today-habit-icon-badge" onclick="event.stopPropagation(); openHabitIconPicker('${h.id}')" title="Change icon for ${sanitizeHTML(h.name)}" aria-label="Change icon">
                    ${getHabitIcon(h)}
                </button>
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

    // Sync Today Micro-Journal Reflection & Custom Pills
    updateJournalTitleUI();
    renderJournalPillsContainer('todayJournalPills', 'todayJournalInput');

    const todayJournalInput = document.getElementById('todayJournalInput');
    if (todayJournalInput) {
        todayJournalInput.value = currentMonthJournal[activeDay] || '';
        todayJournalInput.oninput = () => {
            if (_journalDebounceTimer) clearTimeout(_journalDebounceTimer);
            _journalDebounceTimer = setTimeout(() => {
                saveJournalNote(activeDay, todayJournalInput.value);
                showJournalSavedHint();
            }, 350);
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

    habits.push({ id: generateUUID(), name: newName, icon: getSmartHabitIcon(newName) });
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
    } else {
        renderGridJournal();
    }
}

// Global hooks for Supabase cloud sync layer
window.getTrackerYear = () => currentYear;
window.getTrackerMonth = () => currentMonth;
window.getHabits = () => habits;
window.setHabits = (newHabits) => { habits = newHabits; };
window.updateDashboard = updateDashboard;
window.applyTheme = applyTheme;
window.getTheme = () => localStorage.getItem('habitTracker_theme') || 'obsidian';
window.getJournalTitle = () => journalTitle;
window.setJournalTitle = (title) => {
    if (!title || !title.trim()) return;
    journalTitle = title.trim();
    localStorage.setItem('habitTracker_journalTitle', journalTitle);
    updateJournalTitleUI();
};
window.getJournalPills = () => journalPills;
window.setJournalPills = (pills) => {
    if (!Array.isArray(pills)) return;
    journalPills = pills;
    localStorage.setItem('habitTracker_journalPills_v1', JSON.stringify(journalPills));
    renderAllJournalPills();
};
window.getCurrentMonthJournal = () => currentMonthJournal;
window.setCurrentMonthJournal = (j) => {
    currentMonthJournal = j || {};
    const state = safeJSONParse(localStorage.getItem(getStorageKey()), { habits: {}, moodSleep: {}, journal: {} });
    state.journal = currentMonthJournal;
    localStorage.setItem(getStorageKey(), JSON.stringify(state));
    updateJournalIndicators();
    populateGridJournalDaySelect();
    renderGridJournalHistoryChips();
};

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

    habits.push({ id: generateUUID(), name: newName, icon: getSmartHabitIcon(newName) });
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

let currentMonthJournal = {};
let _journalDebounceTimer = null;

function clearMonth() {
    showConfirm(`Clear all habit checks, mood, sleep, and reflections for ${monthNames[currentMonth]} ${currentYear}?`, () => {
        currentMonthJournal = {};
        localStorage.removeItem(getStorageKey());
        updateDashboard();
        window.SupaSync?.triggerSync(currentYear, currentMonth);
    });
}

// ============================================================
// STATE STORAGE
// ============================================================
function saveState() {
    const state = { habits: {}, moodSleep: {}, journal: currentMonthJournal };
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
    const saved = safeJSONParse(localStorage.getItem(getStorageKey()), { habits: {}, moodSleep: {}, journal: {} });
    currentMonthJournal = saved.journal || {};
    document.querySelectorAll('.habit-checkbox').forEach(box => {
        box.checked = !!(saved.habits && saved.habits[`${box.dataset.uuid}-${box.dataset.day}`]);
    });
    document.querySelectorAll('.mood-sleep-select').forEach(select => {
        const val = saved.moodSleep && saved.moodSleep[`${select.dataset.metric}-${select.dataset.day}`];
        select.value = val !== undefined ? val : '';
    });
    updateJournalIndicators();
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
        th.dataset.day = d;
        th.style.cursor = 'pointer';
        th.title = `Day ${d} — click to view or log daily reflection`;
        th.addEventListener('click', () => openDayNoteModal(d));

        const dateObj = new Date(currentYear, currentMonth, d);
        const dow = dateObj.getDay();
        const isWeekend = dow === 0 || dow === 6;
        const isToday = d === todayDay;

        if (isToday) th.classList.add('today-col');
        if (isWeekend) th.classList.add('weekend-col');

        const hasNote = Boolean(currentMonthJournal[d] && currentMonthJournal[d].trim());

        th.innerHTML = `
            <div class="day-label">${dayNamesShort[dow]}</div>
            <div class="date-label">${d}${isToday ? '<span class="today-indicator"></span>' : ''}${hasNote ? '<span class="date-has-note-dot" title="Daily reflection logged"></span>' : ''}</div>
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
        const habitIcon = getHabitIcon(habitObj);
        tdName.innerHTML = `
            <div class="habit-cell-content">
                <button type="button" class="habit-icon-btn" onclick="openHabitIconPicker('${habitObj.id}')" title="Change icon for ${safeName}" aria-label="Change habit icon">${habitIcon}</button>
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

    // ── Daily Reflection Row in Grid ──
    const trReflect = document.createElement('tr');
    const tdReflectName = document.createElement('td');
    tdReflectName.className = 'sticky-left';
    tdReflectName.innerHTML = `<span class="habit-name" style="color:var(--accent); font-size:0.75rem; font-weight:600;">Daily Note</span>`;
    trReflect.appendChild(tdReflectName);

    for (let d = 1; d <= daysInMonth; d++) {
        const td = document.createElement('td');
        if (d === todayDay) td.classList.add('today-col');

        const hasNote = Boolean(currentMonthJournal[d] && currentMonthJournal[d].trim());
        const notePreview = hasNote ? currentMonthJournal[d].substring(0, 80) : '';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `grid-note-cell-btn ${hasNote ? 'has-note' : ''}`;
        btn.dataset.day = d;
        btn.innerHTML = hasNote ? '📝' : '+';
        btn.title = hasNote ? `Day ${d}: ${sanitizeHTML(notePreview)}` : `Log reflection for Day ${d}`;
        btn.onclick = () => focusGridJournalDay(d);

        td.appendChild(btn);
        trReflect.appendChild(td);
    }
    msBody.appendChild(trReflect);
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

// ============================================================
// MICRO-JOURNAL & REFLECTION SYSTEM (Customizable Types & Tags)
// ============================================================
let modalActiveDay = null;

const defaultJournalPills = [
    { id: 'win', label: '🏆 Win', prefix: '🏆 Win: ' },
    { id: 'lesson', label: '💭 Lesson', prefix: '💭 Lesson: ' },
    { id: 'priority', label: '🎯 Priority', prefix: '🎯 Priority: ' },
    { id: 'grateful', label: '✨ Grateful', prefix: '✨ Grateful: ' }
];

let journalPills = safeJSONParse(localStorage.getItem('habitTracker_journalPills_v1'), defaultJournalPills);
let journalTitle = localStorage.getItem('habitTracker_journalTitle') || 'Daily Reflection & Win';

function initJournal() {
    updateJournalTitleUI();
    renderAllJournalPills();
    updateJournalIndicators();
}

function updateJournalTitleUI() {
    const el = document.getElementById('journalCardTitle');
    if (el) el.textContent = journalTitle;
    const gridEl = document.getElementById('gridJournalCardTitle');
    if (gridEl) gridEl.textContent = journalTitle;
}

function openRenameJournalModal() {
    const overlay = document.getElementById('renameJournalModalOverlay');
    const input = document.getElementById('customJournalTitleInput');
    if (input) input.value = journalTitle;
    if (overlay) overlay.classList.add('active');
    setTimeout(() => input?.focus(), 80);
}

function closeRenameJournalModal() {
    const overlay = document.getElementById('renameJournalModalOverlay');
    if (overlay) overlay.classList.remove('active');
}

function selectJournalPreset(presetName) {
    const input = document.getElementById('customJournalTitleInput');
    if (input) input.value = presetName;
    saveJournalTitle();
}

function saveJournalTitle() {
    const input = document.getElementById('customJournalTitleInput');
    const val = input ? input.value.trim() : '';
    if (val) {
        journalTitle = val;
        localStorage.setItem('habitTracker_journalTitle', journalTitle);
        updateJournalTitleUI();
        window.SupaSync?.pushUserPreferences?.();
    }
    closeRenameJournalModal();
}

function renderAllJournalPills() {
    renderJournalPillsContainer('todayJournalPills', 'todayJournalInput');
    renderJournalPillsContainer('gridJournalPills', 'gridJournalInput');
    renderJournalPillsContainer('modalJournalPromptPills', 'dayNoteModalInput');
}

function renderJournalPillsContainer(containerId, targetInputId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    // Render active pills
    journalPills.forEach(pill => {
        const item = document.createElement('div');
        item.className = 'prompt-pill-item';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'prompt-pill';
        btn.textContent = pill.label;
        btn.onclick = () => insertJournalPrompt(pill.prefix, targetInputId);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'pill-remove-btn';
        delBtn.textContent = '×';
        delBtn.title = `Remove "${pill.label}" tag`;
        delBtn.onclick = (e) => {
            e.stopPropagation();
            deleteJournalPill(pill.id);
        };

        item.appendChild(btn);
        item.appendChild(delBtn);
        container.appendChild(item);
    });

    // Add Tag Button
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'prompt-pill add-custom-pill-btn';
    addBtn.id = `addBtn_${containerId}`;
    addBtn.innerHTML = `
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5"  y1="12" x2="19" y2="12"/></svg>
        <span>Add Tag</span>
    `;
    addBtn.onclick = () => toggleAddPillInput(containerId, true);
    container.appendChild(addBtn);

    // Inline input wrap
    const inputWrap = document.createElement('div');
    inputWrap.className = 'add-pill-inline-wrap hidden';
    inputWrap.id = `inputWrap_${containerId}`;
    inputWrap.innerHTML = `
        <input type="text" class="add-pill-input" id="pillInput_${containerId}" placeholder="e.g. Workout, Ideas…" maxlength="24" />
        <button type="button" class="btn btn-primary btn-mini" id="pillConfirm_${containerId}">Add</button>
        <button type="button" class="btn btn-ghost btn-mini" id="pillCancel_${containerId}">✕</button>
    `;
    container.appendChild(inputWrap);

    // Listeners for inline input
    const inputEl = inputWrap.querySelector(`#pillInput_${containerId}`);
    const confirmBtn = inputWrap.querySelector(`#pillConfirm_${containerId}`);
    const cancelBtn = inputWrap.querySelector(`#pillCancel_${containerId}`);

    if (inputEl) {
        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitCustomPill(containerId, targetInputId);
            } else if (e.key === 'Escape') {
                toggleAddPillInput(containerId, false);
            }
        };
    }
    if (confirmBtn) {
        confirmBtn.onclick = () => submitCustomPill(containerId, targetInputId);
    }
    if (cancelBtn) {
        cancelBtn.onclick = () => toggleAddPillInput(containerId, false);
    }

    // Reset default tags button if user removed all
    if (journalPills.length === 0) {
        const restoreBtn = document.createElement('button');
        restoreBtn.type = 'button';
        restoreBtn.className = 'prompt-pill';
        restoreBtn.style.color = 'var(--text-muted)';
        restoreBtn.style.fontSize = '0.65rem';
        restoreBtn.textContent = '↺ Reset default tags';
        restoreBtn.onclick = restoreDefaultJournalPills;
        container.appendChild(restoreBtn);
    }
}

function toggleAddPillInput(containerId, show) {
    const addBtn = document.getElementById(`addBtn_${containerId}`);
    const inputWrap = document.getElementById(`inputWrap_${containerId}`);
    const inputEl = document.getElementById(`pillInput_${containerId}`);

    if (addBtn) addBtn.classList.toggle('hidden', show);
    if (inputWrap) inputWrap.classList.toggle('hidden', !show);

    if (show && inputEl) {
        inputEl.value = '';
        inputEl.focus();
    }
}

function submitCustomPill(containerId, targetInputId) {
    const inputEl = document.getElementById(`pillInput_${containerId}`);
    const rawVal = inputEl ? inputEl.value.trim() : '';
    if (!rawVal) {
        toggleAddPillInput(containerId, false);
        return;
    }

    let label = rawVal;
    const hasEmoji = /\p{Extended_Pictographic}/u.test(rawVal);
    if (!hasEmoji) {
        label = `🏷️ ${rawVal}`;
    }
    const prefix = `${label}: `;

    const newPill = {
        id: 'pill_' + generateUUID(),
        label: label,
        prefix: prefix
    };

    journalPills.push(newPill);
    localStorage.setItem('habitTracker_journalPills_v1', JSON.stringify(journalPills));

    renderAllJournalPills();
    insertJournalPrompt(prefix, targetInputId);
    window.SupaSync?.pushUserPreferences?.();
}

function deleteJournalPill(id) {
    journalPills = journalPills.filter(p => p.id !== id);
    localStorage.setItem('habitTracker_journalPills_v1', JSON.stringify(journalPills));
    renderAllJournalPills();
    window.SupaSync?.pushUserPreferences?.();
}

function restoreDefaultJournalPills() {
    journalPills = [...defaultJournalPills];
    localStorage.setItem('habitTracker_journalPills_v1', JSON.stringify(journalPills));
    renderAllJournalPills();
    window.SupaSync?.pushUserPreferences?.();
}

function showJournalSavedHint() {
    const hint = document.getElementById('journalSavedHint');
    if (!hint) return;
    hint.textContent = 'Saved ✓';
    hint.style.color = 'var(--success)';
    setTimeout(() => {
        hint.textContent = 'Auto-saved';
        hint.style.color = '';
    }, 1800);
}

function saveJournalNote(day, text) {
    if (!text || !text.trim()) {
        delete currentMonthJournal[day];
    } else {
        currentMonthJournal[day] = text.trim();
    }
    saveState();
    updateJournalIndicators();
    updateGridJournalTableRow(day);
    populateGridJournalDaySelect();
    renderGridJournalHistoryChips();
}

function insertJournalPrompt(prompt, targetInputId = 'todayJournalInput') {
    const journalInput = document.getElementById(targetInputId) || document.getElementById('todayJournalInput');
    if (!journalInput) return;

    const curVal = journalInput.value;
    if (curVal.length > 0 && !curVal.endsWith('\n')) {
        journalInput.value += '\n' + prompt;
    } else {
        journalInput.value += prompt;
    }
    journalInput.focus();
    journalInput.selectionStart = journalInput.selectionEnd = journalInput.value.length;

    if (targetInputId === 'todayJournalInput') {
        const today = new Date();
        const isCurrentMonth = (currentYear === today.getFullYear() && currentMonth === today.getMonth());
        const activeDay = isCurrentMonth ? today.getDate() : 1;
        saveJournalNote(activeDay, journalInput.value);
        showJournalSavedHint();
    } else if (targetInputId === 'gridJournalInput') {
        saveJournalNote(gridJournalActiveDay, journalInput.value);
        showGridJournalSavedHint();
    }
}

function updateJournalIndicators() {
    document.querySelectorAll('#tableHeader th[data-day]').forEach(th => {
        const d = parseInt(th.dataset.day);
        const dateLabel = th.querySelector('.date-label');
        if (!dateLabel) return;
        let dot = dateLabel.querySelector('.date-has-note-dot');
        const hasNote = Boolean(currentMonthJournal[d] && currentMonthJournal[d].trim());
        if (hasNote && !dot) {
            dot = document.createElement('span');
            dot.className = 'date-has-note-dot';
            dot.title = 'Daily reflection logged';
            dateLabel.appendChild(dot);
        } else if (!hasNote && dot) {
            dot.remove();
        }
    });
}

function openDayNoteModal(day) {
    modalActiveDay = day;
    const overlay = document.getElementById('dayNoteModalOverlay');
    const title = document.getElementById('dayNoteTitle');
    const subtitle = document.getElementById('dayNoteSubtitle');
    const input = document.getElementById('dayNoteModalInput');
    if (!overlay || !input) return;

    const dateObj = new Date(currentYear, currentMonth, day);
    const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dateObj.getDay()];
    if (title) title.textContent = `${journalTitle} · ${monthNames[currentMonth]} ${day}, ${currentYear}`;
    if (subtitle) subtitle.textContent = `${dayName} — Daily reflections, wins, & notes`;
    input.value = currentMonthJournal[day] || '';

    renderJournalPillsContainer('modalJournalPromptPills', 'dayNoteModalInput');

    overlay.classList.add('active');
    input.focus();
}

function closeDayNoteModal() {
    const overlay = document.getElementById('dayNoteModalOverlay');
    if (overlay) overlay.classList.remove('active');
    modalActiveDay = null;
}

function saveDayNoteFromModal() {
    if (modalActiveDay === null) return;
    const input = document.getElementById('dayNoteModalInput');
    if (input) {
        saveJournalNote(modalActiveDay, input.value);
        if (currentViewMode === 'today') {
            renderTodayFocus();
        } else {
            renderGridJournal();
        }
    }
    closeDayNoteModal();
}

// ============================================================
// GRID VIEW JOURNAL CONTROLS (Always visible in Month Grid)
// ============================================================
let gridJournalActiveDay = 1;

function initGridJournalActiveDay() {
    const today = new Date();
    const isThisMonth = (today.getFullYear() === currentYear && today.getMonth() === currentMonth);
    gridJournalActiveDay = isThisMonth ? today.getDate() : 1;
}

function renderGridJournal() {
    if (!gridJournalActiveDay || gridJournalActiveDay > daysInMonth) {
        initGridJournalActiveDay();
    }

    updateJournalTitleUI();
    populateGridJournalDaySelect();
    updateGridJournalDayHeading();
    renderJournalPillsContainer('gridJournalPills', 'gridJournalInput');

    const input = document.getElementById('gridJournalInput');
    if (input) {
        input.value = currentMonthJournal[gridJournalActiveDay] || '';
        input.oninput = () => {
            if (_journalDebounceTimer) clearTimeout(_journalDebounceTimer);
            _journalDebounceTimer = setTimeout(() => {
                saveJournalNote(gridJournalActiveDay, input.value);
                showGridJournalSavedHint();

                // If editing today, sync with Today view input too
                const today = new Date();
                const isCurrentMonth = (currentYear === today.getFullYear() && currentMonth === today.getMonth());
                if (isCurrentMonth && gridJournalActiveDay === today.getDate()) {
                    const todayInput = document.getElementById('todayJournalInput');
                    if (todayInput && todayInput.value !== input.value) {
                        todayInput.value = input.value;
                    }
                }
            }, 350);
        };
    }

    renderGridJournalHistoryChips();
}

function updateGridJournalDayHeading() {
    const headingEl = document.getElementById('gridJournalDayHeading');
    if (!headingEl) return;

    const today = new Date();
    const isThisMonth = (today.getFullYear() === currentYear && today.getMonth() === currentMonth);
    const isToday = isThisMonth && (today.getDate() === gridJournalActiveDay);

    const dateObj = new Date(currentYear, currentMonth, gridJournalActiveDay);
    const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dateObj.getDay()];
    headingEl.textContent = `${isToday ? 'Today · ' : ''}${dayName}, ${monthNames[currentMonth]} ${gridJournalActiveDay}`;
}

function populateGridJournalDaySelect() {
    const select = document.getElementById('gridJournalDaySelect');
    if (!select) return;

    const today = new Date();
    const isThisMonth = (today.getFullYear() === currentYear && today.getMonth() === currentMonth);
    const todayDay = isThisMonth ? today.getDate() : -1;

    select.innerHTML = '';
    for (let d = 1; d <= daysInMonth; d++) {
        const hasNote = Boolean(currentMonthJournal[d] && currentMonthJournal[d].trim());
        const isToday = d === todayDay;
        const label = `Day ${d}${isToday ? ' (Today)' : ''}${hasNote ? ' • 📝' : ''}`;
        const opt = new Option(label, d);
        if (d === gridJournalActiveDay) opt.selected = true;
        select.add(opt);
    }

    select.onchange = () => {
        switchGridJournalDay(parseInt(select.value));
    };
}

function switchGridJournalDay(day) {
    gridJournalActiveDay = Math.max(1, Math.min(daysInMonth, day));

    const select = document.getElementById('gridJournalDaySelect');
    if (select) select.value = gridJournalActiveDay;

    updateGridJournalDayHeading();

    const input = document.getElementById('gridJournalInput');
    if (input) {
        input.value = currentMonthJournal[gridJournalActiveDay] || '';
    }

    renderGridJournalHistoryChips();
}

function focusGridJournalDay(day) {
    switchGridJournalDay(day);
    const panel = document.getElementById('gridJournalPanel');
    if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    const input = document.getElementById('gridJournalInput');
    if (input) {
        setTimeout(() => input.focus(), 150);
    }
}

function navigateGridJournalDay(delta) {
    let nextDay = gridJournalActiveDay + delta;
    if (nextDay < 1) nextDay = daysInMonth;
    if (nextDay > daysInMonth) nextDay = 1;
    switchGridJournalDay(nextDay);
}

function jumpGridJournalToToday() {
    const today = new Date();
    const isThisMonth = (today.getFullYear() === currentYear && today.getMonth() === currentMonth);
    const target = isThisMonth ? today.getDate() : 1;
    switchGridJournalDay(target);
}

function showGridJournalSavedHint() {
    const hint = document.getElementById('gridJournalSavedHint');
    if (!hint) return;
    hint.textContent = 'Saved ✓';
    hint.style.color = 'var(--success)';
    setTimeout(() => {
        hint.textContent = 'Auto-saved';
        hint.style.color = '';
    }, 1800);
}

function renderGridJournalHistoryChips() {
    const container = document.getElementById('gridJournalHistoryChips');
    if (!container) return;

    container.innerHTML = '';
    let count = 0;

    for (let d = 1; d <= daysInMonth; d++) {
        const text = currentMonthJournal[d];
        if (!text || !text.trim()) continue;
        count++;

        const snippet = text.replace(/\n/g, ' ').substring(0, 32);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `grid-journal-chip ${d === gridJournalActiveDay ? 'active' : ''}`;
        chip.innerHTML = `
            <span class="grid-journal-chip-day">Day ${d}:</span>
            <span class="grid-journal-chip-snippet">${sanitizeHTML(snippet)}</span>
        `;
        chip.onclick = () => focusGridJournalDay(d);
        container.appendChild(chip);
    }

    if (count === 0) {
        container.innerHTML = `<span style="font-size:0.75rem; color:var(--text-muted);">No notes logged yet for ${monthNames[currentMonth]}. Type above or click + in the table to start!</span>`;
    }
}

function updateGridJournalTableRow(day) {
    const btn = document.querySelector(`.grid-note-cell-btn[data-day="${day}"]`);
    if (!btn) return;
    const hasNote = Boolean(currentMonthJournal[day] && currentMonthJournal[day].trim());
    btn.classList.toggle('has-note', hasNote);
    btn.innerHTML = hasNote ? '📝' : '+';
    if (hasNote) {
        btn.title = `Day ${day}: ${currentMonthJournal[day].substring(0, 80)}`;
    } else {
        btn.title = `Log reflection for Day ${day}`;
    }
}

// ============================================================
// INTERACTIVE ONBOARDING SPOTLIGHT TOUR (Live UI & Hands-on Tasks)
// ============================================================
let isTourActive = false;
let currentTourStepIndex = 0;
let tourActiveElement = null;
let tourStepListenerCleanups = [];
let tourRepositionRaf = null;

const INTERACTIVE_TOUR_STEPS = [
    {
        id: 'workspace_identity',
        title: 'Notion Workspace Identity',
        desc: 'Your habit tracker is built like a Notion page. You can customize your cover banner, page emoji, workspace title, and daily motivational quote.',
        prompt: 'Tap the emoji icon ⚡ or click the title to personalize your tracker!',
        actionLabel: '🎯 TRY IT NOW:',
        targetSelector: () => document.getElementById('notionIdentityBar') || document.getElementById('notionPageIconBtn'),
        beforeShow: () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        setupListener: (onComplete) => {
            const iconBtn = document.getElementById('notionPageIconBtn');
            const titleEl = document.getElementById('notionWorkspaceTitle');
            const handler = () => onComplete('✨ Workspace identity personalized!');
            if (iconBtn) iconBtn.addEventListener('click', handler, { once: true });
            if (titleEl) {
                titleEl.addEventListener('focus', handler, { once: true });
                titleEl.addEventListener('input', handler, { once: true });
            }
            return () => {
                if (iconBtn) iconBtn.removeEventListener('click', handler);
                if (titleEl) {
                    titleEl.removeEventListener('focus', handler);
                    titleEl.removeEventListener('input', handler);
                }
            };
        }
    },
    {
        id: 'view_modes',
        title: 'Dual Focus: Grid vs Today',
        desc: 'Switch anytime between the full 31-day Month Grid and the distraction-free Today Focus list (designed for smartphones and quick 10-second check-ins).',
        prompt: 'Click "Today" (or "Grid") to switch the view mode now!',
        actionLabel: '🎯 TRY IT NOW:',
        beforeShow: () => {
            const el = document.querySelector('.view-mode-toggle');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
        targetSelector: () => document.querySelector('.view-mode-toggle'),
        setupListener: (onComplete) => {
            const todayBtn = document.getElementById('viewTodayBtn');
            const gridBtn = document.getElementById('viewGridBtn');
            const handler = () => onComplete('⚡ View mode toggled! Everything stays synchronized.');
            if (todayBtn) todayBtn.addEventListener('click', handler, { once: true });
            if (gridBtn) gridBtn.addEventListener('click', handler, { once: true });
            return () => {
                if (todayBtn) todayBtn.removeEventListener('click', handler);
                if (gridBtn) gridBtn.removeEventListener('click', handler);
            };
        }
    },
    {
        id: 'habit_tracking',
        title: '1-Tap Daily Habit Tracking',
        desc: 'Tracking consistency is effortless. Every checkmark immediately increments your active streak, calculates monthly completion rate, and updates your charts.',
        prompt: 'Tap a habit checkbox (or today\'s calendar cell) to check off a habit!',
        actionLabel: '🎯 TRY IT NOW:',
        beforeShow: () => {
            const el = document.querySelector('.today-habit-card') || document.querySelector('.tracker-grid tbody tr:first-child');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
        targetSelector: () => {
            if (currentViewMode === 'today') {
                return document.querySelector('.today-habit-card .today-checkbox') || document.querySelector('.today-habit-card');
            }
            return document.querySelector('.tracker-grid tbody tr:first-child td.day-cell.today-col') || document.querySelector('.tracker-grid tbody tr:first-child');
        },
        setupListener: (onComplete) => {
            const handler = (e) => {
                if (e.target.matches('input[type="checkbox"], .day-cell, .today-checkbox, .today-habit-card, .today-checkbox-wrap')) {
                    onComplete('🔥 Streak logged! Your momentum is growing.');
                    fireTourConfetti();
                }
            };
            document.addEventListener('click', handler, true);
            return () => document.removeEventListener('click', handler, true);
        }
    },
    {
        id: 'wellness_tracking',
        title: 'Wellness: Mood & Sleep Logging',
        desc: 'Track how your nightly rest and daily mood directly influence your discipline. The correlation algorithm charts your sweet spot for optimal momentum.',
        prompt: 'Select your mood rating (1–10) or hours of sleep.',
        actionLabel: '🎯 TRY IT NOW:',
        beforeShow: () => {
            const target = currentViewMode === 'today'
                ? document.querySelector('.today-wellness-card')
                : (document.getElementById('moodSleepBody') || document.getElementById('chartPanel'));
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
        targetSelector: () => {
            if (currentViewMode === 'today') {
                return document.querySelector('.today-wellness-card') || document.getElementById('todayMoodSelect');
            }
            return document.getElementById('moodSleepBody') || document.getElementById('chartPanel');
        },
        setupListener: (onComplete) => {
            const moodSelect = document.getElementById('todayMoodSelect');
            const sleepSelect = document.getElementById('todaySleepSelect');
            const handler = () => onComplete('📈 Wellness logged! Feeds your discipline correlation data.');
            if (moodSelect) moodSelect.addEventListener('change', handler, { once: true });
            if (sleepSelect) sleepSelect.addEventListener('change', handler, { once: true });
            const gridBody = document.getElementById('moodSleepBody');
            if (gridBody) gridBody.addEventListener('change', handler, { once: true });
            return () => {
                if (moodSelect) moodSelect.removeEventListener('change', handler);
                if (sleepSelect) sleepSelect.removeEventListener('change', handler);
                if (gridBody) gridBody.removeEventListener('change', handler);
            };
        }
    },
    {
        id: 'micro_journal',
        title: 'Micro-Journal & Custom Tags',
        desc: 'Capture daily reflections, gratitudes, and wins in 60 seconds without blank-page writer\'s block. Tags allow instant categorized journaling.',
        prompt: 'Click "+ 🏆 Daily Win" (or any tag) to stamp a quick reflection into your notes!',
        actionLabel: '🎯 TRY IT NOW:',
        beforeShow: () => {
            const jEl = currentViewMode === 'today'
                ? document.getElementById('todayJournalCard')
                : document.getElementById('gridJournalPanel');
            if (jEl) jEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
        targetSelector: () => {
            if (currentViewMode === 'today') {
                return document.getElementById('todayJournalPills') || document.getElementById('todayJournalCard');
            }
            return document.getElementById('gridJournalPills') || document.getElementById('gridJournalPanel');
        },
        setupListener: (onComplete) => {
            const handler = (e) => {
                if (e.target.closest('.prompt-pill') || e.target.id === 'todayJournalInput' || e.target.id === 'gridJournalInput') {
                    onComplete('📝 Reflection tagged! Auto-saves locally & to cloud.');
                }
            };
            document.addEventListener('click', handler, true);
            const tArea = document.getElementById('todayJournalInput') || document.getElementById('gridJournalInput');
            const onInput = () => onComplete('📝 Reflection logged!');
            if (tArea) tArea.addEventListener('input', onInput, { once: true });
            return () => {
                document.removeEventListener('click', handler, true);
                if (tArea) tArea.removeEventListener('input', onInput);
            };
        }
    },
    {
        id: 'notion_aesthetics',
        title: 'Covers, Wallpaper & Themes',
        desc: 'Personalize your tracker with beautiful Notion-style cover banners, subtle wallpaper patterns, custom typography, or 6 curated color themes.',
        prompt: 'Click the "Customize" button in the toolbar to explore options!',
        actionLabel: '🎯 TRY IT NOW:',
        beforeShow: () => {
            const btn = document.querySelector('.toolbar button[onclick*="openCustomizeModal"]');
            if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
        targetSelector: () => document.querySelector('.toolbar button[onclick*="openCustomizeModal"]'),
        setupListener: (onComplete) => {
            const btn = document.querySelector('.toolbar button[onclick*="openCustomizeModal"]');
            const handler = () => onComplete('🎨 Customizer opened! Make the UI your own.');
            if (btn) btn.addEventListener('click', handler, { once: true });
            return () => {
                if (btn) btn.removeEventListener('click', handler);
            };
        }
    },
    {
        id: 'receipt',
        title: 'Discipline Receipt',
        desc: 'Generate a vintage monospace discipline receipt of your monthly stats, active streaks, and overall completion rate to share or celebrate.',
        prompt: 'Click "Receipt" to preview your monthly discipline summary!',
        actionLabel: '🎯 TRY IT NOW:',
        beforeShow: () => {
            const btn = document.querySelector('.btn-receipt');
            if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
        targetSelector: () => document.querySelector('.btn-receipt'),
        setupListener: (onComplete) => {
            const btn = document.querySelector('.btn-receipt');
            const handler = () => {
                onComplete('🏆 Receipt generated! Monospace & shareable.');
                fireTourConfetti();
            };
            if (btn) btn.addEventListener('click', handler, { once: true });
            return () => {
                if (btn) btn.removeEventListener('click', handler);
            };
        }
    },
    {
        id: 'cloud_sync_auth',
        title: 'Cloud Sync & Account Setup',
        desc: 'Synchronize your habits, streaks, and reflections across your laptop and smartphone in real time. Create your free account below to activate cloud backup.',
        prompt: 'Create your account or sign in below to finish onboarding!',
        actionLabel: '⚡ MANDATORY SETUP:',
        isAuthStep: true,
        beforeShow: () => {
            const authPill = document.getElementById('authOpenBtn') || document.getElementById('userBadge') || document.querySelector('.toolbar-group-right');
            if (authPill) authPill.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
        targetSelector: () => document.getElementById('authOpenBtn') || document.getElementById('userBadge') || document.querySelector('.toolbar-group-right'),
        setupListener: (onComplete) => {
            const currentUser = window.SupaSync?.getCurrentUser ? window.SupaSync.getCurrentUser() : null;
            if (currentUser) {
                onComplete(`✓ Connected as ${currentUser.email}! Sync active.`);
                renderTourAuthStepContent(currentUser);
                return;
            }

            renderTourAuthStepContent(null, onComplete);

            const authHandler = (user) => {
                if (user) {
                    onComplete(`✓ Connected as ${user.email}! Sync active.`);
                    renderTourAuthStepContent(user);
                    fireTourConfetti();
                }
            };
            window.onTourUserAuthenticated = authHandler;

            return () => {
                window.onTourUserAuthenticated = null;
            };
        }
    }
];

let isTourEnforced = false;
let tourAuthMode = 'signup';

async function initOnboarding() {
    setTimeout(async () => {
        let user = null;
        if (window.SupaSync?.getUser) {
            try {
                user = await window.SupaSync.getUser();
            } catch (_) {}
        }

        // If user is NOT authenticated, onboarding is mandatory / enforced!
        if (!user) {
            startInteractiveTour(0, { enforced: true });
        } else {
            // Already signed in: only launch if not yet onboarded
            const onboarded = localStorage.getItem('habitTracker_onboarded');
            if (!onboarded) {
                startInteractiveTour(0, { enforced: false });
            }
        }
    }, 700);
}

function startInteractiveTour(startIndex = 0, options = {}) {
    // Close any other modal dialogs before launching the tour
    closeReceiptModal();
    closeDayNoteModal();
    closeRenameJournalModal();
    closeCustomizeModal();
    closeHabitIconPicker();

    const currentUser = window.SupaSync?.getCurrentUser ? window.SupaSync.getCurrentUser() : null;
    isTourEnforced = options.enforced !== undefined ? options.enforced : (!currentUser);

    isTourActive = true;
    currentTourStepIndex = Math.max(0, Math.min(INTERACTIVE_TOUR_STEPS.length - 1, startIndex));

    const overlay = document.getElementById('interactiveTourOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
    }

    const closeBtn = document.getElementById('tourCloseBtn');
    if (closeBtn) {
        if (isTourEnforced) {
            closeBtn.classList.add('hidden');
        } else {
            closeBtn.classList.remove('hidden');
        }
    }

    const skipBtn = document.getElementById('tourSkipBtn');
    if (skipBtn) {
        if (isTourEnforced) {
            skipBtn.classList.add('hidden');
        } else {
            skipBtn.classList.remove('hidden');
        }
    }

    renderTourStep(currentTourStepIndex);

    window.addEventListener('resize', onTourReposition);
    window.addEventListener('scroll', onTourReposition, { passive: true });
    if ('onscrollend' in window) {
        window.addEventListener('scrollend', onTourReposition, { passive: true });
    }
}

function exitInteractiveTour(force = false) {
    if (isTourEnforced && !force) {
        const user = window.SupaSync?.getCurrentUser ? window.SupaSync.getCurrentUser() : null;
        if (!user) {
            // Cannot dismiss enforced tour until authenticated
            currentTourStepIndex = INTERACTIVE_TOUR_STEPS.length - 1;
            renderTourStep(currentTourStepIndex);
            return;
        }
    }

    isTourActive = false;
    isTourEnforced = false;
    cleanupCurrentTourStepListeners();
    setTourActiveElement(null);

    const overlay = document.getElementById('interactiveTourOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }

    const outline = document.getElementById('tourTargetOutline');
    if (outline) outline.style.display = 'none';

    window.removeEventListener('resize', onTourReposition);
    window.removeEventListener('scroll', onTourReposition);
    if ('onscrollend' in window) {
        window.removeEventListener('scrollend', onTourReposition);
    }

    localStorage.setItem('habitTracker_onboarded', 'true');
}

function nextTourStep() {
    if (currentTourStepIndex < INTERACTIVE_TOUR_STEPS.length - 1) {
        currentTourStepIndex++;
        renderTourStep(currentTourStepIndex);
    } else {
        // Final step: verify user is authenticated
        const user = window.SupaSync?.getCurrentUser ? window.SupaSync.getCurrentUser() : null;
        if (!user && isTourEnforced) {
            const emailInput = document.getElementById('tourAuthEmail');
            const formCard = document.getElementById('tourAuthCard');
            if (formCard) {
                formCard.classList.remove('tour-field-shake');
                void formCard.offsetWidth;
                formCard.classList.add('tour-field-shake');
            }
            if (emailInput) emailInput.focus();
            const feedback = document.getElementById('tourAuthFeedback');
            if (feedback) {
                feedback.textContent = 'Please create your account or sign in to complete onboarding and enable sync across devices!';
                feedback.className = 'tour-auth-feedback error';
                feedback.classList.remove('hidden');
            }
            return;
        }

        fireTourConfetti();
        markTourActionCompleted('🏆 Setup Complete! Your habits are synced.');
        setTimeout(() => {
            exitInteractiveTour(true);
        }, 1200);
    }
}

function prevTourStep() {
    if (currentTourStepIndex > 0) {
        currentTourStepIndex--;
        renderTourStep(currentTourStepIndex);
    }
}

function renderTourStep(index) {
    cleanupCurrentTourStepListeners();

    const step = INTERACTIVE_TOUR_STEPS[index];
    if (!step) return;

    if (typeof step.beforeShow === 'function') {
        step.beforeShow();
    }

    // Update Card UI
    const badgeEl = document.getElementById('tourStepBadge');
    if (badgeEl) badgeEl.textContent = `Step ${index + 1} of ${INTERACTIVE_TOUR_STEPS.length}`;

    const progressBar = document.getElementById('tourProgressBar');
    if (progressBar) {
        const pct = Math.round(((index + 1) / INTERACTIVE_TOUR_STEPS.length) * 100);
        progressBar.style.width = `${pct}%`;
    }

    const titleEl = document.getElementById('tourStepTitle');
    if (titleEl) titleEl.textContent = step.title;

    const descEl = document.getElementById('tourStepDesc');
    if (descEl) descEl.textContent = step.desc;

    const actionBox = document.getElementById('tourActionBox');
    if (actionBox) actionBox.classList.remove('completed');

    const actionLabel = document.getElementById('tourActionLabel');
    if (actionLabel) actionLabel.textContent = step.actionLabel || '🎯 TRY IT NOW:';

    const actionStatus = document.getElementById('tourActionStatus');
    if (actionStatus) actionStatus.textContent = 'Waiting for action...';

    const actionPrompt = document.getElementById('tourActionPrompt');
    if (actionPrompt) actionPrompt.textContent = step.prompt;

    const customSlot = document.getElementById('tourCustomSlot');
    if (customSlot && !step.isAuthStep) {
        customSlot.innerHTML = '';
    }

    const prevBtn = document.getElementById('tourPrevBtn');
    if (prevBtn) {
        prevBtn.style.visibility = index === 0 ? 'hidden' : 'visible';
    }

    const nextBtn = document.getElementById('tourNextBtn');
    if (nextBtn) {
        nextBtn.classList.remove('tour-next-pulse');
        if (index === INTERACTIVE_TOUR_STEPS.length - 1) {
            const isAuth = !!(window.SupaSync?.getCurrentUser && window.SupaSync.getCurrentUser());
            if (isAuth) {
                nextBtn.textContent = 'Finish & Enter Workspace 🎉';
                nextBtn.classList.remove('tour-btn-locked');
                nextBtn.classList.add('tour-next-pulse');
            } else {
                nextBtn.textContent = 'Create Account to Finish 🔒';
                nextBtn.classList.add('tour-btn-locked');
            }
        } else {
            nextBtn.textContent = 'Next Step →';
            nextBtn.classList.remove('tour-btn-locked');
        }
    }

    // Attach step listener
    if (typeof step.setupListener === 'function') {
        const cleanup = step.setupListener((completedMsg) => {
            markTourActionCompleted(completedMsg);
        });
        if (typeof cleanup === 'function') {
            tourStepListenerCleanups.push(cleanup);
        }
    }

    // Progressive spotlight repositioning as scrolling settles
    const updateTourPos = () => {
        if (!isTourActive) return;
        const targetEl = getStepTarget(step);
        setTourActiveElement(targetEl);
        positionTourSpotlight(targetEl);
    };

    updateTourPos();
    setTimeout(updateTourPos, 60);
    setTimeout(updateTourPos, 180);
    setTimeout(updateTourPos, 350);
    setTimeout(updateTourPos, 550);
}

function renderTourAuthStepContent(currentUser, onComplete) {
    const slot = document.getElementById('tourCustomSlot');
    if (!slot) return;

    if (currentUser) {
        slot.innerHTML = `
            <div class="tour-auth-connected-box">
                <div class="tour-auth-connected-header">
                    <span class="tour-auth-check-icon">✓</span>
                    <strong>Cloud Sync Connected</strong>
                </div>
                <div class="tour-auth-connected-email">${sanitizeHTML(currentUser.email || 'Active User')}</div>
                <p class="tour-auth-connected-note">Your habits, streaks, and reflections sync across laptop and smartphone in real time.</p>
            </div>
        `;
        const nextBtn = document.getElementById('tourNextBtn');
        if (nextBtn) {
            nextBtn.textContent = 'Finish & Enter Workspace 🎉';
            nextBtn.classList.remove('tour-btn-locked');
            nextBtn.classList.add('tour-next-pulse');
        }
        return;
    }

    slot.innerHTML = `
        <div class="tour-auth-card" id="tourAuthCard">
            <div class="tour-auth-tabs">
                <button type="button" class="tour-auth-tab ${tourAuthMode === 'signup' ? 'active' : ''}" id="tourAuthSignupTab" onclick="setTourAuthMode('signup')">Create Account</button>
                <button type="button" class="tour-auth-tab ${tourAuthMode === 'signin' ? 'active' : ''}" id="tourAuthSigninTab" onclick="setTourAuthMode('signin')">Sign In</button>
            </div>
            <div class="tour-auth-fields">
                <div class="tour-auth-field">
                    <label class="tour-auth-label" for="tourAuthEmail">Email Address</label>
                    <input type="email" id="tourAuthEmail" class="tour-auth-input" placeholder="you@example.com" autocomplete="email" required>
                </div>
                <div class="tour-auth-field">
                    <label class="tour-auth-label" for="tourAuthPassword">Password</label>
                    <input type="password" id="tourAuthPassword" class="tour-auth-input" placeholder="${tourAuthMode === 'signup' ? 'At least 6 characters' : 'Enter password'}" autocomplete="current-password" required>
                </div>
                <div id="tourAuthFeedback" class="tour-auth-feedback hidden" role="alert"></div>
                <button type="button" class="btn btn-primary tour-auth-btn" id="tourAuthSubmitBtn" onclick="handleTourAuthSubmit()">
                    <span>${tourAuthMode === 'signup' ? 'Create Account & Sync ⚡' : 'Sign In & Sync ⚡'}</span>
                </button>
            </div>
            <div class="tour-auth-footer-help">
                <span id="tourAuthToggleNote">
                    ${tourAuthMode === 'signup' ? 'Already have an account? <a href="#" onclick="setTourAuthMode(\'signin\'); return false;">Sign In</a>' : 'New here? <a href="#" onclick="setTourAuthMode(\'signup\'); return false;">Create an account</a>'}
                </span>
            </div>
        </div>
    `;

    // Hook Enter key on inputs
    const emailInput = document.getElementById('tourAuthEmail');
    const pwInput = document.getElementById('tourAuthPassword');
    if (emailInput && pwInput) {
        emailInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') pwInput.focus();
        });
        pwInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleTourAuthSubmit();
        });
    }
}

function setTourAuthMode(mode) {
    tourAuthMode = mode;
    const currentUser = window.SupaSync?.getCurrentUser ? window.SupaSync.getCurrentUser() : null;
    renderTourAuthStepContent(currentUser);
}

async function handleTourAuthSubmit() {
    const emailEl = document.getElementById('tourAuthEmail');
    const pwEl = document.getElementById('tourAuthPassword');
    const feedback = document.getElementById('tourAuthFeedback');
    const submitBtn = document.getElementById('tourAuthSubmitBtn');

    const email = emailEl?.value?.trim();
    const password = pwEl?.value;

    function showError(msg) {
        if (!feedback) return;
        feedback.textContent = msg;
        feedback.className = 'tour-auth-feedback error';
        feedback.classList.remove('hidden');
    }

    function showSuccess(msg) {
        if (!feedback) return;
        feedback.textContent = msg;
        feedback.className = 'tour-auth-feedback success';
        feedback.classList.remove('hidden');
    }

    if (!email || !email.includes('@')) {
        showError('Please enter a valid email address.');
        emailEl?.focus();
        return;
    }

    if (!password || password.length < 6) {
        showError('Password must be at least 6 characters.');
        pwEl?.focus();
        return;
    }

    if (!window.SupaSync) {
        showError('Cloud sync service is not ready. Please check connection.');
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Connecting to Cloud…';
    }

    try {
        if (tourAuthMode === 'signup') {
            const data = await window.SupaSync.signUpWithEmail(email, password);
            if (!data.session && !data.user) {
                showError('Account registration failed. Please try again.');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Create Account & Sync ⚡';
                }
                return;
            }

            if (!data.session && data.user) {
                showSuccess('Account registered! Please check your email to confirm, then sign in.');
                markTourActionCompleted('✓ Account created! Check your email to confirm.');
                const nextBtn = document.getElementById('tourNextBtn');
                if (nextBtn) {
                    nextBtn.textContent = 'Finish Tour 🎉';
                    nextBtn.classList.remove('tour-btn-locked');
                    nextBtn.classList.add('tour-next-pulse');
                }
                return;
            }

            const user = data.user;
            renderTourAuthStepContent(user);
            markTourActionCompleted(`✓ Account created! Synced as ${user.email}`);
            fireTourConfetti();
        } else {
            const user = await window.SupaSync.signInWithEmail(email, password);
            renderTourAuthStepContent(user);
            markTourActionCompleted(`✓ Signed in! Habits synced for ${user.email}`);
            fireTourConfetti();
        }

        const nextBtn = document.getElementById('tourNextBtn');
        if (nextBtn) {
            nextBtn.textContent = 'Finish & Enter Workspace 🎉';
            nextBtn.classList.remove('tour-btn-locked');
            nextBtn.classList.add('tour-next-pulse');
        }
    } catch (err) {
        console.error('[Tour Auth Error]', err);
        const errMsg = err.message || 'Authentication failed. Please verify credentials.';
        showError(errMsg);
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = (tourAuthMode === 'signup') ? 'Create Account & Sync ⚡' : 'Sign In & Sync ⚡';
        }
    }
}

function getStepTarget(step) {
    if (!step) return null;
    if (typeof step.targetSelector === 'function') {
        return step.targetSelector();
    }
    if (typeof step.targetSelector === 'string') {
        return document.querySelector(step.targetSelector);
    }
    return null;
}

function setTourActiveElement(el) {
    if (tourActiveElement) {
        tourActiveElement.classList.remove('tour-active-element');
    }
    tourActiveElement = el;
    if (tourActiveElement) {
        tourActiveElement.classList.add('tour-active-element');
    }
}

function cleanupCurrentTourStepListeners() {
    while (tourStepListenerCleanups.length > 0) {
        const cleanup = tourStepListenerCleanups.pop();
        try { cleanup(); } catch (err) { /* ignore */ }
    }
}

function markTourActionCompleted(completedText) {
    const actionBox = document.getElementById('tourActionBox');
    const statusEl = document.getElementById('tourActionStatus');
    const promptEl = document.getElementById('tourActionPrompt');
    const nextBtn = document.getElementById('tourNextBtn');

    if (actionBox) actionBox.classList.add('completed');
    if (statusEl) statusEl.textContent = '✓ Done!';
    if (promptEl && completedText) promptEl.textContent = completedText;
    if (nextBtn) nextBtn.classList.add('tour-next-pulse');
}

function positionTourSpotlight(targetEl) {
    const cutout = document.getElementById('tourMaskCutout');
    const outline = document.getElementById('tourTargetOutline');
    const card = document.getElementById('tourCard');

    if (!targetEl) {
        if (cutout) {
            cutout.setAttribute('width', '0');
            cutout.setAttribute('height', '0');
        }
        if (outline) outline.style.display = 'none';
        return;
    }

    const rect = targetEl.getBoundingClientRect();
    const pad = 8;
    const x = Math.max(0, rect.left - pad);
    const y = Math.max(0, rect.top - pad);
    const w = Math.min(window.innerWidth - x, rect.width + (pad * 2));
    const h = rect.height + (pad * 2);

    if (cutout) {
        cutout.setAttribute('x', x);
        cutout.setAttribute('y', y);
        cutout.setAttribute('width', Math.max(0, w));
        cutout.setAttribute('height', Math.max(0, h));
    }

    if (outline) {
        outline.style.left = `${x}px`;
        outline.style.top = `${y}px`;
        outline.style.width = `${Math.max(0, w)}px`;
        outline.style.height = `${Math.max(0, h)}px`;
        outline.style.display = 'block';
    }

    if (card) {
        positionTourCard(rect, card);
    }
}

function positionTourCard(rect, card) {
    if (!card || !rect) return;
    const isMobile = window.innerWidth <= 680;
    if (isMobile) {
        card.style.top = '';
        card.style.left = '';
        card.style.bottom = '';
        return;
    }

    const cardRect = card.getBoundingClientRect();
    const cardW = cardRect.width || 380;
    const cardH = cardRect.height || 260;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 16;
    const gap = 14;

    // Helper: returns true if candidate card bounding box intersects the target element's bounding box
    function checkCollision(cTop, cLeft, cW, cH, target) {
        const cRight = cLeft + cW;
        const cBottom = cTop + cH;
        const pad = 4;
        return !(
            cRight < (target.left - pad) ||
            cLeft > (target.right + pad) ||
            cBottom < (target.top - pad) ||
            cTop > (target.bottom + pad)
        );
    }

    // 4 candidate directions
    const candidates = [
        // 1. Below target (preferred default)
        {
            dir: 'below',
            top: rect.bottom + gap,
            left: Math.max(margin, Math.min(rect.left, vw - cardW - margin))
        },
        // 2. Above target
        {
            dir: 'above',
            top: rect.top - cardH - gap,
            left: Math.max(margin, Math.min(rect.left, vw - cardW - margin))
        },
        // 3. Right of target (ideal for left icon/buttons)
        {
            dir: 'right',
            top: Math.max(margin, Math.min(rect.top, vh - cardH - margin)),
            left: rect.right + gap
        },
        // 4. Left of target (ideal for right toolbar controls)
        {
            dir: 'left',
            top: Math.max(margin, Math.min(rect.top, vh - cardH - margin)),
            left: rect.left - cardW - gap
        }
    ];

    // Priority pass: find a candidate that fits in viewport AND has 0 collision with target
    let chosen = null;
    for (const c of candidates) {
        const inViewport = (
            c.top >= margin &&
            c.top + cardH <= vh - margin &&
            c.left >= margin &&
            c.left + cardW <= vw - margin
        );
        const collides = checkCollision(c.top, c.left, cardW, cardH, rect);
        if (inViewport && !collides) {
            chosen = c;
            break;
        }
    }

    // Secondary pass: if no candidate fits 100% inside viewport,
    // evaluate available vertical space and position outside rect
    if (!chosen) {
        const spaceBelow = (vh - margin) - (rect.bottom + gap);
        const spaceAbove = (rect.top - gap) - margin;

        if (spaceBelow >= spaceAbove && spaceBelow >= 120) {
            const top = rect.bottom + gap;
            const left = Math.max(margin, Math.min(rect.left, vw - cardW - margin));
            chosen = { dir: 'below', top, left };
            const overflow = (top + cardH) - (vh - margin);
            if (overflow > 0) {
                window.scrollBy({ top: overflow + 20, behavior: 'smooth' });
            }
        } else if (spaceAbove >= 120) {
            const top = rect.top - cardH - gap;
            const left = Math.max(margin, Math.min(rect.left, vw - cardW - margin));
            chosen = { dir: 'above', top, left };
            const underflow = margin - top;
            if (underflow > 0) {
                window.scrollBy({ top: -(underflow + 20), behavior: 'smooth' });
            }
        } else {
            // Side candidate fallback if horizontal space permits
            if (rect.right + cardW + gap <= vw - margin) {
                chosen = candidates[2];
            } else if (rect.left - cardW - gap >= margin) {
                chosen = candidates[3];
            } else {
                chosen = candidates[0];
            }
        }
    }

    let finalTop = chosen.top;
    let finalLeft = chosen.left;

    // Strict safety guard: never allow finalTop to sit on top of target element
    if (checkCollision(finalTop, finalLeft, cardW, cardH, rect)) {
        if (rect.top >= cardH + gap + margin) {
            finalTop = rect.top - cardH - gap;
        } else {
            finalTop = rect.bottom + gap;
        }
    }

    finalLeft = Math.max(margin, Math.min(finalLeft, vw - cardW - margin));

    card.style.top = `${finalTop}px`;
    card.style.left = `${finalLeft}px`;
    card.style.bottom = 'auto';
}

function onTourReposition() {
    if (tourRepositionRaf) cancelAnimationFrame(tourRepositionRaf);
    tourRepositionRaf = requestAnimationFrame(() => {
        if (!isTourActive) return;
        const step = INTERACTIVE_TOUR_STEPS[currentTourStepIndex];
        if (step) {
            const targetEl = getStepTarget(step);
            positionTourSpotlight(targetEl);
        }
    });
}

// Celebration Confetti Cannon
function fireTourConfetti() {
    const canvas = document.getElementById('tourConfettiCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';

    const colors = ['#2383e2', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#e2e8f0'];
    const particleCount = 100;
    const particles = [];

    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: window.innerWidth * 0.5 + (Math.random() - 0.5) * 180,
            y: window.innerHeight * 0.45,
            w: Math.random() * 8 + 4,
            h: Math.random() * 6 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: (Math.random() - 0.5) * 12,
            vy: (Math.random() * -12) - 4,
            rotation: Math.random() * 360,
            rotSpeed: (Math.random() - 0.5) * 10,
            opacity: 1,
            gravity: 0.35,
            drag: 0.98
        });
    }

    let animId;
    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.vx *= p.drag;
            p.rotation += p.rotSpeed;
            p.opacity -= 0.009;

            if (p.opacity > 0) {
                alive = true;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rotation * Math.PI) / 180);
                ctx.globalAlpha = Math.max(0, p.opacity);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            }
        });

        if (alive) {
            animId = requestAnimationFrame(render);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.style.display = 'none';
            cancelAnimationFrame(animId);
        }
    }
    render();
}

function onboardOpenAuth() {
    exitInteractiveTour();
    const authBtn = document.getElementById('authOpenBtn');
    if (authBtn) {
        authBtn.click();
    } else {
        document.getElementById('authModalOverlay')?.classList.add('active');
    }
}

// Global window assignments for onclick event attributes
window.startInteractiveTour = startInteractiveTour;
window.exitInteractiveTour = exitInteractiveTour;
window.nextTourStep = nextTourStep;
window.prevTourStep = prevTourStep;
window.onboardOpenAuth = onboardOpenAuth;
window.setTourAuthMode = setTourAuthMode;
window.handleTourAuthSubmit = handleTourAuthSubmit;
window.openOnboardingModal = () => startInteractiveTour(0);
window.closeOnboardingModal = exitInteractiveTour;
window.skipOnboarding = exitInteractiveTour;
window.nextOnboardingStep = nextTourStep;
window.prevOnboardingStep = prevTourStep;
window.openDayNoteModal = openDayNoteModal;
window.closeDayNoteModal = closeDayNoteModal;
window.saveDayNoteFromModal = saveDayNoteFromModal;
window.insertJournalPrompt = insertJournalPrompt;
window.getCurrentJournal = () => currentMonthJournal;
window.openRenameJournalModal = openRenameJournalModal;
window.closeRenameJournalModal = closeRenameJournalModal;
window.selectJournalPreset = selectJournalPreset;
window.saveJournalTitle = saveJournalTitle;
window.deleteJournalPill = deleteJournalPill;
window.restoreDefaultJournalPills = restoreDefaultJournalPills;
window.toggleAddPillInput = toggleAddPillInput;
window.submitCustomPill = submitCustomPill;
window.navigateGridJournalDay = navigateGridJournalDay;
window.jumpGridJournalToToday = jumpGridJournalToToday;
window.focusGridJournalDay = focusGridJournalDay;
window.switchGridJournalDay = switchGridJournalDay;
window.toggleMoreOptionsMenu = toggleMoreOptionsMenu;
window.closeMoreOptionsMenu = closeMoreOptionsMenu;

// ============================================================
// NOTION-STYLE WORKSPACE CUSTOMIZER & AESTHETICS SYSTEM
// ============================================================

function getSmartHabitIcon(name) {
    if (!name) return '✦';
    const n = name.toLowerCase();
    if (n.includes('water') || n.includes('drink') || n.includes('hydrat')) return '💧';
    if (n.includes('train') || n.includes('lift') || n.includes('gym') || n.includes('weight') || n.includes('workout') || n.includes('resist')) return '🏋️';
    if (n.includes('run') || n.includes('jog') || n.includes('sprint') || n.includes('cardio')) return '🏃';
    if (n.includes('walk') || n.includes('step')) return '🚶';
    if (n.includes('bike') || n.includes('cycl')) return '🚴';
    if (n.includes('swim')) return '🏊';
    if (n.includes('stretch') || n.includes('yoga') || n.includes('mobilit')) return '🧘';
    if (n.includes('meditat') || n.includes('breathe') || n.includes('mindful') || n.includes('zen')) return '🧘';
    if (n.includes('sleep') || n.includes('bed') || n.includes('rest') || n.includes('screen-free')) return '😴';
    if (n.includes('wake') || n.includes('morning') || n.includes('early')) return '⏰';
    if (n.includes('read') || n.includes('book') || n.includes('page') || n.includes('chapter')) return '📚';
    if (n.includes('code') || n.includes('dev') || n.includes('program') || n.includes('deep work') || n.includes('study') || n.includes('work')) return '💻';
    if (n.includes('write') || n.includes('journal') || n.includes('reflect') || n.includes('diary')) return '✍️';
    if (n.includes('eat') || n.includes('diet') || n.includes('nutrition') || n.includes('salad') || n.includes('fasting') || n.includes('meal')) return '🥗';
    if (n.includes('coffee') || n.includes('tea')) return '☕';
    if (n.includes('vitamin') || n.includes('supplement') || n.includes('pill') || n.includes('med')) return '💊';
    if (n.includes('alcohol') || n.includes('sober') || n.includes('smoke') || n.includes('sugar') || n.includes('no junk')) return '🛡️';
    if (n.includes('clean') || n.includes('chore') || n.includes('tidy') || n.includes('room')) return '🧹';
    if (n.includes('finance') || n.includes('budget') || n.includes('save') || n.includes('money') || n.includes('invest')) return '💰';
    if (n.includes('plan') || n.includes('priorit') || n.includes('task') || n.includes('goal')) return '🎯';
    if (n.includes('music') || n.includes('guitar') || n.includes('piano') || n.includes('sing')) return '🎸';
    if (n.includes('art') || n.includes('draw') || n.includes('sketch') || n.includes('paint')) return '🎨';
    return '✦';
}

function getHabitIcon(habit) {
    if (!habit) return '✦';
    if (habit.icon && typeof habit.icon === 'string' && habit.icon.trim()) {
        return habit.icon.trim();
    }
    return getSmartHabitIcon(habit.name);
}

const NOTION_PRESET_COVERS = [
    {
        id: 'lofi',
        name: 'Lo-Fi Work',
        url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=80'
    },
    {
        id: 'tokyo',
        name: 'Tokyo Neon',
        url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1600&q=80'
    },
    {
        id: 'forest',
        name: 'Deep Pine',
        url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1600&q=80'
    },
    {
        id: 'kyoto',
        name: 'Kyoto Zen',
        url: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1600&q=80'
    },
    {
        id: 'sunset',
        name: 'Sunset Glow',
        url: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
    },
    {
        id: 'aurora',
        name: 'Cosmic Aurora',
        url: 'linear-gradient(135deg, #09203f 0%, #537895 100%)'
    },
    {
        id: 'obsidian',
        name: 'Dark Obsidian',
        url: 'linear-gradient(135deg, #181920 0%, #292a38 50%, #0d0e13 100%)'
    },
    {
        id: 'golden',
        name: 'Golden Hour',
        url: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)'
    }
];

const NOTION_PAGE_EMOJIS = ['⚡', '🌱', '🎯', '🚀', '🏔️', '☕', '🧘', '📚', '🏆', '🔥', '💡', '🛡️', '🌊', '🦉', '🪐', '🎨', '⚔️', '💎', '🧠', '☀️', '🌙', '⭐', '🌿', '🏹'];

const NOTION_HABIT_ICONS = [
    '💧', '🏋️', '🏃', '🚴', '🏊', '🧘', '🧗', '🥋', '🥗', '🥑', '🍎', '😴', '💊',
    '📚', '✍️', '💻', '🧠', '💡', '🎯', '🎨', '🎸', '☕', '📖', '🧩', '⚡', '🔬',
    '⏰', '🧹', '🧼', '💰', '📵', '🔋', '🛡️', '🌿', '☀️', '🌙', '🏆', '🔥', '✨', '✦'
];

const NOTION_WALLPAPERS = [
    { id: 'none', title: 'Default Theme Canvas', desc: 'Clean background matching selected theme' },
    { id: 'grid', title: 'Blueprint Grid', desc: 'Architectural subtle alignment grid' },
    { id: 'dots', title: 'Tactile Dot Matrix', desc: 'Minimal dot-matrix pattern' },
    { id: 'mesh', title: 'Ambient Mesh Gradient', desc: 'Warm atmospheric glow across workspace' }
];

let notionWorkspace = {
    coverUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=80',
    coverHidden: false,
    coverHeight: '240px',
    coverPosition: 'center 35%',
    pageIcon: '⚡',
    pageTitle: 'Habit OS',
    pageQuote: '“We are what we repeatedly do. Excellence, then, is not an act, but a habit.”',
    wallpaper: 'none',
    wallpaperUrl: '',
    font: 'sans',
    glassEffect: false
};

function initNotionWorkspace() {
    const saved = safeJSONParse(localStorage.getItem('notion_workspace_v1'), null);
    if (saved && typeof saved === 'object') {
        notionWorkspace = { ...notionWorkspace, ...saved };
    }
    applyNotionWorkspaceToDOM();
    renderCustomizerPresetCovers();
    renderCustomizerPageEmojis();
    renderCustomizerWallpapers();
    renderHabitIconPickerGrid();
    setupNotionInlineEditing();
}

function applyNotionWorkspaceToDOM() {
    // 1. Cover
    const coverWrapper = document.getElementById('notionCoverWrapper');
    const coverImg = document.getElementById('notionCoverImg');
    const coverCheckbox = document.getElementById('coverVisibilityCheckbox');

    if (coverImg) {
        if (notionWorkspace.coverUrl.startsWith('linear-gradient')) {
            coverImg.style.backgroundImage = notionWorkspace.coverUrl;
        } else {
            coverImg.style.backgroundImage = `url("${notionWorkspace.coverUrl}")`;
        }
    }

    // Apply Cover Dimensions & Positioning
    const coverHeight = notionWorkspace.coverHeight || '240px';
    const coverPos = notionWorkspace.coverPosition || 'center 35%';
    document.documentElement.style.setProperty('--notion-cover-height', coverHeight);
    document.documentElement.style.setProperty('--notion-cover-pos', coverPos);

    // Update active state of height buttons
    document.querySelectorAll('#coverHeightSelector .preset-tag-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.height === coverHeight);
    });

    // Update active state of position buttons
    document.querySelectorAll('#coverPosSelector .preset-tag-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.pos === coverPos);
    });

    if (coverWrapper) {
        coverWrapper.classList.toggle('cover-collapsed', Boolean(notionWorkspace.coverHidden));
    }
    if (coverCheckbox) {
        coverCheckbox.checked = !notionWorkspace.coverHidden;
    }

    // 2. Identity
    const pageIconDisplay = document.getElementById('notionPageIconDisplay');
    const titleEl = document.getElementById('notionWorkspaceTitle');
    const quoteEl = document.getElementById('notionWorkspaceQuote');
    const titleInput = document.getElementById('customWorkspaceTitleInput');
    const quoteInput = document.getElementById('customWorkspaceQuoteInput');

    if (pageIconDisplay) pageIconDisplay.textContent = notionWorkspace.pageIcon || '⚡';
    if (titleEl) titleEl.textContent = notionWorkspace.pageTitle || 'Habit OS';
    if (quoteEl) quoteEl.textContent = notionWorkspace.pageQuote || '';
    if (titleInput) titleInput.value = notionWorkspace.pageTitle || 'Habit OS';
    if (quoteInput) quoteInput.value = notionWorkspace.pageQuote || '';

    // 3. Wallpaper & Atmosphere
    document.body.dataset.wallpaper = notionWorkspace.wallpaper || 'none';
    if (notionWorkspace.wallpaper === 'custom' && notionWorkspace.wallpaperUrl) {
        document.body.style.backgroundImage = `url("${notionWorkspace.wallpaperUrl}")`;
        document.body.classList.add('has-custom-wallpaper');
    } else {
        if (notionWorkspace.wallpaper !== 'mesh' && notionWorkspace.wallpaper !== 'grid' && notionWorkspace.wallpaper !== 'dots') {
            document.body.style.backgroundImage = '';
        }
        document.body.classList.remove('has-custom-wallpaper');
    }

    // 4. Glass Effect
    document.body.classList.toggle('has-glass-effect', Boolean(notionWorkspace.glassEffect));
    const glassCheckbox = document.getElementById('glassEffectCheckbox');
    if (glassCheckbox) glassCheckbox.checked = Boolean(notionWorkspace.glassEffect);

    // 5. Typography
    const font = notionWorkspace.font || 'sans';
    document.body.dataset.font = font;
    document.querySelectorAll('.font-option-card').forEach(card => card.classList.remove('active'));
    if (font === 'serif') document.getElementById('fontCardSerif')?.classList.add('active');
    else if (font === 'mono') document.getElementById('fontCardMono')?.classList.add('active');
    else document.getElementById('fontCardSans')?.classList.add('active');
}

function setupNotionInlineEditing() {
    const titleEl = document.getElementById('notionWorkspaceTitle');
    const quoteEl = document.getElementById('notionWorkspaceQuote');

    if (titleEl) {
        titleEl.addEventListener('blur', () => {
            const val = titleEl.textContent.trim();
            notionWorkspace.pageTitle = val || 'Habit OS';
            titleEl.textContent = notionWorkspace.pageTitle;
            saveNotionWorkspace();
        });
        titleEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                titleEl.blur();
            }
        });
    }

    if (quoteEl) {
        quoteEl.addEventListener('blur', () => {
            notionWorkspace.pageQuote = quoteEl.textContent.trim();
            saveNotionWorkspace();
        });
        quoteEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                quoteEl.blur();
            }
        });
    }
}

function saveNotionWorkspace(pushToCloud = true) {
    localStorage.setItem('notion_workspace_v1', JSON.stringify(notionWorkspace));
    if (pushToCloud && window.SupaSync?.pushUserPreferences) {
        window.SupaSync.pushUserPreferences();
    }
}

function openCustomizeModal(tab = 'cover') {
    const overlay = document.getElementById('customizeLayoutModalOverlay');
    if (!overlay) return;
    overlay.classList.add('active');
    if (tab === 'general') tab = 'cover';
    switchCustomTab(tab);
}

function closeCustomizeModal() {
    document.getElementById('customizeLayoutModalOverlay')?.classList.remove('active');
}

function switchCustomTab(tab) {
    const tabs = ['cover', 'identity', 'atmosphere', 'typography'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
        const panel = document.getElementById(`customPanel${t.charAt(0).toUpperCase() + t.slice(1)}`);
        const isActive = t === tab;
        btn?.classList.toggle('active', isActive);
        panel?.classList.toggle('hidden', !isActive);
    });
}

function renderCustomizerPresetCovers() {
    const grid = document.getElementById('presetCoversGrid');
    if (!grid) return;
    grid.innerHTML = NOTION_PRESET_COVERS.map(c => `
        <div class="preset-cover-card ${c.url === notionWorkspace.coverUrl ? 'active' : ''}" 
             style="background:${c.url.startsWith('linear-gradient') ? c.url : `url('${c.url}') center/cover no-repeat`}"
             onclick="setNotionCover('${c.url}')" title="${c.name}">
            <span class="preset-cover-name">${c.name}</span>
        </div>
    `).join('');
}

function setNotionCover(url) {
    notionWorkspace.coverUrl = url;
    notionWorkspace.coverHidden = false;
    applyNotionWorkspaceToDOM();
    renderCustomizerPresetCovers();
    saveNotionWorkspace();
}

function applyCustomCoverUrl() {
    const input = document.getElementById('customCoverUrlInput');
    const val = input ? input.value.trim() : '';
    if (!val) return;
    setNotionCover(val);
    input.value = '';
}

function handleCoverFileUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        if (e.target.result) {
            setNotionCover(e.target.result);
        }
    };
    reader.readAsDataURL(file);
}

function resetCoverToDefault() {
    setNotionCover(NOTION_PRESET_COVERS[0].url);
}

function toggleCoverVisibility() {
    notionWorkspace.coverHidden = !notionWorkspace.coverHidden;
    applyNotionWorkspaceToDOM();
    saveNotionWorkspace();
}

function handleCoverVisibilityToggle(checked) {
    notionWorkspace.coverHidden = !checked;
    applyNotionWorkspaceToDOM();
    saveNotionWorkspace();
}

function setNotionCoverHeight(height) {
    notionWorkspace.coverHeight = height;
    applyNotionWorkspaceToDOM();
    saveNotionWorkspace();
}

function setNotionCoverPosition(pos) {
    notionWorkspace.coverPosition = pos;
    applyNotionWorkspaceToDOM();
    saveNotionWorkspace();
}

function renderCustomizerPageEmojis() {
    const grid = document.getElementById('pageEmojiQuickGrid');
    if (!grid) return;
    grid.innerHTML = NOTION_PAGE_EMOJIS.map(em => `
        <button type="button" class="emoji-btn ${em === notionWorkspace.pageIcon ? 'active' : ''}" onclick="setNotionPageIcon('${em}')">
            ${em}
        </button>
    `).join('');
}

function setNotionPageIcon(emoji) {
    notionWorkspace.pageIcon = emoji;
    applyNotionWorkspaceToDOM();
    renderCustomizerPageEmojis();
    saveNotionWorkspace();
}

function applyCustomPageIcon() {
    const input = document.getElementById('customPageIconInput');
    const val = input ? input.value.trim() : '';
    if (!val) return;
    setNotionPageIcon(val);
    input.value = '';
}

function saveWorkspaceIdentity() {
    const titleInput = document.getElementById('customWorkspaceTitleInput');
    const quoteInput = document.getElementById('customWorkspaceQuoteInput');
    if (titleInput) notionWorkspace.pageTitle = titleInput.value.trim() || 'Habit OS';
    if (quoteInput) notionWorkspace.pageQuote = quoteInput.value.trim();
    applyNotionWorkspaceToDOM();
    saveNotionWorkspace();
    closeCustomizeModal();
}

function renderCustomizerWallpapers() {
    const grid = document.getElementById('wallpaperOptionsGrid');
    if (!grid) return;
    grid.innerHTML = NOTION_WALLPAPERS.map(w => `
        <div class="wallpaper-option-card ${notionWorkspace.wallpaper === w.id ? 'active' : ''}" onclick="setNotionWallpaper('${w.id}')">
            <span class="wallpaper-card-title">${w.title}</span>
            <span class="wallpaper-card-desc">${w.desc}</span>
        </div>
    `).join('');
}

function setNotionWallpaper(type, customUrl = '') {
    notionWorkspace.wallpaper = type;
    if (type === 'custom') {
        notionWorkspace.wallpaperUrl = customUrl || notionWorkspace.wallpaperUrl;
    }
    applyNotionWorkspaceToDOM();
    renderCustomizerWallpapers();
    saveNotionWorkspace();
}

function applyCustomWallpaperUrl() {
    const input = document.getElementById('customWallpaperUrlInput');
    const val = input ? input.value.trim() : '';
    if (!val) return;
    setNotionWallpaper('custom', val);
    input.value = '';
}

function handleWallpaperFileUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        if (e.target.result) {
            setNotionWallpaper('custom', e.target.result);
        }
    };
    reader.readAsDataURL(file);
}

function handleGlassEffectToggle(checked) {
    notionWorkspace.glassEffect = Boolean(checked);
    applyNotionWorkspaceToDOM();
    saveNotionWorkspace();
}

function applyWorkspaceFont(fontType) {
    notionWorkspace.font = fontType;
    applyNotionWorkspaceToDOM();
    saveNotionWorkspace();
}

// ── Habit Custom Icon Picker ──
let activeIconPickerHabitId = null;
let pendingHabitIcon = null;

function renderHabitIconPickerGrid() {
    const grid = document.getElementById('habitIconGrid');
    if (!grid) return;
    grid.innerHTML = NOTION_HABIT_ICONS.map(ic => `
        <button type="button" class="habit-icon-cell ${ic === pendingHabitIcon ? 'active' : ''}" onclick="selectHabitIcon('${ic}')">
            ${ic}
        </button>
    `).join('');
}

function openHabitIconPicker(habitId) {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;
    activeIconPickerHabitId = habitId;
    pendingHabitIcon = getHabitIcon(habit);

    const titleEl = document.getElementById('habitIconModalTitle');
    const subEl = document.getElementById('habitIconModalSubtitle');
    if (titleEl) titleEl.textContent = `Icon for "${habit.name}"`;
    if (subEl) subEl.textContent = `Current icon: ${pendingHabitIcon}`;

    renderHabitIconPickerGrid();
    document.getElementById('habitIconPickerModalOverlay')?.classList.add('active');
}

function closeHabitIconPicker() {
    document.getElementById('habitIconPickerModalOverlay')?.classList.remove('active');
    activeIconPickerHabitId = null;
    pendingHabitIcon = null;
}

function selectHabitIcon(emoji) {
    pendingHabitIcon = emoji;
    renderHabitIconPickerGrid();
    const subEl = document.getElementById('habitIconModalSubtitle');
    if (subEl) subEl.textContent = `Selected: ${emoji}`;
}

function applyCustomHabitEmojiFromInput() {
    const input = document.getElementById('customHabitEmojiInput');
    const val = input ? input.value.trim() : '';
    if (!val) return;
    selectHabitIcon(val);
    input.value = '';
}

function autoSuggestHabitIcon() {
    const habit = habits.find(h => h.id === activeIconPickerHabitId);
    if (!habit) return;
    const suggested = getSmartHabitIcon(habit.name);
    selectHabitIcon(suggested);
}

function removeHabitIcon() {
    selectHabitIcon('✦');
}

function saveSelectedHabitIcon() {
    if (!activeIconPickerHabitId || !pendingHabitIcon) {
        closeHabitIconPicker();
        return;
    }
    const habit = habits.find(h => h.id === activeIconPickerHabitId);
    if (habit) {
        habit.icon = pendingHabitIcon;
        localStorage.setItem('myCustomHabits_v3', JSON.stringify(habits));
        buildGrids();
        renderTodayFocus();
        window.SupaSync?.pushHabits?.(habits);
        window.SupaSync?.triggerSync?.(currentYear, currentMonth);
    }
    closeHabitIconPicker();
}

// ── Notion Customizer Window Exports ──
window.getNotionWorkspace = () => notionWorkspace;
window.setNotionWorkspace = (data) => {
    if (data && typeof data === 'object') {
        notionWorkspace = { ...notionWorkspace, ...data };
        localStorage.setItem('notion_workspace_v1', JSON.stringify(notionWorkspace));
        applyNotionWorkspaceToDOM();
    }
};

window.getHabitIconsMap = () => {
    const map = {};
    habits.forEach(h => {
        if (h.icon) map[h.id] = h.icon;
    });
    return map;
};

window.applyHabitIconsMap = (map) => {
    if (!map || typeof map !== 'object') return;
    let modified = false;
    habits.forEach(h => {
        if (map[h.id] && h.icon !== map[h.id]) {
            h.icon = map[h.id];
            modified = true;
        }
    });
    if (modified) {
        localStorage.setItem('myCustomHabits_v3', JSON.stringify(habits));
        buildGrids();
        renderTodayFocus();
    }
};

window.openCustomizeModal = openCustomizeModal;
window.closeCustomizeModal = closeCustomizeModal;
window.switchCustomTab = switchCustomTab;
window.setNotionCover = setNotionCover;
window.applyCustomCoverUrl = applyCustomCoverUrl;
window.handleCoverFileUpload = handleCoverFileUpload;
window.resetCoverToDefault = resetCoverToDefault;
window.toggleCoverVisibility = toggleCoverVisibility;
window.handleCoverVisibilityToggle = handleCoverVisibilityToggle;
window.setNotionCoverHeight = setNotionCoverHeight;
window.setNotionCoverPosition = setNotionCoverPosition;
window.setNotionPageIcon = setNotionPageIcon;
window.applyCustomPageIcon = applyCustomPageIcon;
window.saveWorkspaceIdentity = saveWorkspaceIdentity;
window.setNotionWallpaper = setNotionWallpaper;
window.applyCustomWallpaperUrl = applyCustomWallpaperUrl;
window.handleWallpaperFileUpload = handleWallpaperFileUpload;
window.handleGlassEffectToggle = handleGlassEffectToggle;
window.applyWorkspaceFont = applyWorkspaceFont;

window.openHabitIconPicker = openHabitIconPicker;
window.closeHabitIconPicker = closeHabitIconPicker;
window.selectHabitIcon = selectHabitIcon;
window.applyCustomHabitEmojiFromInput = applyCustomHabitEmojiFromInput;
window.autoSuggestHabitIcon = autoSuggestHabitIcon;
window.removeHabitIcon = removeHabitIcon;
window.saveSelectedHabitIcon = saveSelectedHabitIcon;
window.getHabitIcon = getHabitIcon;

