// ...existing imports...
import CommentList from "@/src/components/CommentList";
import RecommendationCard from "@/src/components/RecommendationCard";
import TransportIcon from "@/src/components/TransportIcon";
import InteractiveTripMap from "@/src/components/map/InteractiveTripMap";
import AddCommentModal from "@/src/components/modals/AddCommentModal";
import AddRecommendationModal from "@/src/components/modals/AddRecommendationModal";
import LikersModal from "@/src/components/modals/LikersModal";
import RecommendationDetailModal from "@/src/components/modals/RecommendationDetailModal";
import IconStatDisplay from "@/src/components/trip/IconStatDisplay";
import Section from "@/src/components/trip/Section";
import SocialButton from "@/src/components/trip/SocialButton";
import Avatar from "@/src/components/ui/Avatar";
import {
	addRecommendation,
	addTripComment,
	deleteTripComment,
	getTripComments,
	getTripJsonById,
	getTripLikers,
	likeTrip,
	unlikeTrip,
	updateRecommendation,
} from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { useTripSocialStore } from "@/src/stores/tripSocialStore";
import { theme } from "@/src/theme";
import { calcAvgSpeed, isoToDate, kmOrMiles, msToDuration } from "@/src/utils/format";
import { lineStringToCoords } from "@/src/utils/geo";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

const DropdownMenu = ({ isVisible, onClose, onEdit, onDelete, onAddRecommendation }) => {
	return (
		<Modal transparent visible={isVisible} onRequestClose={onClose} animationType="fade">
			<Pressable style={styles.modalOverlay} onPress={onClose}>
				<View style={styles.dropdownMenu}>
					<Pressable style={styles.dropdownItem} onPress={onEdit}>
						<Feather name="edit-2" size={18} color={theme.colors.text} />
						<Text style={styles.dropdownItemText}>Edit Trip</Text>
					</Pressable>

					<Pressable style={styles.dropdownItem} onPress={onAddRecommendation}>
						<Feather name="star" size={18} color={theme.colors.warning} />
						<Text style={styles.dropdownItemText}>Add Recommendation</Text>
					</Pressable>

					<Pressable style={styles.dropdownItem} onPress={onDelete}>
						<Feather name="trash-2" size={18} color={theme.colors.error} />
						<Text style={[styles.dropdownItemText, { color: theme.colors.error }]}>Delete Trip</Text>
					</Pressable>
				</View>
			</Pressable>
		</Modal>
	);
};

// --- Main Screen Component ---
export default function TripDetailScreen() {
	const router = useRouter();
	const { id: tripId } = useLocalSearchParams();
	const { user: currentUser, isAuthenticated } = useAuthStore();
	const { setRecCount, setLikeState, setCommentCount } = useTripSocialStore();

	const [trip, setTrip] = useState(null); // Will store the full trip object including its own commentsCount
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	const [selectedRecommendation, setSelectedRecommendation] = useState(null);
	const [isRecDetailModalVisible, setIsRecDetailModalVisible] = useState(false);
	const [isDropdownVisible, setIsDropdownVisible] = useState(false);
	const [showAllPois, setShowAllPois] = useState(false);
	const [showAllRecommendations, setShowAllRecommendations] = useState(false);

	// --- Likers State ---
	const [isLikersModalVisible, setIsLikersModalVisible] = useState(false);
	const [likers, setLikers] = useState([]); // For the modal list
	const [likersLoading, setLikersLoading] = useState(false);
	const [likersError, setLikersError] = useState("");
	const [isLikedByCurrentUser, setIsLikedByCurrentUser] = useState(false);
	const [optimisticLikesCount, setOptimisticLikesCount] = useState(0);

	// --- Comments State ---
	const [comments, setComments] = useState([]); // This will hold fully populated comments
	const [commentsLoading, setCommentsLoading] = useState(false);
	const [commentsError, setCommentsError] = useState("");
	const [isAddCommentModalVisible, setIsAddCommentModalVisible] = useState(false);
	const [isCommentsSectionVisible, setIsCommentsSectionVisible] = useState(false);
	const [isCommentListExpanded, setIsCommentListExpanded] = useState(false);

	const addRecommendationModalRef = useRef(null);

	const fetchTripDetails = async (isRefetch = false) => {
		if (!tripId) {
			setError("Trip ID is missing.");
			setLoading(false);
			return;
		}
		if (!isRefetch) {
			// Only show main loading indicator on initial load
			setLoading(true);
		}
		setError(null);
		try {
			const data = await getTripJsonById(tripId);
			const likesArray = data.likes || [];
			// Get comment COUNT from initial trip load, but not the comment objects themselves for display
			const initialCommentsArray = data.comments || [];

			setTrip({
				...data,
				likesCount: likesArray.length,
				commentsCount: initialCommentsArray.length, // Store the count from the main trip object
				// Do NOT store data.comments directly in trip state if they are not populated
			});

			setOptimisticLikesCount(likesArray.length);
			if (currentUser?._id) {
				setIsLikedByCurrentUser(likesArray.includes(currentUser._id));
			} else {
				setIsLikedByCurrentUser(false);
			}

			// If comments are already visible/expanded and need to be (re)loaded
			if (
				isCommentListExpanded ||
				(isCommentsSectionVisible && initialCommentsArray.length > 0 && comments.length === 0)
			) {
				await fetchCommentsData(); // Fetch full comments if section is open
			}
		} catch (err) {
			console.error("Failed to fetch trip details:", err);
			setError(err.message || "Could not load trip details.");
		} finally {
			if (!isRefetch) {
				setLoading(false);
			}
		}
	};

	useEffect(() => {
		fetchTripDetails();
	}, [tripId, currentUser?._id]); // Add currentUser._id as dep for isLikedByCurrentUser init

	useFocusEffect(
		useCallback(() => {
			// Refetch trip details when the screen comes into focus to sync server state
			fetchTripDetails(true);
		}, [tripId, currentUser?._id]) // Add currentUser._id
	);

	const isOwner = isAuthenticated && trip && trip.user?._id === currentUser?._id;

	const handleToggleLike = async () => {
		if (!isAuthenticated || !trip) {
			Alert.alert("Login Required", "You need to be logged in to like a trip.");
			return;
		}

		const originalLikedState = isLikedByCurrentUser;
		const currentLikes = optimisticLikesCount;

		setIsLikedByCurrentUser(!originalLikedState);
		setOptimisticLikesCount(!originalLikedState ? currentLikes + 1 : Math.max(0, currentLikes - 1));

		// push optimistic state to the slice immediately
		setLikeState(tripId, {
			isLiked: !originalLikedState,
			count: !originalLikedState ? currentLikes + 1 : currentLikes - 1,
		});
		try {
			if (!originalLikedState) {
				await likeTrip(tripId);
			} else {
				await unlikeTrip(tripId);
			}
			// Optionally, the API for like/unlike could return the updated trip/likesCount
			// For now, useFocusEffect will eventually sync.
		} catch (err) {
			console.error("Failed to update like status:", err);
			Alert.alert("Error", "Could not update like status. Please try again.");
			setIsLikedByCurrentUser(originalLikedState);
			setOptimisticLikesCount(currentLikes);
			setLikeState(tripId, { isLiked: originalLikedState, count: currentLikes });
		}
	};

	const fetchLikersData = async () => {
		// For the LikersModal
		if (!tripId) return;
		setLikersLoading(true);
		setLikersError("");
		try {
			const likersData = await getTripLikers(tripId); // This API fetches user objects
			setLikers(likersData || []);
		} catch (err) {
			console.error("Failed to fetch likers:", err);
			setLikersError(err.message || "Could not load likers.");
		} finally {
			setLikersLoading(false);
		}
	};

	const handleOpenLikersModal = () => {
		fetchLikersData();
		setIsLikersModalVisible(true);
	};

	// fetchCommentsData can be used if you need to explicitly refresh comments
	// or if they are not initially embedded in trip details.
	const fetchCommentsData = async () => {
		if (!tripId || commentsLoading) return;
		setCommentsLoading(true);
		setCommentsError("");
		try {
			const populatedComments = await getTripComments(tripId); // API call for full comments
			setComments(populatedComments || []);
			// Update trip's comment count if it differs, ensuring UI consistency
			if (trip && trip.commentsCount !== (populatedComments?.length || 0)) {
				setTrip((prevTrip) => ({ ...prevTrip, commentsCount: populatedComments?.length || 0 }));
			}
		} catch (err) {
			console.error("Failed to fetch comments:", err);
			setCommentsError(err.message || "Could not load comments.");
			setComments([]); // Clear comments on error
		} finally {
			setCommentsLoading(false);
		}
	};

	const handleToggleCommentsSection = () => {
		const newVisibility = !isCommentsSectionVisible;
		setIsCommentsSectionVisible(newVisibility);
		// If comments were embedded, they are already in `comments` state.
		// If section is opened, and comments were NOT embedded or need refresh:
		if (newVisibility && (trip?.comments || []).length === 0 && (trip?.commentsCount || 0) > 0 && !commentsLoading) {
			// This condition might be rare if comments are always embedded from your log
			fetchCommentsData();
		}
		if (!newVisibility) {
			setIsCommentListExpanded(false);
		}
	};

	const handleToggleCommentList = () => {
		const newExpandedState = !isCommentListExpanded;
		setIsCommentListExpanded(newExpandedState);
		// If expanding and comments were not fully loaded or need refresh
		// (This might be redundant if comments are always fully embedded in `trip` state)
		if (newExpandedState && comments.length !== (trip?.commentsCount || 0) && !commentsLoading) {
			fetchCommentsData();
		}
	};

	const handleAddCommentSubmit = async (text) => {
		if (!tripId || !isAuthenticated) {
			Alert.alert("Error", "You must be logged in to comment.");
			throw new Error("Not authenticated");
		}
		try {
			const newComment = await addTripComment(tripId, text);
			setComments((prevComments) => [newComment, ...(prevComments || [])]);
			if (trip) {
				setTrip((prevTrip) => ({
					...prevTrip,
					commentsCount: (prevTrip.commentsCount || 0) + 1,
				}));
				setCommentCount(tripId, (trip?.commentsCount || 0) + 1);
			}
			if (!isCommentListExpanded) setIsCommentListExpanded(true);
			if (!isCommentsSectionVisible) setIsCommentsSectionVisible(true);
		} catch (err) {
			console.error("Failed to add comment:", err);
			Alert.alert("Error", err.message || "Could not post comment.");
			throw err;
		}
	};

	const handleDeleteComment = async (commentId) => {
		if (!tripId || !isAuthenticated) return;
		Alert.alert("Delete Comment", "Are you sure you want to delete this comment?", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Delete",
				style: "destructive",
				onPress: async () => {
					try {
						await deleteTripComment(tripId, commentId);
						setComments((prevComments) => (prevComments || []).filter((comment) => comment._id !== commentId));
						if (trip && typeof trip.commentsCount === "number" && trip.commentsCount > 0) {
							setTrip((prevTrip) => ({
								...prevTrip,
								commentsCount: Math.max(0, prevTrip.commentsCount - 1),
							}));
							setCommentCount(tripId, Math.max(0, (trip?.commentsCount || 1) - 1));
						}
					} catch (err) {
						console.error("Failed to delete comment:", err);
						Alert.alert("Error", err.message || "Could not delete comment.");
					}
				},
			},
		]);
	};

	const handleEdit = () => {
		setIsDropdownVisible(false);
		router.push(`/trip/${tripId}/edit`);
	};

	const handleDelete = () => {
		setIsDropdownVisible(false);
		Alert.alert("Delete Trip", "Are you sure you want to delete this trip? This action cannot be undone.", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Delete",
				style: "destructive",
				onPress: () => {
					Alert.alert("Delete", "Delete functionality to be implemented.");
				},
			},
		]);
	};

	const handleAddRecommendation = () => {
		setIsDropdownVisible(false);
		if (addRecommendationModalRef.current) {
			let initialMapLocation = null;
			if (trip) {
				if (trip.simplifiedRoute) {
					const routeCoords = lineStringToCoords(trip.simplifiedRoute);
					if (routeCoords && routeCoords.length > 0) {
						initialMapLocation = { lat: routeCoords[0].latitude, lon: routeCoords[0].longitude };
					}
				}
				if (!initialMapLocation && trip.startLocation?.coordinates?.length === 2) {
					initialMapLocation = { lat: trip.startLocation.coordinates[1], lon: trip.startLocation.coordinates[0] };
				}
				if (!initialMapLocation && trip.endLocation?.coordinates?.length === 2) {
					initialMapLocation = { lat: trip.endLocation.coordinates[1], lon: trip.endLocation.coordinates[0] };
				}
			}
			addRecommendationModalRef.current.open(initialMapLocation, tripId);
		}
	};

	const handleEditRecommendation = (recommendation) => {
		addRecommendationModalRef.current?.openEdit(recommendation);
	};

	const handleRecommendationSubmit = async (recommendationData, isEditMode = false) => {
		try {
			if (isEditMode) {
				await updateRecommendation(recommendationData._id, recommendationData);
				Alert.alert("Success", "Recommendation updated successfully!");
			} else {
				await addRecommendation({ ...recommendationData, tripId });
				Alert.alert("Success", "Recommendation added successfully!");
			}
			fetchTripDetails(); // Refresh trip data to show new/updated recommendation
			// setRecCount(tripId, (prev) => (isEdit ? prev : (trip?.recommendations?.length || 0) + 1));
			setRecCount(tripId, (prev) => (isEdit ? prev : (trip?.recommendations?.length || 0) + 1));
		} catch (error) {
			console.error("Failed to save recommendation:", error);
			Alert.alert("Error", isEditMode ? "Failed to update recommendation" : "Failed to add recommendation");
		}
	};

	const handleShare = () => Alert.alert("Share", "Share functionality to be implemented.");

	const handleViewRecommendationDetail = (rec) => {
		setSelectedRecommendation(rec);
		setIsRecDetailModalVisible(true);
	};

	if (loading && !trip) {
		// Show loading only if trip is not yet set
		return (
			<View style={styles.centered}>
				<ActivityIndicator size="large" color={theme.colors.primary} />
			</View>
		);
	}

	if (error) {
		// Show error if error state is set
		return (
			<View style={styles.centered}>
				<Text style={styles.errorText}>{error}</Text>
				<Pressable onPress={() => router.back()} style={styles.button}>
					<Text style={styles.buttonText}>Go Back</Text>
				</Pressable>
			</View>
		);
	}

	if (!trip) {
		// Fallback if trip is null after loading and no error (should be rare)
		return (
			<View style={styles.centered}>
				<Text style={styles.errorText}>Trip not found.</Text>
				<Pressable onPress={() => router.back()} style={styles.button}>
					<Text style={styles.buttonText}>Go Back</Text>
				</Pressable>
			</View>
		);
	}

	// --- Derived Data for Display (now that trip is guaranteed to be non-null) ---
	const tripUser = trip.user || {};
	const distance = kmOrMiles(trip.distanceMeters);
	const duration = msToDuration(trip.durationMillis);
	const avgSpeedDisplay = `${calcAvgSpeed(trip.distanceMeters, trip.durationMillis)} ${
		kmOrMiles(1000).endsWith("km") ? "km/h" : "mph"
	}`;
	const mapCoords = lineStringToCoords(trip.simplifiedRoute);
	const travelMode = trip.defaultTravelMode || "car";

	let visibilityIcon = "eye";
	let visibilityText = "Public";
	if (trip.defaultTripVisibility === "followers_only") {
		visibilityIcon = "users";
		visibilityText = "Followers Only";
	} else if (trip.defaultTripVisibility === "private") {
		visibilityIcon = "lock";
		visibilityText = "Private";
	}

	const recommendations = trip.recommendations || [];
	const pois = trip.pointsOfInterest || []; // Corrected from your JSON: pointsOfInterest

	return (
		<ScrollView style={styles.container} nestedScrollEnabled={true}>
			<View style={styles.header}>
				<Pressable onPress={() => router.push(`/user/${tripUser._id}`)} style={styles.userInfo}>
					<Avatar
						user={tripUser}
						photoId={tripUser.profilePictureUrl}
						size={28}
						style={{ marginRight: theme.space.sm }}
					/>
					<Text style={styles.userName}>{tripUser.username || "Unknown User"}</Text>
				</Pressable>
				{isOwner && (
					<Pressable onPress={() => setIsDropdownVisible(true)} style={styles.menuButton}>
						<Feather name="more-vertical" size={24} color={theme.colors.text} />
					</Pressable>
				)}
			</View>

			<Text style={styles.tripTitle}>{trip.title || "Untitled Trip"}</Text>
			{(trip.startLocationName || trip.endLocationName) && (
				<Text style={styles.routeText}>
					From: {trip.startLocationName || "N/A"} → To: {trip.endLocationName || "N/A"}
				</Text>
			)}
			<Text style={styles.dateText}>{isoToDate(trip.startDate || trip.createdAt)}</Text>

			{trip.description && <Text style={styles.description}>{trip.description}</Text>}

			<Section title="Route Map">
				<InteractiveTripMap routeCoords={mapCoords} pois={pois} style={{ marginBottom: theme.space.md }} />
			</Section>

			<View style={styles.statsGrid}>
				<IconStatDisplay
					customIcon={<TransportIcon mode={travelMode} size={20} color={theme.colors.textMuted} />}
					value={travelMode.charAt(0).toUpperCase() + travelMode.slice(1)}
					label="Mode"
				/>
				<IconStatDisplay iconName={visibilityIcon} value={visibilityText} label="Visibility" />
				<IconStatDisplay iconName="map-pin" value={distance} label="Distance" />
				<IconStatDisplay iconName="clock" value={duration} label="Duration" />
				<IconStatDisplay iconName="activity" value={avgSpeedDisplay} label="Avg. Speed" />
			</View>

			{/* Social Bar */}
			<View style={styles.socialBar}>
				<View style={styles.likeButtonContainer}>
					<TouchableOpacity onPress={handleToggleLike} style={styles.socialIconPressable}>
						<Feather
							name="heart"
							size={20}
							color={optimisticLikesCount > 0 ? theme.colors.error : theme.colors.textMuted}
							fill={isLikedByCurrentUser ? theme.colors.error : "none"}
						/>
					</TouchableOpacity>
					<TouchableOpacity onPress={handleOpenLikersModal} style={styles.socialCountPressable}>
						<Text
							style={[
								styles.socialCountText,
								(isLikedByCurrentUser || optimisticLikesCount > 0) && { color: theme.colors.error },
							]}
						>
							{optimisticLikesCount}
						</Text>
					</TouchableOpacity>
				</View>
				<SocialButton iconName="message-circle" count={trip.commentsCount || 0} onPress={handleToggleCommentsSection} />
				{/* <SocialButton iconName="star" countComponent={<SocialCount trip={trip} type="recs" />} /> */}
				<SocialButton iconName="star" count={trip.recommendations?.length || 0} />
				<SocialButton iconName="share-2" onPress={handleShare} />
			</View>

			{/* Comments Section */}
			{isCommentsSectionVisible && (
				<Section title="Comments">
					<TouchableOpacity style={styles.addCommentCard} onPress={() => setIsAddCommentModalVisible(true)}>
						<Feather name="plus-circle" size={20} color={theme.colors.primary} />
						<Text style={styles.addCommentCardText}>
							{(trip.commentsCount || 0) === 0 ? "Be the first to comment!" : "Add a comment"}
						</Text>
					</TouchableOpacity>

					{(trip.commentsCount || 0) > 0 && (
						<TouchableOpacity onPress={handleToggleCommentList} style={styles.viewCommentsButton}>
							<Text style={styles.viewCommentsButtonText}>
								{isCommentListExpanded ? "Hide comments" : `View all ${trip.commentsCount} comments`}
							</Text>
							<Feather
								name={isCommentListExpanded ? "chevron-up" : "chevron-down"}
								size={20}
								color={theme.colors.primary}
							/>
						</TouchableOpacity>
					)}

					{
						isCommentListExpanded &&
							(commentsLoading ? (
								<ActivityIndicator color={theme.colors.primary} style={{ marginVertical: theme.space.md }} />
							) : commentsError ? (
								<Text style={styles.errorTextSmall}>{commentsError}</Text>
							) : comments.length > 0 ? (
								<CommentList
									comments={comments}
									currentUserId={currentUser?._id}
									onDeleteComment={handleDeleteComment}
								/>
							) : (trip.commentsCount || 0) > 0 && !commentsLoading ? ( // If count > 0 but local comments array is empty after trying to load
								<Text style={styles.emptySectionText}>No comments found, or an error occurred.</Text>
							) : null) // If count is 0, CommentList will show "No comments yet..." if comments array is empty
					}
				</Section>
			)}
			<Section
				title="Points of Interest"
				onSeeAll={pois.length > 3 ? () => setShowAllPois(!showAllPois) : undefined}
				isExpanded={showAllPois}
			>
				{pois.length > 0 ? (
					(showAllPois ? pois : pois.slice(0, 3)).map((poi, index) => (
						<Pressable
							key={poi._id || `poi-${index}`}
							style={styles.listItem}
							onPress={() => Alert.alert("POI Detail", poi.note || "View POI")}
						>
							<Feather name="map-pin" size={16} color={theme.colors.primary} style={styles.listItemIcon} />
							<Text style={styles.listItemText}>{poi.note || `POI ${index + 1}`}</Text>
						</Pressable>
					))
				) : (
					<Text style={styles.emptySectionText}>No points of interest added.</Text>
				)}
			</Section>

			<Section
				title="Recommendations"
				onSeeAll={recommendations.length > 3 ? () => setShowAllRecommendations(!showAllRecommendations) : undefined}
				isExpanded={showAllRecommendations}
			>
				{recommendations.length > 0 ? (
					(showAllRecommendations ? recommendations : recommendations.slice(0, 3)).map((rec) => (
						<RecommendationCard key={rec._id} rec={rec} onPress={() => handleViewRecommendationDetail(rec)} />
					))
				) : (
					<Text style={styles.emptySectionText}>No recommendations added.</Text>
				)}
			</Section>

			<Section title="Photo Gallery">
				<Text style={styles.placeholderText}>[Photo Gallery Placeholder - Coming Soon]</Text>
			</Section>

			<View style={{ height: 50 }} />

			<DropdownMenu
				isVisible={isDropdownVisible}
				onClose={() => setIsDropdownVisible(false)}
				onEdit={handleEdit}
				onDelete={handleDelete}
				onAddRecommendation={handleAddRecommendation}
			/>
			<AddRecommendationModal ref={addRecommendationModalRef} onSubmit={handleRecommendationSubmit} />
			<RecommendationDetailModal
				isVisible={isRecDetailModalVisible}
				onClose={() => setIsRecDetailModalVisible(false)}
				recommendation={selectedRecommendation}
				tripUserId={trip?.user?._id}
				onEdit={handleEditRecommendation}
				tripRouteCoordinates={mapCoords}
			/>
			<LikersModal
				isVisible={isLikersModalVisible}
				onClose={() => setIsLikersModalVisible(false)}
				likers={likers} // This is the list of user objects for the modal
				isLoading={likersLoading}
				error={likersError}
			/>
			<AddCommentModal
				isVisible={isAddCommentModalVisible}
				onClose={() => setIsAddCommentModalVisible(false)}
				onSubmit={handleAddCommentSubmit}
			/>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: theme.colors.background,
		paddingHorizontal: theme.space.md,
	},
	centered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: theme.space.lg,
	},
	errorText: {
		fontSize: theme.fontSize.md,
		color: theme.colors.error,
		textAlign: "center",
		marginBottom: theme.space.md,
	},
	errorTextSmall: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.error,
		textAlign: "center",
		paddingVertical: theme.space.md,
	},
	button: {
		backgroundColor: theme.colors.primary,
		paddingVertical: theme.space.sm,
		paddingHorizontal: theme.space.md,
		borderRadius: theme.radius.sm,
	},
	buttonText: {
		color: "#fff",
		fontWeight: "600",
		fontSize: theme.fontSize.md,
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: theme.space.md,
	},
	userInfo: {
		flexDirection: "row",
		alignItems: "center",
	},
	profileImagePlaceholder: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: theme.colors.inputBorder,
		justifyContent: "center",
		alignItems: "center",
		marginRight: theme.space.sm,
	},
	userName: {
		fontSize: theme.fontSize.md,
		fontWeight: "600",
		color: theme.colors.text,
	},
	menuButton: {
		padding: theme.space.sm,
	},
	tripTitle: {
		fontSize: 24,
		fontWeight: "bold",
		color: theme.colors.text,
		marginBottom: theme.space.xs,
	},
	routeText: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.textMuted,
		marginBottom: theme.space.xs,
	},
	dateText: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.textMuted,
		marginBottom: theme.space.md,
	},
	description: {
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
		lineHeight: theme.fontSize.md * 1.5,
		marginBottom: theme.space.lg,
	},
	statsGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-around",
		marginBottom: theme.space.lg,
		backgroundColor: theme.colors.inputBackground,
		paddingVertical: theme.space.sm,
		borderRadius: theme.radius.md,
	},
	socialBar: {
		flexDirection: "row",
		justifyContent: "space-around",
		alignItems: "center",
		paddingVertical: theme.space.md,
		marginBottom: theme.space.lg,
		borderTopWidth: 1,
		borderBottomWidth: 1,
		borderColor: theme.colors.inputBorder,
	},
	likeButtonContainer: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: theme.space.sm,
	},
	socialIconPressable: {
		padding: theme.space.xs,
	},
	socialCountPressable: {
		paddingLeft: theme.space.xs,
		paddingVertical: theme.space.xs,
		alignItems: "center",
		justifyContent: "center",
	},
	socialCountText: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.textMuted,
		fontWeight: "500",
	},
	addCommentCard: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: theme.colors.inputBackground,
		borderRadius: theme.radius.md,
		padding: theme.space.md,
		marginBottom: theme.space.md,
		shadowColor: "#000",
		shadowOpacity: 0.05,
		shadowRadius: 4,
		elevation: 2,
	},
	addCommentCardText: {
		marginLeft: theme.space.sm,
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
		fontWeight: "600",
	},
	viewCommentsButton: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: theme.space.sm,
		paddingHorizontal: theme.space.xs,
		marginBottom: theme.space.md,
		backgroundColor: theme.colors.inputBackground,
		borderRadius: theme.radius.md,
	},
	viewCommentsButtonText: {
		color: theme.colors.primary,
		fontWeight: "500",
		fontSize: theme.fontSize.md,
		marginLeft: theme.space.sm,
	},
	listItem: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: theme.colors.inputBackground,
		padding: theme.space.md,
		borderRadius: theme.radius.sm,
		marginBottom: theme.space.sm,
	},
	listItemIcon: {
		marginRight: theme.space.sm,
	},
	listItemText: {
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
		flex: 1,
	},
	emptySectionText: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.textMuted,
		textAlign: "center",
		paddingVertical: theme.space.md,
	},
	placeholderText: {
		textAlign: "center",
		color: theme.colors.textMuted,
		paddingVertical: theme.space.lg,
		fontStyle: "italic",
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		justifyContent: "flex-start",
		alignItems: "flex-end",
		paddingTop: 80,
		paddingRight: theme.space.md,
	},
	dropdownMenu: {
		backgroundColor: theme.colors.background,
		borderRadius: theme.radius.md,
		paddingVertical: theme.space.sm,
		minWidth: 180,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 5,
	},
	dropdownItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: theme.space.md,
		paddingVertical: theme.space.sm,
	},
	dropdownItemText: {
		marginLeft: theme.space.sm,
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
		fontWeight: "500",
	},
});
