import useProfileContext from "@/src/hooks/useProfileContext";
import { searchPageApi } from "@/src/services/api";
import { useTripSocialStore } from "@/src/stores/tripSocialStore";
import { getFollowRevision, subscribeFollowChanges } from "@/src/utils/followActions";
import { createSearchList } from "@/src/utils/searchList";
import { useFocusEffect } from "expo-router/react-navigation";
import { useCallback, useMemo, useSyncExternalStore } from "react";

export default function useSearchResults(query, type, category) {
	const text = query.trim();
	const categoryFilter = type === "recommendations" ? category : "";
	const followRevision = useSyncExternalStore(subscribeFollowChanges, getFollowRevision, getFollowRevision);
	const deletionRevision = useTripSocialStore(state => state.deletionRevision);
	const key = JSON.stringify([text, type, categoryFilter, followRevision, deletionRevision]);
	const context = useProfileContext(key);
	const eligible = text.length >= 2;
	const list = useMemo(() => createSearchList({
		loadPage: page => searchPageApi(text, type, page, 20, categoryFilter, context.isCurrent),
		isCurrent: context.isCurrent, enabled: eligible,
	}), [context, eligible]);
	const state = useSyncExternalStore(list.subscribe, list.getSnapshot, list.getSnapshot);
	useFocusEffect(useCallback(() => {
		list.activate();
		return () => list.deactivate();
	}, [list]));
	return { ...state, eligible, identity: list, context, key, initialLoading: eligible && !state.loaded,
		submit: list.submit, retry: list.retry, refresh: list.refresh, loadMore: list.loadMore };
}
