// SDK 56+ draws edge-to-edge; safe-area layout controls content insets.
import { NavigationBar } from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";

export function SystemUI() {
	return <StatusBar style="dark" />;
}

export async function configureAndroidNavBar() {
	if (Platform.OS === "android") NavigationBar.setStyle("dark");
}
