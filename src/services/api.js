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
	}

	/* attach JWT if authenticated route */
	if (auth) {
		const token = await SecureStore.getItemAsync("auth-token");
		if (token) headers["Authorization"] = `Bearer ${token}`;
	}

	const res = await fetch(`${API_URL}${path}`, { method, headers, ...options });

	/* safe JSON parse */
	const isJson = res.headers.get("content-type")?.includes("application/json");
	const data = isJson ? await res.json() : await res.text();

	if (!res.ok) {
		const msg = isJson ? data.message || JSON.stringify(data) : data;
		throw new Error(msg || `Request failed (${res.status})`);
	}

	return data;
}

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
	const data = await apiFetch(`/users/user/${userId}`, {
		method: "GET",
	});
	console.log(`[api] getPublicUserById user data`, data);

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

//targeted user id is userId our/user that make call is in req
export const getTripsByUser = async (userId, page = 1, limit = 10) => {
	const data = await apiFetch(`/v2/trips/json/user/${userId}?page=${page}&limit=${limit}`, {
		method: "GET",
	});
	// console.log("[api] getTripsByUser data", data);

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
	console.log(`[api] getTripLikers  data`, data);
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
	console.log(`[api] addTripComment data`, data);
	return data;
};

export const deleteTripComment = async (tripId, commentId) => {
	// router.route("trips/:tripId/comments/:commentId").delete(protect, deleteCommentFromTrip);
	const data = await apiFetch(`/trips/${tripId}/comments/${commentId}`, {
		method: "DELETE",
		csrf: true,
	});
	console.log(`[api] deleteTripComment data`, data);
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

///////////////////////////////////////
// router.get("/search", protect, searchUsers);
// router.post("users/:userId/follow", protect, followUser);
// router.delete("users/:userId/follow", protect, unfollowUser);
// router.get("users/:userId/pois", getUserPois);
// router.get("users/:userId/followers", getUserFollowers);
// router.get("users/:userId/following", getUserFollowing);
// router.get("users/:userId/photos", getUserPhotos);
// router.post("trips/:tripId/photos", protect, uploadMultiplePhotos, uploadTripPhotos);
// router.delete("trips/:tripId/photos/:photoId", protect, deleteTripPhoto);
