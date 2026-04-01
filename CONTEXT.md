# CONTEXT.md — Decision Log & Roadmap

> Living document. Every major decision and its rationale lives here so future-you (or future-Claude) doesn't re-litigate settled questions.

---

## Product Vision

LOUDMOUTH makes karaoke scoring feel like a real game. Users sing along to songs they actually own, get scored by AI that's analyzing their pitch and timing against the real vocal track (not MIDI), and only get to share their recordings when they're genuinely good (9+/10). The gating mechanism is the hook — it creates aspiration, replay value, and ensures shared content is actually impressive.

---

## Decisions Made

### Music Model: BYO-MP3 ✅ DECIDED

**Decision**: Users buy real songs from iTunes ($0.69–$1.29 each) and import them into the app. We never stream, host, or distribute music.

**Why**:
- Eliminates music licensing entirely — the user owns the file
- iTunes purchases are DRM-free AAC/MP3 since 2009
- Per-song cost is trivial and users already buy music
- No ongoing royalty obligations for us
- Stem separation happens once per song and results are cached forever

**Rejected alternatives**:
- Spotify/Apple Music API: licensing is a nightmare, playback restrictions, can't separate stems from streamed audio
- Licensing catalog directly: cost-prohibitive for a startup, complex negotiations
- MIDI-only: sounds terrible, users hate it, inaccurate scoring baseline

### Stem Separation: AudioShake API ✅ DECIDED

**Decision**: Use AudioShake's API for all stem separation (vocals, instrumental, bass, drums).

**Why**:
- Best-in-class Source-to-Distortion Ratio (SDR 13.5dB)
- Used by major labels (Warner, Universal) — production proven
- Clean API, reasonable latency for a one-time operation
- Outputs clean vocal stem = better scoring baseline

**Rejected alternatives**:
- Demucs (Meta's open-source): good quality but requires GPU server infra we don't want to manage
- Spleeter (Deezer): older, lower quality separation
- On-device separation: not feasible for production quality on mobile hardware

### Stem Caching Strategy ✅ DECIDED

**Decision**: Separate once, cache forever. Stems are stored in Supabase Storage with signed URLs. Raw MP3 stays on-device only.

**Flow**:
1. User imports MP3 → app hashes it (SHA-256)
2. Check Supabase: does this hash already have stems?
   - **Yes**: Download stems from Storage → done
   - **No**: Upload to AudioShake → get stems → store in Supabase Storage → link to hash
3. Stems are user-scoped in Storage (RLS enforced)

**Why**:
- If 100 users import the same song, we only separate it once
- AudioShake costs are per-separation, so deduplication saves real money
- Signed URLs mean stems aren't publicly accessible

### Charity Model ✅ DECIDED (partially)

**Decision**: $0.50/user/month to Feeding America.

**Open**: Possible additional $1/user/month to show choirs or local food shelves — TBD based on feasibility and user research.

### Social Sharing Gate: 9+/10 ✅ DECIDED

**Decision**: Users cannot record or share their singing to social media until they score 9 or higher out of 10.

**Why**:
- Creates a genuine achievement moment ("Now you're good enough!")
- Ensures all shared LOUDMOUTH content is actually impressive — organic marketing
- Drives replay and improvement behavior
- Differentiates from karaoke apps where everyone posts garbage

### Scoring: On-Device ✅ DECIDED

**Decision**: All pitch detection and scoring runs on-device. No network round-trip for real-time analysis.

**Why**:
- Latency kills karaoke UX — even 100ms delay feels wrong
- YIN algorithm is lightweight enough for mobile
- Scoring needs to update in real-time (visual feedback while singing)
- Server validates final scores for leaderboard integrity

### Pricing: TBD ⏳ PENDING

**Blocked on**: AudioShake per-separation cost confirmation. Need to model unit economics before setting subscription price.

**Considerations**:
- Subscription via RevenueCat (monthly/annual)
- Need to cover: AudioShake API costs + Supabase infra + charity commitment + margin
- Free tier possibility: X songs/month with ads? Or purely paid?
- Competitor pricing research needed

---

## Feature Roadmap

### Phase 1 — Core Loop (MVP)

The minimum viable karaoke experience. Ship this first.

| Feature | Status | Notes |
|---------|--------|-------|
| User auth (email + Apple/Google sign-in) | 🔲 Not started | Supabase Auth |
| Song import from device storage | 🔲 Not started | File picker → local storage |
| AudioShake stem separation | 🔲 Not started | Edge Function proxy |
| Stem caching (hash-based dedup) | 🔲 Not started | Supabase Storage |
| Instrumental playback + mic recording | 🔲 Not started | Simultaneous play/record |
| Real-time pitch detection (YIN) | 🔲 Not started | On-device, Web Audio API |
| Basic scoring (pitch + timing → 1-10) | 🔲 Not started | Core algorithm |
| Score history per song | 🔲 Not started | Supabase table |
| Basic UI (library, sing screen, results) | 🔲 Not started | Expo Router tabs |

### Phase 2 — Engagement

Make people come back. Add depth to the experience.

| Feature | Status | Notes |
|---------|--------|-------|
| Advanced detailed scoring engine | 🔲 Not started | Breakdown by section, note-level feedback |
| Voice lesson plans | 🔲 Not started | Structured curriculum, progressive difficulty |
| Show choir lesson plans | 🔲 Not started | Choir-specific curriculum |
| Social media recording/sharing | 🔲 Not started | **Gated at 9+/10 score** |
| Subscription + payments | 🔲 Not started | RevenueCat integration |
| Leaderboards | 🔲 Not started | Per-song and global |

### Phase 3 — Expansion

Big swings. These extend the product into new territory.

| Feature | Status | Notes |
|---------|--------|-------|
| A cappella mode | 🔲 Not started | No music, just lyrics displayed |
| Virtual AI vocal coaching agent | 🔲 Not started | AI-powered personalized coaching |
| Duet/group mode | 🔲 Not started | Multiple singers, split scoring |
| Lyrics display (synced) | 🔲 Not started | May need third-party lyrics API |

---

## Open Questions

1. **AudioShake pricing** — What's the per-separation cost? This determines our unit economics and subscription pricing.
2. **Charity $1/month add-on** — Is $1/user/month to show choirs / local food shelf feasible? How do we select recipients?
3. **Free tier** — Do we offer a free tier with limited songs? Or is it subscription-only?
4. **Lyrics source** — Where do synced lyrics come from? Musixmatch API? User-submitted? Generated from vocal stem?
5. **Offline mode** — Should the app work fully offline after stems are cached? Or always require connectivity?
6. **Audio latency calibration** — Different devices have different mic-to-speaker latency. Do we need a calibration step?
7. **Anti-cheat for leaderboards** — How do we prevent people from playing the original vocal track into the mic to get a perfect score?

---

## Technical Debt & Known Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| AudioShake API goes down / changes pricing | High | Abstract behind interface; could swap to Demucs self-hosted as fallback |
| Apple rejects app for music-related policy | Medium | BYO-MP3 model should be fine; document clearly in App Store review notes |
| Pitch detection accuracy varies by device mic | Medium | Calibration flow + normalize input levels |
| Supabase Storage costs at scale | Low | Stem deduplication keeps storage bounded; monitor per-user storage |
| RevenueCat adds fees / changes terms | Low | Standard in the industry; IAP logic is portable |

---

## Changelog

| Date | What Changed | Why |
|------|-------------|-----|
| (project start) | Initial decisions documented | Establishing project foundation |
