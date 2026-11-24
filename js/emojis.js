// ============================================================
// DAYMARK — CURATED EMOJI & SMART ICON LIBRARY
// ============================================================

export const EMOJI_CATEGORIES = [
  {
    id: 'everyday',
    label: 'Everyday',
    items: [
      ['💧', 'water hydrate drink'],
      ['☀️', 'sun morning wake sunlight'],
      ['🌙', 'moon sleep night evening bed'],
      ['🧹', 'clean tidy room home chore'],
      ['🪴', 'plant garden nature calm'],
      ['☕', 'coffee tea morning cafe'],
      ['🍵', 'tea matcha calm'],
      ['🍽️', 'meal cook eat dinner kitchen'],
      ['🛒', 'grocery shop errand'],
      ['💰', 'money save budget finance'],
      ['📅', 'plan schedule calendar'],
      ['⏰', 'alarm wake early time'],
      ['📵', 'screen phone offline unplug'],
      ['✨', 'sparkle glow win'],
      ['🕯️', 'candle relax wind down'],
      ['🐾', 'pet dog cat walk']
    ]
  },
  {
    id: 'wellness',
    label: 'Movement & Health',
    items: [
      ['🚶', 'walk steps stroll outdoor'],
      ['🏃', 'run jog cardio sprint'],
      ['🧘', 'stretch yoga meditate breath mindful'],
      ['🏋️', 'workout gym lift weights strength'],
      ['🚴', 'bike cycle ride'],
      ['🏊', 'swim pool lap'],
      ['🥗', 'salad nutrition healthy eat veggies'],
      ['🍎', 'fruit apple snack diet'],
      ['💊', 'vitamin supplement medicine pill'],
      ['😴', 'sleep rest nap bedtime'],
      ['❤️', 'heart health love self care'],
      ['🛡️', 'boundary sober no alcohol sugar'],
      ['🩺', 'checkup health posture'],
      ['🤸', 'mobility pilates core']
    ]
  },
  {
    id: 'mind',
    label: 'Focus & Learning',
    items: [
      ['📚', 'read book chapter library'],
      ['✍️', 'write journal notes reflect diary'],
      ['🎯', 'goal priority focus target'],
      ['💻', 'work code deep study laptop'],
      ['🧠', 'learn study brain language memory'],
      ['🎓', 'class school course exam'],
      ['🗣️', 'language speak practice call'],
      ['🧩', 'puzzle chess problem solve'],
      ['📬', 'inbox email organize'],
      ['🔖', 'bookmark review notes']
    ]
  },
  {
    id: 'creative',
    label: 'Creative & Joy',
    items: [
      ['🎨', 'art draw paint sketch design'],
      ['🎸', 'music guitar instrument play'],
      ['🎹', 'piano music practice'],
      ['🎧', 'podcast audio listen'],
      ['📷', 'photo camera capture'],
      ['🧵', 'craft knit sew create'],
      ['🤝', 'friend family connect social call'],
      ['💌', 'gratitude thank letter kind'],
      ['🌿', 'botanical peace breathe'],
      ['⭐', 'star habit milestone']
    ]
  }
];

export const ALL_EMOJIS = EMOJI_CATEGORIES.flatMap((cat) =>
  cat.items.map(([emoji, keywords]) => ({ emoji, keywords, category: cat.id }))
);

export function searchEmojis(query = '', categoryId = 'all') {
  const q = query.trim().toLowerCase();
  const pool = categoryId === 'all'
    ? ALL_EMOJIS
    : ALL_EMOJIS.filter((item) => item.category === categoryId);

  if (!q) return pool.map((i) => i.emoji);

  const matches = pool
    .filter((item) => item.emoji.includes(q) || item.keywords.includes(q))
    .map((item) => item.emoji);

  return matches.length > 0 ? matches : pool.map((i) => i.emoji);
}

export function suggestHabitIcon(name = '') {
  const n = String(name).toLowerCase();
  if (!n.trim()) return '✦';
  for (const item of ALL_EMOJIS) {
    const words = item.keywords.split(' ');
    if (words.some((w) => w.length >= 3 && n.includes(w))) {
      return item.emoji;
    }
  }
  return '✦';
}
