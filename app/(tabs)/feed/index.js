// app/(tabs)/feed/index.js
import TripCard from "@/src/components/TripCard";
import { getFeedTrips } from "@/src/services/api";
import { theme } from "@/src/theme";
import {
	calcAvgSpeed,
	isoToDate,
	kmOrMiles,
	msToDuration,
} from "@/src/utils/format";
import { lineStringToCoords } from "@/src/utils/geo";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";

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
			const { items } = await getFeedTrips(page);

			setTrips((prev) => [...prev, ...items]); // adjust field names to API
			setHasMore(items.length > 0);
			setPage((prevPage) => prevPage + 1); // use functional update for setPage
		} catch (err) {
			console.error("feed fetch error", err.message);
			if (err.message.toLowerCase().includes("not authorized")) {
				setHasMore(false);
				return; // prevents infinite loop
			}
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
						onPress={() => console.log("open", item._id)}
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
