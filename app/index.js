import { useAuthStore } from "@/src/stores/auth";
import { Redirect } from "expo-router";
import "expo-router/entry";

export default function Index() {
	const { isAuthenticated } = useAuthStore();

	if (isAuthenticated) {
		return <Redirect href="/(tabs)/feed" />;
	} else {
		return <Redirect href="/(auth)" />;
	}
}
