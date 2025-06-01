import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";

import TripCardContainer from "@/src/components/TripCardContainer";
import CommentsSheet from "@/src/components/sheets/CommentsSheet";
import LikersSheet from "@/src/components/sheets/LikersSheet";
import RecommendationsSheet from "@/src/components/sheets/RecommendationsSheet";

import { getFeedTripJson } from "@/src/services/api";
import { useTripSocialStore } from "@/src/stores/tripSocialStore";
import { theme } from "@/src/theme";

/* ------------------------------------------------------------------ */
/* screen                                                              */
/* ------------------------------------------------------------------ */
export default function FeedScreen() {
	/* paging state */
	const [items, setItems] = useState([]);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(false);
	const [hasMore, setHasMore] = useState(true);

	/* bottom-sheet state */
	const [sheetType, setSheetType] = useState(null); // 'likers'|'comments'|'recs'
	const [selectedTrip, setSelected] = useState(null);

	const router = useRouter();
	const { primeCounts } = useTripSocialStore(); // prime slice

	/* -------------------------------------------------------------- */
	/* fetch one page                                                 */
	/* -------------------------------------------------------------- */
	const loadPage = useCallback(async () => {
		if (loading || !hasMore) return;
		setLoading(true);
		try {
			const { items: fetched } = await getFeedTripJson(page);
			/* cache counts for optimistic sync */
			fetched.forEach(primeCounts);
			// console.log("FEED TRIP/items", items[0]);

			setItems((prev) => [...prev, ...fetched]);
			setHasMore(fetched.length > 0);
			setPage((p) => p + 1);
		} catch (err) {
			console.error("feed fetch error", err);
			setHasMore(false);
		} finally {
			setLoading(false);
		}
	}, [loading, hasMore, page]);

	useEffect(() => {
		loadPage();
	}, []); // first mount

	/* -------------------------------------------------------------- */
	/* sheet helpers                                                  */
	/* -------------------------------------------------------------- */
	const openSheet = (type, trip) => {
		setSelected(trip);
		setSheetType(type);
	};
	const closeSheet = () => setSheetType(null);

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
						onPress={() => router.push(`/trip/${item._id}`)}
					/>
				)}
				contentContainerStyle={{
					paddingHorizontal: theme.space.md,
					paddingTop: theme.space.sm,
					paddingBottom: theme.space.sm,
				}}
				onEndReached={loadPage}
				onEndReachedThreshold={0.3}
				ListFooterComponent={loading ? <ActivityIndicator /> : null}
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
