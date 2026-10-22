import { useAuthStore } from "@/src/stores/auth";
import { authDiagnosticsEnabled, getAuthDiagnostics, recordAuthDiagnostic, subscribeAuthDiagnostics } from "@/src/utils/authDiagnostics";
import { useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, Pressable, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AuthDiagnostics() {
  return authDiagnosticsEnabled ? <TestAuthDiagnostics /> : null;
}
function TestAuthDiagnostics() {
  const [events, setEvents] = useState(getAuthDiagnostics);
  const [expanded, setExpanded] = useState(false);
  const { isAuthenticated, loading } = useAuthStore();
  const segments = useSegments();
  const category = segments[0] === "(auth)" ? "auth" : segments[0] === "(tabs)" ? "tabs" : "other";
  const insets = useSafeAreaInsets();
  useEffect(() => subscribeAuthDiagnostics(setEvents), []);
  useEffect(() => { recordAuthDiagnostic(isAuthenticated ? "auth:signed-in" : "auth:signed-out"); }, [isAuthenticated]);
  useEffect(() => { recordAuthDiagnostic(loading ? "auth:busy" : "auth:idle"); }, [loading]);
  useEffect(() => { recordAuthDiagnostic(`route:${category}`); }, [category]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => recordAuthDiagnostic(`app:${state}`));
    return () => subscription.remove();
  }, []);
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 8, right: 8, bottom: insets.bottom + 4 }}>
      <View style={{ alignSelf: "flex-end", maxWidth: "100%", padding: 8, backgroundColor: "#172b4d", borderRadius: 6 }}>
        <Pressable accessibilityRole="button" onPress={() => setExpanded((value) => !value)}>
          <Text style={{ color: "white", fontSize: 12 }}>Test diagnostics · {category} · {isAuthenticated ? "signed in" : "signed out"}</Text>
        </Pressable>
        {expanded && <>
          <Text style={{ color: "white", fontSize: 11 }}>{events.slice(-10).join("\n")}</Text>
          <Pressable accessibilityRole="button" onPress={() => Share.share({ message: `Travel Test auth diagnostics v1\n${getAuthDiagnostics().join("\n")}` }).catch(() => {})}>
            <Text style={{ color: "#91caff", paddingTop: 8 }}>Share diagnostics</Text>
          </Pressable>
        </>}
      </View>
    </View>
  );
}
