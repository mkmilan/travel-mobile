import { useMemo } from "react";
import { useAuthStore } from "../stores/auth";
import { buildAuthenticatedPhotoSource } from "../services/api";

export function usePhotoSource() {
	const token = useAuthStore((state) => state.token);
	const userId = useAuthStore((state) => state.user?._id);
	// Non-secret cache identity changes with the session. Tokens never enter URLs
	// or React keys, and prior-account images are remounted instead of reused.
	const mediaKey = useMemo(() => `${Date.now()}-${Math.random().toString(36).slice(2)}`, [token, userId]);
	const getPhotoSource = (photoId) => buildAuthenticatedPhotoSource(photoId, token, mediaKey);
	return { getPhotoSource, mediaKey };
}
