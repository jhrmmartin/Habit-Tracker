// ============================================================
// DAYMARK — MONTHLY KEEPSAKE LETTERPRESS PRINT & EXPORT
// Synced dynamically to Linen Paper / Evening Ink & all 3 Inks.
// ============================================================

import { store } from '../store.js';
import { getLastAnalytics } from './charts.js';
import { toast } from './toast.js';

const MONTH_UPPER_FMT = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

function readThemePalette() {
  const cs = getComputedStyle(document.documentElement);
  return {
    bg: cs.getPropertyValue('--bg-canvas').trim() || '#F6F2EA',
    card: cs.getPropertyValue('--bg-surface').trim() || '#FFFDFA',
    ink: cs.getPropertyValue('--text-primary').trim() || '#1E1B18',
    secondary: cs.getPropertyValue('--text-secondary').trim() || '#575047',
    muted: cs.getPropertyValue('--text-muted').trim() || '#6E665C',
    accent: cs.getPropertyValue('--accent').trim() || '#B94825',
    border: cs.getPropertyValue('--border-strong').trim() || 'rgba(30,27,24,0.2)'
  };
}

function getKeepsakeMetrics() {
  const stats = getLastAnalytics() || {
    overallRate: 0,
    totalCompleted: 0,
    totalGoal: 0,
    totalRestDays: 0,
    avgSleep: null,
    avgMood: null,
    topHabits: []
  };

  const bestStreak = stats.topHabits.reduce((max, h) => Math.max(max, h.currentStreak), 0);
  const period = MONTH_UPPER_FMT.format(new Date(store.currentYear, store.currentMonth, 1));
  const motto = (store.prefs.motto || 'Small marks, lasting rhythm.').trim();
  const host = (window.location.host && !window.location.host.startsWith('localhost') && !window.location.host.startsWith('127.'))
    ? `daymark · ${window.location.host}`
    : 'daymark · small marks, lasting rhythm';

  return {
    period,
    rate: `${stats.overallRate}%`,
    logged: `${stats.totalCompleted} / ${stats.totalGoal}`,
    rest: `${stats.totalRestDays} day${stats.totalRestDays === 1 ? '' : 's'}`,
    streak: `${bestStreak} day${bestStreak === 1 ? '' : 's'}`,
    sleep: stats.avgSleep !== null ? `${stats.avgSleep} hrs` : '--',
    mood: stats.avgMood !== null ? `${stats.avgMood} / 10` : '--',
    topHabits: stats.topHabits.slice(0, 3),
    motto,
    footer: host
  };
}

export function openKeepsakeDialog() {
  const dialog = document.getElementById('keepsakeDialog');
  if (!dialog) return;

  const m = getKeepsakeMetrics();
  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setText('ksPeriod', m.period);
  setText('ksRate', m.rate);
  setText('ksLogged', m.logged);
  setText('ksStreak', m.streak);
  setText('ksSleep', m.sleep);
  setText('ksMood', m.mood);
  setText('ksMotto', `“${m.motto}”`);
  setText('ksFooter', m.footer);

  const list = document.getElementById('ksTopHabits');
  if (list) {
    list.innerHTML = '';
    if (m.topHabits.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'keepsake-row';
      empty.style.color = 'var(--text-muted)';
      empty.textContent = 'No habits logged yet this month.';
      list.appendChild(empty);
    } else {
      m.topHabits.forEach((h, i) => {
        const row = document.createElement('div');
        row.className = 'keepsake-row';

        const lbl = document.createElement('span');
        lbl.className = 'keepsake-label';
        lbl.textContent = `${i + 1}. ${h.icon} ${h.name}`;

        const val = document.createElement('span');
        val.className = 'keepsake-val';
        val.textContent = `${h.rate}%`;

        row.append(lbl, val);
        list.appendChild(row);
      });
    }
  }

  dialog.returnValue = '';
  dialog.showModal();
}

function buildKeepsakeCanvas() {
  const m = getKeepsakeMetrics();
  const pal = readThemePalette();
  const canvas = document.createElement('canvas');
  const w = 460;
  const h = 610;
  const dpr = 2;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Outer studio mat
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, w, h);

  // Inner letterpress stationery card
  const pad = 22;
  ctx.fillStyle = pal.card;
  ctx.strokeStyle = pal.border;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(pad, pad, w - pad * 2, h - pad * 2, 14);
  ctx.fill();
  ctx.stroke();

  const left = pad + 26;
  const right = w - pad - 26;
  let y = pad + 44;

  // Brand emblem & heading
  ctx.textAlign = 'center';
  ctx.font = '700 22px "Fraunces", Georgia, serif';
  ctx.fillStyle = pal.accent;
  ctx.fillText('Daymark', w / 2, y);

  y += 22;
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.fillStyle = pal.muted;
  ctx.fillText(`MONTHLY KEEPSAKE · ${m.period.toUpperCase()}`, w / 2, y);

  const drawRule = (ry) => {
    ctx.strokeStyle = pal.border;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(left, ry);
    ctx.lineTo(right, ry);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  y += 18;
  drawRule(y);

  const drawRow = (label, val, emphasis = false) => {
    y += 26;
    ctx.textAlign = 'left';
    ctx.font = `${emphasis ? '700 13px' : '500 12px'} "JetBrains Mono", monospace`;
    ctx.fillStyle = emphasis ? pal.ink : pal.secondary;
    ctx.fillText(label, left, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = emphasis ? pal.accent : pal.ink;
    ctx.fillText(val, right, y);
  };

  drawRow('MONTHLY RHYTHM', m.rate, true);
  drawRow('MARKS LOGGED', m.logged);
  drawRow('ACTIVE STREAK', m.streak);
  drawRow('AVG SLEEP', m.sleep);
  drawRow('AVG MOOD', m.mood);

  y += 20;
  drawRule(y);

  y += 22;
  ctx.textAlign = 'left';
  ctx.font = '700 10px "JetBrains Mono", monospace';
  ctx.fillStyle = pal.muted;
  ctx.fillText('ANCHOR HABITS', left, y);

  if (m.topHabits.length === 0) {
    y += 24;
    ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = pal.muted;
    ctx.fillText('No marks logged yet for this month.', left, y);
  } else {
    m.topHabits.forEach((item, idx) => {
      const cleanName = item.name.length > 22 ? `${item.name.slice(0, 20)}…` : item.name;
      drawRow(`${idx + 1}. ${cleanName}`, `${item.rate}%`);
    });
  }

  y += 24;
  drawRule(y);

  // Decorative studio stamp bars
  y += 22;
  const bars = [2, 5, 1, 3, 2, 6, 1, 4, 2, 3, 1, 5, 2, 4, 1, 3, 4, 2];
  const barW = bars.reduce((a, b) => a + b, 0) + bars.length * 3;
  let bx = (w - barW) / 2;
  ctx.fillStyle = pal.ink;
  ctx.globalAlpha = 0.72;
  for (const bw of bars) {
    ctx.fillRect(bx, y, bw, 22);
    bx += bw + 3;
  }
  ctx.globalAlpha = 1;

  y += 46;
  ctx.textAlign = 'center';
  ctx.font = 'italic 12px "Fraunces", Georgia, serif';
  ctx.fillStyle = pal.secondary;
  const clippedMotto = m.motto.length > 52 ? `${m.motto.slice(0, 50)}…` : m.motto;
  ctx.fillText(`“${clippedMotto}”`, w / 2, y);

  y += 20;
  ctx.font = '600 10px "JetBrains Mono", monospace';
  ctx.fillStyle = pal.muted;
  ctx.fillText(m.footer.toUpperCase(), w / 2, y);

  return canvas;
}

function downloadKeepsakePNG() {
  const canvas = buildKeepsakeCanvas();
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Daymark_Keepsake_${store.currentYear}_${String(store.currentMonth + 1).padStart(2, '0')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('Downloaded Monthly Keepsake PNG');
  }, 'image/png');
}

async function copyKeepsakeImage() {
  // Safari-compatible: pass Promise<Blob> directly inside ClipboardItem during user gesture
  if (!navigator.clipboard || typeof window.ClipboardItem === 'undefined') {
    toast.info('Clipboard image copy is not supported in this browser — downloading PNG instead.');
    downloadKeepsakePNG();
    return;
  }

  try {
    const blobPromise = new Promise((resolve, reject) => {
      const canvas = buildKeepsakeCanvas();
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))), 'image/png');
    });
    await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blobPromise })]);
    toast.success('Copied Monthly Keepsake image to clipboard');
  } catch {
    toast.info('Could not copy image directly — use Download PNG instead.');
  }
}

export function wireKeepsakeDialog() {
  document.getElementById('openKeepsakeBtn')?.addEventListener('click', openKeepsakeDialog);
  document.getElementById('ksDownloadBtn')?.addEventListener('click', downloadKeepsakePNG);
  document.getElementById('ksCopyBtn')?.addEventListener('click', copyKeepsakeImage);
  document.getElementById('ksCloseBtn')?.addEventListener('click', () => {
    document.getElementById('keepsakeDialog')?.close();
  });
}
