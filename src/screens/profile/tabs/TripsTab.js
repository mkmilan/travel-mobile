// screens/profile/tabs/TripsTab.js
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";

import useProfileList from "@/src/hooks/useProfileList";
import ProfileListStatus from "@/src/components/ProfileListStatus";
import TripCardContainer from "@/src/components/TripCardContainer";
import CommentsSheet from "@/src/components/sheets/CommentsSheet";
import LikersSheet from "@/src/components/sheets/LikersSheet";
import RecommendationsSheet from "@/src/components/sheets/RecommendationsSheet";

import { getTripsByUser } from "@/src/services/api";
import { theme } from "@/src/theme";

/* ------------------------------------------------------------------ */
/* Show trips that belong to profile <userId>                         */
/* ------------------------------------------------------------------ */
export default function TripsTab({ userId }) {
	/* ---------------- local list state ---------------- */
	const { identity, items, loading, initialLoading, refreshing, error, refresh: onRefresh, loadMore } = useProfileList(userId, getTripsByUser);

	/* ---------------- sheet state ---------------- */
	const [sheet, setSheet] = useState(null);
	const selectedTrip = sheet && sheet.identity === identity ? sheet.trip : null;
	const sheetType = selectedTrip ? sheet.type : null;

	const router = useRouter();

	/* bottom-sheet helpers */
	const openSheet = (type, trip) => {
		setSheet({ identity, trip, type });
	};
	const closeSheet = () => setSheet(null);

	/* ---------------- render ---------------- */
	return (
		<View style={{ flex: 1, backgroundColor: theme.colors.background }}>
			<FlatList
				data={items}
				keyExtractor={(t) => t._id}
				renderItem={({ item }) => (
					<TripCardContainer
						user={item.user}
						trip={item}
						onOpenSheet={openSheet}
						onPress={() => router.push(`/trip/${item._id}`)}
					/>
				)}
				contentContainerStyle={{
					flexGrow: 1,
					paddingHorizontal: theme.space.sm,
					paddingTop: theme.space.sm,
					paddingBottom: theme.space.sm,
				}}
				onEndReached={loadMore}
				onEndReachedThreshold={0.4}
				ListFooterComponent={items.length > 0 ? (loading ? <ActivityIndicator style={{ margin: 16 }} /> : error ? <ProfileListStatus error={error} onRetry={onRefresh} /> : null) : null}
				refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
				ListEmptyComponent={<ProfileListStatus loading={initialLoading || loading} error={error} onRetry={onRefresh} emptyMessage="Nothing to show yet." />}
			/>

			{/* ---- shared bottom sheets (one copy each) ---- */}
			<LikersSheet trip={selectedTrip} visible={sheetType === "likers"} onClose={closeSheet} />
			<CommentsSheet trip={selectedTrip} visible={sheetType === "comments"} onClose={closeSheet} />
			<RecommendationsSheet trip={selectedTrip} visible={sheetType === "recs"} onClose={closeSheet} />
		</View>
	);
}
