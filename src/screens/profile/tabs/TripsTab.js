// screens/profile/tabs/TripsTab.js
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";

import TripCard from "@/src/components/TripCard";
import { getTripsByUser } from "@/src/services/api";
import { theme } from "@/src/theme";
import { calcAvgSpeed, isoToDate, kmOrMiles, msToDuration } from "@/src/utils/format";
import { lineStringToCoords } from "@/src/utils/geo";

/**
 * Show trips that belong to <userId>
 * – fetch page-by-page with infinite scroll
 * – pull-to-refresh resets to first page
 */
export default function TripsTab({ userId }) {
	/* ─────────────────── state ─────────────────── */
	const [items, setItems] = useState([]);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [hasNext, setHasNext] = useState(true);
	const [error, setError] = useState(null);

	const router = useRouter();

	/* ─────────────────── helpers ─────────────────── */
	const fetchPage = useCallback(
		async (pageToLoad, replace = false) => {
			if (loading) return;
			setLoading(true);
			try {
				const res = await getTripsByUser(userId, pageToLoad, 10); // controller returns { data, page, totalPages }
				setItems((prev) => (replace ? res.data : [...prev, ...res.data]));
				setHasNext(pageToLoad < res.totalPages);
				setPage(pageToLoad + 1);
				setError(null);
			} catch (e) {
				console.warn("[TripsTab] fetch error", e.message);
				setError(e.message);
			} finally {
				setLoading(false);
				setRefreshing(false);
			}
		},
		[loading, userId]
	);

	/* first time the tab becomes visible */
	useFocusEffect(
		useCallback(() => {
			if (items.length === 0) fetchPage(1, true);
		}, [fetchPage, items.length])
	);

	/* pull to refresh */
	const onRefresh = async () => {
		setRefreshing(true);
		await fetchPage(1, true);
	};

	/* infinite scroll */
	const loadMore = () => {
		if (!loading && hasNext) fetchPage(page);
	};

	/* ─────────────────── render ─────────────────── */
	if (error && items.length === 0) {
		return (
			<View style={{ padding: 24 }}>
				<Text style={{ textAlign: "center", color: theme.colors.error }}>Error: {error}</Text>
			</View>
		);
	}

	return (
		<FlatList
			data={items}
			keyExtractor={(t) => t._id}
			renderItem={({ item }) => (
				<TripCard
					{...item} // spread in case you added more fields later
					userName={item.user?.username || "Unknown"}
					visibility={item.defaultTripVisibility}
					coords={lineStringToCoords(item.simplifiedRoute)}
					travelMode={item.defaultTravelMode}
					title={item.title}
					description={item.description}
					date={isoToDate(item.startDate || item.createdAt)}
					distanceKm={kmOrMiles(item.distanceMeters)}
					durationStr={msToDuration(item.durationMillis)}
					avgSpeed={calcAvgSpeed(item.distanceMeters, item.durationMillis)}
					likes={item.likesCount}
					comments={item.commentsCount}
					onPress={() => router.push(`/trip/${item._id}`)}
				/>
			)}
			contentContainerStyle={{
				paddingHorizontal: theme.space.sm,
				paddingTop: theme.space.sm,
			}}
			onEndReachedThreshold={0.4}
			onEndReached={loadMore}
			ListFooterComponent={loading && items.length > 0 ? <ActivityIndicator style={{ margin: 16 }} /> : null}
			refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
			ListEmptyComponent={
				!loading && items.length === 0 ? (
					<Text style={{ textAlign: "center", marginTop: 32 }}>Nothing to show yet.</Text>
				) : null
			}
		/>
	);
}
