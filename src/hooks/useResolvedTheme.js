import { useAuthStore } from "@/src/stores/auth";
import { useColorScheme } from "react-native";

export function useResolvedTheme() {
	const systemTheme = useColorScheme(); // 'light' | 'dark' | null
	const userTheme = useAuthStore((state) => state.theme); // 'light' | 'dark' | 'system'

	if (userTheme === "system") {
		return systemTheme || "light"; // fallback to light if null
	}

	return userTheme;
}
