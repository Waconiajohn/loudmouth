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
import { Audio } from "expo-av";
import { decodeAudioData } from "react-native-audio-api";
import MyModule from "../../modules/my-module";
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
import {
  scoreSession,
  type PitchSample,
  type SessionScore,
  type WordTiming,
} from "@/lib/scoring/engine";
import lyricMapData from "../../data/lyric-maps/Disturbed - Down With The Sickness_lyric_map.json";

/**
 * Audio POC — Pitch Detection + Speaker Playback
 *
 * Strategy:
 * 1. Native Swift module (MyModule) calls AVAudioSession.overrideOutputAudioPort(.speaker)
 * 2. expo-av handles recording (proven to capture audio)
 * 3. react-native-audio-api decodes recorded audio to PCM
 * 4. YIN pitch detection runs on the PCM samples
 * 5. After each recording cycle, forceSpeaker() re-applies speaker routing
 *
 * This solves the expo-av earpiece bug by overriding at the native level.
 */

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
  const [isPlayingTone, setIsPlayingTone] = useState(false);
  const [sessionResult, setSessionResult] = useState<SessionScore | null>(null);
  const [currentWord, setCurrentWord] = useState<string | null>(null);

  const detectorRef = useRef(createPitchDetector());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const liveActiveRef = useRef(false);
  const sessionStartRef = useRef(0);
  const pitchSamplesRef = useRef<PitchSample[]>([]);
  const lyricWords: WordTiming[] = lyricMapData.words.map((w) => ({
    word: w.word,
    start: w.start,
    end: w.end,
  }));

  const resetDisplay = useCallback(() => {
    setSampleCount(0);
    setNoteHistory([]);
    setCurrentNote(null);
    setRawFrequency(null);
    setLiveError(null);
    setDebugInfo("");
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

        // Record sample with timestamp for scoring
        if (sessionStartRef.current > 0) {
          const elapsed = (Date.now() - sessionStartRef.current) / 1000;
          pitchSamplesRef.current.push({
            frequency: detected,
            note: note.name,
            timestamp: elapsed,
          });

          // Update current word display
          const active = lyricWords.find(
            (w) => elapsed >= w.start - 0.2 && elapsed <= w.end + 0.2,
          );
          setCurrentWord(active ? active.word : null);
        }
      }
      setSampleCount((prev) => prev + 1);
    }
  }, [lyricWords]);

  // --- Cleanup ---
  const cleanup = useCallback(async () => {
    liveActiveRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); } catch { /* ok */ }
      try { await soundRef.current.unloadAsync(); } catch { /* ok */ }
      soundRef.current = null;
    }
    setIsPlayingTone(false);
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch { /* ok */ }
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

  // --- Toggle test tone (uses expo-av Sound with WAV data URI) ---
  const toggleTone = useCallback(async () => {
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); } catch { /* ok */ }
      try { await soundRef.current.unloadAsync(); } catch { /* ok */ }
      soundRef.current = null;
      setIsPlayingTone(false);
      return;
    }

    try {
      // Force speaker before playing
      await MyModule.forceSpeaker();

      // Generate a 3-second 440Hz WAV
      const numSamples = SAMPLE_RATE * 3;
      const header = 44;
      const dataSize = numSamples * 2;
      const buf = new ArrayBuffer(header + dataSize);
      const view = new DataView(buf);
      const writeStr = (o: number, s: string) => {
        for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
      };
      writeStr(0, "RIFF");
      view.setUint32(4, header + dataSize - 8, true);
      writeStr(8, "WAVE");
      writeStr(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, SAMPLE_RATE, true);
      view.setUint32(28, SAMPLE_RATE * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeStr(36, "data");
      view.setUint32(40, dataSize, true);
      for (let i = 0; i < numSamples; i++) {
        const sample = Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) * 0.4;
        view.setInt16(header + i * 2, Math.round(sample * 32767), true);
      }
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i] ?? 0);
      }
      const base64 = btoa(binary);
      const uri = `data:audio/wav;base64,${base64}`;

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, isLooping: true, volume: 1.0 },
      );
      soundRef.current = sound;
      setIsPlayingTone(true);

      // Re-force speaker after sound starts (expo-av may have reset it)
      await MyModule.forceSpeaker();
      const route = MyModule.getCurrentRoute();
      setDebugInfo((prev) => `${prev} | Route: ${route}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDebugInfo(`Tone error: ${msg}`);
    }
  }, []);

  // --- Live Mic Mode ---
  const startLive = useCallback(async () => {
    await cleanup();
    setState("live");
    resetDisplay();
    setSessionResult(null);
    setCurrentWord(null);
    pitchSamplesRef.current = [];
    sessionStartRef.current = Date.now();
    liveActiveRef.current = true;

    try {
      // Request mic permission
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setLiveError("Mic permission denied.");
        setState("idle");
        return;
      }

      // Activate karaoke session via native module (speaker + mic)
      const sessionResult = await MyModule.activateKaraokeSession();
      setDebugInfo(`Session: ${sessionResult} | Route: ${MyModule.getCurrentRoute()}`);

      // Enable recording in expo-av
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      } as Parameters<typeof Audio.setAudioModeAsync>[0]);

      // Force speaker AGAIN after expo-av's setAudioModeAsync
      await MyModule.forceSpeaker();
      setDebugInfo(`After setAudioMode: ${MyModule.getCurrentRoute()}`);

      let cycle = 0;

      while (liveActiveRef.current) {
        if (!liveActiveRef.current) break;
        try {
          if (!liveActiveRef.current) break;
          const rec = new Audio.Recording();
          recordingRef.current = rec;

          await rec.prepareToRecordAsync(
            Audio.RecordingOptionsPresets.HIGH_QUALITY as Parameters<typeof rec.prepareToRecordAsync>[0],
          );

          // Force speaker after prepareToRecordAsync (this is where expo-av resets it)
          await MyModule.forceSpeaker();

          await rec.startAsync();
          await new Promise((r) => setTimeout(r, 300));

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

          // Force speaker after stop (before next cycle)
          await MyModule.forceSpeaker();

          if (db <= -50 || !uri) {
            setDebugInfo(
              `#${cycle} | ${db.toFixed(0)} dB | quiet | ${MyModule.getCurrentRoute()}`,
            );
            continue;
          }

          // Decode audio to PCM
          const audioBuffer = await decodeAudioData(uri, SAMPLE_RATE);
          const samples = audioBuffer.getChannelData(0);

          setDebugInfo(
            `#${cycle} | ${db.toFixed(0)} dB | ${samples.length} samples | ${MyModule.getCurrentRoute()}`,
          );

          const numChunks = Math.min(3, Math.floor(samples.length / BUFFER_SIZE));
          for (let c = 0; c < numChunks; c++) {
            const offset = Math.floor(
              (samples.length - BUFFER_SIZE) * c / Math.max(1, numChunks - 1),
            );
            processPitchBuffer(samples.slice(offset, offset + BUFFER_SIZE));
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
    // Score the session if we have pitch data
    if (pitchSamplesRef.current.length > 0 && sessionStartRef.current > 0) {
      const result = scoreSession(lyricWords, pitchSamplesRef.current);
      setSessionResult(result);
    }
    sessionStartRef.current = 0;
    cleanup();
    setState("idle");
  }, [cleanup, lyricWords]);

  useEffect(() => { return () => { cleanup(); }; }, [cleanup]);

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

        {/* Current lyric word */}
        {state === "live" && currentWord && (
          <View style={styles.wordBanner}>
            <Text style={styles.wordText}>{currentWord}</Text>
          </View>
        )}

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
              <View style={[styles.accuracyBadge, { borderColor: accentColor }]}>
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

        <View style={styles.centsBar}>
          <Text style={styles.centsBarEdge}>{"\u266D"}</Text>
          <View style={[styles.centsBarOuter, { width: barWidth }]}>
            <View style={styles.centsBarTrack} />
            <View style={styles.centsBarCenter} />
            {state !== "idle" && (
              <View
                style={[
                  styles.centsBarDot,
                  { left: indicatorLeft - 7, backgroundColor: accentColor },
                ]}
              />
            )}
          </View>
          <Text style={styles.centsBarEdge}>{"\u266F"}</Text>
        </View>

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

        {debugInfo !== "" && (
          <View style={styles.debugBox}>
            <Text style={styles.debugText}>{debugInfo}</Text>
          </View>
        )}

        {liveError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{liveError}</Text>
          </View>
        )}

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
            <View style={{ gap: spacing.sm, flex: 1 }}>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <TouchableOpacity
                  style={[styles.button, styles.stopButton]}
                  onPress={stop}
                  activeOpacity={0.7}
                >
                  <Text style={styles.buttonText}>Stop</Text>
                </TouchableOpacity>
                {state === "live" && (
                  <TouchableOpacity
                    style={[
                      styles.button,
                      {
                        backgroundColor: isPlayingTone ? colors.yellow : colors.surface2,
                        borderWidth: 1,
                        borderColor: colors.yellow,
                      },
                    ]}
                    onPress={toggleTone}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        { color: isPlayingTone ? colors.bg : colors.white },
                      ]}
                    >
                      {isPlayingTone ? "Tone ON" : "Play A4"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>

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

        {/* Session Results */}
        {sessionResult && state === "idle" && (
          <View style={styles.resultsBox}>
            <Text style={styles.resultsTitle}>Session Results</Text>
            <Text style={styles.resultsScore}>
              {sessionResult.compositeScore.toFixed(1)} / 10
            </Text>
            <View style={styles.resultsRow}>
              <View style={styles.resultsStat}>
                <Text style={styles.resultsStatValue}>
                  {sessionResult.sungWords}/{sessionResult.totalWords}
                </Text>
                <Text style={styles.resultsStatLabel}>Words sung</Text>
              </View>
              <View style={styles.resultsStat}>
                <Text style={styles.resultsStatValue}>
                  {Math.round(sessionResult.coverage * 100)}%
                </Text>
                <Text style={styles.resultsStatLabel}>Coverage</Text>
              </View>
              <View style={styles.resultsStat}>
                <Text style={styles.resultsStatValue}>
                  {sessionResult.avgStability.toFixed(1)}
                </Text>
                <Text style={styles.resultsStatLabel}>Stability</Text>
              </View>
            </View>
            <Text style={styles.resultsDetail}>
              Song: {lyricMapData.song.title} by {lyricMapData.song.artist}
            </Text>
            <Text style={styles.resultsDetail}>
              Pitch samples: {pitchSamplesRef.current.length}
            </Text>
          </View>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>
            {state === "live"
              ? `Singing: ${lyricMapData.song.title}`
              : "How it works"}
          </Text>
          <Text style={styles.infoText}>
            {state === "live"
              ? "Your pitch is matched to word timings from the lyric map. When you stop, you'll see a score based on coverage and pitch stability."
              : "Live mode records your voice, detects pitch, and scores against the Down With The Sickness lyric map. Tap Play A4 during a session to test speaker output."}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { color: colors.red, fontSize: fontSize.xxl, fontWeight: "800", textAlign: "center", letterSpacing: 4 },
  subtitle: { color: colors.dimmer, fontSize: fontSize.md, textAlign: "center", marginBottom: spacing.lg },
  pitchCard: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border2, padding: spacing.xl, alignItems: "center", minHeight: 180, justifyContent: "center" },
  noteName: { fontSize: 72, fontWeight: "900", letterSpacing: 2 },
  frequency: { color: colors.dim, fontSize: fontSize.lg, marginTop: spacing.xs },
  centsText: { fontSize: fontSize.md, marginTop: spacing.xs, fontWeight: "600" },
  accuracyBadge: { marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full, borderWidth: 1 },
  accuracyLabel: { fontSize: fontSize.sm, fontWeight: "700", letterSpacing: 1 },
  placeholder: { color: colors.dimmest, fontSize: fontSize.xxl, fontWeight: "600" },
  centsBar: { flexDirection: "row", alignItems: "center", marginTop: spacing.lg, gap: spacing.sm },
  centsBarEdge: { color: colors.dimmest, fontSize: fontSize.lg, width: 20, textAlign: "center" },
  centsBarOuter: { height: 20, position: "relative" },
  centsBarTrack: { position: "absolute", left: 0, right: 0, top: 8, height: 4, backgroundColor: colors.surface2, borderRadius: 2 },
  centsBarCenter: { position: "absolute", left: "50%", top: 3, width: 2, height: 14, backgroundColor: colors.dimmest, marginLeft: -1 },
  centsBarDot: { position: "absolute", top: 3, width: 14, height: 14, borderRadius: 7 },
  statsRow: { flexDirection: "row", marginTop: spacing.lg, gap: spacing.sm },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, alignItems: "center" },
  statValue: { color: colors.white, fontSize: fontSize.lg, fontWeight: "700" },
  statLabel: { color: colors.dimmest, fontSize: fontSize.xs, marginTop: 2 },
  debugBox: { marginTop: spacing.md, backgroundColor: "rgba(245, 196, 0, 0.1)", borderRadius: borderRadius.md, padding: spacing.md, borderWidth: 1, borderColor: "rgba(245, 196, 0, 0.3)" },
  debugText: { color: colors.yellow, fontSize: fontSize.sm },
  errorBox: { marginTop: spacing.md, backgroundColor: "rgba(212, 32, 32, 0.15)", borderRadius: borderRadius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.red },
  errorText: { color: colors.redLight, fontSize: fontSize.sm },
  controls: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  button: { flex: 1, padding: spacing.md, borderRadius: borderRadius.md, alignItems: "center" },
  mockButton: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.green },
  liveButton: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.red },
  stopButton: { backgroundColor: colors.red },
  buttonText: { color: colors.white, fontSize: fontSize.lg, fontWeight: "700" },
  buttonHint: { color: colors.dimmer, fontSize: fontSize.xs, marginTop: 2 },
  historySection: { marginTop: spacing.lg },
  historyTitle: { color: colors.dimmer, fontSize: fontSize.sm, fontWeight: "600", marginBottom: spacing.sm },
  historyRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  historyChip: { backgroundColor: colors.surface, borderRadius: borderRadius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  historyChipActive: { backgroundColor: colors.yellow },
  historyChipText: { color: colors.dimmer, fontSize: fontSize.xs, fontWeight: "600" },
  historyChipTextActive: { color: colors.bg },
  infoBox: { marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  infoTitle: { color: colors.yellow, fontSize: fontSize.sm, fontWeight: "700", marginBottom: spacing.sm },
  infoText: { color: colors.dimmer, fontSize: fontSize.sm, lineHeight: 20 },
  wordBanner: { backgroundColor: colors.red, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.md, alignItems: "center" },
  wordText: { color: colors.white, fontSize: fontSize.xxl, fontWeight: "900", letterSpacing: 2 },
  resultsBox: { marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.green, alignItems: "center" },
  resultsTitle: { color: colors.green, fontSize: fontSize.sm, fontWeight: "700", letterSpacing: 2, marginBottom: spacing.sm },
  resultsScore: { color: colors.white, fontSize: 56, fontWeight: "900" },
  resultsRow: { flexDirection: "row", marginTop: spacing.md, gap: spacing.md },
  resultsStat: { alignItems: "center", flex: 1 },
  resultsStatValue: { color: colors.white, fontSize: fontSize.xl, fontWeight: "700" },
  resultsStatLabel: { color: colors.dimmest, fontSize: fontSize.xs, marginTop: 2 },
  resultsDetail: { color: colors.dimmer, fontSize: fontSize.xs, marginTop: spacing.sm },
});
