import { useAuthStore } from "@/src/stores/auth";

// Root Stack.Protected owns navigation; this hook is only a data-access guard.
export default function useRequireAuth() {
	const { isHydrating, isAuthenticated } = useAuthStore();
	return !isHydrating && isAuthenticated;
}
