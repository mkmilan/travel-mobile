import * as authService from "@/src/services/auth";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { stopActiveRecording } from "../utils/stopActiveRecording";
import { getAppLanguage, getAppThemePreference } from "../constants/presentationPreferences";

const STORAGE_KEYS = {
	user: "user-data",
	token: "auth-token",
};

const isValidUser = (obj) =>
	obj && typeof obj === "object" && typeof obj._id === "string" && typeof obj.username === "string";

export const useAuthStore = create((set, get) => ({
	user: null,
	token: null,
	theme: getAppThemePreference(),
	language: getAppLanguage(),
	loading: false,
	isAuthenticated: false,
	isHydrating: true,

	/* ─────────────────── LOGIN ─────────────────── */
	login: async (userData) => {
		if (get().user?._id && get().user._id !== userData._id) await stopActiveRecording();
		// console.log("LOGIN CALLED", userData);
		// Persist
		await SecureStore.setItemAsync(STORAGE_KEYS.user, JSON.stringify(userData));
		await SecureStore.setItemAsync(STORAGE_KEYS.token, userData.token);
		// console.log("AuthStore: login userData", userData);

		// State
		set({
			user: userData,
			token: userData.token,
			isAuthenticated: true,
			theme: getAppThemePreference(userData.settings?.themePreference),
			language: getAppLanguage(userData.settings?.language),
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
		// Keep unsynced trips in SQLite for their owner, but stop location collection.
		await stopActiveRecording();
		// 1. clear every social cache so mounted screens stop poking the API
		try {
			require("@/src/stores/tripSocialStore").useTripSocialStore.getState().reset();
		} catch (_) {} // ignore if the store hasn't been loaded yet

		await SecureStore.deleteItemAsync(STORAGE_KEYS.user);
		await SecureStore.deleteItemAsync(STORAGE_KEYS.token);
		set({
			user: null,
			token: null,
			isAuthenticated: false,
			theme: getAppThemePreference(),
			language: getAppLanguage(),
			loading: false,
		});
		// router.replace("/login");
	},

	/* ─────────────────── HYDRATE ─────────────────── */
	syncFromStorage: async () => {
		set({ isHydrating: true });
		try {
			const userStr = await SecureStore.getItemAsync(STORAGE_KEYS.user);
			const token = await SecureStore.getItemAsync(STORAGE_KEYS.token);
			const user = userStr ? JSON.parse(userStr) : null;

			if (user && token) {
				set({
					user,
					token,
					isAuthenticated: true,
					theme: getAppThemePreference(user.settings?.themePreference),
					language: getAppLanguage(user.settings?.language),
				});
			}
		} catch (err) {
			console.error("AuthStore: syncFromStorage failed", err);
		} finally {
			set({ isHydrating: false });
		}
	},

	/* ─────────────────── SETTERS ─────────────────── */
	setTheme: (t) => set({ theme: getAppThemePreference(t) }),
	setLanguage: (l) => set({ language: getAppLanguage(l) }),

	/* ─────────────────── UPDATE USER (safe-merge) ─────────────────── */
	/**
	 * Accepts the *full* user object returned by the API **or** a partial patch.
	 * - It keeps the existing `token` intact.
	 * - It validates the payload; if it looks fishy we ignore it and warn.
	 * - It persists the fresh user into SecureStore so the next cold start
	 *   already has the new data.
	 */
	updateUser: async (freshData = {}) => {
		const prev = get().user || {};
		const next = { ...prev, ...freshData };

		if (!isValidUser(next)) {
			console.warn("[AuthStore] updateUser ignored – payload failed validation");
			return false;
		}

		// Write to state
		set({
			user: next,
			// Effective presentation is gated; preserve the original user settings.
			theme: getAppThemePreference(next.settings?.themePreference ?? get().theme),
			language: getAppLanguage(next.settings?.language ?? get().language),
		});

		// Persist – don’t overwrite the token
		await SecureStore.setItemAsync(STORAGE_KEYS.user, JSON.stringify(next));

		return true;
	},
}));
