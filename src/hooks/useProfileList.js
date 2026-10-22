import { createPagedList } from "@/src/utils/pagedList";
import { useAuthStore } from "@/src/stores/auth";
import { useFocusEffect } from "expo-router/react-navigation";
import { useCallback, useMemo, useSyncExternalStore } from "react";

export default function useProfileList(userId, loadPage, pageSize = 10, cacheKey = "") {
	const session = useAuthStore((state) => state.token);
	// A new profile/account gets its own store immediately; a late response can
	// only update the old store, never expose old profile/private data here.
	const list = useMemo(() => createPagedList(
		(page) => loadPage(userId, page, pageSize), Boolean(userId)
	), [userId, loadPage, pageSize, session, cacheKey]);
	const state = useSyncExternalStore(list.subscribe, list.getSnapshot, list.getSnapshot);
	useFocusEffect(useCallback(() => { void list.ensureLoaded(); }, [list]));
	return { ...state, identity: list, initialLoading: !state.loaded, ensureLoaded: list.ensureLoaded, loadMore: list.loadMore, refresh: list.refresh, setItems: list.setItems };
}
