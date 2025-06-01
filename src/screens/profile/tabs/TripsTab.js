// screens/profile/tabs/TripsTab.js
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";

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
	const [items, setItems] = useState([]);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [hasNext, setHasNext] = useState(true);
	const [error, setError] = useState(null);

	/* ---------------- sheet state ---------------- */
	const [sheetType, setSheetType] = useState(null); // 'likers' | 'comments' | 'recs'
	const [selectedTrip, setSelectedTrip] = useState(null);

	const router = useRouter();

	/* ---------------- helpers ---------------- */
	const fetchPage = useCallback(
		async (pageToLoad, replace = false) => {
			if (loading || (!hasNext && !replace)) return;
			setLoading(true);
			try {
				const res = await getTripsByUser(userId, pageToLoad, 10); // { data, page, totalPages }

				setItems((prev) => (replace ? res.data : [...prev, ...res.data]));
				setHasNext(pageToLoad < res.totalPages);
				setPage(pageToLoad + 1);
				setError(null);
			} catch (e) {
				console.warn("[TripsTab] fetch error", e.message);
				setError(e.message);
				setHasNext(false); // stop infinite loop on hard error
			} finally {
				setLoading(false);
				setRefreshing(false);
			}
		},
		[loading, userId, hasNext]
	);

	/* first time the tab becomes visible */
	useFocusEffect(
		useCallback(() => {
			if (items.length === 0) fetchPage(1, true);
		}, [fetchPage, items.length])
	);

	/* pull-to-refresh */
	const onRefresh = () => {
		setRefreshing(true);
		fetchPage(1, true);
	};

	/* infinite scroll */
	const loadMore = () => {
		if (!loading && hasNext) fetchPage(page);
	};

	/* bottom-sheet helpers */
	const openSheet = (type, trip) => {
		setSelectedTrip(trip);
		setSheetType(type);
	};
	const closeSheet = () => setSheetType(null);

	/* ---------------- render ---------------- */
	if (error && items.length === 0) {
		return (
			<View style={{ padding: 24 }}>
				<Text style={{ textAlign: "center", color: theme.colors.error }}>Error: {error}</Text>
			</View>
		);
	}

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
					paddingHorizontal: theme.space.sm,
					paddingTop: theme.space.sm,
					paddingBottom: theme.space.sm,
				}}
				onEndReached={loadMore}
				onEndReachedThreshold={0.4}
				ListFooterComponent={loading && items.length > 0 ? <ActivityIndicator style={{ margin: 16 }} /> : null}
				refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
				ListEmptyComponent={
					!loading && items.length === 0 ? (
						<Text style={{ textAlign: "center", marginTop: 32 }}>Nothing to show yet.</Text>
					) : null
				}
			/>

			{/* ---- shared bottom sheets (one copy each) ---- */}
			<LikersSheet trip={selectedTrip} visible={sheetType === "likers"} onClose={closeSheet} />
			<CommentsSheet trip={selectedTrip} visible={sheetType === "comments"} onClose={closeSheet} />
			<RecommendationsSheet trip={selectedTrip} visible={sheetType === "recs"} onClose={closeSheet} />
		</View>
	);
}
