import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, fontSize } from "@/constants/theme";

export default function ScoresScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SCORES</Text>
      </View>
      <View style={styles.center}>
        <Text style={styles.icon}>🏆</Text>
        <Text style={styles.emptyText}>No scores yet</Text>
        <Text style={styles.emptyHint}>
          Complete a singing session to see your scores here
        </Text>
      </View>
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
  title: {
    fontSize: fontSize.xxl,
    fontWeight: "900",
    color: colors.white,
    letterSpacing: 4,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  icon: {
    fontSize: 64,
    marginBottom: spacing.lg,
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
    lineHeight: 22,
  },
});
