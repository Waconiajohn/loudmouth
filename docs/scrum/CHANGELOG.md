# Changelog — LOUDMOUTH

---

## 2026-03-31 — Session 2
**Sprint:** 1 (Project Foundation) | **Stories:** Schema + UI + Audio POC
**Summary:** Upgraded to Expo SDK 54, built complete app scaffold, and verified pitch detection on a real iPhone.

### Changes Made
- `package.json` — Upgraded from Expo SDK 52 → SDK 54 (React 18→19, RN 0.76→0.81). Added pitchfinder, react-native-worklets, expo-linking, ajv v8.
- `lib/supabase/client.ts` — Created Supabase client singleton with SecureStore auth adapter. Removed react-native-url-polyfill (no longer needed in RN 0.81).
- `lib/supabase/types.ts` — TypeScript Database interface matching all 11 deployed tables.
- `lib/supabase/queries.ts` — Typed query functions: fetchSongs, fetchSongById, fetchProfile, fetchScoreHistory, fetchLeaderboard.
- `lib/audio/pitch-detector.ts` — YIN pitch detection wrapper using pitchfinder. Configurable threshold, vocal range filtering (75-2200 Hz).
- `lib/audio/note-utils.ts` — Frequency→note conversion, cents accuracy classification, test tone generator.
- `types/pitchfinder.d.ts` — TypeScript declarations for pitchfinder library.
- `app/_layout.tsx` — Root layout with QueryClientProvider and Stack navigator.
- `app/(tabs)/_layout.tsx` — Tab navigator with 4 tabs: Library, Sing, Scores, Profile. Dark theme.
- `app/(tabs)/index.tsx` — Library screen with FlatList of songs from Supabase via TanStack Query.
- `app/(tabs)/sing.tsx` — **Audio POC screen** with mock mode: generates test tones, runs YIN detection, displays note/frequency/cents/accuracy in real-time.
- `app/(tabs)/scores.tsx` — Placeholder scores screen.
- `app/(tabs)/profile.tsx` — Profile screen with auth state, sign out.
- `app/(auth)/_layout.tsx` — Auth flow Stack layout.
- `hooks/use-auth.ts` — Auth hook with signIn, signUp, signOut, session management.
- `constants/theme.ts` — Dark theme colors (bg #080808, red #d42020, yellow #f5c400, green #2ecc71).
- `constants/config.ts` — Singer tiers (LEGEND→TRAIN WRECK), score weights, VAS config.
- `types/index.ts` — Shared types: WordTiming, LyricMap, ScoreResult, SingerTier.
- `metro.config.js` — Created (required by SDK 54 / expo-router v6).
- `app.json` — iOS deploymentTarget bumped to 15.1 (SDK 54 requirement).
- `assets/` — Created placeholder icon.png, splash.png, adaptive-icon.png.
- `ARCHITECTURE.md` — Rewritten to match actual 11-table deployed Supabase schema.
- `.env.local` — Created with Supabase URL + anon key for project qslrhgtkxxhesazipcbs.

### Key Results
- **App runs on physical iPhone** via Expo Go + tunnel mode
- **Library tab** loads songs from Supabase successfully
- **Pitch detection POC verified**: YIN algorithm detects notes at 22ms latency on-device, ±1 cent accuracy on synthetic tones
- **TypeScript compiles clean** with strict mode + noUncheckedIndexedAccess

### Decisions Made
- ADR: Upgraded to SDK 54 because Expo Go only supports the latest SDK version (was SDK 52)
- ADR: Used pitchfinder (pure JS YIN) for POC. Plan to upgrade to react-native-pitchy (C++ TurboModule) for production latency.
- ADR: Removed react-native-url-polyfill — RN 0.81 includes native URL support.
- ADR: Using tunnel mode (ngrok) for dev since LAN connection was unreliable.

### Known Issues
- Expo Go shows react-native-reanimated worklet warning on launch (dismissible, non-blocking)
- `api/main.py` still has hardcoded API keys — v1 code, not integrated with new app
- Placeholder assets (icon, splash) are 1x1 black pixels — need real designs
- Node.js version warning: SDK 54 expects Node ^20.19.0 || ^22.13.0 || >=24, current is 22.11.0

### Next Steps
- Wire up live microphone capture (react-native-audio-api or expo-audio-stream)
- Requires dev build: `npx expo prebuild` + Xcode or EAS Build
- Score detected pitch against Down With The Sickness lyric map
- Build auth flow UI screens

---

## 2026-03-31 — Session 1
**Sprint:** 0 (Initialization) | **Story:** Project Setup
**Summary:** Initialized the Expo/React Native project scaffold from chat-generated files.

### Changes Made
- `.env.example` — Environment variable template (Supabase, AudioShake, RevenueCat)
- `.gitignore` — Expo/RN standard ignores
- `app.json` — Expo config with iOS/Android permissions (mic, music library, background audio)
- `ARCHITECTURE.md` — Full system design: data flows, DB schema, edge functions, audio pipeline
- `CLAUDE.md` — Scrum development framework with anti-drift protocol
- `CONTEXT.md` — Decision log (BYO-MP3, AudioShake, stem caching, charity, social gate, on-device scoring)
- `eas.json` — EAS Build profiles (dev/preview/production)
- `package.json` — Dependencies: Expo 52, React Native, Supabase, TanStack Query, Zustand, Zod, RevenueCat
- `README.md` — Project overview with setup instructions
- `tsconfig.json` — Strict TypeScript with path aliases
- Created full directory structure: `app/`, `components/`, `lib/`, `hooks/`, `constants/`, `supabase/`, `types/`
- Created scrum docs: `docs/scrum/BACKLOG.md`, `CURRENT_SPRINT.md`, `SPRINT_LOG.md`, `CHANGELOG.md`

### Decisions Made
- Preserve existing `api/`, `docs/`, `data/`, `static/` directories from prototype phase
- Scrum docs go in `docs/scrum/` to avoid conflicts with existing `docs/` content

### Known Issues
- `api/main.py` has hardcoded API keys (AudioShake, Supabase) — security concern
- `api/lyrics_engine.py` has hardcoded Genius API token
- `npm install` not yet run — dependencies not installed

### Next Steps
- Run `npm install` to bootstrap Expo project
- Deploy Supabase schema (from ARCHITECTURE.md)
- Begin Sprint 1, Story 1: Supabase Schema Deployment
