import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import * as authService from "../services/auth";

const STORAGE_KEYS = {
	user: "user-data",
};

export const useAuthStore = create((set, get) => ({
	user: null,
	theme: "system",
	language: "en",
	loading: false,
	isAuthenticated: false,

	login: async (userData) => {
		await SecureStore.setItemAsync(STORAGE_KEYS.user, JSON.stringify(userData));
		console.log("AuthStore: login userData, token stores/auth.js", userData);

		set({
			user: userData,
			isAuthenticated: true,
			theme: userData.settings?.themePreference || "system",
			language: userData.settings?.language || "en",
		});
	},

	register: async (username, email, password) => {
		set({ loading: true });
		console.log("AuthStore: register", username, email, password);
		try {
			// The backend's registerUser sends a success message and an email for verification.
			// It does not log the user in or return user data at this stage.
			const response = await authService.registerRequest(
				username,
				email,
				password
			);
			// You might want to return the response message to the UI to inform the user.
			// No user state is set here as login happens after email verification.
			set({ loading: false });
			return response; // e.g., { success: true, message: "Verification email sent." }
		} catch (error) {
			console.error("AuthStore: register failed", error);
			set({ loading: false });
			throw error; // Re-throw the error to be caught by the calling component
		}
	},

	logout: async () => {
		await SecureStore.deleteItemAsync(STORAGE_KEYS.user);
		set({
			user: null,
			isAuthenticated: false,
			theme: "system",
			language: "en",
		});
	},

	syncFromStorage: async () => {
		set({ loading: true });

		try {
			const userStr = await SecureStore.getItemAsync(STORAGE_KEYS.user);
			const user = userStr ? JSON.parse(userStr) : null;

			if (user) {
				set({
					user,
					isAuthenticated: true,
					theme: user.settings?.themePreference || "system",
					language: user.settings?.language || "en",
				});
			}
		} catch (err) {
			console.error("AuthStore: syncFromStorage failed", err);
		} finally {
			set({ loading: false });
		}
	},

	setTheme: (newTheme) => {
		set({ theme: newTheme });
	},
	setLanguage: (language) => set({ language }),
}));
