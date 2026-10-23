import { useNavigation, useRoute } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react"; // Added useRef
import { ActivityIndicator, Alert, FlatList, RefreshControl } from "react-native";
/* --- App utils / components -------------------------------------- */
import useProfileList from "@/src/hooks/useProfileList";
import ProfileListStatus from "@/src/components/ProfileListStatus";
import RecommendationSourceLoader from "@/src/components/RecommendationSourceLoader";
import RecommendationCard from "@/src/components/RecommendationCard";
import AddRecommendationModal from "@/src/components/modals/AddRecommendationModal"; // Added
import RecommendationDetailModal from "@/src/components/modals/RecommendationDetailModal";
import {
	deleteRecommendation,
	getRecommendationsByUser,
	getTripJsonById,
	updateRecommendation,
} from "@/src/services/api";
import { theme } from "@/src/theme";
import { lineStringToCoords } from "@/src/utils/geo";

/**
 * List of recommendations for one user.
 * Infinite-scroll + pull-to-refresh.  Opens detail modal onPress.
 */
export default function RecommendationsTab({ userId, isSelf }) {
	/* ---------------- state ---------------- */
	const { identity, items, setItems, loading, initialLoading, refreshing, error, ensureLoaded, refresh: onRefresh, loadMore } = useProfileList(userId, getRecommendationsByUser);
	const [pendingRequest, setPendingRequest] = useState(null);
	const pendingRecId = pendingRequest && pendingRequest.identity === identity ? pendingRequest.id : null;

	/* modal */
	const [detailModalOpen, setDetailModalOpen] = useState(false); // Renamed for clarity
	const [selection, setSelection] = useState(null);
	const selRec = selection && selection.identity === identity ? selection.rec : null;
	const currentPending = useRef(pendingRequest);
	currentPending.current = pendingRequest;
	const currentIdentity = useRef(identity);
	currentIdentity.current = identity;
	const detailRequest = useRef(null);
	const [routeCoords, setRouteCoords] = useState([]); // array of {lat,lon}

	const addRecModalRef = useRef(null); // Ref for AddRecommendationModal

	const navigation = useNavigation();
	const route = useRoute();

	// Gallery and focus can both request initialization; ensureLoaded shares the
	// same request and regards empty/error results as a completed attempt.
	useEffect(() => {
		const recId = route.params?.openRecId;
		if (!recId) return;
		setPendingRequest({ identity, id: recId });
		void ensureLoaded();
	}, [route.params?.openRecId, route.params?.ts]);

	useEffect(() => {
		if (!pendingRecId) return;
		const found = items.find((rec) => rec._id === pendingRecId);
		if (!found) return;
		currentPending.current = null;
		void openDetailModal(found);
		setPendingRequest(null);
		navigation.setParams({ openRecId: undefined });
	}, [items, pendingRecId]);

	/* ---------------- modal helpers ---------------- */
	const openDetailModal = async (rec) => {
		setSelection({ identity, rec });
		const request = {};
		detailRequest.current = request;
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
				if (currentIdentity.current === identity && detailRequest.current === request && trip?.simplifiedRoute) {
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

			// AddRecommendationModal's openEdit expects this.
			addRecModalRef.current.openEdit(recommendationToEdit);
		} else {
			console.warn("[RecommendationsTab] Cannot edit. Modal ref or recommendation missing.");
		}
	};

	// ADD THIS: Handle recommendation deletion
	const handleDeleteRecommendation = async (recommendation) => {
		if (!isSelf) return; // Only own recommendations can be deleted

		Alert.alert(
			"Delete Recommendation",
			`Are you sure you want to delete "${recommendation.name || "this recommendation"}"?`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: async () => {
						try {
							await deleteRecommendation(recommendation._id);

							// Update local state immediately
							setItems((prevItems) => prevItems.filter((item) => item._id !== recommendation._id));
							// A pre-delete request may still be settling; replace it with fresh data.
							await onRefresh();

							Alert.alert("Success", "Recommendation deleted successfully");
						} catch (error) {
							console.error("Failed to delete recommendation:", error);
							Alert.alert("Error", "Failed to delete recommendation");
						}
					},
				},
			]
		);
	};

	// ADD THIS: Handle long press on recommendation card
	const handleRecommendationLongPress = (rec) => {
		if (isSelf) {
			handleDeleteRecommendation(rec);
		}
	};

	// Apply only a confirmed photo deletion from the detail modal.
	const handlePhotoDeleted = (recommendationId, photoId) => {
		if (currentIdentity.current !== identity) return;
		// Keep the selected recommendation and list in sync after confirmation.
		setSelection((previous) => {
			if (previous?.identity !== identity || previous.rec?._id !== recommendationId) return previous;
			return { identity, rec: { ...previous.rec, photos: previous.rec.photos?.filter((id) => id !== photoId) || [] } };
		});

		// Update the items list
		setItems((prevItems) =>
			prevItems.map((item) => {
				if (item._id === recommendationId) {
					return {
						...item,
						photos: item.photos?.filter((id) => id !== photoId) || [],
					};
				}
				return item;
			})
		);
	};

	const handleRecommendationSubmitted = async (recommendationData, isEditMode = false) => {
		console.log("[RecommendationsTab] handleRecommendationSubmitted called with:", { recommendationData, isEditMode });
		try {
			if (isEditMode && recommendationData._id) {
				// Ensure _id is present for updates
				// console.log("[RecommendationsTab] Calling updateRecommendation API for ID:", recommendationData._id);
				await updateRecommendation(recommendationData._id, recommendationData);

				// Return refresh callback for edit mode (same pattern as trip page)
				await onRefresh(); // Refresh data immediately
				return {
					refreshCallback: () => onRefresh(),
				};
			}
			await onRefresh(); // Reload data from page 1
		} catch (error) {
			console.error("[RecommendationsTab] Failed to save recommendation:", error?.response?.data || error?.message);
			throw error; // The form must retain its draft instead of reporting false success.
		}
	};

	/* ---------------- render ---------------- */
	return (
		<>
			<FlatList
				ListHeaderComponent={pendingRecId && !initialLoading && !loading && !items.some((rec) => rec._id === pendingRecId) ? (
					<RecommendationSourceLoader key={`${pendingRecId}-${route.params?.ts || ""}`} recommendationId={pendingRecId} userId={userId}
						onFound={(rec) => {
							if (currentIdentity.current !== identity || currentPending.current !== pendingRequest) return;
							currentPending.current = null;
							void openDetailModal(rec);
							setPendingRequest(null);
							navigation.setParams({ openRecId: undefined });
						}}
						onCancel={() => {
							if (currentIdentity.current !== identity || currentPending.current !== pendingRequest) return;
							currentPending.current = null;
							setPendingRequest(null);
							navigation.setParams({ openRecId: undefined });
						}} />
				) : null}
				data={items}
				keyExtractor={(it) => it._id}
				renderItem={({ item }) => (
					<RecommendationCard
						rec={item}
						onPress={() => openDetailModal(item)}
						onLongPress={isSelf ? () => handleRecommendationLongPress(item) : undefined}
					/>
				)}
				contentContainerStyle={{ paddingHorizontal: theme.space.sm, paddingTop: theme.space.sm, flexGrow: 1 }}
				onEndReachedThreshold={0.4}
				onEndReached={loadMore}
				ListFooterComponent={items.length > 0 ? (loading ? <ActivityIndicator style={{ margin: 16 }} /> : error ? <ProfileListStatus error={error} onRetry={onRefresh} /> : null) : null}
				refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
				ListEmptyComponent={<ProfileListStatus loading={initialLoading || loading} error={error} onRetry={onRefresh} emptyMessage="No recommendations yet." />}
			/>

			{/* ---------- detail modal ---------- */}
			{selRec && (
				<RecommendationDetailModal
					isVisible={detailModalOpen}
					onClose={() => {
						setDetailModalOpen(false);
						detailRequest.current = null;
					}}
					recommendation={selRec}
					// Pass the recommendation's author ID to determine editability
					tripUserId={selRec?.user?._id}
					tripRouteCoordinates={routeCoords}
					onEdit={() => handleEditRecommendation(selRec)} // Use the new handler
					onRefresh={onRefresh}
					onPhotoDeleted={handlePhotoDeleted}
				/>
			)}

			{/* ---------- Add/Edit Recommendation Modal ---------- */}
			{selRec && <AddRecommendationModal ref={addRecModalRef} onSubmit={handleRecommendationSubmitted} />}
		</>
	);
}
