-- TEI Education Platform: per-user progress (invite-only auth via Supabase)
-- Run in Supabase Dashboard → SQL Editor, or via Supabase CLI.

create table education_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  completed_lessons jsonb not null default '{}',
  reflections jsonb not null default '{}',
  commitment_completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table education_progress enable row level security;

create policy "Users read own progress"
  on education_progress for select using (auth.uid() = user_id);

create policy "Users insert own progress"
  on education_progress for insert with check (auth.uid() = user_id);

create policy "Users update own progress"
  on education_progress for update using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Supabase Dashboard (manual)
-- ---------------------------------------------------------------------------
-- Authentication → Providers → Email: enabled
-- Authentication → Sign In / Providers → Allow new users to sign up: OFF (invite-only)
-- Authentication → URL Configuration:
--   Site URL: your production domain (e.g. https://www.theeverydayinvestor.co.uk)
--   Redirect URLs (add each explicitly — wildcards alone are not enough for reset links):
--     https://www.theeverydayinvestor.co.uk/hub/reset-password.html
--     https://*.vercel.app/hub/reset-password.html
--     http://localhost:3000/hub/reset-password.html
--   Email rate limits: use scripts/create-user.mjs with a password, or --reset-link (no email).
--
-- Vercel → Project → Settings → Environment Variables:
--   SUPABASE_URL
--   SUPABASE_ANON_KEY
-- Do NOT add SUPABASE_SERVICE_ROLE_KEY to Vercel (local scripts only).
