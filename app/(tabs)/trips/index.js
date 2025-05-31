// import TripCard from "@/src/components/TripCard";
// import LikersModal from "@/src/components/modals/LikersModal";
// import { getMyJsonTrips, getTripLikers, likeTrip, unlikeTrip } from "@/src/services/api";
// import { useAuthStore } from "@/src/stores/auth";
// import { theme } from "@/src/theme";
// import { calcAvgSpeed, isoToDate, kmOrMiles, msToDuration } from "@/src/utils/format";
// import { lineStringToCoords } from "@/src/utils/geo";
// import { useFocusEffect, useRouter } from "expo-router";
// import { useCallback, useState } from "react";
// import { FlatList, RefreshControl, View } from "react-native";

// export default function MyTrips() {
// 	const [items, setItems] = useState([]);
// 	const [refreshing, setRefreshing] = useState(false);
// 	const user = useAuthStore((state) => state.user || "Unknown User");
// 	// console.log("User data in MyTrips:", user);
// 	const router = useRouter(); // Initialize router for navigation
// 	const username = user?.username || "Unknown User";

// 	// State for Likers Modal
// 	const [isLikersModalVisible, setIsLikersModalVisible] = useState(false);
// 	const [selectedTripLikers, setSelectedTripLikers] = useState([]);
// 	const [isLoadingLikers, setIsLoadingLikers] = useState(false);
// 	const [likersError, setLikersError] = useState(null);
// 	const [currentTripIdForModal, setCurrentTripIdForModal] = useState(null);

// 	const fetchTrips = useCallback(async () => {
// 		setRefreshing(true);
// 		try {
// 			const { items: fetchedItems } = await getMyJsonTrips(); // Ensure this API returns likesCount and isLikedByCurrentUser
// 			// console.log("TRIPS page Fetched trips:", fetchedItems[0]);

// 			setItems(fetchedItems);
// 		} catch (error) {
// 			console.error("Failed to fetch trips:", error);
// 		}
// 		setRefreshing(false);
// 	}, []);

// 	useFocusEffect(
// 		useCallback(() => {
// 			fetchTrips();
// 		}, [fetchTrips])
// 	);

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
// 			// Optionally re-fetch trips or the specific trip to ensure data consistency
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
// 		<View
// 			style={{
// 				flex: 1,
// 				backgroundColor: theme.colors.background,
// 				// paddingHorizontal: theme.space.md,
// 			}}
// 		>
// 			<FlatList
// 				data={items}
// 				keyExtractor={(t, i) => (t._id ? String(t._id) : `idx-${i}`)}
// 				renderItem={({ item }) => (
// 					<TripCard
// 						tripId={item._id}
// 						title={item.title}
// 						userName={username}
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
// 					// Added contentContainerStyle for padding
// 					paddingHorizontal: theme.space.md,
// 					paddingTop: theme.space.sm,
// 					paddingBottom: theme.space.sm,
// 				}}
// 				refreshControl={
// 					<RefreshControl
// 						refreshing={refreshing}
// 						onRefresh={fetchTrips}
// 						tintColor={theme.colors.primary} /* optional */
// 					/>
// 				}
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
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";

import TripCardContainer from "@/src/components/TripCardContainer";
import CommentsSheet from "@/src/components/sheets/CommentsSheet";
import LikersSheet from "@/src/components/sheets/LikersSheet";
import RecommendationsSheet from "@/src/components/sheets/RecommendationsSheet";

import { getMyJsonTrips } from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";

/* ------------------------------------------------------------------ */
/* screen component                                                   */
/* ------------------------------------------------------------------ */
export default function MyTrips() {
	/* ---------- local state ---------- */
	const [items, setItems] = useState([]);
	const [refreshing, setRefreshing] = useState(false);

	/* ---------- sheet state ---------- */
	const [sheetType, setSheetType] = useState(null); // 'likers' | 'comments' | 'recs'
	const [selectedTrip, setSelectedTrip] = useState(null);

	/* ---------- helpers ---------- */
	const user = useAuthStore((s) => s.user || {});
	const username = user?.username || "Unknown User";
	const router = useRouter();

	/* ---------- data fetch ---------- */
	const fetchTrips = useCallback(async () => {
		setRefreshing(true);
		try {
			const { items: fetched } = await getMyJsonTrips();
			// console.log("Fetched trips my trip page:", fetched[0]);
			setItems(fetched);
		} catch (err) {
			console.error("Failed to fetch trips:", err);
		} finally {
			setRefreshing(false);
		}
	}, []);

	/* load on focus */
	useFocusEffect(
		useCallback(() => {
			fetchTrips();
		}, [fetchTrips])
	);

	/* ---------- sheet open / close ---------- */
	const openSheet = (type, trip) => {
		setSelectedTrip(trip);
		setSheetType(type);
	};
	const closeSheet = () => {
		setSheetType(null);
	};
	console.log("selected trip in MY TRIP PAGE", selectedTrip);

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
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={fetchTrips} tintColor={theme.colors.primary} />
				}
			/>

			{/* ---- reusable bottom-sheets (one copy each) ---- */}
			<LikersSheet trip={selectedTrip} visible={sheetType === "likers"} onClose={closeSheet} />
			<CommentsSheet trip={selectedTrip} visible={sheetType === "comments"} onClose={closeSheet} />
			<RecommendationsSheet trip={selectedTrip} userId={user._id} visible={sheetType === "recs"} onClose={closeSheet} />
		</View>
	);
}
