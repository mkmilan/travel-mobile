import TopNavBar from "@/src/components/TopNavBar";
import { recordAuthDiagnostic } from "@/src/utils/authDiagnostics";
import AuthDiagnostics from "@/src/components/AuthDiagnostics";
import { useAuthStore } from "@/src/stores/auth";
import { SystemUI } from "@/src/utils/systemUI";
import { SplashScreen, Stack } from "expo-router";
import { useEffect } from "react";
import FlashMessage from "react-native-flash-message";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

SplashScreen.preventAutoHideAsync().catch(() => {});
const topHeader = () => <TopNavBar />;
const tabsScreenOptions = { header: topHeader };

export default function RootLayout() {
	const { isAuthenticated, syncFromStorage, isHydrating } = useAuthStore();
	useEffect(() => { syncFromStorage(); }, [syncFromStorage]);
	useEffect(() => {
		if (!isHydrating) SplashScreen.hideAsync().catch(() => {});
	}, [isHydrating]);

	// Only initial hydration may delay mounting. Register/network activity must
	// never replace the navigator or discard the active form's local state.
	if (isHydrating) return null;
	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<SafeAreaProvider>
				<SystemUI />
				<Stack screenListeners={{
					transitionStart: () => recordAuthDiagnostic("transition:start"),
					transitionEnd: () => recordAuthDiagnostic("transition:end"),
				}}>
					<Stack.Protected guard={!isAuthenticated}>
						<Stack.Screen name="(auth)" options={{ headerShown: false }} />
					</Stack.Protected>
					<Stack.Protected guard={isAuthenticated}>
						<Stack.Screen name="(tabs)" options={tabsScreenOptions} />
						<Stack.Screen name="search/index" />
						<Stack.Screen name="home/index" />
						<Stack.Screen name="logout" options={{ headerShown: false }} />
					</Stack.Protected>
				</Stack>
				<AuthDiagnostics />
				<FlashMessage position="top" />
			</SafeAreaProvider>
		</GestureHandlerRootView>
	);
}
