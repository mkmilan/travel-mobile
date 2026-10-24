import { useTripSocialStore } from "@/src/stores/tripSocialStore";
import { createPagedList } from "@/src/utils/pagedList";
import useProfileContext from "@/src/hooks/useProfileContext";
import { useFocusEffect } from "expo-router/react-navigation";
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

export default function useProfileList(userId, loadPage, pageSize = 10, cacheKey = "", refreshOnFocus = false) {
	const context = useProfileContext(userId);
	const deletionRevision = useTripSocialStore(state => state.deletionRevision);
	const sourceReturn = useRef(null);
	// A new profile/account gets its own store immediately; a late response can
	// only update the old store, never expose old profile/private data here.
	const list = useMemo(() => createPagedList(
		(page) => {
			if (!context.isCurrent()) throw new Error("Profile changed; request cancelled");
			return loadPage(userId, page, pageSize);
		}, Boolean(userId)
	), [userId, loadPage, pageSize, context, cacheKey, deletionRevision]);
	const state = useSyncExternalStore(list.subscribe, list.getSnapshot, list.getSnapshot);
	useFocusEffect(useCallback(() => {
		if (sourceReturn.current === list) {
			sourceReturn.current = null;
			void list.refresh();
		} else {
			void list.ensureLoaded();
		}
		return () => { if (refreshOnFocus) sourceReturn.current = list; };
	}, [list, refreshOnFocus]));
	// Profile tabs mark source navigation; My Trips also opts into tab-return
	// refresh to pick up Record uploads. Ordinary profile focus keeps
	// loaded pages and scroll position; an edit with unchanged totals still reloads.
	const refreshOnNextFocus = () => { sourceReturn.current = list; };
	return { ...state, refreshOnNextFocus, identity: list, initialLoading: !state.loaded, ensureLoaded: list.ensureLoaded, loadMore: list.loadMore, refresh: list.refresh, setItems: list.setItems };
}
