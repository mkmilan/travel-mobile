import { useRouter } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";

import useProfileList from "@/src/hooks/useProfileList";
import ProfileListStatus from "@/src/components/ProfileListStatus";
import { useAuthStore } from "@/src/stores/auth";
import { getFollowRevision, subscribeFollowChanges } from "@/src/utils/followActions";
import TripCardContainer from "@/src/components/TripCardContainer";
import CommentsSheet from "@/src/components/sheets/CommentsSheet";
import LikersSheet from "@/src/components/sheets/LikersSheet";
import RecommendationsSheet from "@/src/components/sheets/RecommendationsSheet";

import { getFeedTripJson } from "@/src/services/api";
import { useTripSocialStore } from "@/src/stores/tripSocialStore";
import { theme } from "@/src/theme";

const loadFeedPage = async (_userId, page, limit) => {
	const { items } = await getFeedTripJson(page, limit);
	return { data: items, hasNext: items.length > 0 };
};

/* ------------------------------------------------------------------ */
/* screen                                                              */
/* ------------------------------------------------------------------ */
export default function FeedScreen() {
	const userId = useAuthStore((state) => state.user?._id);
	const followRevision = useSyncExternalStore(subscribeFollowChanges, getFollowRevision, getFollowRevision);
	const { identity, items, loading, initialLoading, refreshing, error, refresh, loadMore, refreshOnNextFocus } = useProfileList(userId, loadFeedPage, 10, followRevision);
	// A changed relationship replaces privacy-dependent data immediately. Ordinary
	// tab returns retain the same list, pages and scroll position.
	const [sheet, setSheet] = useState(null);
	const selectedTrip = sheet?.identity === identity ? sheet.trip : null;
	const sheetType = selectedTrip ? sheet.type : null;
	const router = useRouter();
	const { primeCounts } = useTripSocialStore();
	useEffect(() => { items.forEach(primeCounts); }, [items, primeCounts]);

	/* -------------------------------------------------------------- */
	/* sheet helpers                                                  */
	/* -------------------------------------------------------------- */
	const openSheet = (type, trip) => {
		setSheet({ identity, trip, type });
	};
	const closeSheet = () => setSheet(null);

	/* -------------------------------------------------------------- */
	/* render                                                         */
	/* -------------------------------------------------------------- */
	return (
		<View style={styles.container}>
			<FlatList
				data={items}
				keyExtractor={(t, i) => t._id ?? `idx-${i}`}
				renderItem={({ item }) => (
					<TripCardContainer
						user={item.user}
						trip={item}
						onOpenSheet={openSheet}
						onPress={() => { refreshOnNextFocus(); router.push(`/trip/${item._id}`); }}
					/>
				)}
				contentContainerStyle={{
					flexGrow: 1,
					paddingHorizontal: theme.space.md,
					paddingTop: theme.space.sm,
					paddingBottom: theme.space.sm,
				}}
				onEndReached={loadMore}
				onEndReachedThreshold={0.3}
				ListFooterComponent={items.length > 0 ? loading ? <ActivityIndicator /> : error ? <ProfileListStatus error={error} onRetry={refresh} /> : null : null}
				refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
				ListEmptyComponent={<ProfileListStatus loading={initialLoading || loading} error={error} onRetry={refresh} emptyMessage="No trips in your feed yet." />}
			/>

			{/* shared bottom sheets */}
			<LikersSheet trip={selectedTrip} visible={sheetType === "likers"} onClose={closeSheet} />
			<CommentsSheet trip={selectedTrip} visible={sheetType === "comments"} onClose={closeSheet} />
			<RecommendationsSheet
				trip={selectedTrip}
				userId={selectedTrip?.user?._id}
				visible={sheetType === "recs"}
				onClose={closeSheet}
			/>
		</View>
	);
}

/* ------------------------------------------------------------------ */
/* styling                                                            */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: theme.colors.background },
});
