import TripCard from "@/src/components/TripCard";
import { getMyJsonTrips } from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import {
	calcAvgSpeed,
	isoToDate,
	kmOrMiles,
	msToDuration,
} from "@/src/utils/format";
import { lineStringToCoords } from "@/src/utils/geo";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";

export default function MyTrips() {
	const [items, setItems] = useState([]);
	const [refreshing, setRefreshing] = useState(false);
	const user = useAuthStore((state) => state.user || "Unknown User");
	// console.log("User data in MyTrips:", user);
	const router = useRouter(); // Initialize router for navigation
	const username = user?.username || "Unknown User";
	console.log("Rendering MyTrips with username:", username);

	const fetchTrips = useCallback(async () => {
		setRefreshing(true);
		const { items } = await getMyJsonTrips();
		setItems(items);
		setRefreshing(false);
	}, []);

	useFocusEffect(
		useCallback(() => {
			fetchTrips();
		}, [fetchTrips])
	);

	return (
		<View
			style={{
				flex: 1,
				backgroundColor: theme.colors.background,
				paddingHorizontal: theme.space.md,
			}}
		>
			<FlatList
				data={items}
				keyExtractor={(t, i) => (t._id ? String(t._id) : `idx-${i}`)}
				renderItem={({ item }) => (
					<TripCard
						title={item.title}
						userName={username}
						visibility={item.defaultTripVisibility}
						description={item.description}
						date={isoToDate(item.startDate)}
						distanceKm={kmOrMiles(item.distanceMeters)}
						durationStr={msToDuration(item.durationMillis)}
						avgSpeed={calcAvgSpeed(item.distanceMeters, item.durationMillis)}
						travelMode={item.defaultTravelMode}
						likes={item.likesCount}
						comments={item.commentsCount}
						coords={lineStringToCoords(item.simplifiedRoute)}
						onPress={() => router.push(`/trip/${item._id}`)}
					/>
				)}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={fetchTrips}
						tintColor={theme.colors.primary} /* optional */
					/>
				}
			/>
		</View>
	);
}
