import { Tabs } from "expo-router";
import { Text, StyleSheet } from "react-native";
import { colors } from "@/constants/theme";

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={[styles.icon, focused && styles.iconActive]}>{label}</Text>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.red,
        tabBarInactiveTintColor: colors.dimmest,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Library",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="🎵" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="sing"
        options={{
          title: "Sing",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="🎤" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="scores"
        options={{
          title: "Scores",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="🏆" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="👤" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 88,
    paddingBottom: 28,
    paddingTop: 8,
  },
  tabLabel: {
    fontWeight: "600",
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  icon: {
    fontSize: 22,
    opacity: 0.5,
  },
  iconActive: {
    opacity: 1,
  },
});
