# Daymark — Supabase Cloud Sync & Security Setup Guide

Daymark uses a **Local-First Architecture**:
- **Guest / Offline Mode**: Works immediately with zero configuration and zero signup wall using browser storage + optional JSON backups.
- **Optional Cloud Sync**: Sign in anytime to merge and sync habits, marks, mood, sleep, and daily notes across devices via Supabase.

---

## Step 1: Create a Free Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Open the **SQL Editor** in the left sidebar and run the schema below.

---

## Step 2: Run the SQL Schema (With Server-Side Constraints & RLS)

```sql
-- 1. Habits Table
create table if not exists public.habits (
  id            text    not null,
  user_id       uuid    not null default auth.uid() references auth.users on delete cascade,
  name          text    not null check (char_length(name) between 1 and 80),
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  primary key (id, user_id)
);

-- 2. Habit Daily Check Logs
create table if not exists public.habit_logs (
  user_id    uuid    not null default auth.uid() references auth.users on delete cascade,
  habit_id   text    not null,
  log_date   date    not null,
  completed  boolean not null default true,
  primary key (user_id, habit_id, log_date)
);

-- 3. Daily Wellness Logs (Mood & Sleep with range safety checks)
create table if not exists public.wellness_logs (
  user_id     uuid    not null default auth.uid() references auth.users on delete cascade,
  log_date    date    not null,
  mood        integer check (mood is null or (mood between 1 and 10)),
  sleep_hours numeric(4,1) check (sleep_hours is null or (sleep_hours between 0 and 24)),
  primary key (user_id, log_date)
);

-- 4. Daily Notes & Reflections
create table if not exists public.journal_logs (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  log_date    date not null,
  entry_text  text not null check (char_length(entry_text) <= 5000),
  primary key (user_id, log_date)
);

-- 5. Enable Row Level Security (RLS)
alter table public.habits        enable row level security;
alter table public.habit_logs    enable row level security;
alter table public.wellness_logs enable row level security;
alter table public.journal_logs  enable row level security;

-- 6. Strict Per-User Policies
create policy "own_habits"   on public.habits        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_logs"     on public.habit_logs    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_wellness" on public.wellness_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_journal"  on public.journal_logs  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### Upgrading an Existing Database (Non-Breaking)

If you already ran the original schema, you can optionally upgrade `sleep_hours` to support half-hour increments and add validation constraints:

```sql
alter table public.wellness_logs alter column sleep_hours type numeric(4,1);
alter table public.wellness_logs add constraint chk_mood_range check (mood is null or (mood between 1 and 10));
alter table public.wellness_logs add constraint chk_sleep_range check (sleep_hours is null or (sleep_hours between 0 and 24));
```

---

## Step 3: Configure `supabase-config.js`

Open `supabase-config.js` and set your **Project URL** and **anon (public)** key from **Project Settings → API**.

---

## Recommended Production HTTP Security Headers

If hosting behind Netlify, Cloudflare Pages, or Vercel, pair the built-in CSP meta tag with these HTTP response headers:
- `X-Frame-Options: DENY`
- `Content-Security-Policy: frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), geolocation=(), microphone=()`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
