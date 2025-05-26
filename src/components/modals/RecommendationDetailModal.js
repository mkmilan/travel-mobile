import InteractiveTripMap from "@/src/components/map/InteractiveTripMap";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { Feather, Ionicons } from "@expo/vector-icons";
import { forwardRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

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
	({ isVisible, onClose, recommendation, tripUserId, onEdit, tripRouteCoordinates }, ref) => {
		/* run hooks unconditionally */
		const { user: currentUser } = useAuthStore();

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
		const { _id, name, description, rating, primaryCategory, attributeTags, photos = [], location } = recommendation;

		const canEdit = currentUser?._id === tripUserId;

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

		/* ---------------------------------------------------------------- */
		/* render                                                           */
		/* ---------------------------------------------------------------- */
		return (
			<BottomModal visible={isVisible} onClose={onClose}>
				<ModalHeader title={name || "Recommendation"} onClose={onClose} />

				<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: theme.space.lg }}>
					{/* header row ------------------------------------------------ */}
					<View style={styles.headerRow}>
						<View style={{ flex: 1 }} />
						{canEdit && (
							<Pressable onPress={handleEdit} style={styles.editIcon}>
								<Feather name="edit-2" size={22} color={theme.colors.primary} />
							</Pressable>
						)}
					</View>

					{/* map ------------------------------------------------------- */}
					{tripRouteCoordinates?.length > 0 && recPoi.length > 0 && (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>Location on Route</Text>
							<InteractiveTripMap
								routeCoords={tripRouteCoordinates}
								pois={recPoi}
								style={{ height: 220, marginBottom: theme.space.md }}
							/>
						</View>
					)}

					{/* meta row -------------------------------------------------- */}
					<View style={styles.metaContainer}>
						<View style={styles.categoryContainer}>
							<Feather name="tag" size={18} color={theme.colors.textMuted} />
							<Text style={styles.detailText}>{categoryLabel}</Text>
						</View>
						<StarRatingDisplay rating={rating} />
					</View>

					{/* description ---------------------------------------------- */}
					{description ? (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>Description</Text>
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

					{/* gallery placeholder -------------------------------------- */}
					{(photos.length > 0 || canEdit) && (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>Gallery</Text>
							{photos.length ? (
								<View style={styles.galleryPlaceholder}>
									<Feather name="image" size={40} color={theme.colors.textMuted} />
									<Text style={styles.placeholderText}>{photos.length} image(s)</Text>
								</View>
							) : (
								<Pressable style={styles.addPhotosButton} onPress={() => alert("Add photos – TBI")}>
									<Feather name="plus-circle" size={20} color={theme.colors.primary} />
									<Text style={styles.addPhotosButtonText}>Add Photos</Text>
								</Pressable>
							)}
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
		fontSize: theme.fontSize.lg,
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
	tagChip: {
		backgroundColor: `${theme.colors.primary}20`,
		paddingHorizontal: theme.space.sm,
		paddingVertical: theme.space.xs,
		borderRadius: theme.radius.full,
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
});
