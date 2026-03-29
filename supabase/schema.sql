create extension if not exists pgcrypto;

create table if not exists user_config (
  user_id text primary key,
  macro_framework jsonb not null default '{}'::jsonb,
  goal text,
  style text,
  competence text,
  bans text,
  core_max numeric not null default 15,
  probe_max numeric not null default 5,
  theme_max numeric not null default 30,
  cooldown_minutes integer not null default 30,
  single_position_warn numeric not null default 15,
  large_reallocation numeric not null default 5,
  allow_instrument_mismatch boolean not null default true,
  missing_target_weight_action text not null default 'warn',
  industry_views jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table user_config add column if not exists macro_framework jsonb not null default '{}'::jsonb;
alter table user_config add column if not exists industry_views jsonb not null default '[]'::jsonb;

create table if not exists positions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  ticker text not null,
  name text,
  market text not null default 'HK',
  theme text,
  industry_view_id text,
  sector text,
  instrument_type text not null default 'single_stock',
  position_type text not null default 'core_midterm',
  in_competence_circle boolean not null default true,
  avg_cost numeric,
  last_price numeric,
  share_count numeric,
  market_value numeric,
  portfolio_weight numeric,
  max_weight_allowed numeric,
  thesis_horizon_label text not null default 'midterm',
  entry_reason_summary text,
  exit_invalidators_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table positions add column if not exists theme text;
alter table positions add column if not exists industry_view_id text;
alter table positions add column if not exists sector text;

create index if not exists positions_user_id_idx on positions(user_id);
create index if not exists positions_user_ticker_idx on positions(user_id, ticker);

create table if not exists thesis_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  position_id uuid,
  ticker text,
  title text,
  thesis_summary text,
  catalyst_summary text,
  invalidation_summary text,
  horizon_label text,
  evidence_list jsonb not null default '[]'::jsonb,
  notes text,
  snapshot_date timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table thesis_snapshots add column if not exists updated_at timestamptz not null default now();

create index if not exists thesis_snapshots_user_id_idx on thesis_snapshots(user_id);
create index if not exists thesis_snapshots_position_id_idx on thesis_snapshots(position_id);

create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  ticker text not null,
  name text,
  market text not null default 'HK',
  source text not null default 'manual',
  thesis text,
  catalyst text,
  added_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table watchlist add column if not exists updated_at timestamptz not null default now();

create index if not exists watchlist_user_id_idx on watchlist(user_id);
create index if not exists watchlist_user_ticker_idx on watchlist(user_id, ticker);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  position_id text,
  position_name text,
  trade_action text not null,
  result_quality text not null default 'bad_process_good_outcome',
  followed_agent boolean not null default false,
  review_date date,
  action_review text,
  reason text,
  mistake_tags jsonb not null default '[]'::jsonb,
  lesson text,
  review_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table reviews add column if not exists review_date date;
alter table reviews add column if not exists action_review text;
alter table reviews add column if not exists updated_at timestamptz not null default now();

create index if not exists reviews_user_id_idx on reviews(user_id);

create table if not exists trade_review_records (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  position_id uuid,
  thesis_snapshot_id uuid,
  review_target_type text not null default 'position',
  review_stage text not null default 'pre_trade',
  action_label text,
  final_action text not null default 'review',
  matched_rules jsonb not null default '[]'::jsonb,
  decision_summary text,
  agent_summary text,
  user_note text,
  executed boolean not null default false,
  execution_note text,
  outcome_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table trade_review_records add column if not exists updated_at timestamptz not null default now();

create index if not exists trade_review_records_user_id_idx on trade_review_records(user_id);

create table if not exists behavior_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  profile_key text not null,
  profile_name text,
  profile_summary text,
  signal_count integer not null default 0,
  severity text not null default 'info',
  evidence_list jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists behavior_profiles_user_id_idx on behavior_profiles(user_id);
create unique index if not exists behavior_profiles_user_key_idx on behavior_profiles(user_id, profile_key);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  detail text,
  severity text not null default 'info',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table events add column if not exists updated_at timestamptz not null default now();

create index if not exists events_user_id_idx on events(user_id);

create table if not exists automation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  run_date date not null,
  risk_level text not null default 'low',
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, run_date)
);

create index if not exists automation_runs_user_id_idx on automation_runs(user_id);

alter table positions enable row level security;
alter table thesis_snapshots enable row level security;
alter table watchlist enable row level security;
alter table reviews enable row level security;
alter table trade_review_records enable row level security;
alter table behavior_profiles enable row level security;
alter table events enable row level security;
alter table user_config enable row level security;
alter table automation_runs enable row level security;

drop policy if exists "positions_all" on positions;
drop policy if exists "positions_owner_only" on positions;
create policy "positions_owner_only"
on positions
for all
to authenticated
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

drop policy if exists "watchlist_all" on watchlist;
drop policy if exists "watchlist_owner_only" on watchlist;
create policy "watchlist_owner_only"
on watchlist
for all
to authenticated
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

drop policy if exists "reviews_all" on reviews;
drop policy if exists "reviews_owner_only" on reviews;
create policy "reviews_owner_only"
on reviews
for all
to authenticated
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

drop policy if exists "thesis_snapshots_all" on thesis_snapshots;
drop policy if exists "thesis_snapshots_owner_only" on thesis_snapshots;
create policy "thesis_snapshots_owner_only"
on thesis_snapshots
for all
to authenticated
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

drop policy if exists "trade_review_records_all" on trade_review_records;
drop policy if exists "trade_review_records_owner_only" on trade_review_records;
create policy "trade_review_records_owner_only"
on trade_review_records
for all
to authenticated
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

drop policy if exists "behavior_profiles_all" on behavior_profiles;
drop policy if exists "behavior_profiles_owner_only" on behavior_profiles;
create policy "behavior_profiles_owner_only"
on behavior_profiles
for all
to authenticated
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

drop policy if exists "events_all" on events;
drop policy if exists "events_owner_only" on events;
create policy "events_owner_only"
on events
for all
to authenticated
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

drop policy if exists "user_config_all" on user_config;
drop policy if exists "user_config_owner_only" on user_config;
create policy "user_config_owner_only"
on user_config
for all
to authenticated
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

drop policy if exists "automation_runs_all" on automation_runs;
drop policy if exists "automation_runs_owner_only" on automation_runs;
create policy "automation_runs_owner_only"
on automation_runs
for all
to authenticated
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);
