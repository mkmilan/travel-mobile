import Constants from "expo-constants";
import { getCsrfToken } from "./csrf";

const API_URL = Constants.expoConfig.extra.API_URL;

export async function loginRequest(email, password) {
	try {
		const csrfToken = await getCsrfToken();

		const res = await fetch(`${API_URL}/auth/login`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-CSRF-Token": csrfToken,
			},
			credentials: "include", // To send cookies (like _csrf if it gets set and sent)
			body: JSON.stringify({ email, password }),
		});

		const responseData = await res.json();
		if (res.status === 401) {
			throw new Error("Invalid credentials");
		}

		if (!res.ok) {
			throw new Error(
				responseData.message || `Invalid credentials (${res.status})`
			);
		}
		return responseData;
	} catch (error) {
		console.error("Login request failed:", error);

		if (error instanceof Error) {
			throw error;
		} else {
			throw new Error(String(error || "Unknown login error"));
		}
	}
}

export async function registerRequest(username, email, password) {
	try {
		const csrfToken = await getCsrfToken();
		// console.log("registerRequest", username, email, password);

		const res = await fetch(`${API_URL}/auth/register`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-CSRF-Token": csrfToken,
			},
			// credentials: "include", // Typically not needed for registration if not setting cookies immediately
			body: JSON.stringify({ username, email, password }),
		});

		const responseData = await res.json();

		if (!res.ok) {
			// Use message from backend if available, otherwise a generic error
			throw new Error(
				responseData.message || `Registration failed (${res.status})`
			);
		}
		// Backend returns { success: true, message: "..." } on 201
		return responseData;
	} catch (error) {
		console.error("Registration request failed:", error);
		if (error instanceof Error) {
			throw error; // Re-throw if it's already an Error object
		} else {
			// Convert to string or provide a default message
			throw new Error(String(error || "Unknown registration error"));
		}
	}
}

// ...existing imports & login/register functions

export async function forgotPasswordRequest(email) {
	const csrfToken = await getCsrfToken();
	const res = await fetch(`${API_URL}/auth/forgotpassword`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-CSRF-Token": csrfToken,
		},
		body: JSON.stringify({ email }),
	});
	const data = await res.json();
	console.log("forgotPasswordRequest", data);

	if (!res.ok) throw new Error(data.message || "Request failed");
	return data; // { success:true, message:"Email sent" }
}

export async function resetPasswordRequest(token, password) {
	const csrfToken = await getCsrfToken();
	const res = await fetch(`${API_URL}/auth/resetpassword/${token}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-CSRF-Token": csrfToken,
		},
		body: JSON.stringify({ password }),
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.message || "Reset failed");
	return data; // { success:true, message:"Password updated" }
}
