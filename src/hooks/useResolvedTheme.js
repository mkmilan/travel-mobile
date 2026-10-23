import { useAuthStore } from "@/src/stores/auth";
import { useColorScheme } from "react-native";
import { resolveAppTheme } from "@/src/constants/presentationPreferences";

export function useResolvedTheme() {
	const systemTheme = useColorScheme(); // 'light' | 'dark' | null
	const userTheme = useAuthStore((state) => state.theme); // 'light' | 'dark' | 'system'

	return resolveAppTheme(userTheme, systemTheme);
}
