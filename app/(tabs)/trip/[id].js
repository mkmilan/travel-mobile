import TransportIcon from "@/src/components/TransportIcon";
import InteractiveTripMap from "@/src/components/map/InteractiveTripMap";
import AddRecommendationModal from "@/src/components/modals/AddRecommendationModal";
import RecommendationDetailModal from "@/src/components/modals/RecommendationDetailModal";
import IconStatDisplay from "@/src/components/trip/IconStatDisplay";
import Section from "@/src/components/trip/Section";
import SocialButton from "@/src/components/trip/SocialButton";
import { addRecommendation, getTripJsonById, updateRecommendation } from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { calcAvgSpeed, isoToDate, kmOrMiles, msToDuration } from "@/src/utils/format";
import { lineStringToCoords } from "@/src/utils/geo";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const StarRatingDisplay = ({ rating, size = 20, style }) => {
	return (
		<View style={[{ flexDirection: "row" }, style]}>
			{[1, 2, 3, 4, 5].map((star) => (
				<Ionicons
					key={star}
					name={rating >= star ? "star" : "star-outline"}
					size={size}
					color={rating >= star ? "#FCD34D" : theme.colors.textMuted}
					style={{ marginRight: 2 }}
				/>
			))}
		</View>
	);
};

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

	const [trip, setTrip] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	const [selectedRecommendation, setSelectedRecommendation] = useState(null);
	const [isRecDetailModalVisible, setIsRecDetailModalVisible] = useState(false);
	const [isDropdownVisible, setIsDropdownVisible] = useState(false);
	const [showAllPois, setShowAllPois] = useState(false);
	const [showAllRecommendations, setShowAllRecommendations] = useState(false);

	const addRecommendationModalRef = useRef(null);
	// Keep the initial useEffect for when tripId changes
	useEffect(() => {
		if (tripId) {
			fetchTripDetails();
		} else {
			setError("Trip ID is missing.");
			setLoading(false);
		}
	}, [tripId]);

	// Add useFocusEffect to refresh data when screen comes into focus
	useFocusEffect(
		useCallback(() => {
			if (tripId) {
				fetchTripDetails();
			}
		}, [tripId])
	);

	const fetchTripDetails = async () => {
		setLoading(true);
		setError(null);
		try {
			const data = await getTripJsonById(tripId);
			setTrip(data);
		} catch (err) {
			console.error("Failed to fetch trip details:", err);
			setError(err.message || "Could not load trip details.");
			Alert.alert("Error", "Could not load trip details.");
		} finally {
			setLoading(false);
		}
	};

	const isOwner = isAuthenticated && trip && trip.user?._id === currentUser?._id;

	const handleEdit = () => {
		// Navigate to an edit screen (to be created)
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
					// TODO: Implement delete functionality
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
				// Try to get coordinates from the simplified route first
				if (trip.simplifiedRoute) {
					const routeCoords = lineStringToCoords(trip.simplifiedRoute);
					if (routeCoords && routeCoords.length > 0) {
						initialMapLocation = {
							lat: routeCoords[0].latitude,
							lon: routeCoords[0].longitude,
						};
					}
				}
				// Fallback to trip's start location (assuming GeoJSON Point: [lon, lat])
				if (!initialMapLocation && trip.startLocation?.coordinates?.length === 2) {
					initialMapLocation = {
						lat: trip.startLocation.coordinates[1],
						lon: trip.startLocation.coordinates[0],
					};
				}
				// Fallback to trip's end location
				if (!initialMapLocation && trip.endLocation?.coordinates?.length === 2) {
					initialMapLocation = {
						lat: trip.endLocation.coordinates[1],
						lon: trip.endLocation.coordinates[0],
					};
				}
			}

			addRecommendationModalRef.current.open(initialMapLocation, tripId);
		} else {
			Alert.alert("Add Recommendation", "Add recommendation functionality to be implemented.");
		}
	};
	const handleEditRecommendation = (recommendation) => {
		console.log("Editing recommendation:", recommendation);
		addRecommendationModalRef.current?.openEdit(recommendation);
	};

	const handleRecommendationSubmit = async (recommendationData, isEditMode = false) => {
		try {
			if (isEditMode) {
				// Update existing recommendation
				await updateRecommendation(recommendationData._id, recommendationData);
				Alert.alert("Success", "Recommendation updated successfully!");
			} else {
				// Add new recommendation
				await addRecommendation(recommendationData);
				Alert.alert("Success", "Recommendation added successfully!");
			}

			// Refresh trip data to show updated recommendations
			fetchTripDetails();
		} catch (error) {
			console.error("Failed to save recommendation:", error);
			Alert.alert("Error", isEditMode ? "Failed to update recommendation" : "Failed to add recommendation");
		}
	};

	const handleViewLikes = () => Alert.alert("Likes", "View likes functionality to be implemented.");
	const handleViewComments = () => Alert.alert("Comments", "View comments functionality to be implemented.");
	const handleShare = () => Alert.alert("Share", "Share functionality to be implemented.");

	const handleViewPois = () => Alert.alert("POIs", "View all POIs functionality to be implemented.");
	const handleViewRecommendations = () =>
		Alert.alert("Recommendations", "View all recommendations functionality to be implemented.");

	const handleViewRecommendationDetail = (rec) => {
		setSelectedRecommendation(rec);
		setIsRecDetailModalVisible(true);
		// console.log(
		// 	"Viewing recommendation detailfrom handleViewRecommendationDetail",
		// 	rec
		// );
	};

	if (loading) {
		return (
			<View style={styles.centered}>
				<ActivityIndicator size="large" color={theme.colors.primary} />
			</View>
		);
	}

	if (error || !trip) {
		return (
			<View style={styles.centered}>
				<Text style={styles.errorText}>{error || "Trip not found."}</Text>
				<Pressable onPress={() => router.back()} style={styles.button}>
					<Text style={styles.buttonText}>Go Back</Text>
				</Pressable>
			</View>
		);
	}

	// --- Derived Data for Display ---
	const tripUser = trip.user || {};
	const distance = kmOrMiles(trip.distanceMeters);
	const duration = msToDuration(trip.durationMillis);
	const avgSpeedDisplay = `${calcAvgSpeed(trip.distanceMeters, trip.durationMillis)} ${
		kmOrMiles(1000).endsWith("km") ? "km/h" : "mph"
	}`; // Ensure unit matches
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

	return (
		<ScrollView style={styles.container}>
			{/* User Info and Title */}
			<View style={styles.header}>
				<Pressable onPress={() => router.push(`/user/${tripUser._id}`)} style={styles.userInfo}>
					{/* Placeholder for profile image */}
					<View style={styles.profileImagePlaceholder}>
						<Feather name="user" size={24} color={theme.colors.textMuted} />
					</View>
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

			{/* Description */}
			{trip.description && <Text style={styles.description}>{trip.description}</Text>}

			{/* Interactive Map Placeholder (replace with actual interactive map later) */}
			{/* <Section title="Route Map">
				<TripMapThumbnail coords={mapCoords} />
				
				<Text style={styles.placeholderText}>
					[Interactive Map Placeholder]
				</Text>
			</Section> */}
			<Section title="Route Map">
				<InteractiveTripMap routeCoords={mapCoords} pois={trip.pois || []} style={{ marginBottom: theme.space.md }} />
			</Section>
			{/* Stats */}
			<View style={styles.statsGrid}>
				<IconStatDisplay
					customIcon={
						// Pass the TransportIcon component
						<TransportIcon
							mode={travelMode}
							size={22} // Adjust size as needed for this context
							color={theme.colors.textMuted}
						/>
					}
					value={travelMode.charAt(0).toUpperCase() + travelMode.slice(1)}
					label="Mode"
				/>
				<IconStatDisplay iconName={visibilityIcon} value={visibilityText} label="Visibility" />
				<IconStatDisplay iconName="map-pin" value={distance} label="Distance" />
				<IconStatDisplay iconName="clock" value={duration} label="Duration" />
				<IconStatDisplay iconName="activity" value={avgSpeedDisplay} label="Avg. Speed" />
			</View>

			{/* Social Interactions */}
			<View style={styles.socialBar}>
				<SocialButton iconName="heart" count={trip.likesCount || 0} onPress={handleViewLikes} />
				<SocialButton iconName="message-circle" count={trip.commentsCount || 0} onPress={handleViewComments} />
				<SocialButton iconName="share-2" onPress={handleShare} />
			</View>

			{/* Points of Interest */}
			<Section
				title="Points of Interest"
				onSeeAll={trip.pois?.length > 3 ? () => setShowAllPois(!showAllPois) : null}
				isExpanded={showAllPois}
			>
				{trip.pois && trip.pois.length > 0 ? (
					// Conditionally render all POIs or just the first 3
					(showAllPois ? trip.pois : trip.pois.slice(0, 3)).map((poi, index) => (
						<Pressable
							key={`poi-${index}`}
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

			{/* Recommendations */}
			<Section
				title="Recommendations"
				onSeeAll={trip.recommendations?.length > 3 ? () => setShowAllRecommendations(!showAllRecommendations) : null}
				isExpanded={showAllRecommendations}
			>
				{trip.recommendations && trip.recommendations.length > 0 ? (
					// Conditionally render all recommendations or just the first 3
					(showAllRecommendations ? trip.recommendations : trip.recommendations.slice(0, 3)).map((rec, index) => {
						// ...existing code...
						const categoryLabel = rec.primaryCategory
							? rec.primaryCategory.charAt(0).toUpperCase() + rec.primaryCategory.slice(1)
							: "N/A";

						return (
							<Pressable
								key={`rec-${index}`}
								style={styles.recommendationCard} // Use a new style for better visual separation
								onPress={() => handleViewRecommendationDetail(rec)}
							>
								<View style={styles.recommendationCardHeader}>
									<Feather name="star" size={18} color={theme.colors.warning} />
									<Text style={styles.recommendationName} numberOfLines={1}>
										{rec.name || `Recommendation ${index + 1}`}
									</Text>
								</View>
								<View style={styles.recommendationCardDetails}>
									<Text style={styles.recommendationCategory}>{categoryLabel}</Text>
									<StarRatingDisplay rating={rec.rating} size={16} />
								</View>
								{/* Optional: Add a short description snippet if available and desired */}
								{/* {rec.description && <Text style={styles.recommendationDescriptionSnippet} numberOfLines={2}>{rec.description}</Text>} */}
							</Pressable>
						);
					})
				) : (
					<Text style={styles.emptySectionText}>No recommendations added.</Text>
				)}
			</Section>

			{/* Gallery Placeholder */}
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
		</ScrollView>
	);
}

// --- Styles ---
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
	editButton: {
		flexDirection: "row",
		alignItems: "center",
		padding: theme.space.sm,
		// borderWidth: 1,
		// borderColor: theme.colors.primary,
		// borderRadius: theme.radius.sm,
	},
	editButtonText: {
		color: theme.colors.primary,
		marginLeft: theme.space.xs,
		fontWeight: "500",
	},
	tripTitle: {
		fontSize: 24, // Larger title
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
	sectionContainer: {
		marginBottom: theme.space.lg,
	},
	sectionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: theme.space.sm,
	},
	sectionTitle: {
		fontSize: theme.fontSize.lg,
		fontWeight: "600",
		color: theme.colors.text,
	},
	seeAllText: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.primary,
		fontWeight: "500",
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
	iconStatDisplay: {
		alignItems: "center",
		width: "30%", // Adjust for 3 items per row, or '45%' for 2 items
		marginBottom: theme.space.md,
		paddingHorizontal: theme.space.xs,
	},
	iconStatDisplayContent: {
		alignItems: "center",
		marginTop: theme.space.xs,
	},
	iconStatValue: {
		fontSize: theme.fontSize.md,
		fontWeight: "600",
		color: theme.colors.text,
		textAlign: "center",
	},
	iconStatLabel: {
		fontSize: 12,
		color: theme.colors.textMuted,
		textAlign: "center",
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
	socialButton: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: theme.space.sm,
	},
	socialCount: {
		marginLeft: theme.space.xs,
		fontSize: theme.fontSize.sm,
		color: theme.colors.text,
		fontWeight: "500",
	},
	socialLabel: {
		// If you want text labels like "Like", "Comment"
		marginLeft: theme.space.xs,
		fontSize: theme.fontSize.sm,
		color: theme.colors.text,
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
	listItemSubtitle: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.textMuted,
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
	recommendationCard: {
		backgroundColor: theme.colors.inputBackground,
		borderRadius: theme.radius.md,
		padding: theme.space.md,
		marginBottom: theme.space.md,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		shadowRadius: 2,
		elevation: 1,
	},
	recommendationCardHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: theme.space.sm, // Increased margin for more space below header
	},
	recommendationName: {
		fontSize: theme.fontSize.md,
		fontWeight: "600",
		color: theme.colors.text,
		marginLeft: theme.space.sm,
		flex: 1,
	},
	recommendationCardDetails: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginTop: theme.space.xs, // Add some top margin
	},
	recommendationCategory: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.primary, // Use primary color for text for better contrast
		backgroundColor: theme.colors.primary + "20", // Lighter primary background
		paddingHorizontal: theme.space.sm, // Increased padding
		paddingVertical: theme.space.xs, // Increased padding
		borderRadius: theme.radius.sm,
		marginRight: theme.space.md, // Add margin to separate from stars
		alignSelf: "flex-start", // Ensure it doesn't stretch if stars are taller
	},
	menuButton: {
		padding: theme.space.sm,
		borderRadius: theme.radius.sm,
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		justifyContent: "flex-start",
		alignItems: "flex-end",
		paddingTop: 80, // Adjust based on your header height
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
