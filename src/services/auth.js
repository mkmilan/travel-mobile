import Constants from "expo-constants";
import { apiFetch } from "./api";

const API_URL = Constants.expoConfig.extra.API_URL;

export async function loginRequest(email, password) {
	return apiFetch("/auth/login", {
		method: "POST",
		csrf: true,
		auth: false, // no token yet
		body: JSON.stringify({ email, password }),
	});
}

export async function registerRequest(username, email, password) {
	return apiFetch("/auth/register", {
		method: "POST",
		csrf: true,
		auth: false,
		body: JSON.stringify({ username, email, password }),
	});
}

export async function forgotPasswordRequest(email) {
	return apiFetch("/auth/forgotpassword", {
		method: "POST",
		csrf: true,
		auth: false,
		body: JSON.stringify({ email }),
	});
}

export async function resetPasswordRequest(token, password) {
	return apiFetch(`/auth/resetpassword/${token}`, {
		method: "POST",
		csrf: true,
		auth: false,
		body: JSON.stringify({ password }),
	});
}
