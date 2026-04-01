/**
 * Musical note utilities for pitch detection.
 * Converts frequencies to note names, calculates cents offset.
 */

const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F",
  "F#", "G", "G#", "A", "A#", "B",
] as const;

const A4_FREQUENCY = 440;
const A4_MIDI = 69;

export interface NoteInfo {
  /** Display name like "A4" */
  name: string;
  /** Note letter like "A#" */
  noteName: string;
  /** Octave number */
  octave: number;
  /** MIDI note number (A4 = 69) */
  midi: number;
  /** Exact frequency of the nearest note in Hz */
  targetFrequency: number;
  /** Cents offset from target: negative = flat, positive = sharp */
  cents: number;
}

/**
 * Convert a frequency in Hz to the nearest musical note.
 * Returns null for invalid or out-of-range frequencies.
 */
export function frequencyToNote(frequency: number): NoteInfo | null {
  if (!frequency || frequency <= 0 || !isFinite(frequency)) return null;

  const midiFloat = 12 * Math.log2(frequency / A4_FREQUENCY) + A4_MIDI;
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);

  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const noteName = NOTE_NAMES[noteIndex];
  if (!noteName) return null;
  const name = `${noteName}${octave}`;

  const targetFrequency =
    A4_FREQUENCY * Math.pow(2, (midi - A4_MIDI) / 12);

  return { name, noteName, octave, midi, targetFrequency, cents };
}

interface CentsAccuracy {
  label: string;
  quality: "perfect" | "good" | "fair" | "poor";
}

/**
 * Classify pitch accuracy based on cents offset from the target note.
 * Used for color-coding the pitch display.
 */
export function getCentsAccuracy(cents: number): CentsAccuracy {
  const abs = Math.abs(cents);
  if (abs <= 5) return { label: "Perfect", quality: "perfect" };
  if (abs <= 15) return { label: "Good", quality: "good" };
  if (abs <= 30) return { label: "Fair", quality: "fair" };
  return { label: "Off", quality: "poor" };
}

/**
 * Generate a sine wave buffer for testing pitch detection.
 * Adds configurable noise for realism.
 */
export function generateTestTone(
  frequency: number,
  sampleRate: number,
  bufferSize: number,
  noiseLevel = 0.02,
): Float32Array {
  const buffer = new Float32Array(bufferSize);
  for (let i = 0; i < bufferSize; i++) {
    const signal = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
    const noise = (Math.random() - 0.5) * noiseLevel;
    buffer[i] = signal + noise;
  }
  return buffer;
}
