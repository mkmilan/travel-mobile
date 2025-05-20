import TripCard from "@/src/components/TripCard";
import { getMyTrips } from "@/src/services/api";
import { theme } from "@/src/theme";
import {
	calcAvgSpeed,
	isoToDate,
	kmOrMiles,
	msToDuration,
} from "@/src/utils/format";
import { lineStringToCoords } from "@/src/utils/geo";
import { useEffect, useState } from "react";
import { FlatList, View } from "react-native";

export default function MyTrips() {
	const [items, setItems] = useState([]);

	useEffect(() => {
		(async () => {
			const res = await getMyTrips();
			setItems(res.items || res); // supports array response
		})();
	}, []);

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
				keyExtractor={(t) => t._id}
				renderItem={({ item }) => (
					<TripCard
						title={item.title}
						description={item.description}
						date={isoToDate(item.startDate)}
						distanceKm={kmOrMiles(item.distanceMeters)}
						durationStr={msToDuration(item.durationMillis)}
						avgSpeed={calcAvgSpeed(item.distanceMeters, item.durationMillis)}
						travelMode={item.defaultTravelMode}
						likes={item.likesCount}
						comments={item.commentsCount}
						coords={lineStringToCoords(item.simplifiedRoute)}
					/>
				)}
			/>
		</View>
	);
}
