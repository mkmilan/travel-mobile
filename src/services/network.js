// src/services/network.js
import { useSyncStore } from "@/store/syncStore";
import NetInfo from "@react-native-community/netinfo";

let unsubscribe;

/** Call once in App.js after stores are initialised */
export function initNetworkWatcher() {
	if (unsubscribe) return;

	unsubscribe = NetInfo.addEventListener((state) => {
		useSyncStore.getState().setIsConnected(state.isConnected);
	});
}
