// app/(tabs)/feed/index.js
import TripCard from "@/src/components/TripCard";
import { getFeedTripJson } from "@/src/services/api";
import { theme } from "@/src/theme";
import {
	calcAvgSpeed,
	isoToDate,
	kmOrMiles,
	msToDuration,
} from "@/src/utils/format";
import { lineStringToCoords } from "@/src/utils/geo";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
const router = useRouter();

export default function FeedScreen() {
	const [trips, setTrips] = useState([]);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(false);
	const [hasMore, setHasMore] = useState(true);

	useEffect(() => {
		loadPage();
	}, []);

	const loadPage = async () => {
		if (loading || !hasMore) return;
		setLoading(true);
		try {
			const { items } = await getFeedTripJson(page);

			setTrips((prev) => [...prev, ...items]); // adjust field names to API
			setHasMore(items.length > 0);
			setPage((prevPage) => prevPage + 1); // use functional update for setPage
		} catch (err) {
			console.error("feed fetch error", err.message);
			// if (err.message.toLowerCase().includes("not authorized")) {
			setHasMore(false);
			return; // prevents infinite loop
			// }
		} finally {
			setLoading(false);
		}
	};

	return (
		<View style={styles.container}>
			<FlatList
				data={trips}
				keyExtractor={(item, index) =>
					item._id ? String(item._id) : `idx-${index}`
				}
				renderItem={({ item }) => (
					<TripCard
						{...item} // title, description, etc.
						// coords={item.coords} // array from API
						userName={item.user?.username || "Unknown User"}
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
					paddingTop: theme.space.lg,
				}}
				onEndReached={loadPage}
				onEndReachedThreshold={0.3} // trigger when 30% from bottom
				ListFooterComponent={loading ? <ActivityIndicator /> : null}
			/>
		</View>
	);
}
const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: theme.colors.background },
});
