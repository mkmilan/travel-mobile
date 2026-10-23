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

// SecureStore writes cannot be cancelled once dispatched. Serialize profile
// persistence and login/logout so an older write can never finish after the
// newer session has been persisted. A rejected write must not poison the queue.
let storageQueue = Promise.resolve();
const withAuthStorage = (operation) => {
	const result = storageQueue.then(operation);
	storageQueue = result.catch(() => {});
	return result;
};

export const useAuthStore = create((set, get) => ({
	user: null,
	token: null,
	theme: getAppThemePreference(),
	language: getAppLanguage(),
	loading: false,
	isAuthenticated: false,
	isHydrating: true,
	sessionEpoch: 0,
	isSessionChanging: false,

	// Capture before the first await, not when a response arrives. The epoch
	// distinguishes a logout/login cycle even if both user and token are reused.
	captureSession: () => {
		const state = get();
		return state.isAuthenticated && !state.isSessionChanging && state.user?._id && state.token
			? { epoch: state.sessionEpoch, userId: state.user._id, token: state.token } : null;
	},
	isSessionCurrent: (session) => {
		const state = get();
		return !!session && state.isAuthenticated && !state.isSessionChanging
			&& session.epoch === state.sessionEpoch && session.userId === state.user?._id && session.token === state.token;
	},

	/* ─────────────────── LOGIN ─────────────────── */
	login: async (userData) => {
		const epoch = get().sessionEpoch + 1;
		set({ sessionEpoch: epoch, isSessionChanging: true });
		try {
			if (get().user?._id && get().user._id !== userData._id) await stopActiveRecording();
			return await withAuthStorage(async () => {
				if (get().sessionEpoch !== epoch) return false;
				await SecureStore.setItemAsync(STORAGE_KEYS.user, JSON.stringify(userData));
				if (get().sessionEpoch !== epoch) return false;
				await SecureStore.setItemAsync(STORAGE_KEYS.token, userData.token);
				if (get().sessionEpoch !== epoch) return false;
				set({
					user: userData,
					token: userData.token,
					isAuthenticated: true,
					isHydrating: false,
					theme: getAppThemePreference(userData.settings?.themePreference),
					language: getAppLanguage(userData.settings?.language),
				});
				return true;
			});
		} finally {
			if (get().sessionEpoch === epoch) set({ isSessionChanging: false });
		}
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
		const epoch = get().sessionEpoch + 1;
		set({ sessionEpoch: epoch, isSessionChanging: true });
		try {
			// Keep unsynced trips in SQLite for their owner, but stop collection.
			await stopActiveRecording();
			return await withAuthStorage(async () => {
				if (get().sessionEpoch !== epoch) return false;
				try {
					require("@/src/stores/tripSocialStore").useTripSocialStore.getState().reset();
				} catch (_) {} // ignore if the store hasn't been loaded yet
				await SecureStore.deleteItemAsync(STORAGE_KEYS.user);
				if (get().sessionEpoch !== epoch) return false;
				await SecureStore.deleteItemAsync(STORAGE_KEYS.token);
				if (get().sessionEpoch !== epoch) return false;
				set({
					user: null,
					token: null,
					isAuthenticated: false,
					isHydrating: false,
					theme: getAppThemePreference(),
					language: getAppLanguage(),
					loading: false,
				});
				return true;
			});
		} finally {
			if (get().sessionEpoch === epoch) set({ isSessionChanging: false });
		}
	},

	/* ─────────────────── HYDRATE ─────────────────── */
	syncFromStorage: async () => {
		const epoch = get().sessionEpoch + 1;
		set({ isHydrating: true, sessionEpoch: epoch, isSessionChanging: true });
		try {
			await withAuthStorage(async () => {
				if (get().sessionEpoch !== epoch) return;
				const userStr = await SecureStore.getItemAsync(STORAGE_KEYS.user);
				const token = await SecureStore.getItemAsync(STORAGE_KEYS.token);
				if (get().sessionEpoch !== epoch) return;
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
			});
		} catch {
			console.error("AuthStore: syncFromStorage failed");
		} finally {
			if (get().sessionEpoch === epoch) set({ isHydrating: false, isSessionChanging: false });
		}
	},

	/* ─────────────────── SETTERS ─────────────────── */
	setTheme: (t) => set({ theme: getAppThemePreference(t) }),
	setLanguage: (l) => set({ language: getAppLanguage(l) }),

	/* ─────────────────── UPDATE USER (session-bound merge) ─────────────────── */
	// API completions pass the session captured before dispatch and, for screens,
	// their mounted-operation guard. Direct synchronous patches use the live session.
	updateUser: async (freshData = {}, session = get().captureSession(), canApply = () => true) => {
		const isCurrent = () => get().isSessionCurrent(session) && canApply();
		if (!isCurrent() || !freshData || typeof freshData !== "object" || Array.isArray(freshData)
			|| (freshData._id !== undefined && freshData._id !== session.userId)) return false;
		return withAuthStorage(async () => {
			if (!isCurrent()) return false;
			const prev = get().user;
			const next = { ...prev, ...freshData, token: get().token };
			if (freshData.settings && typeof freshData.settings === "object") {
				next.settings = { ...prev.settings, ...freshData.settings };
			}
			if (!isValidUser(next)) return false;
			await SecureStore.setItemAsync(STORAGE_KEYS.user, JSON.stringify(next));
			if (!isCurrent()) return false;
			set({
				user: next,
				// Gate effective presentation; preserve saved account preferences.
				theme: getAppThemePreference(next.settings?.themePreference ?? get().theme),
				language: getAppLanguage(next.settings?.language ?? get().language),
			});
			return true;
		});
	},
}));
