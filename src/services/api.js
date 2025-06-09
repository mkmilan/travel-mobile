import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as Updates from "expo-updates";
import { getCsrfToken } from "./csrf";

const extra = Constants.expoConfig?.extra || Updates.manifest?.extra || Constants.manifest?.extra || {};

let API_URL = extra.API_URL;
const APP_ENV = extra.APP_ENV || "unknown";

console.log("[api] Using API_URL =", API_URL);
console.log("[api] Running in environment =", APP_ENV);

// last-chance fallback for dev devices if no env var provided
if (!API_URL) {
	const { debuggerHost } = Constants.manifest ?? {};
	// debuggerHost looks like "192.168.1.10:19000"
	if (debuggerHost) {
		const host = debuggerHost.split(":")[0];
		API_URL = `http://${host}:5001/api`;
	}
}

if (!API_URL) {
	console.error("[api] API_URL is not defined in app.config.js › extra. " + "Feed calls will fail.");
}

/* ------------------------------------------------------------------ *
 * core fetch wrapper
 * ------------------------------------------------------------------ */
export async function apiFetch(path, { method = "GET", auth = true, csrf = false, ...options } = {}) {
	const headers = {
		"Content-Type": "application/json",
		...(options.headers || {}),
	};

	/* attach CSRF header if requested */
	if (csrf) {
		headers["X-CSRF-Token"] = await getCsrfToken();
		options.credentials = "include"; // ADDED
	}

	/* attach JWT if authenticated route */
	if (auth) {
		const token = await SecureStore.getItemAsync("auth-token");
		if (token) headers["Authorization"] = `Bearer ${token}`;
	}

	/* ──────────────────────────────────────────────────────────────── *
	 *  ABSOLUTE SAFETY VALVE
	 *  If any code ever builds a path containing “undefined” or “null”
	 *  as a final URL segment, bail out early so the backend never sees it.
	 * ---------------------------------------------------------------- */
	const badIdPattern = /\/(undefined|null)(?:$|[/?#])/;
	if (badIdPattern.test(path)) {
		console.warn("[apiFetch] blocked invalid path →", path);
		return null; // swallow the call gracefully
	}

	const res = await fetch(`${API_URL}${path}`, { method, headers, ...options });

	/* ─── automatic logout on 401 ─── */
	if (res.status === 401) {
		try {
			const { logout } = require("@/src/stores/auth").useAuthStore.getState();
			await logout(); // clear SecureStore + state
		} catch {
			/* ignore */
		}
		// Optional: toast could go here
	}
	/* safe JSON parse */
	const isJson = res.headers.get("content-type")?.includes("application/json");
	const data = isJson ? await res.json() : await res.text();

	if (!res.ok) {
		const msg = isJson ? data.message || JSON.stringify(data) : data;
		throw new Error(msg || `Request failed (${res.status})`);
	}

	return data;
}

//  ========== PHOTO UTILS ==========
/**
 * Convert a raw GridFS photoId into a full URL the <Image> component can load.
 * Safely returns "" for falsy / malformed ids.
 *
 *   const uri = buildPhotoUrl(user.profilePictureUrl);
 *   <Image source={{ uri }} />
 */
export const buildPhotoUrl = (photoId) => (photoId ? `${API_URL}/photos/${photoId}` : "");

/* ------------------------------------------------------------------ *
 * typed helpers for upcoming screens
 * ------------------------------------------------------------------ */
// i think this is old route we need to check
export const getFeedTrips = async (page = 1, pageSize = 10) => {
	const data = await apiFetch(`/trips/feed?page=${page}&limit=${pageSize}`, {
		method: "GET",
	});
	// Server sends an array directly; normalize to { items }
	// console.log("[api] getFeedTrips data", data);

	return { items: Array.isArray(data) ? data : data.items || [] };
};

// ───────────────── getMyTrips  ✅ ───────────────── old
export const getMyTrips = async (page = 1, pageSize = 10) => {
	const data = await apiFetch(`/trips/me?page=${page}&limit=${pageSize}`, {
		method: "GET",
	});
	// console.log("[api] getMyTrips data", data);
	return { items: Array.isArray(data) ? data : data.items || [] };
};

// ───────────────── getTripById  ✅ ───────────────── old
export const getTripById = async (tripId) => {
	const data = await apiFetch(`/trips/${tripId}`, {
		method: "GET",
	});
	// console.log(`[api] getTripById (${tripId}) data`, data);
	return data; // Assuming the server returns the trip object directly
};

// ───────────────── getUserById  ✅ ───────────────── old
export const getUserById = async (userId) => {
	const data = await apiFetch(`/users/${userId}`, {
		method: "GET",
	});
	// console.log(`[api] getUserById user data`, data);

	return data;
};
// ───────────────── getPublicUserById  ✅ ───────────────── old
export const getPublicUserById = async (userId) => {
	if (
		!userId || // falsy
		userId === "undefined" || // literal string
		userId === "null"
	) {
		console.warn("[api] getPublicUserById called with invalid id:", userId);
		return null;
	}
	const data = await apiFetch(`/users/user/${userId}`, {
		method: "GET",
	});
	// console.log(`[api] getPublicUserById user data`, data);

	return data;
};
// ───────────────── updateUserById  ✅ ───────────────── old
export const updateUserById = async (csrf = true, payload) => {
	const data = await apiFetch(`/users/me`, {
		method: "PUT",
		csrf,
		body: JSON.stringify(payload),
	});
	return data;
};

// ───────────────── getUserSettings  ✅ ───────────────── old
export const getUserSettings = async () => {
	const data = await apiFetch(`/users/settings`, {
		method: "GET",
	});
	return data;
};
// ───────────────── updateUserSettings  ✅ ───────────────── old
export const updateUserSettings = async (csrf = true, payload) => {
	const data = await apiFetch(`/users/settings`, {
		method: "PUT",
		csrf,
		body: JSON.stringify(payload),
	});
	// console.log("[api] updateUserSettings data", data);

	return data;
};
// ───────────────── V2 routes   ✅ ─────────────────

// ───────────────── uploadTripJson ✅ ─────────────────
export const uploadTripJson = async (payload, csrf = true) => {
	// console.log("[api] uploadTripJson payload", payload);

	return await apiFetch(`/v2/trips/json`, {
		method: "POST",
		csrf,
		body: JSON.stringify(payload),
	});
};

// ───────────────── getMyTrips  ✅ ───────────────── old
export const getMyJsonTrips = async (page = 1, pageSize = 10) => {
	const data = await apiFetch(`/v2/trips/json/me?page=${page}&limit=${pageSize}`, {
		method: "GET",
	});
	// console.log("[api] getMyJsonTrips data", data);
	return { items: Array.isArray(data) ? data : data.items || [] };
};

// ───────────────── getTripJsonById  ✅ ─────────────────
export const getTripJsonById = async (tripId) => {
	const data = await apiFetch(`/v2/trips/json/${tripId}`, {
		method: "GET",
	});
	// console.log(`[api] getTripJsonById (${tripId}) data`, data);
	return data; // Assuming the server returns the trip object directly
};

// ───────────────── updateTripJson  ✅ ─────────────────
export const updateTripJson = async (tripId, payload, csrf = true) => {
	const data = await apiFetch(`/v2/trips/json/${tripId}`, {
		method: "PUT",
		csrf,
		body: JSON.stringify(payload),
	});
	return data;
};

// ───────────────── getFeedTripJson  ✅ ─────────────────
export const getFeedTripJson = async (page = 1, pageSize = 10) => {
	const data = await apiFetch(`/v2/trips/json/feed?page=${page}&limit=${pageSize}`, {
		method: "GET",
	});
	return { items: Array.isArray(data) ? data : data.items || [] };
};

// ───────────────── getTripsByUser  ✅ ─────────────────
//targeted user id is userId our/user that make call is in req
export const getTripsByUser = async (userId, page = 1, limit = 10) => {
	const data = await apiFetch(`/v2/trips/json/user/${userId}?page=${page}&limit=${limit}`, {
		method: "GET",
	});
	// console.log("[api] getTripsByUser data", data);

	return data;
};

// ───────────────── updateRecommendations  ✅ ─────────────────
export const updateRecommendation = async (recommendationId, updatedData, csrf = true) => {
	const data = await apiFetch(`/v2/recommendations/${recommendationId}`, {
		method: "PUT",
		csrf,
		body: JSON.stringify(updatedData),
	});
	return data;
};

// ───────────────── addRecommendations  ✅ ─────────────────
export const addRecommendation = async (recommendationData, csrf = true) => {
	const data = await apiFetch(`/v2/recommendations/`, {
		method: "POST",
		csrf,
		body: JSON.stringify(recommendationData),
	});
	return data;
};

// Fetch recommendations roe requested user requested user id is userId
export const getRecommendationsByUser = async (userId, page = 1, limit = 10) => {
	const data = await apiFetch(`/v2/recommendations/user/${userId}?page=${page}&limit=${limit}`, {
		method: "GET",
	});
	// console.log("[api] getRecommendationsByUser data", data);
	return data;
};
///////////////////
export const getTripLikers = async (tripId) => {
	// router.get("trips/:tripId/likers", getTripLikers);
	const data = await apiFetch(`/trips/${tripId}/likers`, {
		method: "GET",
	});
	// console.log(`[api] getTripLikers  data`, data);
	return data;
};

export const getTripComments = async (tripId) => {
	// router.get("trips/:tripId/comments", getTripComments);
	const data = await apiFetch(`/trips/${tripId}/comments`, {
		method: "GET",
	});
	// console.log(`[api] getTripComments data`, data);
	return data;
};

export const addTripComment = async (tripId, text) => {
	// router.post("trips/:tripId/comments", protect, addCommentToTrip);
	const data = await apiFetch(`/trips/${tripId}/comments`, {
		method: "POST",
		csrf: true,
		body: JSON.stringify({ text }),
	});
	// console.log(`[api] addTripComment data`, data);
	return data;
};

export const deleteTripComment = async (tripId, commentId) => {
	// router.route("trips/:tripId/comments/:commentId").delete(protect, deleteCommentFromTrip);
	const data = await apiFetch(`/trips/${tripId}/comments/${commentId}`, {
		method: "DELETE",
		csrf: true,
	});
	// console.log(`[api] deleteTripComment data`, data);
	return data;
};

export const likeTrip = async (tripId) => {
	// router.post("trips/:tripId/like", protect, likeTrip);
	return await apiFetch(`/trips/${tripId}/like`, {
		method: "POST",
		csrf: true,
	});
};

export const unlikeTrip = async (tripId) => {
	// router.delete("trips/:tripId/like", protect, unlikeTrip);
	return await apiFetch(`/trips/${tripId}/like`, {
		// Often, unliking is a DELETE request to the same endpoint
		method: "DELETE",
		csrf: true,
	});
};

//  ========== PHOTOS ==========
/* ───────────────── uploadProfilePhoto ✅ ─────────────────
 *
 * PUT /api/users/me   (multer field name: photo)
 * Sends a multipart-form request with the selected image.
 * Returns whatever updateUserProfile sends back (usually { user }).
 *
 * Usage example in a screen:
 *   const res = await uploadProfilePhoto(pickedImageUri);
 *   authStore.setState({ user: res.user }); // or however you refresh user data
 */
export const uploadProfilePhoto = async (localUri) => {
	// 1. Resolve tokens
	const csrfToken = await getCsrfToken();
	const authToken = await SecureStore.getItemAsync("auth-token");

	// 2. Build FormData (no import needed – global in RN)
	const filename = localUri.split("/").pop() || "avatar.jpg";
	const ext = (filename.match(/\.\w+$/)?.[0] || ".jpg").slice(1).toLowerCase();
	const mimeType = `image/${ext === "jpg" ? "jpeg" : ext}`;

	const form = new FormData();
	form.append("photo", {
		uri: localUri,
		name: filename,
		type: mimeType,
	});

	// 3. Direct fetch (we **don’t** use apiFetch so we avoid the JSON header)
	const res = await fetch(`${API_URL}/users/me`, {
		method: "PUT",
		headers: {
			"X-CSRF-Token": csrfToken,
			Authorization: `Bearer ${authToken}`,
			// 👇 Don’t set Content-Type – fetch will add the right multipart boundary
		},
		body: form,
	});

	const isJson = res.headers.get("content-type")?.includes("application/json");
	const data = isJson ? await res.json() : await res.text();

	if (!res.ok) {
		const msg = isJson ? data.message : data;
		throw new Error(msg || `Profile photo upload failed (${res.status})`);
	}

	return data; // e.g. { user: { …profilePictureUrl… } }
};

/* ───────────────── uploadTripPhoto ✅ ─────────────────
 *
 * POST /api/trips/:tripId/photos   (multer field name: photos)
 * Returns  { photoIds: [ ... ] }
 */
export const uploadTripPhoto = async (tripId, localUri) => {
	const csrfToken = await getCsrfToken();
	const authToken = await SecureStore.getItemAsync("auth-token");

	const filename = localUri.split("/").pop() || "photo";
	const ext = (filename.match(/\.\w+$/)?.[0] || ".jpg").slice(1).toLowerCase();
	const mimeMap = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
	const mimeType = mimeMap[ext] || "image/jpeg"; // fallback → jpeg

	const form = new FormData();
	form.append("photos", { uri: localUri, name: `${filename}`, type: mimeType });

	const res = await fetch(`${API_URL}/trips/${tripId}/photos`, {
		method: "POST",
		headers: { "X-CSRF-Token": csrfToken, Authorization: `Bearer ${authToken}` },
		body: form,
	});

	const isJson = res.headers.get("content-type")?.includes("application/json");
	const data = isJson ? await res.json() : await res.text();
	if (!res.ok) throw new Error(isJson ? data.message : data);

	return data; // { photoIds:[id] }
};

/* ───────────────── deleteTripPhoto ✅ ───────────────── */
export const deleteTripPhoto = async (tripId, photoId) =>
	apiFetch(`/trips/${tripId}/photos/${photoId}`, { method: "DELETE", csrf: true });

/* ───────────────── uploadRecommendationPhoto ✅ ─────────────────
 * POST  /api/v2/recommendations/:recId/photos     (field name: photos)
 * Returns { photoIds:[ ... ] }
 */
export const uploadRecommendationPhoto = async (recId, localUri) => {
	const csrfToken = await getCsrfToken();
	const authToken = await SecureStore.getItemAsync("auth-token");

	const filename = localUri.split("/").pop() || "photo";
	const ext = (filename.match(/\.\w+$/)?.[0] || ".jpg").slice(1).toLowerCase();
	const mimeMap = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
	const mimeType = mimeMap[ext] || "image/jpeg";

	const form = new FormData();
	form.append("photos", { uri: localUri, name: filename, type: mimeType });

	const res = await fetch(`${API_URL}/v2/recommendations/${recId}/photos`, {
		method: "POST",
		headers: { "X-CSRF-Token": csrfToken, Authorization: `Bearer ${authToken}` },
		body: form,
	});

	const isJson = res.headers.get("content-type")?.includes("application/json");
	const data = isJson ? await res.json() : await res.text();
	if (!res.ok) throw new Error(isJson ? data.message : data);

	return data; // { photoIds:[id] }
};

/* ───────────────── deleteRecommendationPhoto ✅ ───────────────── */
export const deleteRecommendationPhoto = async (recId, photoId) =>
	apiFetch(`/v2/recommendations/${recId}/photos/${photoId}`, {
		method: "DELETE",
		csrf: true,
	});

/* ───────────────── deleteRecommendation ✅ ───────────────── */
export const deleteRecommendation = async (recommendationId) =>
	apiFetch(`/v2/recommendations/${recommendationId}`, {
		method: "DELETE",
		csrf: true,
	});

/* ───────────────── unfollowUser ✅ ───────────────── */
export const unfollowUser = async (userId) =>
	apiFetch(`/users/${userId}/follow`, {
		method: "DELETE",
		csrf: true,
	});
// ───────────────── followUser ✅ ─────────────────
export const followUser = async (userId) =>
	apiFetch(`/users/${userId}/follow`, {
		method: "POST",
		csrf: true,
	});
// router.get("users/:userId/followers", getUserFollowers);

// ───────────────── getUserFollowing ✅ ─────────────────
export const getUserFollowing = async (userId, page = 1, limit = 10) => {
	const data = await apiFetch(`/users/${userId}/following`, {
		method: "GET",
	});
	return data;
};
// ───────────────── getUserFollowers ✅ ─────────────────
export const getUserFollowers = async (userId, page = 1, limit = 10) => {
	const data = await apiFetch(`/users/${userId}/followers`, {
		method: "GET",
	});
	return data;
};

/**
 * Search for users, trips, or recommendations.
 * @param {string} searchTerm - The query string.
 * @param {string} searchType - One of "user", "trip", "recommendation".
 * @returns {Promise<{items: Array}>}
 */
//NOT IN USE NOW
export const searchApi = async (searchTerm, searchType) => {
	const params = new URLSearchParams();
	params.append("q", searchTerm);
	params.append("type", searchType);

	const data = await apiFetch(`/v2/search?${params.toString()}`, {
		method: "GET",
		auth: true,
		csrf: true,
	});
	return Array.isArray(data) ? data : [];
};

/**
 * Users-only search (page & limit optional).
 */
export const searchUsersApi = async (searchTerm, page = 1, limit = 20) => {
	const params = new URLSearchParams({ q: searchTerm, page, limit });
	const data = await apiFetch(`/v2/search/users?${params}`, {
		// const data = await apiFetch(`/v2/search/users?${params.toString()}`, {
		method: "GET",
		// auth: true,
		csrf: true,
	});
	return Array.isArray(data) ? data : [];
};

/**
 * Paginated gallery for a given user.
 * Falls back to [] if API returns non-array.
 */
export const fetchUserPhotosApi = async (userId, page = 1, limit = 20) => {
	const params = new URLSearchParams({ page, limit });
	const data = await apiFetch(`/users/v2/${userId}/photos?${params}`, {
		method: "GET",
		auth: true,
		csrf: true,
	});
	return data?.data ?? []; // API shape: { data, page, ... }
};
///////////////////////////////////////
// router.get("/search", protect, searchUsers);
// router.get("users/:userId/pois", getUserPois);
// `${API_URL}/photos/${entry.photoId}`;
