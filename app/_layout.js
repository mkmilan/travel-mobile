// eslint-disable-next-line import/order
// prettier-ignore
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useAuthStore } from "@/src/stores/auth"; // Make sure alias `@` works
import { SplashScreen, Stack } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import FlashMessage from "react-native-flash-message";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
	const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
	const loading = useAuthStore((state) => state.loading);
	const syncFromStorage = useAuthStore((state) => state.syncFromStorage);

	// Hydrate auth state from SecureStore
	useEffect(() => {
		syncFromStorage().finally(() => SplashScreen.hideAsync());
	}, [syncFromStorage]); // Added syncFromStorage to dependency array, though it should be stable from Zustand

	// While loading the user from storage
	if (loading) {
		return (
			<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
				<ActivityIndicator size="large" />
			</View>
		);
	}

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<Stack screenOptions={{ headerShown: false }}>
				{!isAuthenticated ? (
					// This will only show login.js in (auth) stack
					<Stack.Screen name="(auth)" />
				) : (
					// This will show the full tabbed app
					<Stack.Screen name="(tabs)" />
				)}
			</Stack>
			<FlashMessage position="top" />
		</GestureHandlerRootView>
	);
}
