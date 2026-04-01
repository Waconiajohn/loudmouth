// Generated types for Supabase — run `npm run db:types` to regenerate.
// This is a starter scaffold; regenerate from the live DB for full accuracy.

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
          is_subscriber: boolean;
          sub_started_at: string | null;
          sub_ends_at: string | null;
          sub_provider: string | null;
          sub_external_id: string | null;
          free_songs_used_this_month: number;
          free_tier_reset_at: string | null;
          credits_cents: number;
          total_sessions: number;
          best_tier_reached: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          is_subscriber?: boolean;
        };
        Update: {
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          is_subscriber?: boolean;
        };
      };
      songs: {
        Row: {
          id: string;
          title: string;
          artist: string;
          album: string | null;
          release_year: number | null;
          duration_sec: number | null;
          genre: string | null;
          emoji: string;
          price_cents: number;
          is_free_tier: boolean;
          difficulty: number;
          status: "pending" | "processing" | "ready" | "error";
          processed_at: string | null;
          genius_song_id: number | null;
          isrc: string | null;
          total_purchases: number;
          total_sessions: number;
          avg_user_score: number | null;
          artist_email: string | null;
          artist_payout_cents: number;
          is_active: boolean;
          is_featured: boolean;
          featured_order: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          title: string;
          artist: string;
          album?: string | null;
          genre?: string | null;
          price_cents?: number;
          difficulty?: number;
        };
        Update: {
          title?: string;
          artist?: string;
          status?: "pending" | "processing" | "ready" | "error";
        };
      };
      sessions: {
        Row: {
          id: string;
          user_id: string;
          song_id: string;
          vas_value: number;
          playback_speed: number;
          tier_name: string | null;
          completed: boolean;
          duration_sec: number | null;
          score_you: number | null;
          score_artist: number | null;
          device_type: string | null;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          user_id: string;
          song_id: string;
          vas_value?: number;
          playback_speed?: number;
          tier_name?: string | null;
        };
        Update: {
          completed?: boolean;
          duration_sec?: number | null;
          score_you?: number | null;
          score_artist?: number | null;
          completed_at?: string | null;
        };
      };
      session_scores: {
        Row: {
          id: string;
          session_id: string;
          pitch_score: number | null;
          timing_score: number | null;
          clarity_score: number | null;
          dynamics_score: number | null;
          artist_pitch: number | null;
          artist_timing: number | null;
          artist_clarity: number | null;
          artist_dynamics: number | null;
          section_breakdown: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          session_id: string;
          pitch_score?: number | null;
          timing_score?: number | null;
          clarity_score?: number | null;
          dynamics_score?: number | null;
        };
        Update: {
          pitch_score?: number | null;
          timing_score?: number | null;
          clarity_score?: number | null;
          dynamics_score?: number | null;
        };
      };
      song_stems: {
        Row: {
          id: string;
          song_id: string;
          original_path: string | null;
          vocals_path: string | null;
          backing_path: string | null;
          full_mix_path: string | null;
          whisper_json_path: string | null;
          lyric_map_path: string | null;
          vocals_size: number | null;
          backing_size: number | null;
          full_mix_size: number | null;
          sample_rate: number;
          bit_depth: number;
          format: string;
          created_at: string;
        };
        Insert: {
          song_id: string;
          vocals_path?: string | null;
          backing_path?: string | null;
        };
        Update: {
          vocals_path?: string | null;
          backing_path?: string | null;
          whisper_json_path?: string | null;
          lyric_map_path?: string | null;
        };
      };
      leaderboard: {
        Row: {
          id: string;
          song_id: string;
          user_id: string;
          display_name: string | null;
          best_score: number;
          vas_value: number | null;
          tier_name: string | null;
          achieved_at: string | null;
        };
        Insert: {
          song_id: string;
          user_id: string;
          best_score: number;
        };
        Update: {
          best_score?: number;
          vas_value?: number | null;
          tier_name?: string | null;
        };
      };
      purchases: {
        Row: {
          id: string;
          user_id: string;
          song_id: string;
          amount_cents: number;
          payment_provider: string | null;
          payment_ref: string | null;
          artist_payout_cents: number | null;
          charity_payout_cents: number | null;
          payout_processed: boolean;
          purchased_at: string;
        };
        Insert: {
          user_id: string;
          song_id: string;
          amount_cents: number;
        };
        Update: {
          payout_processed?: boolean;
        };
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          status: "active" | "cancelled" | "past_due" | "trialing";
          plan: "monthly" | "annual";
          amount_cents: number;
          provider: string;
          provider_sub_id: string | null;
          artist_pool_cents: number;
          charity_cents: number;
          revenue_cents: number;
          started_at: string;
          current_period_end: string | null;
          cancelled_at: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          amount_cents: number;
          provider: string;
        };
        Update: {
          status?: "active" | "cancelled" | "past_due" | "trialing";
          current_period_end?: string | null;
          cancelled_at?: string | null;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
