import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { fetchSongs } from "@/lib/supabase/queries";
import { colors, spacing, fontSize } from "@/constants/theme";
import type { Database } from "@/lib/supabase/types";

type Song = Database["public"]["Tables"]["songs"]["Row"];

function SongCard({ song }: { song: Song }) {
  return (
    <Pressable style={styles.card}>
      <Text style={styles.emoji}>{song.emoji}</Text>
      <View style={styles.cardText}>
        <Text style={styles.songTitle} numberOfLines={1}>
          {song.title}
        </Text>
        <Text style={styles.songArtist} numberOfLines={1}>
          {song.artist}
        </Text>
      </View>
      <View style={styles.cardMeta}>
        <Text style={styles.difficulty}>
          {"★".repeat(song.difficulty)}
          {"☆".repeat(5 - song.difficulty)}
        </Text>
        {song.status === "ready" ? (
          <Text style={styles.ready}>READY</Text>
        ) : (
          <Text style={styles.pending}>{song.status.toUpperCase()}</Text>
        )}
      </View>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const {
    data: songs,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["songs"],
    queryFn: fetchSongs,
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>LOUDMOUTH</Text>
        <Text style={styles.subtitle}>YOUR LIBRARY</Text>
      </View>

      {isLoading && (
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading songs...</Text>
        </View>
      )}

      {error && (
        <View style={styles.center}>
          <Text style={styles.errorText}>Failed to load songs</Text>
        </View>
      )}

      <FlatList
        data={songs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SongCard song={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>No songs yet</Text>
              <Text style={styles.emptyHint}>
                Import a song from iTunes to get started
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logo: {
    fontSize: fontSize.xxl,
    fontWeight: "900",
    color: colors.red,
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: colors.dimmest,
    letterSpacing: 3,
    marginTop: 4,
  },
  list: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  emoji: {
    fontSize: 32,
  },
  cardText: {
    flex: 1,
  },
  songTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.white,
  },
  songArtist: {
    fontSize: fontSize.sm,
    color: colors.dimmer,
    marginTop: 2,
  },
  cardMeta: {
    alignItems: "flex-end",
    gap: 4,
  },
  difficulty: {
    fontSize: fontSize.xs,
    color: colors.yellow,
    letterSpacing: 1,
  },
  ready: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: colors.green,
    letterSpacing: 1,
  },
  pending: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: colors.dimmer,
    letterSpacing: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  loadingText: {
    color: colors.dimmer,
    fontSize: fontSize.md,
  },
  errorText: {
    color: colors.red,
    fontSize: fontSize.md,
  },
  emptyText: {
    color: colors.dim,
    fontSize: fontSize.xl,
    fontWeight: "700",
  },
  emptyHint: {
    color: colors.dimmest,
    fontSize: fontSize.md,
    marginTop: spacing.sm,
    textAlign: "center",
  },
});
