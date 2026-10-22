import { useAuthStore } from "@/src/stores/auth";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function LogoutScreen() {
	const logout = useAuthStore((state) => state.logout);

	useEffect(() => {
		async function performLogout() {
			await logout();
		}
		performLogout();
	}, [logout]);

	return (
		<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
			<ActivityIndicator size="large" />
		</View>
	);
}
