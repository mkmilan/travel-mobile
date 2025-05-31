// // app/(tabs)/feed/index.js
// import TripCard from "@/src/components/TripCard";
// import LikersModal from "@/src/components/modals/LikersModal";
// import { getFeedTripJson, getTripLikers, likeTrip, unlikeTrip } from "@/src/services/api";
// import { theme } from "@/src/theme";
// import { calcAvgSpeed, isoToDate, kmOrMiles, msToDuration } from "@/src/utils/format";
// import { lineStringToCoords } from "@/src/utils/geo";
// import { useRouter } from "expo-router";
// import { useEffect, useState } from "react";
// import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
// const router = useRouter();

// export default function FeedScreen() {
// 	const [items, setItems] = useState([]);
// 	const [page, setPage] = useState(1);
// 	const [loading, setLoading] = useState(false);
// 	const [hasMore, setHasMore] = useState(true);

// 	// State for Likers Modal
// 	const [isLikersModalVisible, setIsLikersModalVisible] = useState(false);
// 	const [selectedTripLikers, setSelectedTripLikers] = useState([]);
// 	const [isLoadingLikers, setIsLoadingLikers] = useState(false);
// 	const [likersError, setLikersError] = useState(null);
// 	const [currentTripIdForModal, setCurrentTripIdForModal] = useState(null);

// 	useEffect(() => {
// 		loadPage();
// 	}, []);

// 	const loadPage = async () => {
// 		if (loading || !hasMore) return;
// 		setLoading(true);
// 		try {
// 			const { items } = await getFeedTripJson(page);
// 			console.log("Feed page fetched items:", items[0]);

// 			setItems((prev) => [...prev, ...items]); // adjust field names to API
// 			setHasMore(items.length > 0);
// 			setPage((prevPage) => prevPage + 1); // use functional update for setPage
// 		} catch (err) {
// 			console.error("feed fetch error", err.message);
// 			// if (err.message.toLowerCase().includes("not authorized")) {
// 			setHasMore(false);
// 			return; // prevents infinite loop
// 			// }
// 		} finally {
// 			setLoading(false);
// 		}
// 	};

// 	// Renamed: This function is now for the like/unlike ACTION
// 	const handleLikeUnlikeTrip = async (tripId) => {
// 		const originalItems = JSON.parse(JSON.stringify(items)); // Deep copy for reliable revert
// 		let tripToUpdate = items.find((t) => t._id === tripId);
// 		if (!tripToUpdate) return;

// 		const isCurrentlyLiked = tripToUpdate.isLikedByCurrentUser;

// 		// Optimistic update
// 		setItems((prevItems) =>
// 			prevItems.map((trip) => {
// 				if (trip._id === tripId) {
// 					return {
// 						...trip,
// 						isLikedByCurrentUser: !isCurrentlyLiked,
// 						likesCount: isCurrentlyLiked ? (trip.likesCount || 1) - 1 : (trip.likesCount || 0) + 1,
// 					};
// 				}
// 				return trip;
// 			})
// 		);

// 		try {
// 			if (!isCurrentlyLiked) {
// 				// If it was not liked, now we like it
// 				await likeTrip(tripId);
// 			} else {
// 				// If it was liked, now we unlike it
// 				await unlikeTrip(tripId);
// 			}
// 			// For now, we rely on the optimistic update.
// 		} catch (error) {
// 			console.error("Failed to like/unlike trip:", error);
// 			setItems(originalItems); // Revert on error
// 			// TODO: Show user feedback for the error
// 		}
// 	};

// 	// This function now handles opening the modal to VIEW likers
// 	const handleOpenLikersListModal = async (tripId) => {
// 		if (!tripId) return;
// 		setCurrentTripIdForModal(tripId);
// 		setIsLoadingLikers(true);
// 		setLikersError(null);
// 		setIsLikersModalVisible(true);
// 		try {
// 			const likersData = await getTripLikers(tripId);
// 			setSelectedTripLikers(likersData || []);
// 		} catch (error) {
// 			console.error("Failed to fetch likers:", error);
// 			setLikersError("Could not load likers. Please try again.");
// 			setSelectedTripLikers([]);
// 		} finally {
// 			setIsLoadingLikers(false);
// 		}
// 	};

// 	const handleCloseLikersModal = () => {
// 		setIsLikersModalVisible(false);
// 		setSelectedTripLikers([]);
// 		setLikersError(null);
// 		setCurrentTripIdForModal(null);
// 	};

// 	const handleOpenRecommendationsModal = (tripId) => {
// 		console.log("Open recommendations for trip:", tripId);
// 		// ... (your existing or new logic for recommendations modal)
// 	};

// 	const handleOpenCommentsModal = (tripId) => {
// 		console.log("Open comments for trip:", tripId);
// 		// ... (your logic for comments modal)
// 	};

// 	return (
// 		<View style={styles.container}>
// 			<FlatList
// 				data={items}
// 				keyExtractor={(item, index) => (item._id ? String(item._id) : `idx-${index}`)}
// 				renderItem={({ item }) => (
// 					<TripCard
// 						tripId={item._id}
// 						title={item.title}
// 						userName={item.user?.username}
// 						visibility={item.defaultTripVisibility}
// 						description={item.description}
// 						date={isoToDate(item.startDate)}
// 						distanceKm={kmOrMiles(item.distanceMeters)}
// 						durationStr={msToDuration(item.durationMillis)}
// 						avgSpeed={calcAvgSpeed(item.distanceMeters, item.durationMillis)}
// 						travelMode={item.defaultTravelMode}
// 						coords={lineStringToCoords(item.simplifiedRoute)}
// 						likes={item.likesCount || 0}
// 						isLikedByCurrentUser={item.isLikedByCurrentUser || false}
// 						comments={item.commentsCount || 0}
// 						recommendationsCount={item.recommendationCount || 0}
// 						onLikePress={handleLikeUnlikeTrip}
// 						onOpenLikersModalPress={handleOpenLikersListModal}
// 						onCommentPress={handleOpenCommentsModal}
// 						onRecommendPress={handleOpenRecommendationsModal}
// 						onSharePress={(id) => console.log("Share trip:", id)}
// 						onPress={() => router.push(`/trip/${item._id}`)}
// 					/>
// 				)}
// 				contentContainerStyle={{
// 					paddingHorizontal: theme.space.md,
// 					paddingTop: theme.space.sm,
// 					paddingBottom: theme.space.sm,
// 				}}
// 				onEndReached={loadPage}
// 				onEndReachedThreshold={0.3} // trigger when 30% from bottom
// 				ListFooterComponent={loading ? <ActivityIndicator /> : null}
// 			/>
// 			<LikersModal
// 				isVisible={isLikersModalVisible}
// 				onClose={handleCloseLikersModal}
// 				likers={selectedTripLikers}
// 				isLoading={isLoadingLikers}
// 				error={likersError}
// 			/>
// 		</View>
// 	);
// }
// const styles = StyleSheet.create({
// 	container: { flex: 1, backgroundColor: theme.colors.background },
// });
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
					<TripCardContainer trip={item} onOpenSheet={openSheet} onPress={() => router.push(`/trip/${item._id}`)} />
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
