// app/_layout.js
/* eslint-disable import/order */

import TopNavBar from "@/src/components/TopNavBar";
import { useAuthStore } from "@/src/stores/auth";
import { SystemUI } from "@/src/utils/systemUI"; /////////////////////////////////
import { SplashScreen, Stack, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
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
	const { isAuthenticated, loading, syncFromStorage, isHydrating } = useAuthStore();
	const router = useRouter();
	const hasMounted = useRef(false);

	// useEffect(() => {
	// 	syncFromStorage().finally(() => SplashScreen.hideAsync());
	// 	configureAndroidNavBar(); ////////////////////////////////////
	// }, [syncFromStorage]);

	useEffect(() => {
		// ① Hydrate auth store ONCE, splash stays visible for now
		syncFromStorage();
	}, []);

	useEffect(() => {
		if (!loading && hasMounted.current) {
			if (isAuthenticated) {
				router.replace("/(tabs)/trips");
			} else {
				router.replace("/(auth)/login");
			}
		} else {
			hasMounted.current = true;
		}
	}, [isAuthenticated, loading, router]);

	useEffect(() => {
		if (!isHydrating) {
			SplashScreen.hideAsync().catch(() => {});
		}
	}, [isHydrating]);

	if (isHydrating) {
		return null;
	}

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
