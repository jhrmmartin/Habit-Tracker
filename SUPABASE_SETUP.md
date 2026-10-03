# ⚡ Supabase Cloud Sync Setup Guide

This Habit Tracker supports **Local-First Cloud Sync** powered by Supabase.
- **Offline / Guest**: Works immediately with zero configuration using `localStorage`.
- **Cloud Sync**: Log in from any computer or phone to sync habits, daily checkmarks, mood, and sleep logs in real-time.

---

## Step 1: Create a Free Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New Project**.
3. Choose a project name (e.g. `habit-tracker`) and set a database password.
4. Select the region nearest to you and click **Create new project**.

---

## Step 2: Run the SQL Schema

1. In your Supabase dashboard, click the **SQL Editor** tab in the left sidebar.
2. Click **New Query**, paste the SQL block below, and click **Run**:

```sql
-- 1. Habits Table
create table public.habits (
  id            text not null,
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  name          text not null,
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  primary key (id, user_id)
);

-- 2. Habit Daily Check Logs
create table public.habit_logs (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  habit_id   text not null,
  log_date   date not null,
  completed  boolean not null default true,
  primary key (user_id, habit_id, log_date)
);

-- 3. Daily Wellness Logs (Mood & Sleep)
create table public.wellness_logs (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  log_date    date not null,
  mood        integer,
  sleep_hours integer,
  primary key (user_id, log_date)
);

-- 4. Enable Row Level Security (RLS) so each user only accesses their own data
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.wellness_logs enable row level security;

-- 5. Access Policies
create policy "own_habits" on public.habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_logs" on public.habit_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_wellness" on public.wellness_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

---

## Step 3: Copy Your API Keys

1. In your Supabase dashboard, click **Project Settings** (gear icon) $\rightarrow$ **API**.
2. Find:
   - **Project URL** (e.g., `https://xyzcompany.supabase.co`)
   - **Project API Keys** $\rightarrow$ `anon` / `public` (a long JWT string)
3. Open `supabase-config.js` in this repository and paste them in:

```javascript
window.SUPABASE_CONFIG = {
    url:     'https://YOUR_PROJECT_ID.supabase.co',
    anonKey: 'YOUR_ANON_KEY_HERE'
};
```

---

## Step 4: Test Cloud Sync

1. Open your habit tracker website.
2. Click the **Cloud Sync** button in the header.
3. Switch to **Sign up**, enter your email and password, and create an account.
4. Your existing habits and logs will automatically upload to the cloud!
5. Any subsequent checkmark or habit change will automatically sync in the background with a green **Synced** indicator.
