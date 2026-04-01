export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const SINGER_TIERS = [
  { min: 0, max: 15, name: "LEGEND", blend: 0.1 },
  { min: 15, max: 35, name: "FRONT MAN", blend: 0.25 },
  { min: 35, max: 65, name: "KARAOKE HERO", blend: 0.5 },
  { min: 65, max: 85, name: "SHOWER SINGER", blend: 0.75 },
  { min: 85, max: 100, name: "TRAIN WRECK", blend: 0.9 },
] as const;

export function getTierForVAS(vasValue: number) {
  return (
    SINGER_TIERS.find((t) => vasValue >= t.min && vasValue <= t.max) ??
    SINGER_TIERS[2]
  );
}

export const SCORE_WEIGHTS = {
  pitch: 0.4,
  timing: 0.25,
  clarity: 0.2,
  dynamics: 0.15,
} as const;

export const SHARE_UNLOCK_SCORE = 9.0;
