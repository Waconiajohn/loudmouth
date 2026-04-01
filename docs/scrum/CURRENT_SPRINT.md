# Sprint 1: Project Foundation
**Goal:** Set up the Expo project, deploy Supabase schema, scaffold core UI, and prove audio feasibility.
**Started:** 2026-03-31

## Stories This Sprint
1. [x] Supabase Schema Deployment — **DONE** — 11 tables deployed, client + types + queries created
2. [x] Basic UI (Library, Sing, Scores, Profile tabs) — **DONE** — 4 tabs with dark theme, Library loads from DB
3. [x] Audio POC (Pitch Detection) — **DONE** — YIN algorithm verified on iPhone at 22ms latency
4. [ ] Live Microphone Capture — **NOT STARTED** — requires dev build (npx expo prebuild)
5. [ ] User Authentication (Supabase Auth + Apple Sign-In) — **NOT STARTED**

## What's Proven
- Pitch detection pipeline works end-to-end on a real iPhone
- YIN (pitchfinder, pure JS) runs at 22ms/frame — well under 50ms target
- Supabase connection works, songs load from DB

## What's Blocked
- **Live mic capture**: Needs native audio modules (react-native-audio-api or expo-audio-stream) which require a dev build, not Expo Go. Dev build needs Xcode (user doesn't have latest macOS for Xcode) or EAS Build (cloud).
- **Xcode**: Requires macOS 26.2 which user doesn't have. **Workaround: use EAS Build** (cloud-based, no Xcode needed).

## Next Session Pick-Up Point
1. Set up EAS Build for cloud-based dev builds (bypasses Xcode requirement)
2. Install react-native-audio-api (Software Mansion) for mic buffer access
3. Build live pitch detection from real microphone input
4. Test simultaneous playback (backing track) + recording (mic)
5. Score detected pitch against Down With The Sickness lyric map (`data/lyric-maps/`)

## Out of Scope (Explicitly)
- AudioShake integration (needs API key confirmation)
- Scoring engine (requires audio pipeline first)
- Payments / RevenueCat (Phase 2)
- AI Coaching (Phase 3)

## Technical Notes for Next Session
- **SDK version**: Expo 54, React 19.1, React Native 0.81.5
- **Supabase project**: qslrhgtkxxhesazipcbs
- **Dev server**: `npx expo start --tunnel --clear` (tunnel mode required, LAN didn't work)
- **react-native-url-polyfill removed**: RN 0.81 has native URL support
- **Expo Go limitation**: Can only run JS-only code. Native audio modules need dev build via `eas build --profile development`
- **Node.js**: Currently v22.11.0. SDK 54 warns about needing ^22.13.0. Works but should upgrade.
- **Apple Music Store**: iTunes store is now called Apple Music Store. Update all user-facing copy.
