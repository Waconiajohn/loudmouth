# CLAUDE.md — LOUDMOUTH Project Governance

> This file governs how Claude Code (and any AI agent) operates within this codebase.
> Read this FIRST before touching anything.

---

## Project Identity

**LOUDMOUTH** is a karaoke scoring app that lets users sing along to real songs they own, with AI-powered pitch/timing analysis and gamified scoring. It is NOT a music streaming service — users supply their own MP3s purchased from iTunes ($0.69–$1.29 per song).

---

## Architecture Mandate

### Stack (Non-Negotiable)

| Layer              | Technology                        | Why                                          |
|--------------------|-----------------------------------|----------------------------------------------|
| **Frontend**       | React Native (Expo)               | Cross-platform iOS + Android from one codebase |
| **Backend**        | Supabase (Postgres + Auth + Storage + Edge Functions) | Managed infra, real-time, generous free tier |
| **Stem Separation**| AudioShake API                    | Best-in-class SDR 13.5dB, used by major labels |
| **Audio Analysis** | On-device (Web Audio API / native modules) | Low latency pitch detection, no round-trip |
| **Payments**       | RevenueCat (wrapping Apple/Google IAP) | Handles subscription logic + receipt validation |
| **CI/CD**          | EAS Build + EAS Submit            | Expo's native build pipeline                 |

### Do NOT Introduce

- **No Electron, no web-only builds** — this is a mobile-first app
- **No Firebase** — we're all-in on Supabase
- **No server-side audio processing for real-time scoring** — latency kills the UX
- **No Spotify/Apple Music API for playback** — licensing nightmare; BYO-MP3 model only
- **No storing full audio files in Supabase** — stems go to Supabase Storage with signed URLs; raw MP3s stay on-device

---

## Code Conventions

### File Structure
```
loudmouth/
├── app/                    # Expo Router file-based routing
│   ├── (tabs)/             # Tab navigator screens
│   ├── (auth)/             # Auth flow screens
│   └── _layout.tsx         # Root layout
├── components/             # Reusable UI components
│   ├── ui/                 # Primitives (buttons, cards, inputs)
│   ├── audio/              # Audio player, waveform, pitch viz
│   └── scoring/            # Score displays, leaderboards
├── lib/                    # Core business logic
│   ├── audio/              # AudioShake client, pitch detection, stem cache
│   ├── scoring/            # Scoring engine, accuracy algorithms
│   ├── supabase/           # Supabase client, queries, types
│   └── purchases/          # RevenueCat integration
├── hooks/                  # Custom React hooks
├── constants/              # Theme, config, feature flags
├── assets/                 # Static assets (fonts, images, sounds)
├── supabase/               # Supabase project config
│   ├── migrations/         # SQL migrations
│   └── functions/          # Edge Functions (TypeScript)
└── types/                  # Shared TypeScript types
```

### Naming
- **Files**: `kebab-case.ts` / `kebab-case.tsx`
- **Components**: `PascalCase` exports from `kebab-case.tsx` files
- **Hooks**: `useCamelCase`
- **DB tables**: `snake_case`
- **DB columns**: `snake_case`
- **Edge Functions**: `kebab-case/index.ts`
- **Types**: `PascalCase` interfaces, no `I` prefix

### TypeScript Rules
- Strict mode always on (`"strict": true`)
- No `any` — use `unknown` and narrow
- Prefer `interface` over `type` for object shapes
- All Supabase queries must use generated types from `supabase gen types`
- Zod validation on all API boundaries (Edge Function inputs, AudioShake responses)

### State Management
- **Server state**: TanStack Query (react-query) with Supabase
- **Local UI state**: React `useState` / `useReducer`
- **Global app state**: Zustand (minimal — auth status, current song, playback state)
- **No Redux** — overkill for this app

### Audio Rules
- All audio processing must happen on the main thread or a dedicated audio worklet
- Pitch detection uses autocorrelation (YIN algorithm or similar)
- Audio buffers must be cleaned up on component unmount — no memory leaks
- Stem separation is a one-time operation per song; cache aggressively

---

## Supabase Schema Principles

- Every table has `id` (UUID, default `gen_random_uuid()`), `created_at`, `updated_at`
- Row Level Security (RLS) is ALWAYS enabled — no exceptions
- Users can only read/write their own data unless explicitly shared (leaderboards)
- Soft deletes where appropriate (`deleted_at` timestamp)
- All foreign keys have `ON DELETE CASCADE` or explicit handling

---

## Testing Requirements

- **Unit tests**: Vitest for scoring algorithms and utility functions
- **Component tests**: React Native Testing Library
- **E2E**: Detox for critical flows (sign up → import song → sing → see score)
- **Audio tests**: Mock audio input with known pitch sequences; assert scoring accuracy
- Minimum 80% coverage on `lib/scoring/` — this is the heart of the product

---

## Git Workflow

- `main` — production, protected, deploy-on-merge
- `develop` — integration branch
- Feature branches: `feat/description`, `fix/description`, `chore/description`
- Conventional commits required: `feat:`, `fix:`, `chore:`, `docs:`, `test:`
- PR requires 1 approval + passing CI
- Squash merge to `develop`, merge commit to `main`

---

## Environment Variables

```bash
# .env.local (never committed)
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
AUDIOSHAKE_API_KEY=             # Server-side only (Edge Function)
REVENUECAT_API_KEY=             # Public key for SDK
REVENUECAT_WEBHOOK_SECRET=      # Server-side only (Edge Function)
```

**Rule**: Any key prefixed `EXPO_PUBLIC_` is visible to the client. AudioShake and webhook secrets MUST only live in Edge Functions via Supabase secrets.

---

## Deployment

- **Dev**: `npx expo start` with Expo Go
- **Preview**: EAS Build → internal distribution
- **Production**: EAS Build → EAS Submit to App Store / Google Play
- **Edge Functions**: `supabase functions deploy <function-name>`
- **Migrations**: `supabase db push` (dev) / `supabase db push --linked` (prod)

---

## What Claude Code Should Always Do

1. **Read this file first** on every new session
2. **Run `supabase gen types typescript`** after any migration change
3. **Check RLS policies** when creating or modifying tables
4. **Write tests** for any scoring logic changes
5. **Use the existing patterns** — don't invent new state management or data fetching approaches
6. **Keep Edge Functions thin** — they're the proxy to AudioShake and payment webhooks, not a general backend
7. **Never commit secrets** — check `.env.local` is in `.gitignore`

## What Claude Code Should Never Do

1. Install a new major dependency without documenting why in the PR
2. Disable TypeScript strict mode or add `@ts-ignore` without a linked issue
3. Store user audio files in the database (Storage only)
4. Make scoring logic dependent on network calls
5. Skip RLS policies on any new table
6. Use `console.log` in production code — use a structured logger
