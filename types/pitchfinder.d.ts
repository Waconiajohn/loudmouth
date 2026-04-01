declare module "pitchfinder" {
  interface YINConfig {
    sampleRate?: number;
    threshold?: number;
    probabilityThreshold?: number;
  }

  type PitchDetector = (buffer: Float32Array) => number | null;

  export function YIN(config?: YINConfig): PitchDetector;
  export function AMDF(config?: { sampleRate?: number }): PitchDetector;
  export function ACF2PLUS(config?: { sampleRate?: number }): PitchDetector;
  export function DynamicWavelet(config?: {
    sampleRate?: number;
  }): PitchDetector;
}
