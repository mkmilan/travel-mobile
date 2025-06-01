import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";

import TripCardContainer from "@/src/components/TripCardContainer";
import CommentsSheet from "@/src/components/sheets/CommentsSheet";
import LikersSheet from "@/src/components/sheets/LikersSheet";
import RecommendationsSheet from "@/src/components/sheets/RecommendationsSheet";

import { getMyJsonTrips } from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { useTripSocialStore } from "@/src/stores/tripSocialStore";
import { theme } from "@/src/theme";

/* ------------------------------------------------------------------ */
/* screen component                                                   */
/* ------------------------------------------------------------------ */
export default function MyTrips() {
	/* ---------- local state ---------- */
	const [items, setItems] = useState([]);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [hasMore, setHasMore] = useState(true);

	/* ---------- sheet state ---------- */
	const [sheetType, setSheetType] = useState(null); // 'likers' | 'comments' | 'recs'
	const [selectedTrip, setSelectedTrip] = useState(null);

	/* ---------- helpers ---------- */
	const user = useAuthStore((s) => s.user || {});
	const username = user?.username || "Unknown User";
	const router = useRouter();
	const { primeCounts } = useTripSocialStore();

	/* ---------------- fetch one page ---------------- */
	const loadPage = useCallback(
		async (pageToLoad = page) => {
			if (loading || (!hasMore && pageToLoad !== 1)) return;
			pageToLoad === 1 ? setRefreshing(true) : setLoading(true);

			try {
				// the endpoint supports ?page & ?limit – if it didn't, you'd set hasMore=false below
				const { items: fetched = [] } = await getMyJsonTrips(pageToLoad, 10);

				fetched.forEach(primeCounts); // cache counts for optimistic sync
				setItems((prev) => (pageToLoad === 1 ? fetched : [...prev, ...fetched]));
				setHasMore(fetched.length > 0);
				setPage(pageToLoad + 1);
			} catch (err) {
				console.error("MyTrips fetch error", err);
				setHasMore(false); // stop infinite retry on hard error
			} finally {
				setLoading(false);
				setRefreshing(false);
			}
		},
		[loading, hasMore, page]
	);

	/* first time the tab comes into focus */
	useFocusEffect(
		useCallback(() => {
			loadPage(1);
		}, [])
	);

	/* pull-to-refresh */
	const onRefresh = () => loadPage(1);

	/* infinite scroll */
	const loadMore = () => loadPage(page);

	/* bottom-sheet helpers */
	const openSheet = (type, trip) => {
		setSelected(trip);
		setSheetType(type);
	};
	const closeSheet = () => setSheetType(null);
	// console.log("selected trip in MY TRIP PAGE", selectedTrip);
	// console.log(`MyTrips render: ${items.length} trips loaded, page ${page}, hasMore=${hasMore}`);

	/* ---------------------------------------------------------------- */
	/* render                                                           */
	/* ---------------------------------------------------------------- */
	return (
		<View style={{ flex: 1, backgroundColor: theme.colors.background }}>
			<FlatList
				data={items}
				keyExtractor={(t) => t._id}
				renderItem={({ item }) => (
					<TripCardContainer
						trip={item}
						onOpenSheet={openSheet}
						onPress={() => router.push(`/trip/${item._id}`)}
						/* TripCard needs userName explicitly */
						userNameOverride={username}
					/>
				)}
				contentContainerStyle={{
					paddingHorizontal: theme.space.md,
					paddingTop: theme.space.sm,
					paddingBottom: theme.space.sm,
				}}
				onEndReached={loadMore}
				onEndReachedThreshold={0.3}
				ListFooterComponent={loading && items.length > 0 ? <ActivityIndicator style={{ margin: 16 }} /> : null}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
				}
			/>

			{/* ---- reusable bottom-sheets (one copy each) ---- */}
			<LikersSheet trip={selectedTrip} visible={sheetType === "likers"} onClose={closeSheet} />
			<CommentsSheet trip={selectedTrip} visible={sheetType === "comments"} onClose={closeSheet} />
			<RecommendationsSheet trip={selectedTrip} userId={user._id} visible={sheetType === "recs"} onClose={closeSheet} />
		</View>
	);
}
