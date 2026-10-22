import { useAuthStore } from "@/src/stores/auth";
import { Redirect } from "expo-router";

// Native cold launches and the not-found recovery link both resolve '/'.
// This entry route chooses a destination; Protected guards own auth changes.
export default function EntryScreen() {
  const { isHydrating, isAuthenticated } = useAuthStore();
  if (isHydrating) return null;
  return <Redirect href={isAuthenticated ? "/(tabs)/trips" : "/(auth)/login"} />;
}
