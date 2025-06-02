import Constants from "expo-constants";

const API_URL = Constants.expoConfig.extra.API_URL; // e.g. http://192.168.1.193:5001/api

/**
 * Get a fresh CSRF token **and** make sure the server’s cookie
 * is stored on the device for the next request.
 */
export async function getCsrfToken() {
	try {
		const res = await fetch(`${API_URL}/csrf-token`, {
			method: "GET",
			credentials: "include", // Important to receive the _csrf cookie IT WAS COMMENTED OUT
		});
		if (!res.ok) {
			const errorData = await res.json().catch(() => ({}));
			throw new Error(errorData.message || `Failed to fetch CSRF token (${res.status})`);
		}
		const data = await res.json();
		return data.csrfToken;
	} catch (error) {
		console.error("Error fetching CSRF token without credentials:", error);
		throw error; // Re-throw to be handled by the caller
	}
}
