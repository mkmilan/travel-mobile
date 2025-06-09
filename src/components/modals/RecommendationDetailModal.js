import InteractiveTripMap from "@/src/components/map/InteractiveTripMap";
import PhotoGallery from "@/src/components/trip/PhotoGallery";
import { deleteRecommendationPhoto } from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { Feather, Ionicons } from "@expo/vector-icons"; // Added Ionicons
import { useRouter } from "expo-router"; // Import useRouter
import { forwardRef } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"; // Added Image
import Avatar from "../ui/Avatar";
import BottomModal from "./BottomModal";
import ModalHeader from "./ModalHeader";
/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */
const StarRatingDisplay = ({ rating, size = 20, style }) => (
	<View style={[{ flexDirection: "row" }, style]}>
		{[1, 2, 3, 4, 5].map((s) => (
			<Ionicons
				key={s}
				name={rating >= s ? "star" : "star-outline"}
				size={size}
				color={rating >= s ? "#FCD34D" : theme.colors.textMuted}
				style={{ marginRight: 2 }}
			/>
		))}
	</View>
);

const TagChip = ({ label }) => (
	<View style={styles.tagChip}>
		<Text style={styles.tagChipText}>{label}</Text>
	</View>
);

/* ------------------------------------------------------------------ */
/* main component                                                     */
/* ------------------------------------------------------------------ */
const RecommendationDetailModal = forwardRef(
	(
		{
			isVisible,
			onClose,
			recommendation,
			tripUserId,
			onEdit,
			tripRouteCoordinates,
			onRefresh,
			onOptimisticPhotoDelete,
			readOnly = false,
		},
		ref
	) => {
		/* run hooks unconditionally */
		const { user: currentUser } = useAuthStore();
		const router = useRouter();
		// console.log("RecommendationDetailModal rec", {  recommendation });

		/* if nothing to show just render an empty modal (keeps hook order) */
		if (!recommendation) {
			return (
				<BottomModal visible={isVisible} onClose={onClose}>
					<ModalHeader title="Recommendation" onClose={onClose} />
				</BottomModal>
			);
		}

		/* ---------------------------------------------------------------- */
		/* derived data                                                     */
		/* ---------------------------------------------------------------- */
		const {
			_id,
			name,
			description,
			rating,
			primaryCategory,
			attributeTags,
			photos = [],
			location,
			user, // Destructure user from recommendation
			associatedTrip,
		} = recommendation;

		const canEdit = !readOnly && currentUser?._id === tripUserId; // we added readonly for rec in rec sheet to be only view

		const categoryLabel = primaryCategory ? primaryCategory.charAt(0).toUpperCase() + primaryCategory.slice(1) : "N/A";

		/* marker for map */
		const recPoi =
			location?.coordinates?.length === 2
				? [
						{
							_id,
							lat: location.coordinates[1],
							lon: location.coordinates[0],
							note: name || "POI",
						},
				  ]
				: [];

		/* ---------------------------------------------------------------- */
		/* handlers                                                         */
		/* ---------------------------------------------------------------- */
		const handleEdit = () => {
			onClose();
			onEdit?.(recommendation);
		};
		const handleRemovePhoto = async (photoId) => {
			try {
				// 1. IMMEDIATE FEEDBACK - Update UI optimistically
				if (onOptimisticPhotoDelete) {
					onOptimisticPhotoDelete(recommendation._id, photoId);
				}

				// 2. API CALL - Delete from server
				await deleteRecommendationPhoto(_id, photoId);

				// 3. SUCCESS FEEDBACK
				Alert.alert("Success", "Photo deleted successfully");

				// 4. SYNC - Refresh to ensure consistency
				if (onRefresh) {
					onRefresh();
				}
			} catch (e) {
				// 5. ERROR HANDLING - Revert optimistic update
				Alert.alert("Delete failed", e.message);

				// Revert the optimistic update by refreshing
				if (onRefresh) {
					onRefresh();
				}
			}

			// try {
			// 	await deleteRecommendationPhoto(_id, photoId);
			// 	// setSelectedRecommendation((prev) =>
			// 	// 	prev
			// 	// 		? {
			// 	// 				...prev,
			// 	// 				photos: prev.photos.filter((id) => id !== photoId),
			// 	// 		  }
			// 	// 		: prev
			// 	// );

			// 	Alert.alert("Success", "Photo deleted successfully");
			// 	if (onRefresh) {
			// 		onRefresh();
			// 	}
			// } catch (e) {
			// 	Alert.alert("Delete failed", e.message);
			// }
		};
		const handleNavigateToTrip = () => {
			if (associatedTrip) {
				onClose(); // Close the modal before navigating
				router.push(`/trip/${associatedTrip}`);
			}
		};
		const handleNavigateToUserProfile = () => {
			if (user?._id) {
				onClose(); // Close this modal
				router.push(`/user/${user._id}`); // Navigate to the user's profile
			}
		};
		/* ---------------------------------------------------------------- */
		/* render                                                           */
		/* ---------------------------------------------------------------- */
		return (
			<BottomModal visible={isVisible} onClose={onClose}>
				<ModalHeader title={name || "Recommendation"} onClose={onClose} />

				<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: theme.space.lg }}>
					{/* header row ------------------------------------------------ */}
					{/* <View style={styles.headerRow}> */}
					{/* <View style={{ flex: 1 }} />
						{canEdit && (
							<Pressable onPress={handleEdit} style={styles.editIcon}>
								<Feather name="edit-2" size={22} color={theme.colors.primary} />
							</Pressable>
						)}
					</View> */}
					{/* Author Info */}
					{/* {user?._id && ( // Check if user and user._id exist
						<Pressable onPress={handleNavigateToUserProfile} style={styles.authorSection}>
							{user.profilePictureUrl ? (
								<Avatar
									user={user}
									profilePictureUrl={user.profilePictureUrl}
									size={26}
									style={{ marginRight: theme.space.sm }}
								/>
							) : (
								<View style={[styles.authorAvatar, styles.avatarFallback]}>
									<Text style={styles.avatarFallbackText}>{user.username?.[0]?.toUpperCase() || "?"}</Text>
								</View>
							)}
							<Text style={styles.authorName} numberOfLines={1}>
								{user.username || "Anonymous"}
							</Text>
						</Pressable>
					)} */}
					{/* Author Info + Edit Icon */}
					{user?._id && (
						<View style={styles.authorRow}>
							<Pressable onPress={handleNavigateToUserProfile} style={styles.authorSection}>
								{user.profilePictureUrl ? (
									<Avatar
										user={user}
										profilePictureUrl={user.profilePictureUrl}
										size={26}
										style={{ marginRight: theme.space.sm }}
									/>
								) : (
									<View style={[styles.authorAvatar, styles.avatarFallback]}>
										<Text style={styles.avatarFallbackText}>{user.username?.[0]?.toUpperCase() || "?"}</Text>
									</View>
								)}
								<Text style={styles.authorName} numberOfLines={1}>
									{user.username || "Anonymous"}
								</Text>
							</Pressable>
							{canEdit && (
								<Pressable onPress={handleEdit} style={styles.editIconInline}>
									<Feather name="edit-2" size={20} color={theme.colors.primary} />
								</Pressable>
							)}
						</View>
					)}
					{/* map ------------------------------------------------------- */}
					{tripRouteCoordinates?.length > 0 && recPoi.length > 0 && (
						<View style={styles.section}>
							{/* <Text style={styles.sectionTitle}>Location on Route</Text> */}
							<InteractiveTripMap
								routeCoords={tripRouteCoordinates}
								pois={recPoi}
								style={{ height: 220, marginBottom: theme.space.md }}
							/>
						</View>
					)}
					{/* Link to Associated Trip */}
					{associatedTrip && (
						<Pressable onPress={handleNavigateToTrip} style={styles.tripLinkButton}>
							<Ionicons name="map-outline" size={18} color={theme.colors.primary} style={{ marginRight: 6 }} />
							<Text style={styles.tripLinkTextSmall}>View Associated Trip</Text>
						</Pressable>
					)}

					{/* meta row -------------------------------------------------- */}
					{/* <View style={styles.metaContainer}>
						<View style={styles.categoryContainer}>
							<Feather name="tag" size={18} color={theme.colors.textMuted} />
							<Text style={styles.detailText}>{categoryLabel}</Text>
						</View>
						<StarRatingDisplay rating={rating} />
					</View> */}
					<Text style={styles.sectionTitle}>Category</Text>
					<View style={styles.metaContainer}>
						<View style={styles.categoryChip}>
							<Feather name="tag" size={16} color={theme.colors.primary} />
							<Text style={styles.categoryChipText}>{categoryLabel}</Text>
						</View>
						<StarRatingDisplay rating={rating} />
					</View>

					{/* description ---------------------------------------------- */}
					{description ? (
						<View style={styles.section}>
							{/* <Text style={styles.sectionTitle}>Description</Text> */}
							<Text style={styles.descriptionText}>{description}</Text>
						</View>
					) : null}

					{/* tags ------------------------------------------------------ */}
					{attributeTags?.length ? (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>Features / Tags</Text>
							<View style={styles.tagsContainer}>
								{attributeTags.map((t) => (
									<TagChip key={t} label={t} />
								))}
							</View>
						</View>
					) : null}

					{/* gallery -------------------------------------- */}

					{photos.length > 0 && (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>Gallery</Text>
							<PhotoGallery photoIds={photos} canDelete={!readOnly && canEdit} onDelete={handleRemovePhoto} />
						</View>
					)}
				</ScrollView>
			</BottomModal>
		);
	}
);

export default RecommendationDetailModal;

/* ------------------------------------------------------------------ */
/* styling (unchanged except tiny tweaks)                             */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
	headerRow: {
		flexDirection: "row",
		justifyContent: "flex-end",
		marginBottom: theme.space.sm,
	},
	editIcon: { padding: theme.space.xs },
	metaContainer: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: theme.space.lg,
	},
	categoryContainer: { flexDirection: "row", alignItems: "center" },
	detailText: {
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
		marginLeft: theme.space.sm,
	},
	section: { marginBottom: theme.space.lg },
	sectionTitle: {
		fontSize: theme.fontSize.md,
		fontWeight: "600",
		color: theme.colors.text,
		marginBottom: theme.space.sm,
	},
	descriptionText: {
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
		lineHeight: theme.fontSize.md * 1.5,
	},
	tagsContainer: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: theme.space.sm,
	},
	categoryChip: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: `${theme.colors.primary}22`,
		paddingHorizontal: theme.space.md,
		paddingVertical: theme.space.xs,
		borderRadius: theme.radius.sm,
	},
	categoryChipText: {
		color: theme.colors.primary,
		fontWeight: "400",
		fontSize: theme.fontSize.md,
		marginLeft: theme.space.xs,
	},
	tripLinkTextSmall: {
		color: theme.colors.primary ?? "#2563eb",
		fontSize: theme.fontSize.sm,
		fontWeight: "400",
		letterSpacing: 0.2,
		textTransform: "none",
	},
	tagChip: {
		backgroundColor: `${theme.colors.primary}15`,
		paddingHorizontal: theme.space.sm,
		paddingVertical: theme.space.xs,
		borderRadius: theme.radius.xs, // Less rounded
	},
	tagChipText: { color: theme.colors.primary, fontSize: theme.fontSize.sm },
	galleryPlaceholder: {
		height: 150,
		backgroundColor: theme.colors.inputBackground,
		borderRadius: theme.radius.md,
		justifyContent: "center",
		alignItems: "center",
		borderWidth: 1,
		borderColor: theme.colors.inputBorder,
		borderStyle: "dashed",
	},
	addPhotosButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: theme.space.md,
		backgroundColor: theme.colors.inputBackground,
		borderRadius: theme.radius.md,
		borderWidth: 1,
		borderColor: theme.colors.primary,
	},
	addPhotosButtonText: {
		color: theme.colors.primary,
		marginLeft: theme.space.sm,
		fontSize: theme.fontSize.md,
		fontWeight: "500",
	},
	placeholderText: {
		marginTop: theme.space.sm,
		color: theme.colors.textMuted,
		fontSize: theme.fontSize.sm,
	},
	authorSection: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: theme.space.sm,
		paddingHorizontal: 0,
		marginBottom: 0,
	},
	authorAvatar: {
		width: 32,
		height: 32,
		borderRadius: 16,
		marginRight: theme.space.sm,
		backgroundColor: theme.colors.muted,
		justifyContent: "center",
		alignItems: "center",
	},
	avatarFallback: {
		backgroundColor: theme.colors.primaryMuted,
	},
	avatarFallbackText: {
		color: theme.colors.primary,
		fontWeight: "bold",
		fontSize: theme.fontSize.sm,
	},
	authorName: {
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
		fontWeight: "500",
		flexShrink: 1,
	},
	tripLinkButton: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: theme.colors.primary + "10",
		paddingVertical: theme.space.sm,
		paddingHorizontal: 0,
		borderRadius: theme.radius.sm,
		justifyContent: "center",
		marginBottom: theme.space.lg,
		marginHorizontal: 0,
	},
	tripLinkText: {
		color: theme.colors.primary,
		fontSize: theme.fontSize.md,
		fontWeight: "400",
	},
	authorRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 0,
		marginBottom: theme.space.md,
	},
	editIconInline: {
		padding: theme.space.xs,
		marginLeft: theme.space.sm,
	},
});
