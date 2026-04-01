import { supabase } from "./client";
import type { Database } from "./types";

type Song = Database["public"]["Tables"]["songs"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export async function fetchSongs(): Promise<Song[]> {
  const { data, error } = await supabase
    .from("songs")
    .select("*")
    .eq("is_active", true)
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function fetchSongById(id: string): Promise<Song | null> {
  const { data, error } = await supabase
    .from("songs")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return data;
}

export async function fetchScoreHistory(userId: string, songId?: string) {
  let query = supabase
    .from("sessions")
    .select("*, session_scores(*)")
    .eq("user_id", userId)
    .eq("completed", true)
    .order("completed_at", { ascending: false })
    .limit(50);

  if (songId) {
    query = query.eq("song_id", songId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchLeaderboard(songId: string) {
  const { data, error } = await supabase
    .from("leaderboard")
    .select("*")
    .eq("song_id", songId)
    .order("best_score", { ascending: false })
    .limit(10);

  if (error) throw error;
  return data ?? [];
}
