import * as authService from "@/src/services/auth";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

const STORAGE_KEYS = {
	user: "user-data",
	token: "auth-token",
};

export const useAuthStore = create((set, get) => ({
	user: null,
	token: null,
	theme: "system",
	language: "en",
	loading: false,
	isAuthenticated: false,

	/* ─────────────────── LOGIN ─────────────────── */
	login: async (userData) => {
		// Persist
		await SecureStore.setItemAsync(STORAGE_KEYS.user, JSON.stringify(userData));
		await SecureStore.setItemAsync(STORAGE_KEYS.token, userData.token);

		// State
		set({
			user: userData,
			token: userData.token,
			isAuthenticated: true,
			theme: userData.settings?.themePreference || "system",
			language: userData.settings?.language || "en",
		});
	},

	/* ─────────────────── REGISTER ─────────────────── */
	register: async (username, email, password) => {
		set({ loading: true });
		try {
			const res = await authService.registerRequest(username, email, password);
			return res; // { success, message }
		} finally {
			set({ loading: false });
		}
	},

	/* ─────────────────── LOGOUT ─────────────────── */
	logout: async () => {
		await SecureStore.deleteItemAsync(STORAGE_KEYS.user);
		await SecureStore.deleteItemAsync(STORAGE_KEYS.token);
		set({
			user: null,
			token: null,
			isAuthenticated: false,
			theme: "system",
			language: "en",
		});
	},

	/* ─────────────────── HYDRATE ─────────────────── */
	syncFromStorage: async () => {
		set({ loading: true });
		try {
			const userStr = await SecureStore.getItemAsync(STORAGE_KEYS.user);
			const token = await SecureStore.getItemAsync(STORAGE_KEYS.token);
			const user = userStr ? JSON.parse(userStr) : null;

			if (user && token) {
				set({
					user,
					token,
					isAuthenticated: true,
					// theme: user.settings?.themePreference || "system",

					theme: "light",
					language: user.settings?.language || "en",
				});
			}
		} catch (err) {
			console.error("AuthStore: syncFromStorage failed", err);
		} finally {
			set({ loading: false });
		}
	},

	/* ─────────────────── SETTERS ─────────────────── */
	setTheme: (t) => set({ theme: t }),
	setLanguage: (l) => set({ language: l }),
}));
