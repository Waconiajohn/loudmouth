# ARCHITECTURE.md — System Design

> How LOUDMOUTH is built, how data flows, and why each piece exists.
> Updated 2026-03-31 to reflect the actual deployed Supabase schema (11 tables).

---

## System Overview

LOUDMOUTH is a mobile-first application with a thin backend. The core audio processing (pitch detection, scoring) runs entirely on-device for latency reasons. The backend handles authentication, data persistence, stem storage, and proxying to third-party APIs (AudioShake, RevenueCat webhooks).

```
┌─────────────────────────────────────────────────────────────┐
│                        MOBILE APP                           │
│                    (React Native / Expo)                     │
│                                                             │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ Song     │  │ Singing      │  │ Scoring Engine     │    │
│  │ Library  │  │ Session      │  │ (on-device)        │    │
│  │          │  │              │  │                    │    │
│  │ • Import │  │ • Play inst. │  │ • YIN pitch detect │    │
│  │ • Browse │  │ • Record mic │  │ • Timing analysis  │    │
│  │ • Delete │  │ • Live viz   │  │ • Score compute    │    │
│  └────┬─────┘  └──────┬───────┘  └─────────┬──────────┘    │
│       │               │                     │               │
│  ┌────┴───────────────┴─────────────────────┴────────────┐  │
│  │                    Zustand Store                       │  │
│  │  • Auth state  • Current song  • Playback state       │  │
│  │  • Recording buffer  • Live score  • UI state         │  │
│  └───────────────────────┬───────────────────────────────┘  │
│                          │                                  │
│  ┌───────────────────────┴───────────────────────────────┐  │
│  │              TanStack Query (Server State)            │  │
│  │  • Song library  • Score history  • Leaderboards      │  │
│  │  • User profile  • Subscription status                │  │
│  └───────────────────────┬───────────────────────────────┘  │
└──────────────────────────┼──────────────────────────────────┘
                           │
                    HTTPS / WebSocket
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                     SUPABASE                                │
│                                                             │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Auth       │  │ Postgres DB  │  │ Storage            │  │
│  │            │  │ (11 tables)  │  │                    │  │
│  │ • Email    │  │              │  │ • stems/           │  │
│  │ • Apple    │  │ See schema   │  │   {song}/vocal.mp3 │  │
│  │ • Google   │  │ below        │  │   {song}/inst.mp3  │  │
│  │            │  │              │  │ • originals/       │  │
│  └────────────┘  └──────────────┘  └────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Edge Functions                           │   │
│  │                                                      │   │
│  │  separate-stems/    → Proxy to AudioShake API        │   │
│  │  process-webhook/   → RevenueCat payment events      │   │
│  │  submit-score/      → Validate + store + leaderboard │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                    External APIs
                           │
            ┌──────────────┼──────────────┐
            │              │              │
      ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐
      │ AudioShake│ │ RevenueCat│ │ Apple /   │
      │ API       │ │ API       │ │ Google IAP│
      └───────────┘ └───────────┘ └───────────┘
```

---

## Data Flow: Song Import & Stem Separation

This is the most complex flow in the app. It happens once per unique song.

```
User taps "Import Song"
        │
        ▼
┌─────────────────┐
│ File Picker      │  ← iOS: DocumentPicker / Android: SAF
│ (on device)      │
└────────┬────────┘
         │ MP3/AAC file
         ▼
┌─────────────────┐
│ Create song row  │  ← songs table (status: 'pending')
│ in Supabase      │
└────────┬────────┘
         │ song_id
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Check song_stems │────▶│ Stems exist?    │
│ table            │     └────────┬────────┘
└─────────────────┘              │
                          Yes ◄──┴──► No
                           │          │
                           ▼          ▼
                    ┌────────┐  ┌──────────────┐
                    │Download│  │ Upload to     │
                    │stems   │  │ Edge Function │
                    │from    │  │ separate-stems│
                    │Storage │  └───────┬──────┘
                    └────┬───┘          │
                         │              ▼
                         │     ┌──────────────┐
                         │     │ AudioShake    │ ← processing_queue
                         │     │ separates     │   tracks status
                         │     │ stems         │
                         │     └───────┬──────┘
                         │             │ vocal + instrumental stems
                         │             ▼
                         │     ┌──────────────┐
                         │     │ Store stems   │ ← Supabase Storage
                         │     │ Write paths   │ ← song_stems table
                         │     │ Mark ready    │ ← songs.status = 'ready'
                         │     └───────┬──────┘
                         │             │
                         ▼             ▼
                    ┌─────────────────────┐
                    │ Cache stems locally  │
                    │ Song ready to sing   │
                    └─────────────────────┘
```

---

## Data Flow: Singing Session

Real-time flow during active singing. All scoring is on-device.

```
┌─────────────┐         ┌──────────────┐
│ Instrumental │         │ Microphone   │
│ Stem Playback│         │ Input        │
│ (speaker)    │         │ (recording)  │
└──────┬──────┘         └──────┬───────┘
       │                       │
       │ audio frames          │ audio frames
       │ (reference timing)    │ (user voice)
       ▼                       ▼
┌─────────────────────────────────────────┐
│           Pitch Detector (YIN)           │
│                                         │
│  Reference vocal stem ──► expected pitch │
│  User mic input ────────► detected pitch │
│                                         │
│  Compare: pitch accuracy + timing offset │
└─────────────────────┬───────────────────┘
                      │
                      ▼ (every ~50ms)
               ┌──────────────┐
               │ Live Score   │
               │ Update       │──► Visual feedback
               │ (Zustand)    │    (pitch bar, accuracy %)
               └──────┬───────┘
                      │
                      │ (song ends)
                      ▼
               ┌──────────────┐
               │ Final Score  │  4D: pitch (40%), timing (25%),
               │ Computation  │      clarity (20%), dynamics (15%)
               │ (1-10 scale) │
               └──────┬───────┘
                      │
                      ▼
               ┌──────────────┐     ┌──────────────┐
               │ Display      │     │ Submit to     │
               │ Results      │     │ Supabase      │
               │ Screen       │     │ sessions +    │
               │              │     │ session_scores │
               └──────────────┘     └──────────────┘
```

---

## Database Schema (Deployed — 11 Tables)

Supabase project: `qslrhgtkxxhesazipcbs` (us-east-1)
All tables have RLS enabled.

### Table Relationships

```
auth.users
    │
    ▼
profiles (1:1)
    │
    ├──► sessions ──► session_scores (1:1)
    ├──► purchases
    ├──► subscriptions
    └──► leaderboard
              │
songs ◄───────┘
    │
    ├──► song_stems (1:1)
    └──► processing_queue (1:1)

artist_payouts (standalone)
charity_log (standalone)
```

### profiles
Extends `auth.users`. Stores subscription state, tier progression, and free-tier tracking.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | References `auth.users(id)` |
| username | text | Unique, nullable |
| display_name | text | |
| avatar_url | text | |
| is_subscriber | boolean | Default `false` |
| sub_started_at | timestamptz | |
| sub_ends_at | timestamptz | |
| sub_provider | text | 'stripe', 'apple', 'google' |
| sub_external_id | text | RevenueCat subscriber ID |
| free_songs_used_this_month | integer | Default `0` |
| free_tier_reset_at | timestamptz | Auto-set to next month start |
| credits_cents | integer | Default `0` |
| total_sessions | integer | Lifetime session count |
| best_tier_reached | text | Default `'TRAIN WRECK'` |
| created_at, updated_at | timestamptz | |

### songs
Song catalog. Admin-managed. 10 songs currently seeded.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| title | text | Required |
| artist | text | Required |
| album | text | |
| release_year | integer | |
| duration_sec | integer | |
| genre | text | |
| emoji | text | Default `'🎤'` |
| price_cents | integer | Default `129` ($1.29 iTunes) |
| is_free_tier | boolean | Available without subscription |
| difficulty | integer | 1-5, default 3 |
| status | text | `pending` / `processing` / `ready` / `error` |
| processed_at | timestamptz | When stems were ready |
| genius_song_id | bigint | Genius API reference |
| isrc | text | International Standard Recording Code |
| total_purchases | integer | Running count |
| total_sessions | integer | Running count |
| avg_user_score | numeric | Aggregate stat |
| artist_email | text | For payouts |
| artist_payout_cents | integer | Default `100` ($1.00/month) |
| is_active | boolean | Soft visibility toggle |
| is_featured | boolean | Featured on home screen |
| featured_order | integer | Sort order for featured |
| created_at, updated_at | timestamptz | |

### song_stems
One-to-one with `songs`. Stores Supabase Storage paths for separated stems.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| song_id | UUID FK | References `songs(id)` |
| original_path | text | Storage path to original upload |
| vocals_path | text | Storage path to vocal stem |
| backing_path | text | Storage path to instrumental |
| full_mix_path | text | Storage path to full mix |
| whisper_json_path | text | Whisper transcript JSON |
| lyric_map_path | text | Processed lyric map JSON |
| vocals_size, backing_size, full_mix_size | bigint | File sizes in bytes |
| sample_rate | integer | Default `44100` |
| bit_depth | integer | Default `16` |
| format | text | Default `'mp3'` |
| created_at | timestamptz | |

### sessions
One row per singing session. Captures VAS position, scores, duration.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | References `profiles(id)` |
| song_id | UUID FK | References `songs(id)` |
| vas_value | integer | 0-100, default `50` |
| playback_speed | numeric | Default `1.0` |
| tier_name | text | Computed from VAS value |
| completed | boolean | Default `false` |
| duration_sec | integer | Actual duration sung |
| score_you | numeric | User's composite score (1-10) |
| score_artist | numeric | Seeded artist score |
| device_type | text | iOS/Android/web |
| started_at | timestamptz | |
| completed_at | timestamptz | |

### session_scores
Detailed 4D scoring breakdown per session. Both user and artist dimensions.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| session_id | UUID FK | References `sessions(id)` |
| pitch_score | numeric | User pitch accuracy |
| timing_score | numeric | User timing accuracy |
| clarity_score | numeric | User clarity/tone |
| dynamics_score | numeric | User dynamic range |
| artist_pitch | numeric | Artist seed score |
| artist_timing | numeric | Artist seed score |
| artist_clarity | numeric | Artist seed score |
| artist_dynamics | numeric | Artist seed score |
| section_breakdown | jsonb | Per-section scores |
| created_at | timestamptz | |

### purchases
Records song purchases (iTunes imports) with payout tracking.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | References `profiles(id)` |
| song_id | UUID FK | References `songs(id)` |
| amount_cents | integer | What user paid on iTunes |
| payment_provider | text | 'itunes', etc. |
| payment_ref | text | External transaction ID |
| artist_payout_cents | integer | Amount owed to artist |
| charity_payout_cents | integer | Amount owed to charity |
| payout_processed | boolean | Default `false` |
| purchased_at | timestamptz | |

### subscriptions
Subscription lifecycle management. One active subscription per user.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | References `profiles(id)` |
| status | text | `active` / `cancelled` / `past_due` / `trialing` |
| plan | text | `monthly` / `annual` |
| amount_cents | integer | Subscription price |
| provider | text | 'apple', 'google', 'stripe' |
| provider_sub_id | text | RevenueCat subscription ID |
| artist_pool_cents | integer | Default `100` ($1.00) |
| charity_cents | integer | Default `50` ($0.50) |
| revenue_cents | integer | Default `249` (LOUDMOUTH share) |
| started_at | timestamptz | |
| current_period_end | timestamptz | |
| cancelled_at | timestamptz | |
| created_at | timestamptz | |

### leaderboard
Per-song top scores. Denormalized for fast reads.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| song_id | UUID FK | References `songs(id)` |
| user_id | UUID FK | References `profiles(id)` |
| display_name | text | Snapshot at time of score |
| best_score | numeric | Highest composite score |
| vas_value | integer | VAS position when achieved |
| tier_name | text | Tier when achieved |
| achieved_at | timestamptz | |

### processing_queue
Tracks stem separation pipeline status per song.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| song_id | UUID FK | References `songs(id)` |
| status | text | `queued` / `demucs_running` / `whisper_running` / `mapping` / `done` / `failed` |
| queued_at | timestamptz | |
| started_at | timestamptz | |
| completed_at | timestamptz | |
| error_message | text | |
| retry_count | integer | Default `0` |
| source_url | text | Original upload URL |
| source_type | text | |

### artist_payouts
Monthly artist payout tracking. Standalone (no user FK).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| artist_name | text | |
| artist_email | text | |
| billing_period | text | e.g. '2026-04' |
| songs_in_catalog | integer | |
| subscriber_count | integer | |
| amount_cents | integer | |
| status | text | `pending` / `processing` / `paid` / `failed` |
| paid_at | timestamptz | |
| payment_ref | text | |
| created_at | timestamptz | |

### charity_log
Monthly charity donation tracking (Feeding America). Standalone.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| billing_period | text | e.g. '2026-04' |
| subscriber_count | integer | |
| amount_cents | integer | |
| meals_count | integer | Calculated: $0.50 = ~11 meals |
| status | text | `pending` / `donated` / `failed` |
| donated_at | timestamptz | |
| donation_ref | text | |
| created_at | timestamptz | |

---

## Edge Functions

### `separate-stems`

Proxies stem separation requests to AudioShake. Keeps the API key server-side.

```
POST /functions/v1/separate-stems
Authorization: Bearer <supabase-jwt>
Body: { song_id: string }

1. Verify JWT
2. Look up song in songs table
3. Check song_stems for existing stems → return early if found
4. Upload original to AudioShake API
5. Download stems, store in Supabase Storage at stems/{song_id}/
6. Insert/update song_stems row with storage paths
7. Update songs.status → 'ready', songs.processed_at → now()
8. Update processing_queue status → 'done'
9. Return signed URLs for stems
```

### `process-webhook`

Handles RevenueCat server-to-server webhooks for subscription events.

```
POST /functions/v1/process-webhook
X-RevenueCat-Signature: <hmac>

1. Verify HMAC signature with REVENUECAT_WEBHOOK_SECRET
2. Parse event type (INITIAL_PURCHASE, RENEWAL, CANCELLATION, etc.)
3. Upsert subscriptions row (status, current_period_end, etc.)
4. Update profiles (is_subscriber, sub_ends_at, sub_provider)
5. Log event for analytics
```

### `submit-score`

Validates and persists scores. Prevents trivial cheating.

```
POST /functions/v1/submit-score
Authorization: Bearer <supabase-jwt>
Body: {
  session_id, song_id,
  score_you, score_artist,
  pitch_score, timing_score, clarity_score, dynamics_score,
  artist_pitch, artist_timing, artist_clarity, artist_dynamics,
  section_breakdown, proof_hash
}

1. Verify JWT → get user_id
2. Validate score ranges (0-10 composite, 0-1 dimensions)
3. Verify proof_hash (hash of scoring inputs — basic anti-tamper)
4. Update sessions row (completed, score_you, score_artist, completed_at)
5. Insert session_scores row
6. Increment profiles.total_sessions and songs.total_sessions
7. Update songs.avg_user_score
8. If score >= 9.0, upsert leaderboard entry
9. Return updated leaderboard position
```

---

## Audio Pipeline Detail

### Pitch Detection: YIN Algorithm

The YIN algorithm detects fundamental frequency (F0) from audio frames. We chose YIN over FFT-based approaches because it handles human voice better and has lower latency for real-time use.

```
Audio Frame (2048 samples @ 44.1kHz ≈ 46ms)
        │
        ▼
┌─────────────────────────┐
│ 1. Difference Function   │  Autocorrelation variant
├─────────────────────────┤
│ 2. Cumulative Mean       │  Normalize the difference
│    Normalized Difference  │
├─────────────────────────┤
│ 3. Absolute Threshold    │  Find first dip below 0.1
├─────────────────────────┤
│ 4. Parabolic             │  Sub-sample accuracy
│    Interpolation          │
└────────────┬────────────┘
             │
             ▼
      Detected Pitch (Hz)
      Confidence (0.0-1.0)
```

### Scoring Algorithm

```
For each ~50ms frame:
  1. Get expected pitch from vocal stem (reference)
  2. Get detected pitch from mic input (user)
  3. Compute pitch distance in cents: 1200 * log2(detected / expected)
  4. Compute timing offset from onset detection
  5. Frame score = weighted(pitch_accuracy, timing_accuracy)

Final score:
  1. Aggregate all frame scores
  2. Weight by musical importance (held notes > passing tones)
  3. Apply section weighting (chorus may count more)
  4. Map to 1-10 scale with calibrated curve
```

**Score weights:** pitch (40%) + timing (25%) + clarity (20%) + dynamics (15%)

The scoring curve is intentionally calibrated so that:
- 1-3: You're basically talking, not singing
- 4-6: Recognizable attempt, noticeable pitch issues
- 7-8: Good singer, minor issues
- 9-10: Genuinely impressive, share-worthy performance

**Artist score seeding:** Artist scores are seeded by section difficulty with random variation, so users can genuinely beat the artist:
- verse: 7.8, bridge: 7.2, chorus: 6.9, outro: 7.5 (base values, ±0.3 random)

---

## Vocal Assist Slider (VAS)

The core UX mechanic. Maps 0-100 slider to named tiers:

| Slider | Tier | Artist Blend | Description |
|--------|------|-------------|-------------|
| 0-15% | LEGEND | 10% artist | You don't need help |
| 15-35% | FRONT MAN | 25% artist | Strong singer, light polish |
| 35-65% | KARAOKE HERO | 50% artist | Natural default |
| 65-85% | SHOWER SINGER | 75% artist | Building confidence |
| 85-100% | TRAIN WRECK | 90% artist | No judgment |

---

## Security Model

| Concern | Mitigation |
|---------|-----------|
| API keys exposed to client | AudioShake key lives only in Edge Functions; client never sees it |
| User data leakage | RLS on all 11 tables; users can only access their own data |
| Stem storage unauthorized access | Supabase Storage with signed URLs (time-limited) |
| Score manipulation | Server-side validation in submit-score Edge Function + proof hash |
| Payment fraud | RevenueCat handles receipt validation; we verify via webhook |
| Replay attacks on score submission | Unique proof_hash per session + rate limiting on Edge Function |

---

## Performance Targets

| Metric | Target | Why |
|--------|--------|-----|
| Audio latency (mic to pitch detect) | < 50ms | Imperceptible to singer |
| Pitch detection accuracy | > 95% on clean vocal | Must be trustworthy for scoring |
| Stem separation time | < 60s per song | One-time cost, acceptable wait |
| App cold start | < 2s | Standard mobile expectation |
| Score submission round-trip | < 500ms | Results should feel instant |
| Stem download (cached) | < 5s on LTE | Returning users shouldn't wait |

---

## Scalability Notes

The architecture is intentionally simple for MVP. Here's what changes at scale:

- **10K users**: Current architecture handles this fine. Supabase free/pro tier.
- **100K users**: Stem dedup becomes very valuable. Monitor AudioShake costs. Consider CDN for stem delivery. Leaderboard queries may need materialized views.
- **1M+ users**: May need to self-host stem separation (Demucs on GPU instances) to control costs. Consider Supabase Enterprise or self-hosted Postgres. Read replicas for leaderboards.

We deliberately chose managed services (Supabase, AudioShake, RevenueCat) to avoid premature infrastructure investment. Every piece can be swapped later behind clean interfaces.
