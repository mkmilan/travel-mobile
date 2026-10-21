/** Native image source. Never put credentials in a URL or attach them to files. */
export function createPhotoSource(photoId, apiUrl, token, cacheKey) {
	if (typeof photoId !== "string" || !photoId) return undefined;
	if (photoId.startsWith("file://")) return { uri: photoId };
	// The backend route accepts GridFS ObjectIds, not arbitrary remote URLs.
	if (!/^[a-f\d]{24}$/i.test(photoId) || !apiUrl) return undefined;
	return {
		uri: `${apiUrl.replace(/\/$/, "")}/photos/${photoId}?view=${encodeURIComponent(cacheKey)}`,
		...(token ? { headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-store" } } : {}),
		cache: "reload",
	};
}
