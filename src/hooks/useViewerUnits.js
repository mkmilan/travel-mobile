import { useAuthStore } from "@/src/stores/auth";

// Always the current viewer, never a trip/profile owner's saved preference.
// Subscribe directly so cached cards and already-open sheets update in place.
export default function useViewerUnits() {
	return useAuthStore((state) => state.user?.settings?.preferredUnits === "imperial" ? "imperial" : "metric");
}
