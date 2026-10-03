// ============================================================
// SUPABASE CONFIGURATION — Habit Tracker Cloud Sync
// ============================================================
// Steps to fill this in:
//   1. Go to https://supabase.com → open your project
//   2. Navigate to: Settings → API
//   3. Copy "Project URL" and "Project API Keys → anon (public)"
//   4. Paste them below, then save + push to GitHub
//
// SQL to run once in your Supabase SQL editor:
// ┌────────────────────────────────────────────────────────────┐
// │  See the README or the comment block below                  │
// └────────────────────────────────────────────────────────────┘
//
// ── SQL SCHEMA (run this once in Supabase SQL Editor) ────────
//
//  create table public.habits (
//    id            text    not null,
//    user_id       uuid    not null default auth.uid() references auth.users on delete cascade,
//    name          text    not null,
//    display_order integer not null default 0,
//    created_at    timestamptz not null default now(),
//    primary key (id, user_id)
//  );
//
//  create table public.habit_logs (
//    user_id    uuid not null default auth.uid() references auth.users on delete cascade,
//    habit_id   text not null,
//    log_date   date not null,
//    completed  boolean not null default true,
//    primary key (user_id, habit_id, log_date)
//  );
//
//  create table public.wellness_logs (
//    user_id     uuid    not null default auth.uid() references auth.users on delete cascade,
//    log_date    date    not null,
//    mood        integer,
//    sleep_hours integer,
//    primary key (user_id, log_date)
//  );
//
//  alter table public.habits      enable row level security;
//  alter table public.habit_logs  enable row level security;
//  alter table public.wellness_logs enable row level security;
//
//  create policy "own_habits"   on public.habits        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
//  create policy "own_logs"     on public.habit_logs    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
//  create policy "own_wellness" on public.wellness_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
//
// ─────────────────────────────────────────────────────────────

window.SUPABASE_CONFIG = {
    url:     'https://dtfyyxmrmhpxusynhvfl.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0Znl5eG1ybWhweHVzeW5odmZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMDIxNjIsImV4cCI6MjEwNjU3ODE2Mn0.58ysNGS3JflnZqtbAcL45W3l41DXdzHWNLbWeCpu3eI'
};
