import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Audio } from "expo-av";
import { decodeAudioData } from "react-native-audio-api";
import {
  frequencyToNote,
  getCentsAccuracy,
  generateTestTone,
} from "@/lib/audio/note-utils";
import type { NoteInfo } from "@/lib/audio/note-utils";
import {
  createPitchDetector,
  SAMPLE_RATE,
  BUFFER_SIZE,
} from "@/lib/audio/pitch-detector";
import { colors, spacing, fontSize, borderRadius } from "@/constants/theme";

/**
 * Audio Proof of Concept — Pitch Detection Pipeline
 *
 * Mock mode: synthetic sine waves → YIN → note display (works in Expo Go)
 * Live mode: real microphone → AudioRecorder → YIN → note display (requires dev build)
 */

// C major scale from C4 to C5
const TEST_FREQUENCIES = [
  261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25,
];
const TICKS_PER_NOTE = 5;

type ScreenState = "idle" | "mock" | "live";

const ACCURACY_COLORS: Record<string, string> = {
  perfect: colors.green,
  good: colors.yellow,
  fair: "#f59e0b",
  poor: colors.red,
};

export default function SingScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const [state, setState] = useState<ScreenState>("idle");
  const [currentNote, setCurrentNote] = useState<NoteInfo | null>(null);
  const [rawFrequency, setRawFrequency] = useState<number | null>(null);
  const [noteHistory, setNoteHistory] = useState<string[]>([]);
  const [sampleCount, setSampleCount] = useState(0);
  const [lastLatency, setLastLatency] = useState(0);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>("");

  const detectorRef = useRef(createPitchDetector());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const liveActiveRef = useRef(false);

  const resetDisplay = useCallback(() => {
    setSampleCount(0);
    setNoteHistory([]);
    setCurrentNote(null);
    setRawFrequency(null);
    setLiveError(null);
  }, []);

  const processPitchBuffer = useCallback((buffer: Float32Array) => {
    const t0 = performance.now();
    const detected = detectorRef.current(buffer);
    const latencyMs = performance.now() - t0;

    if (detected !== null) {
      const note = frequencyToNote(detected);
      setRawFrequency(detected);
      setCurrentNote(note);
      setLastLatency(Math.round(latencyMs * 100) / 100);
      if (note) {
        setNoteHistory((prev) => [...prev.slice(-29), note.name]);
      }
      setSampleCount((prev) => prev + 1);
    }
  }, []);

  const cleanup = useCallback(() => {
    liveActiveRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (recordingRef.current) {
      try {
        recordingRef.current.stopAndUnloadAsync();
      } catch { /* ok */ }
      recordingRef.current = null;
    }
  }, []);

  // --- Mock Mode ---
  const startMock = useCallback(() => {
    cleanup();
    setState("mock");
    tickRef.current = 0;
    resetDisplay();

    intervalRef.current = setInterval(() => {
      const noteIndex =
        Math.floor(tickRef.current / TICKS_PER_NOTE) %
        TEST_FREQUENCIES.length;
      const baseFreq = TEST_FREQUENCIES[noteIndex] ?? 440;
      const centsDrift = Math.random() * 30 - 15;
      const driftedFreq = baseFreq * Math.pow(2, centsDrift / 1200);
      const buffer = generateTestTone(driftedFreq, SAMPLE_RATE, BUFFER_SIZE);
      processPitchBuffer(buffer);
      tickRef.current++;
    }, 100);
  }, [cleanup, resetDisplay, processPitchBuffer]);

  // --- Live Mic Mode ---
  // Records 0.6s clips with expo-av (proven working), decodes to PCM
  // with react-native-audio-api's decodeAudioData, runs YIN pitch detection.
  const startLive = useCallback(async () => {
    cleanup();
    setState("live");
    resetDisplay();
    liveActiveRef.current = true;

    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setLiveError("Mic permission denied.");
        setState("idle");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      setDebugInfo("Recording...");
      let cycle = 0;

      while (liveActiveRef.current) {
        try {
          const rec = new Audio.Recording();
          recordingRef.current = rec;

          await rec.prepareToRecordAsync(
            Audio.RecordingOptionsPresets.HIGH_QUALITY as Parameters<typeof rec.prepareToRecordAsync>[0],
          );
          await rec.startAsync();
          await new Promise((r) => setTimeout(r, 600));

          if (!liveActiveRef.current) {
            try { await rec.stopAndUnloadAsync(); } catch { /* ok */ }
            break;
          }

          const status = await rec.getStatusAsync();
          const db = status.metering ?? -160;
          await rec.stopAndUnloadAsync();
          const uri = rec.getURI();
          recordingRef.current = null;
          cycle++;

          if (db <= -50 || !uri) {
            setDebugInfo(`#${cycle} | ${db.toFixed(0)} dB | too quiet`);
            continue;
          }

          // Decode audio file to PCM samples
          const audioBuffer = await decodeAudioData(uri, SAMPLE_RATE);
          const samples = audioBuffer.getChannelData(0);

          setDebugInfo(
            `#${cycle} | ${db.toFixed(0)} dB | ${samples.length} samples`,
          );

          if (samples.length >= BUFFER_SIZE) {
            const mid = Math.max(
              0,
              Math.floor(samples.length / 2) - BUFFER_SIZE / 2,
            );
            processPitchBuffer(samples.slice(mid, mid + BUFFER_SIZE));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setDebugInfo(`#${cycle} err: ${msg}`);
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setLiveError(message);
      setState("idle");
    }
  }, [cleanup, resetDisplay, processPitchBuffer]);

  const stop = useCallback(() => {
    cleanup();
    setState("idle");
  }, [cleanup]);

  useEffect(() => cleanup, [cleanup]);

  // Derived display values
  const accuracy = currentNote ? getCentsAccuracy(currentNote.cents) : null;
  const accentColor = accuracy
    ? ACCURACY_COLORS[accuracy.quality]
    : colors.dimmest;

  const centsText =
    currentNote && currentNote.cents !== 0
      ? `${currentNote.cents > 0 ? "+" : ""}${currentNote.cents} cents ${currentNote.cents > 0 ? "\u266F" : "\u266D"}`
      : "In tune";

  const barPadding = spacing.lg * 2 + 60;
  const barWidth = screenWidth - barPadding;
  const indicatorLeft = currentNote
    ? Math.max(
        0,
        Math.min(
          barWidth,
          barWidth / 2 + (currentNote.cents / 50) * (barWidth / 2),
        ),
      )
    : barWidth / 2;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>AUDIO POC</Text>
        <Text style={styles.subtitle}>Pitch Detection Pipeline</Text>

        {/* Main Pitch Display */}
        <View style={styles.pitchCard}>
          {currentNote ? (
            <>
              <Text style={[styles.noteName, { color: accentColor }]}>
                {currentNote.name}
              </Text>
              <Text style={styles.frequency}>
                {rawFrequency?.toFixed(1)} Hz
              </Text>
              <Text style={[styles.centsText, { color: accentColor }]}>
                {centsText}
              </Text>
              <View
                style={[styles.accuracyBadge, { borderColor: accentColor }]}
              >
                <Text style={[styles.accuracyLabel, { color: accentColor }]}>
                  {accuracy?.label}
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.placeholder}>
              {state === "idle" ? "Ready" : "Listening..."}
            </Text>
          )}
        </View>

        {/* Cents Accuracy Bar */}
        <View style={styles.centsBar}>
          <Text style={styles.centsBarEdge}>{"\u266D"}</Text>
          <View style={[styles.centsBarOuter, { width: barWidth }]}>
            <View style={styles.centsBarTrack} />
            <View style={styles.centsBarCenter} />
            {state !== "idle" && (
              <View
                style={[
                  styles.centsBarDot,
                  {
                    left: indicatorLeft - 7,
                    backgroundColor: accentColor,
                  },
                ]}
              />
            )}
          </View>
          <Text style={styles.centsBarEdge}>{"\u266F"}</Text>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{sampleCount}</Text>
            <Text style={styles.statLabel}>Samples</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{lastLatency}ms</Text>
            <Text style={styles.statLabel}>YIN Latency</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {state === "idle" ? "\u2014" : state.toUpperCase()}
            </Text>
            <Text style={styles.statLabel}>Mode</Text>
          </View>
        </View>

        {/* Debug Info */}
        {debugInfo !== "" && (
          <View style={styles.errorBox}>
            <Text style={[styles.errorText, { color: colors.yellow }]}>
              {debugInfo}
            </Text>
          </View>
        )}

        {/* Error Display */}
        {liveError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{liveError}</Text>
          </View>
        )}

        {/* Controls */}
        <View style={styles.controls}>
          {state === "idle" ? (
            <>
              <TouchableOpacity
                style={[styles.button, styles.mockButton]}
                onPress={startMock}
                activeOpacity={0.7}
              >
                <Text style={styles.buttonText}>Mock Mode</Text>
                <Text style={styles.buttonHint}>Synthetic test tones</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.liveButton]}
                onPress={startLive}
                activeOpacity={0.7}
              >
                <Text style={styles.buttonText}>Live Mic</Text>
                <Text style={styles.buttonHint}>Real microphone input</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.button, styles.stopButton]}
              onPress={stop}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Stop</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Note History */}
        {noteHistory.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>Note History</Text>
            <View style={styles.historyRow}>
              {noteHistory.slice(-15).map((note, i, arr) => {
                const isLast = i === arr.length - 1;
                return (
                  <View
                    key={`${i}-${note}`}
                    style={[
                      styles.historyChip,
                      isLast && styles.historyChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.historyChipText,
                        isLast && styles.historyChipTextActive,
                      ]}
                    >
                      {note}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>
            {state === "live" ? "Live mic active" : "What this proves"}
          </Text>
          <Text style={styles.infoText}>
            {state === "live"
              ? "Sing a note and watch the pitch detection respond in real-time. Try holding a steady note to see accuracy. The YIN algorithm analyzes your voice ~10 times per second."
              : "Mock mode tests the pipeline with synthetic tones. Live mode captures real microphone audio via react-native-audio-api and runs YIN pitch detection on each buffer."}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: {
    color: colors.red,
    fontSize: fontSize.xxl,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 4,
  },
  subtitle: {
    color: colors.dimmer,
    fontSize: fontSize.md,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  pitchCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border2,
    padding: spacing.xl,
    alignItems: "center",
    minHeight: 180,
    justifyContent: "center",
  },
  noteName: {
    fontSize: 72,
    fontWeight: "900",
    letterSpacing: 2,
  },
  frequency: {
    color: colors.dim,
    fontSize: fontSize.lg,
    marginTop: spacing.xs,
  },
  centsText: {
    fontSize: fontSize.md,
    marginTop: spacing.xs,
    fontWeight: "600",
  },
  accuracyBadge: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  accuracyLabel: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    letterSpacing: 1,
  },
  placeholder: {
    color: colors.dimmest,
    fontSize: fontSize.xxl,
    fontWeight: "600",
  },
  centsBar: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  centsBarEdge: {
    color: colors.dimmest,
    fontSize: fontSize.lg,
    width: 20,
    textAlign: "center",
  },
  centsBarOuter: {
    height: 20,
    position: "relative",
  },
  centsBarTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 8,
    height: 4,
    backgroundColor: colors.surface2,
    borderRadius: 2,
  },
  centsBarCenter: {
    position: "absolute",
    left: "50%",
    top: 3,
    width: 2,
    height: 14,
    backgroundColor: colors.dimmest,
    marginLeft: -1,
  },
  centsBarDot: {
    position: "absolute",
    top: 3,
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  statsRow: {
    flexDirection: "row",
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: "center",
  },
  statValue: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: "700",
  },
  statLabel: {
    color: colors.dimmest,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  errorBox: {
    marginTop: spacing.md,
    backgroundColor: "rgba(212, 32, 32, 0.15)",
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.red,
  },
  errorText: {
    color: colors.redLight,
    fontSize: fontSize.sm,
  },
  controls: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  button: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  mockButton: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.green,
  },
  liveButton: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.red,
  },
  stopButton: {
    backgroundColor: colors.red,
  },
  buttonText: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: "700",
  },
  buttonHint: {
    color: colors.dimmer,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  disabledText: {
    color: colors.dimmest,
  },
  historySection: {
    marginTop: spacing.lg,
  },
  historyTitle: {
    color: colors.dimmer,
    fontSize: fontSize.sm,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  historyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  historyChip: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  historyChipActive: {
    backgroundColor: colors.yellow,
  },
  historyChipText: {
    color: colors.dimmer,
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  historyChipTextActive: {
    color: colors.bg,
  },
  infoBox: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoTitle: {
    color: colors.yellow,
    fontSize: fontSize.sm,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  infoText: {
    color: colors.dimmer,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
