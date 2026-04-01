import { View, Text, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/hooks/use-auth";
import { colors, spacing, fontSize, borderRadius } from "@/constants/theme";

export default function ProfileScreen() {
  const { user, isAuthenticated, signOut, loading } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>PROFILE</Text>
      </View>

      <View style={styles.content}>
        {loading ? (
          <Text style={styles.loadingText}>Loading...</Text>
        ) : isAuthenticated ? (
          <>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.email?.[0]?.toUpperCase() ?? "?"}
              </Text>
            </View>
            <Text style={styles.email}>{user?.email}</Text>
            <Text style={styles.tier}>TRAIN WRECK</Text>
            <Text style={styles.tierHint}>
              Practice to move up the Singer Scale
            </Text>

            <Pressable style={styles.signOutBtn} onPress={signOut}>
              <Text style={styles.signOutText}>SIGN OUT</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.icon}>👤</Text>
            <Text style={styles.notSignedIn}>Not signed in</Text>
            <Text style={styles.signInHint}>
              Sign in to save your scores and track progress
            </Text>
          </>
        )}
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
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.red,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: "900",
    color: colors.white,
  },
  email: {
    fontSize: fontSize.lg,
    color: colors.dim,
    marginBottom: spacing.sm,
  },
  tier: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.yellow,
    letterSpacing: 3,
    marginBottom: 4,
  },
  tierHint: {
    fontSize: fontSize.sm,
    color: colors.dimmest,
  },
  signOutBtn: {
    marginTop: spacing.xxl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border2,
    borderRadius: borderRadius.md,
  },
  signOutText: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.dimmer,
    letterSpacing: 2,
  },
  loadingText: {
    color: colors.dimmer,
    fontSize: fontSize.md,
  },
  icon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  notSignedIn: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.dim,
  },
  signInHint: {
    fontSize: fontSize.md,
    color: colors.dimmest,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 22,
  },
});
