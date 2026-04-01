export type { Database } from "@/lib/supabase/types";

export interface WordTiming {
  word: string;
  start: number;
  end: number;
  probability?: number;
}

export interface LyricMap {
  song: {
    title: string;
    artist: string;
    genius_url?: string;
    thumbnail?: string;
    song_id?: number;
  };
  words: WordTiming[];
}

export interface ScoreResult {
  overall: number;
  pitch: number;
  timing: number;
  clarity: number;
  dynamics: number;
}

export interface SingerTier {
  min: number;
  max: number;
  name: string;
  blend: number;
}
