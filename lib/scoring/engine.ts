/**
 * Scoring engine for LOUDMOUTH.
 * Aligns detected pitches to lyric map word timings and produces per-word scores.
 *
 * Without target pitch data (from vocal stem analysis), scoring is based on:
 * - Did the user sing during each word? (presence)
 * - How stable was their pitch during the word? (consistency)
 * - How many words were covered? (coverage)
 *
 * When target pitches are available, pitch accuracy scoring (40% weight) will compare
 * the user's F0 against the artist's F0 per word.
 */

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface PitchSample {
  frequency: number;
  note: string;
  timestamp: number; // seconds from session start
}

export interface WordScore {
  word: string;
  start: number;
  end: number;
  pitchSamples: PitchSample[];
  sung: boolean;
  dominantNote: string | null;
  pitchStability: number; // 0-10, how consistent the pitch was
}

export interface SessionScore {
  wordScores: WordScore[];
  coverage: number;      // 0-1, fraction of words that were sung
  avgStability: number;  // 0-10, average pitch stability across sung words
  totalWords: number;
  sungWords: number;
  compositeScore: number; // 0-10, overall session score
}

/**
 * Score a singing session by aligning pitch samples to word timings.
 */
export function scoreSession(
  words: WordTiming[],
  pitchSamples: PitchSample[],
): SessionScore {
  const wordScores: WordScore[] = words.map((w) => {
    // Find all pitch samples that fall within this word's time window
    // Allow 100ms tolerance on either side for timing imprecision
    const tolerance = 0.1;
    const samples = pitchSamples.filter(
      (p) => p.timestamp >= w.start - tolerance && p.timestamp <= w.end + tolerance,
    );

    const sung = samples.length > 0;

    // Find the most common note (dominant pitch)
    let dominantNote: string | null = null;
    if (samples.length > 0) {
      const noteCounts = new Map<string, number>();
      for (const s of samples) {
        noteCounts.set(s.note, (noteCounts.get(s.note) ?? 0) + 1);
      }
      let maxCount = 0;
      for (const [note, count] of noteCounts) {
        if (count > maxCount) {
          maxCount = count;
          dominantNote = note;
        }
      }
    }

    // Calculate pitch stability (how consistent the frequency was)
    let pitchStability = 0;
    if (samples.length >= 2) {
      const freqs = samples.map((s) => s.frequency);
      const mean = freqs.reduce((a, b) => a + b, 0) / freqs.length;
      const variance =
        freqs.reduce((sum, f) => sum + (f - mean) ** 2, 0) / freqs.length;
      const stdDev = Math.sqrt(variance);
      // Convert to cents: stdDev in Hz → cents from mean
      const centsStdDev = stdDev > 0 ? 1200 * Math.log2(1 + stdDev / mean) : 0;
      // Score: 10 = perfect (0 cents deviation), 0 = wildly unstable (>200 cents)
      pitchStability = Math.max(0, Math.min(10, 10 * (1 - centsStdDev / 200)));
    } else if (samples.length === 1) {
      pitchStability = 7; // Single sample = decent but can't measure stability
    }

    return {
      word: w.word,
      start: w.start,
      end: w.end,
      pitchSamples: samples,
      sung,
      dominantNote,
      pitchStability,
    };
  });

  const totalWords = wordScores.length;
  const sungWords = wordScores.filter((w) => w.sung).length;
  const coverage = totalWords > 0 ? sungWords / totalWords : 0;

  const sungScores = wordScores.filter((w) => w.sung);
  const avgStability =
    sungScores.length > 0
      ? sungScores.reduce((sum, w) => sum + w.pitchStability, 0) / sungScores.length
      : 0;

  // Composite: 60% coverage + 40% stability (no pitch accuracy without targets)
  const compositeScore = coverage * 6 + (avgStability / 10) * 4;

  return {
    wordScores,
    coverage,
    avgStability,
    totalWords,
    sungWords,
    compositeScore: Math.round(compositeScore * 10) / 10,
  };
}
