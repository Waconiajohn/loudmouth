# 🎤 LOUDMOUTH

**Sing loud. Score big. Share when you're actually good.**

LOUDMOUTH is a karaoke scoring app that uses AI-powered stem separation and real-time pitch analysis to score your singing against real songs you own. No fake MIDI backing tracks — real music, real scoring, real bragging rights.

---

## How It Works

1. **Buy a song** — User purchases an MP3 from iTunes ($0.69–$1.29)
2. **Import it** — The app sends it to AudioShake for stem separation (vocals, instrumental, bass, drums)
3. **Sing** — User sings along to the instrumental track while the app captures their voice
4. **Score** — Real-time pitch and timing analysis compares their voice to the original vocal stem
5. **Improve** — Detailed scoring feedback helps them get better
6. **Share** — When they score 9+/10, social sharing unlocks ("Now you're good enough!")

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Mobile App | React Native (Expo) | Cross-platform iOS + Android |
| Navigation | Expo Router | File-based routing |
| Backend | Supabase | Auth, Postgres DB, Storage, Edge Functions |
| Stem Separation | AudioShake API | Industry-leading vocal isolation (SDR 13.5dB) |
| Audio Analysis | On-device (YIN pitch detection) | Real-time scoring with zero latency |
| Payments | RevenueCat | Subscription management via Apple/Google IAP |
| State | Zustand + TanStack Query | Minimal global state + server cache |
| Build | EAS Build + EAS Submit | Native builds and store submission |

---

## Prerequisites

- **Node.js** >= 18
- **npm** or **yarn**
- **Expo CLI**: `npm install -g expo-cli`
- **EAS CLI**: `npm install -g eas-cli`
- **Supabase CLI**: `npm install -g supabase`
- **iOS**: Xcode 15+ (Mac only, for native builds)
- **Android**: Android Studio with SDK 34+

---

## Getting Started

### 1. Clone and Install

```bash
git clone https://github.com/your-org/loudmouth.git
cd loudmouth
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env.local
```

Fill in your keys:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
AUDIOSHAKE_API_KEY=ask_...           # Edge Function secret only
REVENUECAT_API_KEY=appl_...
```

### 3. Supabase Local Dev

```bash
supabase start                       # Starts local Supabase (Docker required)
supabase db push                     # Apply migrations
supabase gen types typescript --local # Generate TypeScript types
```

### 4. Run the App

```bash
npx expo start                       # Development server
# Press 'i' for iOS simulator, 'a' for Android emulator
```

### 5. Deploy Edge Functions (Local)

```bash
supabase functions serve separate-stems --env-file .env.local
```

---

## Project Structure

```
loudmouth/
├── app/                        # Expo Router screens
│   ├── (tabs)/                 # Main tab navigation
│   │   ├── index.tsx           # Home / Song library
│   │   ├── sing.tsx            # Active singing session
│   │   ├── scores.tsx          # Score history + leaderboard
│   │   └── profile.tsx         # User profile + settings
│   ├── (auth)/                 # Login / signup flow
│   └── _layout.tsx             # Root layout + providers
├── components/
│   ├── ui/                     # Design system primitives
│   ├── audio/                  # Waveform, pitch visualizer, player
│   └── scoring/                # Score cards, progress rings, streaks
├── lib/
│   ├── audio/
│   │   ├── audioshake.ts       # AudioShake API client
│   │   ├── pitch-detector.ts   # YIN algorithm implementation
│   │   ├── stem-cache.ts       # Local + remote stem management
│   │   └── audio-session.ts    # Recording + playback coordinator
│   ├── scoring/
│   │   ├── engine.ts           # Core scoring algorithm
│   │   ├── pitch-accuracy.ts   # Note-level comparison
│   │   ├── timing-accuracy.ts  # Onset/offset alignment
│   │   └── grading.ts          # 1-10 scale conversion
│   ├── supabase/
│   │   ├── client.ts           # Supabase client singleton
│   │   ├── queries.ts          # Typed query functions
│   │   └── types.ts            # Generated DB types (do not edit)
│   └── purchases/
│       └── revenuecat.ts       # RevenueCat setup + entitlements
├── hooks/
│   ├── use-audio-session.ts    # Singing session lifecycle
│   ├── use-pitch-data.ts       # Real-time pitch stream
│   └── use-song-library.ts     # Song CRUD + import
├── constants/
│   ├── theme.ts                # Colors, spacing, typography
│   └── config.ts               # Feature flags, API endpoints
├── supabase/
│   ├── migrations/             # SQL migration files
│   └── functions/
│       ├── separate-stems/     # AudioShake proxy
│       ├── process-webhook/    # RevenueCat webhook handler
│       └── submit-score/       # Score validation + leaderboard
├── types/
│   └── index.ts                # Shared app-level types
├── CLAUDE.md                   # AI agent governance
├── CONTEXT.md                  # Decision log + roadmap
├── ARCHITECTURE.md             # System design doc
└── package.json
```

---

## Key Commands

| Command | Description |
|---------|-------------|
| `npx expo start` | Start dev server |
| `npx expo start --clear` | Start with cache clear |
| `eas build --platform ios --profile preview` | iOS preview build |
| `eas build --platform android --profile preview` | Android preview build |
| `eas submit --platform ios` | Submit to App Store |
| `supabase start` | Start local Supabase |
| `supabase db push` | Apply migrations locally |
| `supabase gen types typescript --local` | Regenerate DB types |
| `supabase functions deploy separate-stems` | Deploy Edge Function |
| `npm test` | Run test suite |
| `npm run lint` | ESLint + Prettier check |
| `npm run typecheck` | TypeScript compilation check |

---

## Business Model

- **Song acquisition**: User buys real songs from iTunes ($0.69–$1.29 per track)
- **Stem separation**: AudioShake API (cost TBD — awaiting AudioShake pricing confirmation)
- **App pricing**: Subscription model via RevenueCat (pricing TBD)
- **Charity**: $0.50/user/month to Feeding America + possible $1/user/month to show choirs or local food shelf (TBD)

---

## Feature Roadmap

See [CONTEXT.md](./CONTEXT.md) for full roadmap and decision history.

**Phase 1 — Core Loop**: Import → Separate → Sing → Score
**Phase 2 — Engagement**: Voice lesson plans, detailed scoring, social sharing (9+/10 gate)
**Phase 3 — Expansion**: Show choir lesson plans, a cappella mode, virtual AI vocal coach

---

## Contributing

1. Read `CLAUDE.md` before writing any code
2. Branch from `develop` with conventional naming (`feat/`, `fix/`, `chore/`)
3. Write tests for scoring logic changes
4. Ensure `npm run typecheck && npm run lint && npm test` all pass
5. Open a PR against `develop`

---

## License

Proprietary. All rights reserved.
