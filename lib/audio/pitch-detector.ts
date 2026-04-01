/**
 * Pitch detection using YIN algorithm via pitchfinder.
 * YIN is an autocorrelation-based fundamental frequency estimator
 * optimized for monophonic audio (singing voice).
 *
 * Performance: ~1-2ms per 2048-sample buffer in pure JS.
 * For production, consider react-native-pitchy (C++ TurboModule, ~0.3ms).
 */
import { YIN } from "pitchfinder";

export const SAMPLE_RATE = 44100;
export const BUFFER_SIZE = 2048;

/** Minimum detectable frequency — below E2 (~82 Hz) */
const MIN_FREQUENCY = 75;
/** Maximum detectable frequency — above C7 (~2093 Hz) */
const MAX_FREQUENCY = 2200;

interface PitchDetectorConfig {
  sampleRate?: number;
  /** YIN threshold: lower = stricter (fewer false positives, more dropouts). Default 0.15 */
  threshold?: number;
  probabilityThreshold?: number;
}

/**
 * Create a configured pitch detector function.
 * Returns a function that accepts a Float32Array audio buffer
 * and returns the detected fundamental frequency in Hz, or null
 * if no pitched sound is detected.
 */
export function createPitchDetector(config: PitchDetectorConfig = {}) {
  const {
    sampleRate = SAMPLE_RATE,
    threshold = 0.15,
    probabilityThreshold = 0.1,
  } = config;

  const detect = YIN({ sampleRate, threshold, probabilityThreshold });

  return function detectPitch(buffer: Float32Array): number | null {
    const frequency = detect(buffer);
    if (frequency === null || frequency === undefined || frequency <= 0) {
      return null;
    }

    // Filter frequencies outside the human vocal range
    if (frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY) {
      return null;
    }

    return frequency;
  };
}
