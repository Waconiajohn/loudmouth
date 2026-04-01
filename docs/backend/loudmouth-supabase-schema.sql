-- ═══════════════════════════════════════════════════════════════════════
--  LOUDMOUTH — Supabase Database Schema
--  Version: 1.0
--  Last updated: 2026-03
-- ═══════════════════════════════════════════════════════════════════════
--
--  TABLES:
--    1. profiles          — user accounts (extends Supabase auth.users)
--    2. songs             — the song catalog
--    3. song_stems        — processed audio file references (S3/Storage)
--    4. purchases         — song purchases (one-time)
--    5. subscriptions     — $3.99/month subscribers
--    6. sessions          — individual sing-through attempts
--    7. session_scores    — 4-dimension scores per session
--    8. leaderboard       — top scores per song (computed)
--    9. processing_queue  — songs being processed by Demucs+Whisper
--   10. artist_payouts    — track what each artist is owed
--   11. charity_log       — Feeding America meal count tracker
--
-- ═══════════════════════════════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ───────────────────────────────────────────────────────────────────────
--  1. PROFILES
--     Extends Supabase's built-in auth.users
-- ───────────────────────────────────────────────────────────────────────
create table public.profiles (
  id              uuid references auth.users(id) on delete cascade primary key,
  username        text unique,
  display_name    text,
  avatar_url      text,

  -- Subscription status
  is_subscriber   boolean default false,
  sub_started_at  timestamptz,
  sub_ends_at     timestamptz,
  sub_provider    text,                        -- 'stripe' | 'apple' | 'google'
  sub_external_id text,                        -- Stripe subscription ID

  -- Free tier tracking
  free_songs_used_this_month  int default 0,
  free_tier_reset_at          timestamptz default (date_trunc('month', now()) + interval '1 month'),

  -- Credits balance (for song store)
  credits_cents   int default 0,              -- stored in cents; $1.99 = 199

  -- Singer stats
  total_sessions  int default 0,
  best_tier_reached text default 'TRAIN WRECK', -- highest tier ever achieved

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ───────────────────────────────────────────────────────────────────────
--  2. SONGS
-- ───────────────────────────────────────────────────────────────────────
create table public.songs (
  id              uuid default uuid_generate_v4() primary key,

  -- Metadata
  title           text not null,
  artist          text not null,
  album           text,
  release_year    int,
  duration_sec    int,                         -- song length in seconds
  genre           text,                        -- 'rock', 'metal', 'pop', etc.
  emoji           text default '🎤',

  -- Pricing
  price_cents     int not null default 129,    -- 129 = $1.29, 199 = $1.99, 0 = free
  is_free_tier    boolean default false,       -- available on free tier

  -- Difficulty (1–5)
  difficulty      int default 3 check (difficulty between 1 and 5),

  -- Processing status
  status          text default 'pending'
                  check (status in ('pending','processing','ready','error')),
  processed_at    timestamptz,

  -- Genius / external IDs
  genius_song_id  bigint,
  isrc            text,                        -- International Standard Recording Code

  -- Stats
  total_purchases int default 0,
  total_sessions  int default 0,
  avg_user_score  numeric(4,2),

  -- Artist payout info
  artist_email    text,                        -- direct payout email (bypasses label)
  artist_payout_cents int default 100,        -- $1.00 per subscriber who has this song

  -- Catalog flags
  is_active       boolean default true,
  is_featured     boolean default false,
  featured_order  int,

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index songs_genre_idx      on public.songs(genre);
create index songs_status_idx     on public.songs(status);
create index songs_featured_idx   on public.songs(is_featured, featured_order);

-- ───────────────────────────────────────────────────────────────────────
--  3. SONG STEMS
--     References to processed audio stored in Supabase Storage
-- ───────────────────────────────────────────────────────────────────────
create table public.song_stems (
  id              uuid default uuid_generate_v4() primary key,
  song_id         uuid references public.songs(id) on delete cascade not null,

  -- Supabase Storage paths
  original_path   text,     -- original upload (may be deleted after processing)
  vocals_path     text,     -- Demucs: isolated vocals
  backing_path    text,     -- Demucs: everything except vocals (instruments)
  full_mix_path   text,     -- Original mix for playback

  -- Whisper output
  whisper_json_path text,   -- raw Whisper word timestamps JSON
  lyric_map_path    text,   -- processed lyric map JSON (our format)

  -- File sizes (bytes)
  vocals_size     bigint,
  backing_size    bigint,
  full_mix_size   bigint,

  -- Audio metadata
  sample_rate     int default 44100,
  bit_depth       int default 16,
  format          text default 'mp3',          -- 'mp3' | 'wav' | 'aac'

  created_at      timestamptz default now()
);

create index song_stems_song_id_idx on public.song_stems(song_id);

-- ───────────────────────────────────────────────────────────────────────
--  4. PURCHASES
--     One-time song purchases through the Song Store
-- ───────────────────────────────────────────────────────────────────────
create table public.purchases (
  id              uuid default uuid_generate_v4() primary key,
  user_id         uuid references public.profiles(id) on delete cascade not null,
  song_id         uuid references public.songs(id) on delete restrict not null,

  -- Payment
  amount_cents    int not null,
  payment_provider text,                       -- 'stripe' | 'apple' | 'google'
  payment_ref     text,                        -- external transaction ID

  -- Payout tracking
  artist_payout_cents  int,
  charity_payout_cents int,
  payout_processed     boolean default false,

  purchased_at    timestamptz default now(),

  unique (user_id, song_id)                    -- one purchase per user per song
);

create index purchases_user_id_idx on public.purchases(user_id);
create index purchases_song_id_idx on public.purchases(song_id);

-- ───────────────────────────────────────────────────────────────────────
--  5. SUBSCRIPTIONS
-- ───────────────────────────────────────────────────────────────────────
create table public.subscriptions (
  id              uuid default uuid_generate_v4() primary key,
  user_id         uuid references public.profiles(id) on delete cascade not null,

  status          text default 'active'
                  check (status in ('active','cancelled','past_due','trialing')),
  plan            text default 'monthly'
                  check (plan in ('monthly','annual')),

  amount_cents    int not null,                -- 399 monthly, 3499 annual
  provider        text not null,              -- 'stripe' | 'apple' | 'google'
  provider_sub_id text,                        -- e.g. Stripe sub_xxxxx

  -- Payout split (cents per month per subscriber)
  artist_pool_cents  int default 100,         -- $1.00 → artist pool
  charity_cents      int default 50,          -- $0.50 → Feeding America
  revenue_cents      int default 249,         -- $2.49 → LOUDMOUTH

  started_at      timestamptz default now(),
  current_period_end timestamptz,
  cancelled_at    timestamptz,

  created_at      timestamptz default now()
);

create index subs_user_id_idx   on public.subscriptions(user_id);
create index subs_status_idx    on public.subscriptions(status);

-- ───────────────────────────────────────────────────────────────────────
--  6. SESSIONS
--     One row per "sing-through" attempt
-- ───────────────────────────────────────────────────────────────────────
create table public.sessions (
  id              uuid default uuid_generate_v4() primary key,
  user_id         uuid references public.profiles(id) on delete cascade not null,
  song_id         uuid references public.songs(id) on delete restrict not null,

  -- Playback settings
  vas_value       int default 50               -- Vocal Assist Slider 0–100 (0=Legend,100=Train Wreck)
                  check (vas_value between 0 and 100),
  playback_speed  numeric(3,1) default 1.0,    -- 1.0 | 1.5 | 2.0 | 3.0
  tier_name       text,                        -- 'LEGEND' | 'FRONT MAN' | etc.

  -- Completion
  completed       boolean default false,       -- did they reach end of song?
  duration_sec    int,                         -- how long they actually sang

  -- Aggregate scores (0.0–10.0)
  score_you       numeric(4,2),
  score_artist    numeric(4,2),

  -- Metadata
  device_type     text,                        -- 'mobile' | 'desktop'

  started_at      timestamptz default now(),
  completed_at    timestamptz
);

create index sessions_user_id_idx on public.sessions(user_id);
create index sessions_song_id_idx on public.sessions(song_id);
create index sessions_started_at_idx on public.sessions(started_at desc);

-- ───────────────────────────────────────────────────────────────────────
--  7. SESSION SCORES
--     4-dimension breakdown per session
-- ───────────────────────────────────────────────────────────────────────
create table public.session_scores (
  id              uuid default uuid_generate_v4() primary key,
  session_id      uuid references public.sessions(id) on delete cascade not null,

  -- Four dimensions (0.0–10.0 each)
  pitch_score     numeric(4,2),   -- how accurately you hit the notes
  timing_score    numeric(4,2),   -- how well you hit words on beat
  clarity_score   numeric(4,2),   -- clean signal, minimal noise
  dynamics_score  numeric(4,2),   -- soft/loud variation matching artist

  -- Artist scores for same dimensions (for comparison)
  artist_pitch    numeric(4,2),
  artist_timing   numeric(4,2),
  artist_clarity  numeric(4,2),
  artist_dynamics numeric(4,2),

  -- Section-level breakdown (JSON array of {section, score, artist_score})
  section_breakdown jsonb,

  created_at      timestamptz default now()
);

create index session_scores_session_id_idx on public.session_scores(session_id);

-- ───────────────────────────────────────────────────────────────────────
--  8. LEADERBOARD
--     Top scores per song — computed/updated via trigger
-- ───────────────────────────────────────────────────────────────────────
create table public.leaderboard (
  id              uuid default uuid_generate_v4() primary key,
  song_id         uuid references public.songs(id) on delete cascade not null,
  user_id         uuid references public.profiles(id) on delete cascade not null,
  display_name    text,

  best_score      numeric(4,2) not null,
  vas_value       int,           -- what slider setting they used
  tier_name       text,

  achieved_at     timestamptz,

  unique (song_id, user_id)      -- one leaderboard entry per user per song
);

create index leaderboard_song_idx  on public.leaderboard(song_id, best_score desc);
create index leaderboard_user_idx  on public.leaderboard(user_id);

-- ───────────────────────────────────────────────────────────────────────
--  9. PROCESSING QUEUE
--     Tracks Demucs + Whisper pipeline jobs
-- ───────────────────────────────────────────────────────────────────────
create table public.processing_queue (
  id              uuid default uuid_generate_v4() primary key,
  song_id         uuid references public.songs(id) on delete cascade not null,

  status          text default 'queued'
                  check (status in ('queued','demucs_running','whisper_running','mapping','done','failed')),

  -- Timing
  queued_at       timestamptz default now(),
  started_at      timestamptz,
  completed_at    timestamptz,

  -- Error info
  error_message   text,
  retry_count     int default 0,

  -- Source file
  source_url      text,          -- where the original file came from
  source_type     text           -- 'upload' | 'url'
);

-- ───────────────────────────────────────────────────────────────────────
--  10. ARTIST PAYOUTS
--      Track what each artist is owed per billing cycle
-- ───────────────────────────────────────────────────────────────────────
create table public.artist_payouts (
  id              uuid default uuid_generate_v4() primary key,
  artist_name     text not null,
  artist_email    text,

  billing_period  text not null,               -- e.g. '2026-03'
  songs_in_catalog int default 0,
  subscriber_count int default 0,              -- subscribers who own at least one song by this artist
  amount_cents    int default 0,               -- total owed for this period

  status          text default 'pending'
                  check (status in ('pending','processing','paid','failed')),
  paid_at         timestamptz,
  payment_ref     text,

  created_at      timestamptz default now()
);

-- ───────────────────────────────────────────────────────────────────────
--  11. CHARITY LOG
--      Feeding America meal tracker — good for PR
-- ───────────────────────────────────────────────────────────────────────
create table public.charity_log (
  id              uuid default uuid_generate_v4() primary key,
  billing_period  text not null,               -- '2026-03'
  subscriber_count int,
  amount_cents    int,                         -- $0.50 × subscribers
  meals_count     int,                         -- amount_cents / 9 cents per meal ≈ 5.5 meals/$0.50

  status          text default 'pending'
                  check (status in ('pending','donated','failed')),
  donated_at      timestamptz,
  donation_ref    text,

  created_at      timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════

alter table public.profiles         enable row level security;
alter table public.purchases        enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.sessions         enable row level security;
alter table public.session_scores   enable row level security;

-- Profiles: users can only read/write their own
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Purchases: users can only see their own
create policy "Users can view own purchases"
  on public.purchases for select using (auth.uid() = user_id);
create policy "Users can insert own purchases"
  on public.purchases for insert with check (auth.uid() = user_id);

-- Sessions: users can only see their own
create policy "Users can view own sessions"
  on public.sessions for select using (auth.uid() = user_id);
create policy "Users can insert own sessions"
  on public.sessions for insert with check (auth.uid() = user_id);
create policy "Users can update own sessions"
  on public.sessions for update using (auth.uid() = user_id);

-- Session scores: tied to sessions user owns
create policy "Users can view own session scores"
  on public.session_scores for select
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id and s.user_id = auth.uid()
  ));

-- Songs and leaderboard: publicly readable
create policy "Songs are publicly readable"
  on public.songs for select using (is_active = true);
alter table public.songs enable row level security;

create policy "Leaderboard is publicly readable"
  on public.leaderboard for select using (true);
alter table public.leaderboard enable row level security;

-- ═══════════════════════════════════════════════════════════════════════
--  HELPFUL VIEWS
-- ═══════════════════════════════════════════════════════════════════════

-- Song catalog with stem status
create view public.song_catalog as
  select
    s.id,
    s.title,
    s.artist,
    s.genre,
    s.emoji,
    s.price_cents,
    s.is_free_tier,
    s.difficulty,
    s.status,
    s.total_sessions,
    s.avg_user_score,
    s.is_featured,
    st.vocals_path,
    st.backing_path,
    st.lyric_map_path
  from public.songs s
  left join public.song_stems st on st.song_id = s.id
  where s.is_active = true and s.status = 'ready';

-- User library (songs they own or are on free tier)
create view public.user_library as
  select
    p.user_id,
    s.id as song_id,
    s.title,
    s.artist,
    s.emoji,
    s.difficulty,
    s.status,
    coalesce(sess.best_score, 0) as best_score,
    sess.session_count
  from public.purchases p
  join public.songs s on s.id = p.song_id
  left join (
    select song_id, user_id,
           max(score_you) as best_score,
           count(*) as session_count
    from public.sessions
    where completed = true
    group by song_id, user_id
  ) sess on sess.song_id = s.id and sess.user_id = p.user_id;

-- Total meals donated (for display on marketing page)
create view public.charity_total as
  select
    sum(meals_count) as total_meals,
    sum(amount_cents) / 100.0 as total_dollars,
    count(*) as billing_periods
  from public.charity_log
  where status = 'donated';

-- ═══════════════════════════════════════════════════════════════════════
--  SAMPLE DATA — a handful of songs to start
-- ═══════════════════════════════════════════════════════════════════════

insert into public.songs (title, artist, genre, emoji, price_cents, difficulty, status, is_featured, featured_order)
values
  ('Down With The Sickness', 'Disturbed',      'metal',         '🤘', 0,   4, 'ready', true,  1),
  ('Livin'' on a Prayer',    'Bon Jovi',        'rock',          '🎸', 129, 3, 'ready', true,  2),
  ('Don''t Stop Believin''', 'Journey',         'classic rock',  '🎹', 129, 3, 'ready', true,  3),
  ('Bohemian Rhapsody',      'Queen',           'classic rock',  '👑', 199, 5, 'ready', true,  4),
  ('Mr. Brightside',         'The Killers',     'rock',          '🌅', 129, 2, 'ready', false, null),
  ('Sweet Child O'' Mine',   'Guns N'' Roses',  'classic rock',  '🌹', 129, 4, 'ready', false, null),
  ('Enter Sandman',          'Metallica',       'metal',         '😴', 199, 4, 'ready', false, null),
  ('I Will Survive',         'Gloria Gaynor',   'karaoke classics','💪',129, 2, 'ready', false, null),
  ('Wonderwall',             'Oasis',           'rock',          '🧱', 129, 2, 'ready', false, null),
  ('Africa',                 'Toto',            '80s',           '🌍', 129, 3, 'ready', false, null);
