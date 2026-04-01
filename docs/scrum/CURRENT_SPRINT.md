# Sprint 1: Project Foundation
**Goal:** Set up the Expo project, deploy Supabase schema, scaffold core UI, and prove audio feasibility.
**Started:** 2026-03-31

## Stories This Sprint
1. [x] Supabase Schema Deployment — **DONE** — 11 tables deployed, client + types + queries created
2. [x] Basic UI (Library, Sing, Scores, Profile tabs) — **DONE** — 4 tabs with dark theme, Library loads from DB
3. [x] Audio POC (Pitch Detection) — **DONE** — YIN algorithm verified on iPhone at 22ms latency
4. [ ] Live Microphone Capture — **NOT STARTED** — blocked on Xcode install
5. [ ] User Authentication (Supabase Auth + Apple Sign-In) — **NOT STARTED**

## What's Proven
- Pitch detection pipeline works end-to-end on a real iPhone
- YIN (pitchfinder, pure JS) runs at 22ms/frame — well under 50ms target
- Supabase connection works, songs load from DB

## What's Blocked
- **Xcode**: User is updating macOS to 26.2, then installing Xcode (~12GB). Once done, we can do local dev builds.

## Next Session Pick-Up Point (After Xcode Is Installed)

### Step 1: Prebuild the Expo project
```bash
cd ~/loudmouth
npx expo prebuild
```
This generates the `ios/` and `android/` native directories.

### Step 2: Install native audio library
```bash
npx expo install react-native-audio-api
# OR
npx expo install expo-audio-stream
```
Then re-run `npx expo prebuild` to link the native module.

### Step 3: Build and run on device
- Plug iPhone into Mac via USB
- Open `ios/loudmouth.xcworkspace` in Xcode
- Select your iPhone as build target
- Hit Build & Run (Cmd+R)
- OR from terminal: `npx expo run:ios --device`

### Step 4: Wire live mic capture
- Replace mock mode in `app/(tabs)/sing.tsx` with real mic input
- Use react-native-audio-api: MediaStreamSourceNode → AnalyserNode → getFloatTimeDomainData → pitchfinder YIN
- Test that pitch detection works on real voice

### Step 5: Add simultaneous playback
- Play backing track while recording mic
- Use expo-audio with `playAndRecord` audio session category

### Step 6: Score against lyric map
- Load `data/lyric-maps/Disturbed - Down With The Sickness_lyric_map.json`
- Compare detected pitch per word against target pitch from lyric map
- Display per-word accuracy + composite score

## Out of Scope (Explicitly)
- AudioShake integration (needs API key confirmation)
- Scoring engine full implementation (requires audio pipeline first)
- Payments / RevenueCat (Phase 2)
- AI Coaching (Phase 3)

## Technical Notes
- **SDK version**: Expo 54, React 19.1, React Native 0.81.5
- **Supabase project**: qslrhgtkxxhesazipcbs
- **Dev server**: `npx expo start --tunnel --clear` (tunnel mode required, LAN didn't work)
- **Expo Go**: Works for JS-only screens (Library, Profile). Native audio needs dev build.
- **Node.js**: v22.11.0 — consider upgrading to ^22.13.0 (SDK 54 recommended)
- **Apple Music Store**: All user-facing copy should say "Apple Music Store" not "iTunes"
- **eas.json**: Updated with `development` profile for physical device (simulator: false)
- **Pitch detection POC**: `app/(tabs)/sing.tsx` — mock mode generates test tones, proves YIN pipeline works
