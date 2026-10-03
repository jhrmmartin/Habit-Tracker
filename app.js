// ============================================================
// UTILITIES
// ============================================================
const generateUUID = () => Math.random().toString(36).substr(2, 9);

/** Escapes HTML to prevent XSS when inserting user-supplied strings into innerHTML */
function sanitizeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/** Safe JSON.parse that never throws */
function safeJSONParse(str, fallback) {
    try { return JSON.parse(str) ?? fallback; }
    catch { return fallback; }
}

// ============================================================
// CUSTOM MODAL — replaces native confirm() dialogs
// ============================================================
function showConfirm(message, onConfirm) {
    const overlay = document.getElementById('modalOverlay');
    const msg     = document.getElementById('modalMessage');
    const confirmBtn = document.getElementById('modalConfirm');
    const cancelBtn  = document.getElementById('modalCancel');

    msg.textContent = message;
    overlay.classList.add('active');

    const cleanup = () => overlay.classList.remove('active');

    function confirmHandler() {
        cleanup();
        onConfirm();
        confirmBtn.removeEventListener('click', confirmHandler);
        cancelBtn.removeEventListener('click', cancelHandler);
    }
    function cancelHandler() {
        cleanup();
        confirmBtn.removeEventListener('click', confirmHandler);
        cancelBtn.removeEventListener('click', cancelHandler);
    }

    confirmBtn.addEventListener('click', confirmHandler);
    cancelBtn.addEventListener('click', cancelHandler);
    // Click outside to dismiss
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cancelHandler();
    }, { once: true });
}

// ============================================================
// DATA
// ============================================================
const defaultHabits = [
    { id: 'h1', name: "Wake up at 05:00 ⏰" },
    { id: 'h2', name: "Stretching 🤸" },
    { id: 'h3', name: "Gym 💪" },
    { id: 'h4', name: "Day Planning 🗓️" },
    { id: 'h5', name: "Project Work 💻" },
    { id: 'h6', name: "No Alcohol 🍷" },
    { id: 'h7', name: "Social Media Detox 📱" }
];

// FIX: wrapped in safeJSONParse — no longer crashes if localStorage is corrupted
let habits = safeJSONParse(localStorage.getItem('myCustomHabits_v3'), defaultHabits);
let mixedChart, overallChart;
let currentYear, currentMonth, daysInMonth;

const monthNames    = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const dayNamesShort = ["Su","Mo","Tu","We","Th","Fr","Sa"];

// ============================================================
// INIT
// ============================================================
window.onload = () => {
    initGreeting();
    initCalendarSettings();
    initCharts();

    document.getElementById('newHabitInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addNewHabit();
    });

    updateDashboard();
};

function initGreeting() {
    const hour = new Date().getHours();
    let text, icon;
    if (hour < 12)      { text = "Good morning";   icon = "☀️"; }
    else if (hour < 17) { text = "Good afternoon"; icon = "🌤️"; }
    else                { text = "Good evening";   icon = "🌙"; }

    const el = document.getElementById('greeting');
    if (el) el.textContent = `${text} ${icon}`;
}

function getStorageKey() {
    return `habitData_${currentYear}_${currentMonth}`;
}

function updateDashboard() {
    buildGrids();
    loadState();
    calculateStats();
}

// ============================================================
// HABIT MANAGEMENT
// ============================================================
function addNewHabit() {
    const input   = document.getElementById('newHabitInput');
    const msg     = document.getElementById('errorMessage');
    const newName = input.value.trim();

    if (!newName) return;

    const exists = habits.some(h => h.name.toLowerCase() === newName.toLowerCase());
    if (exists) {
        msg.innerText = "A habit with this name already exists.";
        setTimeout(() => msg.innerText = "", 3000);
        return;
    }

    habits.push({ id: generateUUID(), name: newName });
    localStorage.setItem('myCustomHabits_v3', JSON.stringify(habits));
    input.value = '';
    updateDashboard();
}

function deleteHabit(id) {
    const habitIndex = habits.findIndex(h => h.id === id);
    if (habitIndex === -1) return;

    showConfirm(`Remove "${habits[habitIndex].name}"? This cannot be undone.`, () => {
        habits.splice(habitIndex, 1);
        localStorage.setItem('myCustomHabits_v3', JSON.stringify(habits));

        // FIX: collect keys first, THEN iterate — modifying localStorage mid-loop was unsafe
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('habitData_')) keys.push(k);
        }
        keys.forEach(key => {
            const monthData = safeJSONParse(localStorage.getItem(key), null);
            if (monthData && monthData.habits) {
                const cleanedHabits = {};
                for (const [dataKey, value] of Object.entries(monthData.habits)) {
                    if (!dataKey.startsWith(`${id}-`)) cleanedHabits[dataKey] = value;
                }
                monthData.habits = cleanedHabits;
                localStorage.setItem(key, JSON.stringify(monthData));
            }
        });
        updateDashboard();
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
}

function clearMonth() {
    showConfirm(`Clear ALL data for ${monthNames[currentMonth]} ${currentYear}? This cannot be undone.`, () => {
        localStorage.removeItem(getStorageKey());
        updateDashboard();
    });
}

// ============================================================
// STATE — save & load
// ============================================================
function saveState() {
    const state = { habits: {}, moodSleep: {} };
    document.querySelectorAll('.habit-checkbox').forEach(box => {
        if (box.checked) state.habits[`${box.dataset.uuid}-${box.dataset.day}`] = true;
    });
    document.querySelectorAll('.mood-sleep-select').forEach(select => {
        if (select.value !== "") state.moodSleep[`${select.dataset.metric}-${select.dataset.day}`] = select.value;
    });
    localStorage.setItem(getStorageKey(), JSON.stringify(state));
}

function loadState() {
    const saved = safeJSONParse(localStorage.getItem(getStorageKey()), { habits: {}, moodSleep: {} });
    document.querySelectorAll('.habit-checkbox').forEach(box => {
        box.checked = !!(saved.habits && saved.habits[`${box.dataset.uuid}-${box.dataset.day}`]);
    });
    document.querySelectorAll('.mood-sleep-select').forEach(select => {
        const val = saved.moodSleep && saved.moodSleep[`${select.dataset.metric}-${select.dataset.day}`];
        select.value = val || '';
    });
}

// ============================================================
// CALENDAR INIT
// ============================================================
function initCalendarSettings() {
    const date = new Date();
    currentYear  = date.getFullYear();
    currentMonth = date.getMonth();

    const mSelect = document.getElementById('monthSelect');
    const ySelect = document.getElementById('yearSelect');

    monthNames.forEach((m, i) => mSelect.add(new Option(m, i)));
    mSelect.value = currentMonth;

    for (let y = currentYear - 2; y <= currentYear + 4; y++) ySelect.add(new Option(y, y));
    ySelect.value = currentYear;

    mSelect.addEventListener('change', (e) => { currentMonth = parseInt(e.target.value); updateDashboard(); });
    ySelect.addEventListener('change', (e) => { currentYear  = parseInt(e.target.value); updateDashboard(); });
}

// ============================================================
// GRID BUILDER
// ============================================================
function buildGrids() {
    daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    document.getElementById('gridTitle').innerText = `${monthNames[currentMonth]} ${currentYear}`;

    const today    = new Date();
    const todayDay = (today.getFullYear() === currentYear && today.getMonth() === currentMonth)
        ? today.getDate() : -1;

    const header       = document.getElementById('tableHeader');
    const body         = document.getElementById('tableBody');
    const msBody       = document.getElementById('moodSleepBody');
    const analysisBody = document.getElementById('analysisBody');

    header.innerHTML = ''; body.innerHTML = ''; msBody.innerHTML = ''; analysisBody.innerHTML = '';

    // ── Week label row (with date ranges) ──
    const trWeeks    = document.createElement('tr');
    const thEmptyTop = document.createElement('th');
    thEmptyTop.className = 'sticky-left';
    trWeeks.appendChild(thEmptyTop);

    let weekNum = 1;
    for (let d = 1; d <= daysInMonth; d += 7) {
        const span   = Math.min(7, daysInMonth - d + 1);
        const endDay = d + span - 1;
        const thWeek = document.createElement('th');
        thWeek.colSpan   = span;
        thWeek.textContent = `Week ${weekNum} · ${d}–${endDay}`;
        thWeek.className = 'week-label';
        trWeeks.appendChild(thWeek);
        weekNum++;
    }
    header.appendChild(trWeeks);

    // ── Day / date header row ──
    const trDays  = document.createElement('tr');
    const thHabit = document.createElement('th');
    thHabit.className = 'sticky-left';
    thHabit.innerHTML = '<div class="habit-cell-content"><span style="color:var(--text-muted); font-weight:600; letter-spacing:1px;">HABIT</span></div>';
    trDays.appendChild(thHabit);

    for (let d = 1; d <= daysInMonth; d++) {
        const th      = document.createElement('th');
        const dateObj = new Date(currentYear, currentMonth, d);
        const dow     = dateObj.getDay();
        const isWeekend = dow === 0 || dow === 6;
        const isToday   = d === todayDay;

        if (isToday)   th.classList.add('today-col');
        if (isWeekend) th.classList.add('weekend-col');

        th.innerHTML = `
            <div class="day-label">${dayNamesShort[dow]}</div>
            <div class="date-label">${d}${isToday ? '<span class="today-dot"></span>' : ''}</div>
        `;
        trDays.appendChild(th);
    }
    header.appendChild(trDays);

    // ── Habit rows ──
    habits.forEach((habitObj, hIdx) => {
        const tr     = document.createElement('tr');
        const tdName = document.createElement('td');
        tdName.className = 'sticky-left';

        // FIX: use sanitizeHTML to prevent XSS from user-supplied habit names
        const safeName = sanitizeHTML(habitObj.name);
        tdName.innerHTML = `
            <div class="habit-cell-content">
                <button class="icon-btn" onclick="moveHabit(${hIdx}, -1)" ${hIdx === 0 ? 'style="visibility:hidden"' : ''} aria-label="Move Up">↑</button>
                <button class="icon-btn" onclick="moveHabit(${hIdx}, 1)" ${hIdx === habits.length - 1 ? 'style="visibility:hidden"' : ''} aria-label="Move Down">↓</button>
                <span class="habit-name" title="${safeName}">${safeName}</span>
                <button class="icon-btn delete-btn" onclick="deleteHabit('${habitObj.id}')" title="Delete" aria-label="Delete">×</button>
            </div>
        `;
        tr.appendChild(tdName);

        for (let d = 1; d <= daysInMonth; d++) {
            const td = document.createElement('td');
            if (d === todayDay) td.classList.add('today-col');

            const cb = document.createElement('input');
            cb.type      = 'checkbox';
            cb.className = 'habit-checkbox';
            cb.dataset.uuid = habitObj.id;
            cb.dataset.day  = d;
            cb.setAttribute('aria-label', `${habitObj.name} on day ${d}`);
            cb.addEventListener('change', () => { saveState(); calculateStats(); });
            td.appendChild(cb);
            tr.appendChild(td);
        }
        body.appendChild(tr);

        // Analysis sidebar row
        const cleanName = sanitizeHTML(
            habitObj.name.replace(/[\u2700-\u27BF\uE000-\uF8FF\uD83C\uDC00-\uD83E\uDDFF\u2011-\u26FF]/g, '').trim()
        );
        const anaTr = document.createElement('tr');
        anaTr.innerHTML = `
            <td class="text-left" title="${safeName}">${cleanName || safeName}</td>
            <td id="ana-act-${habitObj.id}">0/${daysInMonth}</td>
            <td>
                <div style="display:flex; align-items:center; gap:5px; justify-content:center;">
                    <div class="progress-container" style="width:30px;">
                        <div class="progress-fill" id="ana-bar-${habitObj.id}"></div>
                    </div>
                    <span id="ana-pct-${habitObj.id}" style="width:25px; text-align:right;">0%</span>
                </div>
            </td>
            <td><b id="ana-curr-${habitObj.id}">0</b></td>
            <td style="color:var(--text-muted)" id="ana-best-${habitObj.id}">0</td>
        `;
        analysisBody.appendChild(anaTr);
    });

    // ── Wellness / Mood + Sleep rows ──
    const trWellnessTitle = document.createElement('tr');
    trWellnessTitle.innerHTML = `
        <td class="sticky-left" style="border-top:2px solid rgba(255,255,255,0.05);">
            <div class="habit-cell-content">
                <span style="color:var(--accent-1); font-weight:700; letter-spacing:1px; font-size:0.75rem;">OVERALL WELLNESS</span>
            </div>
        </td>
        <td colspan="${daysInMonth}" style="border-top:2px solid rgba(255,255,255,0.05);"></td>
    `;
    msBody.appendChild(trWellnessTitle);

    ['Mood', 'Hours of Sleep'].forEach(metric => {
        const tr     = document.createElement('tr');
        const tdName = document.createElement('td');
        tdName.className = 'sticky-left';
        tdName.innerHTML = `
            <div class="habit-cell-content" style="justify-content:flex-end;">
                <span class="habit-name" style="color:var(--text-muted);">${metric}</span>
            </div>
        `;
        tr.appendChild(tdName);

        for (let d = 1; d <= daysInMonth; d++) {
            const td     = document.createElement('td');
            const select = document.createElement('select');
            if (d === todayDay) td.classList.add('today-col');

            select.className = 'mood-sleep-select';
            select.add(new Option('·', ''));
            for (let i = 1; i <= 10; i++) select.add(new Option(`${i}`, i));
            select.dataset.metric = metric;
            select.dataset.day    = d;
            select.setAttribute('aria-label', `${metric} on day ${d}`);
            select.addEventListener('change', () => { saveState(); calculateStats(); });
            td.appendChild(select);
            tr.appendChild(td);
        }
        msBody.appendChild(tr);
    });
}

// ============================================================
// STATS & ANALYSIS
// ============================================================
function calculateStats() {
    const totalGoal = habits.length * daysInMonth;
    if (totalGoal === 0) {
        document.getElementById('statGoal').innerText      = 0;
        document.getElementById('statCompleted').innerText = 0;
        document.getElementById('statLeft').innerText      = 0;
        document.getElementById('topHabitsList').innerHTML =
            '<li><span style="color:var(--text-muted); width:100%; text-align:center;">No habits yet.</span></li>';
        return;
    }

    // FIX: don't count future days against the streak for the current month
    const today          = new Date();
    const isCurrentMonth = (currentYear === today.getFullYear() && currentMonth === today.getMonth());
    const countUpTo      = isCurrentMonth ? today.getDate() : daysInMonth;

    let totalCompleted  = 0;
    const checksPerHabit = {};
    const habitDataGrid  = {};
    const checksPerDay   = Array(daysInMonth).fill(0);

    habits.forEach(h => {
        checksPerHabit[h.id] = 0;
        habitDataGrid[h.id]  = Array(daysInMonth).fill(false);
    });

    document.querySelectorAll('.habit-checkbox').forEach(box => {
        if (box.checked) {
            totalCompleted++;
            const uuid   = box.dataset.uuid;
            const dayIdx = parseInt(box.dataset.day) - 1;
            if (checksPerHabit[uuid] !== undefined) {
                checksPerHabit[uuid]++;
                checksPerDay[dayIdx]++;
                habitDataGrid[uuid][dayIdx] = true;
            }
        }
    });

    animateValue("statGoal",      parseInt(document.getElementById('statGoal').innerText)      || 0, totalGoal,                    500);
    animateValue("statCompleted", parseInt(document.getElementById('statCompleted').innerText) || 0, totalCompleted,               500);
    animateValue("statLeft",      parseInt(document.getElementById('statLeft').innerText)      || 0, totalGoal - totalCompleted,   500);

    const habitStatsArray = [];

    habits.forEach(h => {
        // Current streak: count backwards from today (ignores future unchecked days)
        let currStreak = 0;
        for (let d = countUpTo - 1; d >= 0; d--) {
            if (habitDataGrid[h.id][d]) { currStreak++; }
            else { break; }
        }

        // Best streak: forward pass, only up to countUpTo
        let bestStreak = 0, tempStreak = 0;
        for (let d = 0; d < countUpTo; d++) {
            if (habitDataGrid[h.id][d]) { tempStreak++; bestStreak = Math.max(bestStreak, tempStreak); }
            else { tempStreak = 0; }
        }
        bestStreak = Math.max(bestStreak, currStreak);

        const actual = checksPerHabit[h.id];
        const pct    = Math.round((actual / daysInMonth) * 100);

        document.getElementById(`ana-act-${h.id}`).innerText  = `${actual}/${daysInMonth}`;
        document.getElementById(`ana-pct-${h.id}`).innerText  = `${pct}%`;
        document.getElementById(`ana-bar-${h.id}`).style.width = `${pct}%`;
        document.getElementById(`ana-curr-${h.id}`).innerText = currStreak;
        document.getElementById(`ana-best-${h.id}`).innerText = bestStreak;

        habitStatsArray.push({ name: h.name, actual, streak: currStreak });
    });

    habitStatsArray.sort((a, b) => b.actual - a.actual || b.streak - a.streak);

    const topList = document.getElementById('topHabitsList');
    if (topList) {
        topList.innerHTML = '';
        habitStatsArray.slice(0, 10).forEach((stat, i) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>${i + 1}</span>
                <span style="flex-grow:1; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${sanitizeHTML(stat.name)}">${sanitizeHTML(stat.name)}</span>
                <span style="color:var(--accent-1); font-weight:600;">${stat.actual} <span style="font-weight:400; color:var(--text-muted); font-size:0.7rem;">/ ${daysInMonth}</span></span>
            `;
            topList.appendChild(li);
        });
    }

    const moodData  = Array(daysInMonth).fill(null);
    const sleepData = Array(daysInMonth).fill(null);

    document.querySelectorAll('.mood-sleep-select').forEach(select => {
        const val    = select.value ? parseInt(select.value) : null;
        const dayIdx = parseInt(select.dataset.day) - 1;
        if (select.dataset.metric === 'Mood')           moodData[dayIdx]  = val;
        if (select.dataset.metric === 'Hours of Sleep') sleepData[dayIdx] = val;
    });

    mixedChart.data.labels          = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    mixedChart.data.datasets[0].data = checksPerDay;
    mixedChart.data.datasets[1].data = moodData;
    mixedChart.data.datasets[2].data = sleepData;
    mixedChart.update();

    overallChart.data.datasets[0].data = [totalCompleted, totalGoal - totalCompleted];
    overallChart.update();
}

// FIX: Math.max(1, ...) prevents 0ms interval causing a spin-lock
function animateValue(id, start, end, duration) {
    if (start === end) return;
    const range     = end - start;
    let current     = start;
    const increment = end > start ? 1 : -1;
    const stepTime  = Math.max(1, Math.abs(Math.floor(duration / range)));
    const obj       = document.getElementById(id);
    const timer     = setInterval(() => {
        current += increment;
        obj.innerHTML = current;
        if (current === end) clearInterval(timer);
    }, stepTime);
}

// ============================================================
// EXPORT
// ============================================================
function exportCSV() {
    // FIX: use Blob + createObjectURL instead of encodeURI — handles all special characters correctly
    let csvContent = "\uFEFF"; // UTF-8 BOM for Excel compatibility

    const headerRow = ["Date", "Day", ...habits.map(h =>
        `"${h.name.replace(/"/g, '""').replace(/[\u2700-\u27BF\uE000-\uF8FF\uD83C\uDC00-\uD83E\uDDFF\u2011-\u26FF]/g, '').trim()}"`
    ), "Mood", "Sleep"];
    csvContent += headerRow.join(",") + "\r\n";

    const saved = safeJSONParse(localStorage.getItem(getStorageKey()), { habits: {}, moodSleep: {} });

    for (let d = 1; d <= daysInMonth; d++) {
        const dateObj      = new Date(currentYear, currentMonth, d);
        const shortMonth   = monthNames[currentMonth].substring(0, 3);
        const formattedDate = `${shortMonth}-${d.toString().padStart(2, '0')}`;
        const row          = [formattedDate, dayNamesShort[dateObj.getDay()]];

        habits.forEach(h => row.push(saved.habits[`${h.id}-${d}`] ? "1" : "0"));
        row.push(saved.moodSleep[`Mood-${d}`] || "");
        row.push(saved.moodSleep[`Hours of Sleep-${d}`] || "");

        csvContent += row.join(",") + "\r\n";
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href     = url;
    link.download = `Habits_${monthNames[currentMonth]}_${currentYear}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ============================================================
// CHARTS
// ============================================================
function initCharts() {
    const ctxDaily = document.getElementById('dailyMixedChart').getContext('2d');

    const gradientBar = ctxDaily.createLinearGradient(0, 0, 0, 300);
    gradientBar.addColorStop(0, '#f9a836');
    gradientBar.addColorStop(1, '#9d7cfc');

    mixedChart = new Chart(ctxDaily, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
                {
                    type: 'bar', label: 'Tasks Done', data: [],
                    backgroundColor: gradientBar, borderRadius: 5,
                    yAxisID: 'y', order: 3
                },
                {
                    type: 'line', label: 'Mood', data: [],
                    borderColor: '#f9a836', backgroundColor: '#f9a836',
                    borderWidth: 2, fill: false, tension: 0.4,
                    pointRadius: 3, spanGaps: true,
                    yAxisID: 'y1', order: 1
                },
                {
                    type: 'line', label: 'Sleep', data: [],
                    borderColor: '#9d7cfc', backgroundColor: '#9d7cfc',
                    borderWidth: 2, borderDash: [5, 5], fill: false, tension: 0.4,
                    pointRadius: 3, pointStyle: 'rect', spanGaps: true,
                    yAxisID: 'y1', order: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y:  { type: 'linear', display: true, position: 'left',  ticks: { color: '#8b8aa0' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y1: { type: 'linear', display: true, position: 'right', min: 0, max: 10, ticks: { color: '#f9a836' }, grid: { drawOnChartArea: false } },
                x:  { ticks: { color: '#8b8aa0' }, grid: { display: false } }
            },
            plugins: {
                legend: { display: true, position: 'top', labels: { color: '#c8c6d8', usePointStyle: true, boxWidth: 8 } }
            }
        }
    });

    const ctxDoughnut = document.getElementById('overallDoughnutChart').getContext('2d');
    overallChart = new Chart(ctxDoughnut, {
        type: 'doughnut',
        data: {
            labels: ['Done', 'Left'],
            datasets: [{ data: [0, 1], backgroundColor: ['#9d7cfc', 'rgba(0,0,0,0.2)'], borderWidth: 0 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '80%',
            plugins: { legend: { display: false } }
        }
    });
}
