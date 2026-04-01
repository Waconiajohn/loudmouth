import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
 * Mock mode: generates synthetic sine waves at known frequencies,
 * feeds them through the YIN pitch detector, and displays results.
 * Proves: audio buffer → YIN → frequency → note → UI works end-to-end.
 *
 * Live mode (TODO): captures real mic input via react-native-audio-api
 * or expo-audio-stream. Requires a dev build (npx expo prebuild).
 */

// C major scale from C4 to C5 — covers the middle vocal range
const TEST_FREQUENCIES = [
  261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25,
];

// How many ticks (at 100ms each) to hold each test note
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

  const detectorRef = useRef(createPitchDetector());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef(0);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startMock = useCallback(() => {
    cleanup();
    setState("mock");
    tickRef.current = 0;
    setSampleCount(0);
    setNoteHistory([]);
    setCurrentNote(null);
    setRawFrequency(null);

    intervalRef.current = setInterval(() => {
      // Cycle through the scale, holding each note for TICKS_PER_NOTE ticks
      const noteIndex =
        Math.floor(tickRef.current / TICKS_PER_NOTE) %
        TEST_FREQUENCIES.length;
      const baseFreq = TEST_FREQUENCIES[noteIndex] ?? 440;

      // Add ±15 cents random drift for realism
      const centsDrift = Math.random() * 30 - 15;
      const driftedFreq = baseFreq * Math.pow(2, centsDrift / 1200);

      const buffer = generateTestTone(driftedFreq, SAMPLE_RATE, BUFFER_SIZE);

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

      tickRef.current++;
    }, 100);
  }, [cleanup]);

  const stop = useCallback(() => {
    cleanup();
    setState("idle");
  }, [cleanup]);

  // Clean up interval on unmount
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

  // Cents bar: maps -50..+50 cents to pixel position
  const barPadding = spacing.lg * 2 + 60; // container padding + label widths
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
        {/* Header */}
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
              {state === "idle" ? "Ready" : "Detecting..."}
            </Text>
          )}
        </View>

        {/* Cents Accuracy Bar */}
        <View style={styles.centsBar}>
          <Text style={styles.centsBarEdge}>{"\u266D"}</Text>
          <View style={[styles.centsBarOuter, { width: barWidth }]}>
            {/* Track */}
            <View style={styles.centsBarTrack} />
            {/* Center line */}
            <View style={styles.centsBarCenter} />
            {/* Indicator dot */}
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
                disabled
                activeOpacity={0.4}
              >
                <Text style={[styles.buttonText, styles.disabledText]}>
                  Live Mic
                </Text>
                <Text style={[styles.buttonHint, styles.disabledText]}>
                  Requires dev build
                </Text>
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

        {/* What This Proves */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>What this proves</Text>
          <Text style={styles.infoText}>
            Mock mode generates sine waves at known musical frequencies (C4
            through C5), adds realistic noise and pitch drift, then feeds
            each buffer through the YIN pitch detection algorithm. The
            detected frequency is converted to a musical note with cents
            accuracy.
          </Text>
          <Text style={[styles.infoText, { marginTop: spacing.sm }]}>
            This verifies the full scoring pipeline: audio buffer, pitch
            detection, note identification, accuracy measurement, and UI
            rendering all work end-to-end.
          </Text>
          <Text style={[styles.infoText, { marginTop: spacing.sm }]}>
            Next: real microphone capture via react-native-audio-api or
            expo-audio-stream. Requires a dev build (npx expo prebuild).
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

  // Header
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

  // Pitch Card
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

  // Cents Bar
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

  // Stats
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

  // Controls
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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

  // History
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

  // Info
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
