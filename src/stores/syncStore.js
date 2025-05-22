// src/store/syncStore.js
import { create } from "zustand";

export const useSyncStore = create((set) => ({
	isConnected: true,
	setIsConnected: (value) => set({ isConnected: value }),
	// uploadQueue: [],  ← to be fleshed out in next milestone
}));
