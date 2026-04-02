# Changelog — LOUDMOUTH

---

## 2026-04-01 — Session 3
**Sprint:** 1 (Foundation) | **Stories:** Live Mic, Speaker+Mic, Scoring
**Summary:** Proved all core audio capabilities on a real iPhone — live mic pitch detection, simultaneous speaker playback + mic recording, and scoring against a lyric map.

### Changes Made
- `modules/my-module/` — **NEW** Native Swift module that calls `AVAudioSession.overrideOutputAudioPort(.speaker)` to force audio through the main speaker during recording. Solves expo-av's earpiece routing bug.
- `lib/scoring/engine.ts` — **NEW** Scoring engine: aligns pitch samples to word timings, calculates per-word coverage and pitch stability, produces composite session score.
- `app/(tabs)/sing.tsx` — Major rewrite: live mic mode with expo-av recording + react-native-audio-api PCM decoding + YIN pitch detection. Session scoring with results card. Play A4 test tone. Current word display from lyric map.
- `app.json` — iOS deploymentTarget bumped to 15.1 (SDK 54 requirement)
- `package.json` — Upgraded Expo SDK 52→54, React 18→19, RN 0.76→0.81. Added react-native-audio-api, react-native-worklets, expo-linking, ajv v8, @expo/ngrok.
- `metro.config.js` — **NEW** Required by SDK 54 / expo-router v6.
- `lib/supabase/client.ts` — Removed react-native-url-polyfill import (RN 0.81 has native URL support).
- `assets/` — Created placeholder icon.png, splash.png, adaptive-icon.png.

### Key Milestones
1. **Xcode installed** — macOS updated to 26.2, Xcode 26.4 installed, dev builds working
2. **Live mic pitch detection** — YIN algorithm detects sung notes on iPhone 14 Pro
3. **Simultaneous speaker + mic** — Native Swift module forces speaker routing. Backing track + mic recording work together.
4. **Scoring engine** — Session results with composite score, coverage %, pitch stability

### Technical Decisions
- ADR: expo-av recording is the only working mic capture on iOS. react-native-audio-api AudioRecorder has a known bug (#721) delivering empty buffers on physical devices.
- ADR: Native Swift module is required to override expo-av's earpiece routing. This is the standard iOS approach (AVAudioSession.overrideOutputAudioPort).
- ADR: Upgraded to SDK 54 because Expo Go only supports the latest SDK. This required React 18→19, RN 0.76→0.81.

### Known Issues
- expo-av is deprecated in SDK 54 (warns on every use) but is the only working recording option
- react-native-audio-api AudioRecorder.onAudioReady doesn't deliver buffers on iOS (bug #721)
- Pitch detection picks up the A4 test tone from the speaker along with the user's voice (expected — echo cancellation needed later)
- Recorder cleanup race condition (mostly fixed with guards, occasional error on stop)
- Node.js v22.11.0 — SDK 54 recommends ^22.13.0

### Next Steps
- AudioShake stem separation via Supabase Edge Function
- Song import flow with backing track playback
- Target pitch extraction for real pitch accuracy scoring

---

## 2026-03-31 — Session 2
**Sprint:** 1 (Foundation) | **Stories:** Schema + UI + Audio POC
**Summary:** Initialized Expo app, connected Supabase, built 4-tab UI, verified pitch detection with synthetic tones on iPhone.

### Changes Made
- Supabase client + types + queries for 11-table schema
- 4-tab navigation (Library, Sing, Scores, Profile) with dark theme
- Audio POC: mock mode with synthetic sine waves → YIN pitch detection at 22ms
- ARCHITECTURE.md rewritten to match actual deployed schema
- Scrum docs initialized

---

## 2026-03-31 — Session 1
**Sprint:** 0 (Initialization) | **Story:** Project Setup
**Summary:** Cloned repo, created scaffold files from chat session, initialized project structure.
