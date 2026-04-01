# Architecture Decision Records — LOUDMOUTH

---

## ADR-001: BYO-MP3 Music Model
**Date:** 2026-03-31
**Status:** Accepted
**Context:** Need access to real artist recordings for scoring. Streaming APIs (Spotify, Apple Music) prohibit stem separation. Label licensing is cost-prohibitive pre-revenue.
**Decision:** Users buy songs from iTunes ($0.69-$1.29) and import DRM-free AAC/MP3 files. App processes them on-device.
**Reasoning:** No licensing obligations, user owns the file, proven model (Voloco, djay Pro). Entertainment lawyer review recommended before charging users.
**Consequences:** Users must acquire songs separately. iTunes affiliate program provides revenue share (2.5-7%).

## ADR-002: AudioShake for Stem Separation
**Date:** 2026-03-31
**Status:** Accepted
**Context:** Need high-quality vocal/instrumental separation. Demucs requires GPU server infra.
**Decision:** Use AudioShake API for all stem separation, proxied through Supabase Edge Function.
**Reasoning:** Best-in-class SDR (13.5dB), used by major labels, clean API. Pricing pending negotiation ($0.25-$0.50/user/month).
**Consequences:** External dependency on AudioShake. Abstract behind interface for potential future swap to self-hosted Demucs at scale.

## ADR-003: On-Device Scoring
**Date:** 2026-03-31
**Status:** Accepted
**Context:** Scoring needs real-time visual feedback. Network round-trips add unacceptable latency.
**Decision:** All pitch detection and scoring runs on-device using YIN algorithm. Server validates final scores for leaderboard integrity.
**Reasoning:** Even 100ms delay breaks karaoke UX. YIN is lightweight enough for mobile. Server-side validation prevents cheating.
**Consequences:** Scoring logic must work within mobile CPU constraints. Anti-tamper mechanism (proof_hash) needed for leaderboard.

## ADR-004: Hash-Based Stem Caching
**Date:** 2026-03-31
**Status:** Accepted
**Context:** AudioShake charges per separation. Multiple users importing the same song shouldn't trigger duplicate separations.
**Decision:** SHA-256 hash of audio file used as dedup key. Stems stored in Supabase Storage, shared across users via `stems_meta` table.
**Reasoning:** If 100 users import the same song, we separate it once. Significant cost savings at scale.
**Consequences:** Storage costs scale with unique songs, not users. RLS must allow read access to shared stems.

## ADR-005: RevenueCat for Payments
**Date:** 2026-03-31
**Status:** Accepted
**Context:** Need subscription management across iOS and Android with receipt validation.
**Decision:** RevenueCat wraps Apple IAP and Google Play Billing. Webhook to Edge Function updates subscription status.
**Reasoning:** Industry standard, handles receipt validation, entitlement management, analytics. Avoids building payment infra.
**Consequences:** RevenueCat fee on transactions. Webhook reliability is critical for access control.

## ADR-006: Scrum Framework for Development
**Date:** 2026-03-31
**Status:** Accepted
**Context:** Complex project with multiple work streams. Need structured process to prevent scope creep and context drift across sessions.
**Decision:** Strict scrum framework with epics, stories, sprints, changelog, and anti-drift protocol documented in CLAUDE.md.
**Reasoning:** Prevents vibe coding. Every line traces to a story. Every change is documented.
**Consequences:** Overhead of maintaining scrum docs. Worthwhile tradeoff for project coherence across AI-assisted sessions.
