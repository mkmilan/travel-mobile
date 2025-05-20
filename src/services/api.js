import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { getCsrfToken } from "./csrf";

const API_URL = Constants.expoConfig.extra.API_URL;

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
		const token = await SecureStore.getItemAsync("token");
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
export const getFeedTrips = (page = 1) =>
	apiFetch(`/trips/feed?page=${page}`, { method: "GET" });

export const getUserTrips = (userId, page = 1) =>
	apiFetch(`/users/${userId}/trips?page=${page}`, { method: "GET" });
