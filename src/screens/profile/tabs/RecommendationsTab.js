// /* --- React / nav -------------------------------------------------- */
// import { useFocusEffect } from "@react-navigation/native";
// import { useRouter } from "expo-router";
// import { useCallback, useState } from "react";
// import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";

// /* --- App utils / components -------------------------------------- */
// import RecommendationCard from "@/src/components/RecommendationCard";
// import RecommendationDetailModal from "@/src/components/modals/RecommendationDetailModal";
// import { getRecommendationsByUser, getTripJsonById } from "@/src/services/api";
// import { theme } from "@/src/theme";
// import { lineStringToCoords } from "@/src/utils/geo";

// /**
//  * List of recommendations for one user.
//  * Infinite-scroll + pull-to-refresh.  Opens detail modal onPress.
//  */
// export default function RecommendationsTab({ userId }) {
// 	/* ---------------- state ---------------- */
// 	const [items, setItems] = useState([]);
// 	const [page, setPage] = useState(1);
// 	const [loading, setLoading] = useState(false);
// 	const [refreshing, setRefresh] = useState(false);
// 	const [hasNext, setHasNext] = useState(true);
// 	const [error, setError] = useState(null);

// 	/* modal */
// 	const [modalOpen, setModalOpen] = useState(false);
// 	const [selRec, setSelRec] = useState(null); // selected recommendation
// 	const [routeCoords, setRouteCoords] = useState([]); // array of {lat,lon}

// 	const router = useRouter();

// 	/* ---------------- fetch helpers ---------------- */
// 	const fetchPage = useCallback(
// 		async (pageToLoad, replace = false) => {
// 			if (loading) return;
// 			setLoading(true);

// 			try {
// 				const res = await getRecommendationsByUser(userId, pageToLoad, 10); // { data, page, totalPages }
// 				console.log("[RecommendationsTab] RES", res);

// 				setItems((prev) => (replace ? res.data : [...prev, ...res.data]));
// 				setHasNext(pageToLoad < res.totalPages);
// 				setPage(pageToLoad + 1);
// 				setError(null);
// 			} catch (e) {
// 				console.warn("[RecommendationsTab] fetch error", e.message);
// 				setError(e.message);
// 			} finally {
// 				setLoading(false);
// 				setRefresh(false);
// 			}
// 		},
// 		[loading, userId]
// 	);

// 	/* first time tab visible */
// 	useFocusEffect(
// 		useCallback(() => {
// 			if (items.length === 0) fetchPage(1, true);
// 		}, [fetchPage, items.length])
// 	);

// 	/* pull-to-refresh */
// 	const onRefresh = async () => {
// 		setRefresh(true);
// 		await fetchPage(1, true);
// 	};

// 	/* infinite scroll */
// 	const loadMore = () => {
// 		if (!loading && hasNext) fetchPage(page);
// 	};

// 	/* ---------------- modal helpers ---------------- */
// 	const openModal = async (rec) => {
// 		setSelRec(rec);
// 		setRouteCoords([]); // clear previous
// 		setModalOpen(true);

// 		/* route extraction */
// 		if (rec.trip?.simplifiedRoute) {
// 			setRouteCoords(lineStringToCoords(rec.trip.simplifiedRoute));
// 		} else if (rec.associatedTrip || rec.tripId) {
// 			const tripId = rec.associatedTrip ?? rec.tripId;
// 			try {
// 				const trip = await getTripJsonById(tripId);
// 				if (trip?.simplifiedRoute) {
// 					setRouteCoords(lineStringToCoords(trip.simplifiedRoute));
// 				}
// 			} catch {
// 				/* ignore – map just stays hidden */
// 			}
// 		}
// 	};

// 	/* ---------------- render ---------------- */
// 	if (error && items.length === 0) {
// 		return (
// 			<View style={{ padding: 24 }}>
// 				<Text style={{ textAlign: "center", color: theme.colors.error }}>Error: {error}</Text>
// 			</View>
// 		);
// 	}

// 	return (
// 		<>
// 			<FlatList
// 				data={items}
// 				keyExtractor={(it) => it._id}
// 				renderItem={({ item }) => <RecommendationCard rec={item} onPress={() => openModal(item)} />}
// 				contentContainerStyle={{ paddingHorizontal: theme.space.sm, paddingTop: theme.space.sm }}
// 				onEndReachedThreshold={0.4}
// 				onEndReached={loadMore}
// 				ListFooterComponent={loading && items.length ? <ActivityIndicator style={{ margin: 16 }} /> : null}
// 				refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
// 				ListEmptyComponent={
// 					!loading && items.length === 0 ? (
// 						<Text style={{ textAlign: "center", marginTop: 32 }}>Nothing to show yet.</Text>
// 					) : null
// 				}
// 			/>

// 			{/* ---------- detail modal ---------- */}
// 			<RecommendationDetailModal
// 				isVisible={modalOpen}
// 				onClose={() => setModalOpen(false)}
// 				recommendation={selRec}
// 				tripAuthorId={selRec?.user?._id ?? selRec?.userId ?? selRec?.authorId}
// 				tripRouteCoordinates={routeCoords}
// 				onEdit={() => {
// 					setModalOpen(false);
// 					// navigate to edit-screen or open your edit-modal here
// 					router.push(`/recommendation/${selRec._id}/edit`);
// 				}}
// 			/>
// 		</>
// 	);
// }
/* --- React / nav -------------------------------------------------- */
import { useFocusEffect } from "@react-navigation/native";
// Removed useRouter as it's not used for modal-based editing here
import { useCallback, useRef, useState } from "react"; // Added useRef
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";

/* --- App utils / components -------------------------------------- */
import RecommendationCard from "@/src/components/RecommendationCard";
import AddRecommendationModal from "@/src/components/modals/AddRecommendationModal"; // Added
import RecommendationDetailModal from "@/src/components/modals/RecommendationDetailModal";
import { getRecommendationsByUser, getTripJsonById, updateRecommendation } from "@/src/services/api";
import { theme } from "@/src/theme";
import { lineStringToCoords } from "@/src/utils/geo";

/**
 * List of recommendations for one user.
 * Infinite-scroll + pull-to-refresh.  Opens detail modal onPress.
 */
export default function RecommendationsTab({ userId }) {
	/* ---------------- state ---------------- */
	const [items, setItems] = useState([]);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefresh] = useState(false);
	const [hasNext, setHasNext] = useState(true);
	const [error, setError] = useState(null);

	/* modal */
	const [detailModalOpen, setDetailModalOpen] = useState(false); // Renamed for clarity
	const [selRec, setSelRec] = useState(null); // selected recommendation
	const [routeCoords, setRouteCoords] = useState([]); // array of {lat,lon}

	const addRecModalRef = useRef(null); // Ref for AddRecommendationModal

	/* ---------------- fetch helpers ---------------- */
	const fetchPage = useCallback(
		async (pageToLoad, replace = false) => {
			if (loading && !replace) return; // Allow refresh even if loading
			setLoading(true);

			try {
				const res = await getRecommendationsByUser(userId, pageToLoad, 10);
				// console.log("[RecommendationsTab] RES", res); // Keep for debugging if needed

				setItems((prev) => (replace ? res.data : [...prev, ...res.data]));
				setHasNext(pageToLoad < res.totalPages);
				setPage(pageToLoad + 1); // This should be pageToLoad, or res.page if API returns it
				setError(null);
			} catch (e) {
				console.warn("[RecommendationsTab] fetch error", e.message);
				setError(e.message);
			} finally {
				setLoading(false);
				setRefresh(false);
			}
		},
		[loading, userId] // Removed items from dependencies
	);

	/* first time tab visible */
	useFocusEffect(
		useCallback(() => {
			// Fetch only if items are empty or userId changed (implicitly handled by hook)
			if (items.length === 0 && userId) {
				fetchPage(1, true);
			}
		}, [fetchPage, items.length, userId]) // Added userId dependency
	);

	/* pull-to-refresh */
	const onRefresh = async () => {
		setRefresh(true);
		await fetchPage(1, true); // Reset to page 1 and replace data
	};

	/* infinite scroll */
	const loadMore = () => {
		if (!loading && hasNext) {
			fetchPage(page); // fetchPage will use its current 'page' state and increment it
		}
	};

	/* ---------------- modal helpers ---------------- */
	const openDetailModal = async (rec) => {
		setSelRec(rec);
		setRouteCoords([]); // clear previous
		setDetailModalOpen(true);

		/* route extraction for map in detail modal */
		if (rec.trip?.simplifiedRoute) {
			setRouteCoords(lineStringToCoords(rec.trip.simplifiedRoute));
		} else if (rec.associatedTrip) {
			// Use rec.associatedTrip directly as it's the ID
			const tripId = rec.associatedTrip;
			try {
				const trip = await getTripJsonById(tripId);
				if (trip?.simplifiedRoute) {
					setRouteCoords(lineStringToCoords(trip.simplifiedRoute));
				}
			} catch (err) {
				console.warn("[RecommendationsTab] Error fetching trip for route coords:", err.message);
				/* ignore – map just stays hidden */
			}
		}
	};

	const handleEditRecommendation = (recommendationToEdit) => {
		setDetailModalOpen(false); // Close detail modal
		if (addRecModalRef.current && recommendationToEdit) {
			console.log("[RecommendationsTab] Opening AddRecModal for edit:", recommendationToEdit); // Log data passed to openEdit
			// Ensure `recommendationToEdit.location.coordinates` is [longitude, latitude]
			// The log shows it's an array, assuming it's in the correct GeoJSON order.
			// AddRecommendationModal's openEdit expects this.
			addRecModalRef.current.openEdit(recommendationToEdit);
		} else {
			console.warn("[RecommendationsTab] Cannot edit. Modal ref or recommendation missing.");
		}
	};

	const handleRecommendationSubmitted = async (recommendationData, isEditMode = false) => {
		console.log("[RecommendationsTab] handleRecommendationSubmitted called with:", { recommendationData, isEditMode });
		try {
			if (isEditMode && recommendationData._id) {
				// Ensure _id is present for updates
				// console.log("[RecommendationsTab] Calling updateRecommendation API for ID:", recommendationData._id);
				await updateRecommendation(recommendationData._id, recommendationData);
			}
			await fetchPage(1, true); // Reload data from page 1
		} catch (error) {
			console.error("[RecommendationsTab] Failed to save recommendation:", error.response?.data || error.message);
			Alert.alert("Error", isEditMode ? "Failed to update recommendation" : "Failed to add recommendation");
		}
	};

	/* ---------------- render ---------------- */
	if (error && items.length === 0 && !loading) {
		// Show error only if not loading and no items
		return (
			<View style={{ padding: 24, flex: 1, justifyContent: "center", alignItems: "center" }}>
				<Text style={{ textAlign: "center", color: theme.colors.error }}>Error: {error}</Text>
			</View>
		);
	}

	return (
		<>
			<FlatList
				data={items}
				keyExtractor={(it) => it._id}
				renderItem={({ item }) => <RecommendationCard rec={item} onPress={() => openDetailModal(item)} />}
				contentContainerStyle={{ paddingHorizontal: theme.space.sm, paddingTop: theme.space.sm, flexGrow: 1 }}
				onEndReachedThreshold={0.4}
				onEndReached={loadMore}
				ListFooterComponent={loading && items.length > 0 ? <ActivityIndicator style={{ margin: 16 }} /> : null}
				refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
				ListEmptyComponent={
					!loading && items.length === 0 ? (
						<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
							<Text style={{ textAlign: "center", marginTop: 32, color: theme.colors.textMuted }}>
								No recommendations yet.
							</Text>
						</View>
					) : null
				}
			/>

			{/* ---------- detail modal ---------- */}
			{selRec && (
				<RecommendationDetailModal
					isVisible={detailModalOpen}
					onClose={() => {
						setDetailModalOpen(false);
						// setSelRec(null); // Optionally clear selRec, or keep it if needed for quick reopen
					}}
					recommendation={selRec}
					// Pass the recommendation's author ID to determine editability
					tripUserId={selRec?.user?._id}
					tripRouteCoordinates={routeCoords}
					onEdit={() => handleEditRecommendation(selRec)} // Use the new handler
				/>
			)}

			{/* ---------- Add/Edit Recommendation Modal ---------- */}
			<AddRecommendationModal ref={addRecModalRef} onSubmit={handleRecommendationSubmitted} />
		</>
	);
}
