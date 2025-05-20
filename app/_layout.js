import { useAuthStore } from "@/src/stores/auth"; // Make sure alias `@` works
import { SplashScreen, Stack } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import FlashMessage from "react-native-flash-message";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
	const { isAuthenticated, loading, syncFromStorage } = useAuthStore();

	// Hydrate auth state from SecureStore
	useEffect(() => {
		syncFromStorage().finally(() => SplashScreen.hideAsync());
	}, []);

	// While loading the user from storage
	if (loading) {
		return (
			<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
				<ActivityIndicator size="large" />
			</View>
		);
	}

	return (
		<>
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
		</>
	);
}
