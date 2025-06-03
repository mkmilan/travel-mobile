import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

/**
 * Renders children only when the auth slice finished hydrating
 * AND the user is authenticated.
 * Otherwise redirects to /login.
 */
export default function AuthGate({ children }) {
	const { loading, isAuthenticated } = useAuthStore();

	/* redirect when the gate decides we’re unauthenticated */
	useEffect(() => {
		if (!loading && !isAuthenticated) {
			router.replace("(auth)/login");
		}
	}, [loading, isAuthenticated]);

	if (loading) {
		return (
			<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
				<ActivityIndicator size="large" color={theme.colors.primary} />
			</View>
		);
	}

	/* either logged-in or about to be redirected */
	return isAuthenticated ? children : null;
}
