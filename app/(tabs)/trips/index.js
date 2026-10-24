import PendingTripDeletions from "@/src/components/PendingTripDeletions";
import useProfileList from "@/src/hooks/useProfileList";
import ProfileListStatus from "@/src/components/ProfileListStatus";
import { recordAuthDiagnostic } from "@/src/utils/authDiagnostics";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";

import TripCardContainer from "@/src/components/TripCardContainer";
import CommentsSheet from "@/src/components/sheets/CommentsSheet";
import LikersSheet from "@/src/components/sheets/LikersSheet";
import RecommendationsSheet from "@/src/components/sheets/RecommendationsSheet";

import { getMyJsonTrips } from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { useTripSocialStore } from "@/src/stores/tripSocialStore";
import { theme } from "@/src/theme";

const loadMyTrips = async (_userId, page, limit) => {
	const { items } = await getMyJsonTrips(page, limit);
	return { data: items, hasNext: items.length > 0 };
};

export default function MyTrips() {
	const user = useAuthStore((s) => s.user);
	const username = user?.username || "Unknown User";
	const router = useRouter();
	const { primeCounts } = useTripSocialStore();
	// Share the same session-scoped invalidation as feed/profile lists. A late
	// pre-deletion page cannot repopulate this replacement list or its sheets.
	const { identity, items, loading, initialLoading, refreshing, error, refresh: onRefresh, loadMore, refreshOnNextFocus } = useProfileList(user?._id, loadMyTrips);
	useEffect(() => { items.forEach(primeCounts); }, [items, primeCounts]);
	const [sheet, setSheet] = useState(null);
	const selectedTrip = sheet?.identity === identity ? sheet.trip : null;
	const sheetType = selectedTrip ? sheet.type : null;
	const openSheet = (type, trip) => setSheet({ identity, type, trip });
	const closeSheet = () => setSheet(null);

	/* ---------------------------------------------------------------- */
	/* render                                                           */
	/* ---------------------------------------------------------------- */
	return (
		<View onLayout={() => recordAuthDiagnostic("trips:layout")} style={{ flex: 1, backgroundColor: theme.colors.background }}>
			<FlatList
				ListHeaderComponent={<PendingTripDeletions />}
				data={items}
				keyExtractor={(t) => t._id}
				renderItem={({ item }) => (
					<TripCardContainer
						trip={item}
						onOpenSheet={openSheet}
						onPress={() => { refreshOnNextFocus(); router.push(`/trip/${item._id}`); }}
						/* TripCard needs userName explicitly */
						userNameOverride={username}
						user={user}
					/>
				)}
				contentContainerStyle={{
					paddingHorizontal: theme.space.md,
					paddingTop: theme.space.sm,
					paddingBottom: theme.space.sm,
				}}
				onEndReached={loadMore}
				onEndReachedThreshold={0.3}
				ListFooterComponent={items.length > 0 ? loading ? <ActivityIndicator style={{ margin: 16 }} /> : error ? <ProfileListStatus error={error} onRetry={onRefresh} /> : null : null}
				ListEmptyComponent={<ProfileListStatus loading={initialLoading || loading} error={error} onRetry={onRefresh} emptyMessage="No trips yet." />}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
				}
			/>

			{/* ---- reusable bottom-sheets (one copy each) ---- */}
			<LikersSheet trip={selectedTrip} visible={sheetType === "likers"} onClose={closeSheet} />
			<CommentsSheet trip={selectedTrip} visible={sheetType === "comments"} onClose={closeSheet} />
			<RecommendationsSheet
				trip={selectedTrip}
				userId={user?._id}
				visible={sheetType === "recs"}
				onClose={closeSheet}
			/>
		</View>
	);
}
