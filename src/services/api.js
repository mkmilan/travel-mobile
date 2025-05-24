import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as Updates from "expo-updates";
import { getCsrfToken } from "./csrf";

const extra =
	Constants.expoConfig?.extra ||
	Updates.manifest?.extra ||
	Constants.manifest?.extra ||
	{};

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
	console.error(
		"[api] API_URL is not defined in app.config.js › extra. " +
			"Feed calls will fail."
	);
}

/* ------------------------------------------------------------------ *
 * core fetch wrapper
 * ------------------------------------------------------------------ */
export async function apiFetch(
	path,
	{ method = "GET", auth = true, csrf = false, ...options } = {}
) {
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
export const getFeedTrips = async (page = 1, pageSize = 10) => {
	const data = await apiFetch(`/trips/feed?page=${page}&limit=${pageSize}`, {
		method: "GET",
	});
	// Server sends an array directly; normalize to { items }
	console.log("[api] getFeedTrips data", data);

	return { items: Array.isArray(data) ? data : data.items || [] };
};

// ───────────────── getMyTrips  ✅ ─────────────────
export const getMyTrips = async (page = 1, pageSize = 10) => {
	const data = await apiFetch(`/trips/me?page=${page}&limit=${pageSize}`, {
		method: "GET",
	});
	// console.log("[api] getMyTrips data", data);
	return { items: Array.isArray(data) ? data : data.items || [] };
};

// ───────────────── uploadTripJson ✅ ─────────────────
export const uploadTripJson = async (payload, csrf = true) => {
	// console.log("[api] uploadTripJson payload", payload);

	return await apiFetch(`/v2/trips/json`, {
		method: "POST",
		csrf,
		body: JSON.stringify(payload),
	});
};
