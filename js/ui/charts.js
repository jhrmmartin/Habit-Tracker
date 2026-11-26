// ============================================================
// DAYMARK — RESILIENT CHARTS, MOMENTUM & RHYTHM INSIGHTS
// Reads live CSS tokens; gracefully degrades if Chart.js is offline.
// ============================================================

import { store } from '../store.js';
import { computeMonthAnalytics } from '../streaks.js';

let dailyChart = null;
let rhythmDonut = null;
let lastAnalytics = null;

export function getLastAnalytics() {
  return lastAnalytics;
}

function readPaletteTokens() {
  const cs = getComputedStyle(document.documentElement);
  return {
    accent: cs.getPropertyValue('--accent').trim() || '#B94825',
    mood: cs.getPropertyValue('--mood-line').trim() || '#26664E',
    sleep: cs.getPropertyValue('--sleep-line').trim() || '#5D6A8A',
    grid: cs.getPropertyValue('--border-subtle').trim() || 'rgba(0,0,0,0.08)',
    tick: cs.getPropertyValue('--text-muted').trim() || '#6E665C',
    legend: cs.getPropertyValue('--text-secondary').trim() || '#575047',
    track: cs.getPropertyValue('--bg-surface-elevated').trim() || '#EFE9DD'
  };
}

function setCanvasFallback(container, canvasId, buildContent) {
  if (!container) return;
  const canvas = document.getElementById(canvasId);
  if (canvas) canvas.classList.add('hidden');
  let box = container.querySelector('.chart-fallback');
  if (!box) {
    box = document.createElement('div');
    box.className = 'chart-fallback';
    container.appendChild(box);
  }
  box.innerHTML = '';
  buildContent(box);
}

function clearCanvasFallback(container, canvasId) {
  if (!container) return;
  container.querySelector('.chart-fallback')?.remove();
  const canvas = document.getElementById(canvasId);
  if (canvas) canvas.classList.remove('hidden');
}

function renderFallbackDaily(container, analytics) {
  setCanvasFallback(container, 'dailyMixedChart', (box) => {
    const title = document.createElement('strong');
    title.textContent = `${analytics.totalCompleted} marks completed across ${analytics.totalDays} days (${analytics.overallRate}%)`;
    const sub = document.createElement('span');
    sub.textContent = 'Interactive chart resumes automatically when online.';
    box.append(title, sub);
  });
}

function renderFallbackDonut(container, analytics) {
  setCanvasFallback(container, 'overallDoughnutChart', (box) => {
    const big = document.createElement('strong');
    big.className = 'tabular';
    big.style.fontSize = '1.75rem';
    big.style.color = 'var(--accent)';
    big.textContent = `${analytics.overallRate}%`;
    const sub = document.createElement('span');
    sub.textContent = `${analytics.totalCompleted} of ${analytics.totalGoal} scheduled marks`;
    box.append(big, sub);
  });
}

function ensureCharts() {
  if (typeof window.Chart !== 'function') return false;
  const pal = readPaletteTokens();
  const dailyPanelVisible = !document.getElementById('chartPanel')?.classList.contains('hidden');

  clearCanvasFallback(document.getElementById('donutChartBox'), 'overallDoughnutChart');
  if (dailyPanelVisible) {
    clearCanvasFallback(document.getElementById('dailyChartBox'), 'dailyMixedChart');
  }

  if (!dailyChart && dailyPanelVisible) {
    const canvas = document.getElementById('dailyMixedChart');
    if (canvas) {
      dailyChart = new window.Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: [],
          datasets: [
            {
              type: 'bar',
              label: 'Habits Marked',
              data: [],
              backgroundColor: pal.accent,
              borderRadius: 5,
              yAxisID: 'y',
              order: 3
            },
            {
              type: 'line',
              label: 'Mood (1–10)',
              data: [],
              borderColor: pal.mood,
              backgroundColor: pal.mood,
              borderWidth: 2,
              tension: 0.32,
              pointRadius: 2.5,
              spanGaps: true,
              yAxisID: 'y1',
              order: 1
            },
            {
              type: 'line',
              label: 'Sleep (hrs)',
              data: [],
              borderColor: pal.sleep,
              backgroundColor: pal.sleep,
              borderWidth: 1.75,
              borderDash: [4, 4],
              tension: 0.32,
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
          animation: { duration: 220 },
          interaction: { mode: 'index', intersect: false },
          scales: {
            y: {
              beginAtZero: true,
              position: 'left',
              ticks: { precision: 0, color: pal.tick, font: { family: 'JetBrains Mono', size: 10 } },
              grid: { color: pal.grid }
            },
            y1: {
              min: 0,
              max: 12,
              position: 'right',
              ticks: { color: pal.mood, font: { family: 'JetBrains Mono', size: 10 } },
              grid: { drawOnChartArea: false }
            },
            x: {
              ticks: { color: pal.tick, font: { family: 'JetBrains Mono', size: 10 } },
              grid: { display: false }
            }
          },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                color: pal.legend,
                usePointStyle: true,
                boxWidth: 7,
                font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' }
              }
            }
          }
        }
      });
    }
  }

  if (!rhythmDonut) {
    const canvas = document.getElementById('overallDoughnutChart');
    if (canvas) {
      rhythmDonut = new window.Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['Marked', 'Remaining'],
          datasets: [{
            data: [0, 1],
            backgroundColor: [pal.accent, pal.track],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 220 },
          cutout: '78%',
          plugins: {
            legend: { display: false },
            tooltip: { enabled: true }
          }
        }
      });
    }
  }

  return Boolean(rhythmDonut);
}

const INSIGHT_ICONS = {
  moon: `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  smile: `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  pulse: `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  anchor: `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`
};

export function renderAnalyticsAndCharts() {
  const year = store.currentYear;
  const month = store.currentMonth;
  const analytics = computeMonthAnalytics({
    habits: store.habits,
    monthData: store.getMonthData(year, month),
    allLogsByHabit: store.getAllLogsByHabit(),
    year,
    month
  });
  lastAnalytics = analytics;

  // Stat Trio (zero interval leaks — crisp direct updates!)
  const goalEl = document.getElementById('statGoal');
  const compEl = document.getElementById('statCompleted');
  const leftEl = document.getElementById('statLeft');
  const rateCenterEl = document.getElementById('rhythmCenterPct');
  if (goalEl) goalEl.textContent = String(analytics.totalGoal);
  if (compEl) compEl.textContent = String(analytics.totalCompleted);
  if (leftEl) leftEl.textContent = String(analytics.totalRemaining);
  if (rateCenterEl) rateCenterEl.textContent = `${analytics.overallRate}%`;

  // Accessible chart summary caption
  const dailySummary = document.getElementById('dailyChartSummary');
  if (dailySummary) {
    dailySummary.textContent = `${analytics.totalCompleted} of ${analytics.totalGoal} scheduled marks completed (${analytics.overallRate}%).`;
  }

  // Charts or Resilient Fallback
  const hasChartLib = ensureCharts();
  if (hasChartLib) {
    const pal = readPaletteTokens();

    if (dailyChart && !document.getElementById('chartPanel')?.classList.contains('hidden')) {
      dailyChart.data.labels = Array.from({ length: analytics.totalDays }, (_, i) => String(i + 1));
      dailyChart.data.datasets[0].data = analytics.checksPerDay;
      dailyChart.data.datasets[0].backgroundColor = pal.accent;
      dailyChart.data.datasets[1].data = analytics.moodData;
      dailyChart.data.datasets[1].borderColor = pal.mood;
      dailyChart.data.datasets[1].backgroundColor = pal.mood;
      dailyChart.data.datasets[2].data = analytics.sleepData;
      dailyChart.data.datasets[2].borderColor = pal.sleep;
      dailyChart.data.datasets[2].backgroundColor = pal.sleep;
      dailyChart.options.scales.y.ticks.color = pal.tick;
      dailyChart.options.scales.y.grid.color = pal.grid;
      dailyChart.options.scales.y1.ticks.color = pal.mood;
      dailyChart.options.scales.x.ticks.color = pal.tick;
      dailyChart.options.plugins.legend.labels.color = pal.legend;
      dailyChart.update('none');
    }

    rhythmDonut.data.datasets[0].data = analytics.totalGoal > 0
      ? [analytics.totalCompleted, analytics.totalRemaining]
      : [0, 1];
    rhythmDonut.data.datasets[0].backgroundColor = [pal.accent, pal.track];
    rhythmDonut.options.plugins.tooltip.enabled = analytics.totalGoal > 0;
    rhythmDonut.update('none');
  } else {
    const dailyBox = document.getElementById('dailyChartBox');
    const donutBox = document.getElementById('donutChartBox');
    if (dailyBox) renderFallbackDaily(dailyBox, analytics);
    if (donutBox) renderFallbackDonut(donutBox, analytics);
  }

  // Habit Momentum Table (True Cross-Month Now + All-Time Best Streaks)
  const momBody = document.getElementById('momentumTableBody');
  if (momBody) {
    momBody.innerHTML = '';
    if (analytics.habitStats.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'muted';
      td.style.padding = '16px 8px';
      td.textContent = 'Add habits to see streaks and consistency.';
      tr.appendChild(td);
      momBody.appendChild(tr);
    } else {
      for (const s of analytics.habitStats) {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.className = 'momentum-habit-cell privacy-sensitive';
        tdName.textContent = `${s.icon} ${s.name}`;
        tdName.title = s.name;

        const tdTot = document.createElement('td');
        tdTot.className = 'tabular';
        tdTot.textContent = `${s.actual}/${s.target}`;

        const tdRate = document.createElement('td');
        const wrap = document.createElement('div');
        wrap.className = 'mini-bar-wrap';
        const bar = document.createElement('div');
        bar.className = 'mini-bar';
        const fill = document.createElement('div');
        fill.className = 'mini-bar-fill';
        fill.style.width = `${s.rate}%`;
        bar.appendChild(fill);
        const pctSpan = document.createElement('span');
        pctSpan.className = 'tabular muted';
        pctSpan.style.fontSize = '0.72rem';
        pctSpan.textContent = `${s.rate}%`;
        wrap.append(bar, pctSpan);
        tdRate.appendChild(wrap);

        const tdNow = document.createElement('td');
        tdNow.className = 'tabular';
        tdNow.style.fontWeight = '700';
        tdNow.style.color = s.currentStreak > 0 ? 'var(--accent)' : 'var(--text-muted)';
        tdNow.textContent = String(s.currentStreak);

        const tdBest = document.createElement('td');
        tdBest.className = 'tabular muted';
        tdBest.textContent = String(s.bestStreak);

        tr.append(tdName, tdTot, tdRate, tdNow, tdBest);
        momBody.appendChild(tr);
      }
    }
  }

  // Rhythm Insights Cards
  const insHost = document.getElementById('rhythmInsightsHost');
  if (insHost) {
    insHost.innerHTML = '';
    if (analytics.insights.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.style.padding = '14px 8px';
      empty.textContent = 'Log a couple of days with mood and sleep to uncover personal rhythm patterns.';
      insHost.appendChild(empty);
    } else {
      for (const card of analytics.insights) {
        const el = document.createElement('article');
        el.className = 'insight-card';

        const badge = document.createElement('div');
        badge.className = 'insight-badge';
        badge.innerHTML = INSIGHT_ICONS[card.icon] || INSIGHT_ICONS.anchor;

        const body = document.createElement('div');
        const head = document.createElement('div');
        head.className = 'insight-headline';
        head.textContent = card.headline;

        const det = document.createElement('div');
        det.className = 'insight-detail';
        det.textContent = card.detail;

        body.append(head, det);
        el.append(badge, body);
        insHost.appendChild(el);
      }
    }
  }
}
