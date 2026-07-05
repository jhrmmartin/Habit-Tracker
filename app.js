const generateUUID = () => Math.random().toString(36).substr(2, 9);

const defaultHabits = [
    { id: 'h1', name: "Wake up at 05:00 ⏰" },
    { id: 'h2', name: "Stretching 🤸" },
    { id: 'h3', name: "Gym 💪" },
    { id: 'h4', name: "Day Planning 🗓️" },
    { id: 'h5', name: "Project Work 💻" },
    { id: 'h6', name: "No Alcohol 🍷" },
    { id: 'h7', name: "Social Media Detox 📱" }
];

let habits = JSON.parse(localStorage.getItem('myCustomHabits_v3')) || defaultHabits;
let mixedChart, overallChart;
let currentYear, currentMonth, daysInMonth;

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dayNamesShort = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

window.onload = () => { 
    initCalendarSettings(); 
    initCharts(); 
    
    document.getElementById('newHabitInput').addEventListener('keypress', (e) => {
        if(e.key === 'Enter') addNewHabit();
    });

    updateDashboard(); 
};

function getStorageKey() {
    return `habitData_${currentYear}_${currentMonth}`;
}

function updateDashboard() { 
    buildGrids(); 
    loadState(); 
    calculateStats(); 
}

function addNewHabit() {
    const input = document.getElementById('newHabitInput');
    const msg = document.getElementById('errorMessage');
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

    if (confirm(`Remove "${habits[habitIndex].name}"? This action cannot be undone.`)) {
        habits.splice(habitIndex, 1);
        localStorage.setItem('myCustomHabits_v3', JSON.stringify(habits));
        
        for (let i = 0; i < localStorage.length; i++) {
            let key = localStorage.key(i);
            if (key && key.startsWith('habitData_')) {
                let monthData = JSON.parse(localStorage.getItem(key));
                if (monthData && monthData.habits) {
                    let cleanedHabits = {};
                    for (const [dataKey, value] of Object.entries(monthData.habits)) {
                        if (!dataKey.startsWith(`${id}-`)) {
                            cleanedHabits[dataKey] = value;
                        }
                    }
                    monthData.habits = cleanedHabits;
                    localStorage.setItem(key, JSON.stringify(monthData));
                }
            }
        }
        updateDashboard();
    }
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
    if(confirm(`Are you sure you want to clear ALL data for ${monthNames[currentMonth]} ${currentYear}?`)) {
        localStorage.removeItem(getStorageKey());
        updateDashboard();
    }
}

function saveState() {
    let state = { habits: {}, moodSleep: {} };
    document.querySelectorAll('.habit-checkbox').forEach(box => { 
        if(box.checked) state.habits[`${box.dataset.uuid}-${box.dataset.day}`] = true; 
    });
    document.querySelectorAll('.mood-sleep-select').forEach(select => { 
        if(select.value !== "") state.moodSleep[`${select.dataset.metric}-${select.dataset.day}`] = select.value; 
    });
    localStorage.setItem(getStorageKey(), JSON.stringify(state));
}

function loadState() {
    const saved = JSON.parse(localStorage.getItem(getStorageKey())) || { habits: {}, moodSleep: {} };
    document.querySelectorAll('.habit-checkbox').forEach(box => {
        box.checked = !!(saved.habits && saved.habits[`${box.dataset.uuid}-${box.dataset.day}`]);
    });
    document.querySelectorAll('.mood-sleep-select').forEach(select => { 
        if (saved.moodSleep && saved.moodSleep[`${select.dataset.metric}-${select.dataset.day}`]) {
            select.value = saved.moodSleep[`${select.dataset.metric}-${select.dataset.day}`];
        } else {
            select.value = ''; 
        }
    });
}

function initCalendarSettings() {
    const date = new Date(); currentYear = date.getFullYear(); currentMonth = date.getMonth();
    const mSelect = document.getElementById('monthSelect'); const ySelect = document.getElementById('yearSelect');

    monthNames.forEach((m, i) => mSelect.add(new Option(m, i))); mSelect.value = currentMonth;
    for(let y = currentYear - 2; y <= currentYear + 4; y++) ySelect.add(new Option(y, y)); ySelect.value = currentYear;

    mSelect.addEventListener('change', (e) => { currentMonth = parseInt(e.target.value); updateDashboard(); });
    ySelect.addEventListener('change', (e) => { currentYear = parseInt(e.target.value); updateDashboard(); });
}

function buildGrids() {
    daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    document.getElementById('gridTitle').innerText = `${monthNames[currentMonth]} ${currentYear}`;

    const header = document.getElementById('tableHeader'); 
    const body = document.getElementById('tableBody');
    const msBody = document.getElementById('moodSleepBody');
    const analysisBody = document.getElementById('analysisBody');
    
    header.innerHTML = ''; body.innerHTML = ''; msBody.innerHTML = ''; analysisBody.innerHTML = '';

    let trWeeks = document.createElement('tr'); let thEmptyTop = document.createElement('th');
    thEmptyTop.className = 'sticky-left'; trWeeks.appendChild(thEmptyTop);

    let currentWeek = 1;
    for (let d = 1; d <= daysInMonth; d += 7) {
        let thWeek = document.createElement('th'); let daysInThisWeek = Math.min(7, daysInMonth - d + 1);
        thWeek.colSpan = daysInThisWeek; thWeek.innerText = 'Week ' + currentWeek; thWeek.className = 'week-label';
        trWeeks.appendChild(thWeek); currentWeek++;
    }
    header.appendChild(trWeeks);

    let trDays = document.createElement('tr'); let thHabit = document.createElement('th'); thHabit.className = 'sticky-left'; 
    thHabit.innerHTML = '<div class="habit-cell-content"><span style="color:var(--text-muted); font-weight:600; letter-spacing:1px;">HABIT</span></div>';
    trDays.appendChild(thHabit);
    
    for (let d = 1; d <= daysInMonth; d++) { 
        let th = document.createElement('th'); let dateObj = new Date(currentYear, currentMonth, d);
        th.innerHTML = `<div class="day-label">${dayNamesShort[dateObj.getDay()]}</div><div class="date-label">${d}</div>`;
        trDays.appendChild(th); 
    }
    header.appendChild(trDays);

    habits.forEach((habitObj, hIdx) => {
        let tr = document.createElement('tr'); let tdName = document.createElement('td'); tdName.className = 'sticky-left'; 
        tdName.innerHTML = `
            <div class="habit-cell-content">
                <button class="icon-btn" onclick="moveHabit(${hIdx}, -1)" ${hIdx===0?'style="visibility:hidden"':''} aria-label="Move Up">↑</button>
                <button class="icon-btn" onclick="moveHabit(${hIdx}, 1)" ${hIdx===habits.length-1?'style="visibility:hidden"':''} aria-label="Move Down">↓</button>
                <span class="habit-name" title="${habitObj.name}">${habitObj.name}</span>
                <button class="icon-btn delete-btn" onclick="deleteHabit('${habitObj.id}')" title="Delete" aria-label="Delete">×</button>
            </div>
        `;
        tr.appendChild(tdName);

        for (let d = 1; d <= daysInMonth; d++) {
            let td = document.createElement('td'); let cb = document.createElement('input');
            cb.type = 'checkbox'; cb.className = 'habit-checkbox'; 
            cb.dataset.uuid = habitObj.id; cb.dataset.day = d;
            cb.setAttribute('aria-label', `${habitObj.name} on day ${d}`);
            cb.addEventListener('change', () => { saveState(); calculateStats(); });
            td.appendChild(cb); tr.appendChild(td);
        }
        body.appendChild(tr);

        let cleanName = habitObj.name.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '').trim(); 
        let anaTr = document.createElement('tr');
        anaTr.innerHTML = `
            <td class="text-left" title="${habitObj.name}">${cleanName}</td>
            <td id="ana-act-${habitObj.id}">0/${daysInMonth}</td>
            <td><div style="display:flex; align-items:center; gap:5px; justify-content:center;"><div class="progress-container" style="width: 30px;"><div class="progress-fill" id="ana-bar-${habitObj.id}"></div></div><span id="ana-pct-${habitObj.id}" style="width: 25px; text-align:right;">0%</span></div></td>
            <td><b id="ana-curr-${habitObj.id}">0</b></td>
            <td style="color:var(--text-muted)" id="ana-best-${habitObj.id}">0</td>
        `;
        analysisBody.appendChild(anaTr);
    });

    let trWellnessTitle = document.createElement('tr'); 
    trWellnessTitle.innerHTML = `<td class="sticky-left" style="border-top:2px solid rgba(255,255,255,0.05);"><div class="habit-cell-content"><span style="color:var(--accent-1); font-weight:700; letter-spacing:1px; font-size:0.75rem;">OVERALL WELLNESS</span></div></td><td colspan="${daysInMonth}" style="border-top:2px solid rgba(255,255,255,0.05);"></td>`;
    msBody.appendChild(trWellnessTitle);

    ['Mood', 'Hours of Sleep'].forEach(metric => {
        let tr = document.createElement('tr'); let tdName = document.createElement('td'); tdName.className = 'sticky-left'; 
        tdName.innerHTML = `<div class="habit-cell-content" style="justify-content: flex-end;"><span class="habit-name" style="color: var(--text-muted);">${metric}</span></div>`; tr.appendChild(tdName);
        
        for (let d = 1; d <= daysInMonth; d++) {
            let td = document.createElement('td'); let select = document.createElement('select'); select.className = 'mood-sleep-select';
            select.add(new Option(`·`, ``)); 
            for(let i = 1; i <= 10; i++) select.add(new Option(`${i}`, i));
            
            select.dataset.metric = metric; select.dataset.day = d;
            select.setAttribute('aria-label', `${metric} on day ${d}`);
            select.addEventListener('change', () => { saveState(); calculateStats(); });
            td.appendChild(select); tr.appendChild(td);
        }
        msBody.appendChild(tr);
    });
}

function calculateStats() {
    const totalGoal = habits.length * daysInMonth;
    if (totalGoal === 0) {
        document.getElementById('statGoal').innerText = 0; document.getElementById('statCompleted').innerText = 0; document.getElementById('statLeft').innerText = 0;
        document.getElementById('topHabitsList').innerHTML = '<li><span style="color:var(--text-muted); width:100%; text-align:center;">No habits data.</span></li>';
        return; 
    }

    let totalCompleted = 0; 
    let checksPerHabit = {}; 
    let habitDataGrid = {};
    let checksPerDay = Array(daysInMonth).fill(0);
    
    habits.forEach(h => {
        checksPerHabit[h.id] = 0;
        habitDataGrid[h.id] = Array(daysInMonth).fill(false);
    });

    document.querySelectorAll('.habit-checkbox').forEach(box => {
        if (box.checked) { 
            totalCompleted++; 
            const uuid = box.dataset.uuid;
            const dayIdx = box.dataset.day - 1;
            if(checksPerHabit[uuid] !== undefined) {
                checksPerHabit[uuid]++; 
                checksPerDay[dayIdx]++; 
                habitDataGrid[uuid][dayIdx] = true;
            }
        }
    });

    // Animate the counters for a premium feel
    animateValue("statGoal", parseInt(document.getElementById('statGoal').innerText) || 0, totalGoal, 500);
    animateValue("statCompleted", parseInt(document.getElementById('statCompleted').innerText) || 0, totalCompleted, 500);
    animateValue("statLeft", parseInt(document.getElementById('statLeft').innerText) || 0, totalGoal - totalCompleted, 500);

    let habitStatsArray = [];

    habits.forEach(h => {
        let currStreak = 0; let bestStreak = 0;
        for (let d = 0; d < daysInMonth; d++) {
            if (habitDataGrid[h.id][d]) {
                currStreak++; bestStreak = Math.max(bestStreak, currStreak);
            } else { currStreak = 0; }
        }

        let actual = checksPerHabit[h.id]; let pct = Math.round((actual / daysInMonth) * 100);
        
        document.getElementById(`ana-act-${h.id}`).innerText = `${actual}/${daysInMonth}`;
        document.getElementById(`ana-pct-${h.id}`).innerText = `${pct}%`;
        document.getElementById(`ana-bar-${h.id}`).style.width = `${pct}%`;
        document.getElementById(`ana-curr-${h.id}`).innerText = currStreak;
        document.getElementById(`ana-best-${h.id}`).innerText = bestStreak;

        habitStatsArray.push({ name: h.name, actual: actual, streak: currStreak });
    });

    habitStatsArray.sort((a, b) => b.actual - a.actual || b.streak - a.streak);

    const topList = document.getElementById('topHabitsList');
    if (topList) {
        topList.innerHTML = '';
        habitStatsArray.slice(0, 10).forEach((stat, i) => {
            let li = document.createElement('li'); 
            li.innerHTML = `
                <span>${i+1}</span> 
                <span style="flex-grow: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${stat.name}">${stat.name}</span>
                <span style="color: var(--accent-1); font-weight: 600;">${stat.actual} <span style="font-weight: 400; color: var(--text-muted); font-size: 0.7rem;">/ ${daysInMonth}</span></span>
            `; 
            topList.appendChild(li);
        });
    }

    let moodData = Array(daysInMonth).fill(null);
    let sleepData = Array(daysInMonth).fill(null);
    
    document.querySelectorAll('.mood-sleep-select').forEach(select => {
        let val = select.value ? parseInt(select.value) : null;
        let dayIdx = parseInt(select.dataset.day) - 1;
        if(select.dataset.metric === 'Mood') moodData[dayIdx] = val;
        if(select.dataset.metric === 'Hours of Sleep') sleepData[dayIdx] = val;
    });

    mixedChart.data.labels = Array.from({length: daysInMonth}, (_, i) => i + 1);
    mixedChart.data.datasets[0].data = checksPerDay; 
    mixedChart.data.datasets[1].data = moodData;     
    mixedChart.data.datasets[2].data = sleepData;    
    mixedChart.update();

    overallChart.data.datasets[0].data = [totalCompleted, totalGoal - totalCompleted];
    overallChart.update();
}

// Simple counter animation
function animateValue(id, start, end, duration) {
    if (start === end) return;
    let range = end - start;
    let current = start;
    let increment = end > start ? 1 : -1;
    let stepTime = Math.abs(Math.floor(duration / range));
    let obj = document.getElementById(id);
    let timer = setInterval(function() {
        current += increment;
        obj.innerHTML = current;
        if (current == end) {
            clearInterval(timer);
        }
    }, stepTime);
}

function exportCSV() {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    let headerRow = ["Date", "Day", ...habits.map(h => {
        return h.name.replace(/,/g, '').replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '').trim(); 
    }), "Mood", "Sleep"];
    
    csvContent += headerRow.join(",") + "\r\n";

    const saved = JSON.parse(localStorage.getItem(getStorageKey())) || { habits: {}, moodSleep: {} };

    for (let d = 1; d <= daysInMonth; d++) {
        let dateObj = new Date(currentYear, currentMonth, d);
        let shortMonth = monthNames[currentMonth].substring(0, 3);
        let formattedDate = `${shortMonth}-${d.toString().padStart(2, '0')}`;
        let row = [formattedDate, dayNamesShort[dateObj.getDay()]];
        
        habits.forEach(h => {
            let isChecked = saved.habits[`${h.id}-${d}`] ? "1" : "0";
            row.push(isChecked);
        });

        row.push(saved.moodSleep[`Mood-${d}`] || "");
        row.push(saved.moodSleep[`Hours of Sleep-${d}`] || "");

        csvContent += row.join(",") + "\r\n";
    }

    let encodedUri = encodeURI(csvContent);
    let link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Habits_${monthNames[currentMonth]}_${currentYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function initCharts() {
    let ctxDaily = document.getElementById('dailyMixedChart').getContext('2d');
    
    // Create a beautiful gradient for the bars
    let gradientBar = ctxDaily.createLinearGradient(0, 0, 0, 300);
    gradientBar.addColorStop(0, '#ec4899'); // Pink
    gradientBar.addColorStop(1, '#6366f1'); // Indigo

    mixedChart = new Chart(ctxDaily, {
        type: 'bar', 
        data: { 
            labels: [], 
            datasets: [
                { type: 'bar', label: 'Tasks Done', data: [], backgroundColor: gradientBar, borderRadius: 4, yAxisID: 'y', order: 3 },
                { type: 'line', label: 'Mood', data: [], borderColor: '#ffffff', backgroundColor: '#ffffff', borderWidth: 2, fill: false, tension: 0.4, pointRadius: 3, spanGaps: true, yAxisID: 'y1', order: 1 },
                { type: 'line', label: 'Sleep', data: [], borderColor: '#94a3b8', backgroundColor: '#94a3b8', borderWidth: 2, borderDash: [5, 5], fill: false, tension: 0.4, pointRadius: 3, pointStyle: 'rect', spanGaps: true, yAxisID: 'y1', order: 2 }
            ] 
        },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            interaction: { mode: 'index', intersect: false },
            scales: { 
                y: { type: 'linear', display: true, position: 'left', ticks: {color: '#94a3b8'}, grid: {color: 'rgba(255,255,255,0.05)'} }, 
                y1: { type: 'linear', display: true, position: 'right', min: 0, max: 10, ticks: {color: '#ffffff'}, grid: {drawOnChartArea: false} },
                x: { ticks: {color: '#94a3b8'}, grid: {display: false} } 
            }, 
            plugins: { legend: { display: true, position: 'top', labels: {color: '#e2e8f0', usePointStyle: true, boxWidth: 8} } } 
        }
    });

    let ctxDoughnut = document.getElementById('overallDoughnutChart').getContext('2d');
    overallChart = new Chart(ctxDoughnut, {
        type: 'doughnut', data: { labels: ['Done', 'Left'], datasets: [{ data: [0, 1], backgroundColor: ['#6366f1', 'rgba(0,0,0,0.3)'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '80%', plugins: { legend: { display: false }, tooltips: {enabled: false} } }
    });
}
