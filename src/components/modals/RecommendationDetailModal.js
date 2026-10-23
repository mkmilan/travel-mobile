import InteractiveTripMap from "@/src/components/map/InteractiveTripMap";
import PhotoGallery from "@/src/components/trip/PhotoGallery";
import usePhotoManager from "@/src/hooks/usePhotoManager";
import useProfileContext from "@/src/hooks/useProfileContext";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { Feather, Ionicons } from "@expo/vector-icons"; // Added Ionicons
import { useRouter } from "expo-router"; // Import useRouter
import { forwardRef, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"; // Added Image
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
			onNavigateClose,
			recommendation,
			tripUserId,
			onEdit,
			tripRouteCoordinates,
			onRefresh,
			onPhotoDeleted,
			readOnly = false,
		},
		ref
	) => {
		/* run hooks unconditionally */
		const { user: currentUser } = useAuthStore();
		const router = useRouter();
		const detailContext = useProfileContext(`${isVisible}:${recommendation?._id || "empty"}`);
		const closedContext = useRef(null);
		const deleteOperation = useRef(null);
		const failedPhoto = useRef(null);
		const photoManager = usePhotoManager({ context: "recommendation",
			id: isVisible ? recommendation?._id : null, initial: isVisible ? recommendation?.photos || [] : [] });
		const isCurrentDetail = () => isVisible && closedContext.current !== detailContext && detailContext.isCurrent();
		const closeDetail = () => {
			if (photoManager.isDeleting()) return;
			closedContext.current = detailContext; // Invalidate native Alert callbacks before the next render.
			onClose();
		};

		/* if nothing to show just render an empty modal (keeps hook order) */
		if (!recommendation) {
			return (
				<BottomModal visible={isVisible} onClose={closeDetail}>
					<ModalHeader title="Recommendation" onClose={closeDetail} />
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
			if (!isCurrentDetail() || photoManager.isDeleting()) return;
			closeDetail();
			onEdit?.(recommendation);
		};
		const handleRemovePhoto = (photoId) => {
			if (!canEdit || !isCurrentDetail()) return Promise.resolve(false);
			if (deleteOperation.current?.context === detailContext) return deleteOperation.current.promise;
			if (!photoManager.getPhotos().includes(photoId)) return Promise.resolve(true);
			const operation = { context: detailContext, promise: null };
			deleteOperation.current = operation;
			failedPhoto.current = photoId;
			operation.promise = (async () => {
				try {
					// Keep the thumbnail on failure. The shared editor hook owns the
					// single-flight DELETE, visible error and session/draft safeguards.
					const removed = await photoManager.removePhoto(photoId);
					if (!removed || !isCurrentDetail()) return false;
					onPhotoDeleted?.(_id, photoId);
					// Refresh is read-only and must not turn a confirmed DELETE into
					// a retry of the write. Parent lists expose their own refresh error.
					void Promise.resolve().then(() => {
						if (isCurrentDetail()) return onRefresh?.();
					}).catch(() => { /* confirmed local removal stays */ });
					return true;
				} finally {
					if (deleteOperation.current === operation) deleteOperation.current = null;
				}
			})();
			return operation.promise;
		};
		const handleNavigateToTrip = () => {
			if (associatedTrip && isCurrentDetail() && !photoManager.isDeleting()) {
				closedContext.current = detailContext;
				(onNavigateClose || onClose)(); // Dismiss any source list as well.
				router.push(`/trip/${associatedTrip}`);
			}
		};
		const handleNavigateToUserProfile = () => {
			if (user?._id && isCurrentDetail() && !photoManager.isDeleting()) {
				closedContext.current = detailContext;
				(onNavigateClose || onClose)(); // Dismiss any source list as well.
				router.push(`/user/${user._id}`); // Navigate to the user's profile
			}
		};
		/* ---------------------------------------------------------------- */
		/* render                                                           */
		/* ---------------------------------------------------------------- */
		return (
			<BottomModal visible={isVisible} onClose={closeDetail}>
				<ModalHeader title={name || "Recommendation"} onClose={closeDetail} />

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
								<Pressable onPress={handleEdit} disabled={photoManager.deleting} style={styles.editIconInline}>
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

					{photoManager.photos.length > 0 && (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>Gallery</Text>
							<PhotoGallery photoIds={photoManager.photos} canDelete={canEdit} deleteDisabled={photoManager.deleting} onDelete={handleRemovePhoto} />
							{photoManager.deleting && <Text accessibilityLiveRegion="polite">Removing photo…</Text>}
							{photoManager.deleteError && <View>
								<Text accessibilityRole="alert" style={{ color: theme.colors.error }}>{photoManager.deleteError}</Text>
								<Pressable accessibilityRole="button" testID="recommendation-photo-delete-retry" onPress={() => handleRemovePhoto(failedPhoto.current)}>
									<Text>Retry remove photo</Text>
								</Pressable>
							</View>}
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
