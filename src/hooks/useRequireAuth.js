// NEW ────────────────────────────────────────────────────────────────
// One tiny hook you can reuse in any screen that must be logged-in.
import { useAuthStore } from "@/src/stores/auth";
import { useRouter } from "expo-router";
import { useEffect } from "react";

/**
 * Returns `true` once:
 *   • the auth slice is hydrated  **AND**
 *   • the user is authenticated.
 *
 * While those conditions are not met it silently redirects to /login.
 */
export default function useRequireAuth() {
	const { loading, isAuthenticated } = useAuthStore();
	const router = useRouter();

	useEffect(() => {
		if (!loading && !isAuthenticated) {
			// User is *definitely* logged-out → push them to Login
			router.replace("/(auth)/login");
		}
	}, [loading, isAuthenticated, router]);

	/*  --------  WHAT THE HOOK RETURNS  --------
      false →  still hydrating *or* redirecting
      true  →  safe to render the private screen      */
	return !loading && isAuthenticated;
}
