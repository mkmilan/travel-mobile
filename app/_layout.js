// app/_layout.js
/* eslint-disable import/order */

import TopNavBar from "@/src/components/TopNavBar";
import { useAuthStore } from "@/src/stores/auth";
import { SystemUI, configureAndroidNavBar } from "@/src/utils/systemUI"; /////////////////////////////////
import { SplashScreen, Stack } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import FlashMessage from "react-native-flash-message";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

SplashScreen.preventAutoHideAsync();

/* ────────────────────────────────────────────────────────────
 *  ❶  CONSTANT, never recreated  →  no header loop
 * ──────────────────────────────────────────────────────────── */
const topHeader = () => <TopNavBar />;
const tabsScreenOptions = { header: topHeader };

export default function RootLayout() {
	/* Auth hydration */
	const { isAuthenticated, loading, syncFromStorage } = useAuthStore();

	useEffect(() => {
		syncFromStorage().finally(() => SplashScreen.hideAsync());
		configureAndroidNavBar(); ////////////////////////////////////
	}, [syncFromStorage]);

	/* While loading SecureStore */
	if (loading) {
		return (
			<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
				<ActivityIndicator size="large" />
			</View>
		);
	}

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<SafeAreaProvider>
				<SystemUI />
				<Stack /* DON’T set headerShown:false here */>
					{!isAuthenticated ? (
						<Stack.Screen name="(auth)" options={{ headerShown: false }} /* keep auth screens clean */ />
					) : (
						<Stack.Screen name="(tabs)" options={tabsScreenOptions} /* 1-time constant object */ />
					)}
				</Stack>
				<FlashMessage position="top" />
			</SafeAreaProvider>
		</GestureHandlerRootView>
	);
}
