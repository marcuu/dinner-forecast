-- Single-row JSON store for the dinner forecaster.
create table if not exists public.meal_state (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.meal_state enable row level security;

-- Personal family tool: anonymous read + write to the single 'default' row.
-- NOTE: this is intentionally open. Anyone with the site URL + anon key can
-- read and edit the meal list. Swap these for Supabase Auth policies if you
-- ever want it locked down.
drop policy if exists "anon read meal_state"   on public.meal_state;
drop policy if exists "anon insert meal_state" on public.meal_state;
drop policy if exists "anon update meal_state" on public.meal_state;

create policy "anon read meal_state"   on public.meal_state for select using (true);
create policy "anon insert meal_state" on public.meal_state for insert with check (true);
create policy "anon update meal_state" on public.meal_state for update using (true) with check (true);
