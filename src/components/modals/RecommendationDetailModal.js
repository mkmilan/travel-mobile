import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { Feather, Ionicons } from "@expo/vector-icons"; // Added Feather
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Modal from "react-native-modal";

// Reusable StarRating component (can be moved to a shared file if not already)
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

const TagChip = ({ label }) => (
	<View style={styles.tagChip}>
		<Text style={styles.tagChipText}>{label}</Text>
	</View>
);

export default function RecommendationDetailModal({
	isVisible,
	onClose,
	recommendation,
	tripUserId,
}) {
	const { user: currentUser } = useAuthStore();
	if (!recommendation) {
		return null;
	}

	const {
		name,
		description,
		rating,
		primaryCategory,
		attributeTags,
		// latitude, // For future map display
		// longitude,
		photos, // Assuming 'photos' is an array of image URLs/objects
	} = recommendation;

	const canEdit = currentUser?._id === tripUserId;
	// console.log("RecommendationDetailModal props:", {
	// 	isVisible,
	// 	onClose,
	// 	recommendation,
	// 	tripUserId,
	// 	currentUser,
	// });
	// console.log("RECOMENDATION DETAIL MODAL", recommendation);

	// Attempt to find a more descriptive label for the category
	// You might need to import RECOMMENDATION_CATEGORIES from your constants
	// For now, just capitalize
	const categoryLabel = primaryCategory
		? primaryCategory.charAt(0).toUpperCase() + primaryCategory.slice(1)
		: "N/A";

	const handleEdit = () => {
		// onClose(); // Optionally close this modal first
		// router.push(`/recommendation/${recommendation._id}/edit`); // Or open an edit modal
		alert("Edit recommendation: To be implemented");
	};

	return (
		<Modal
			isVisible={isVisible}
			onBackdropPress={onClose}
			onSwipeComplete={onClose}
			swipeDirection={["down"]}
			animationIn="slideInUp"
			animationOut="slideOutDown"
			style={styles.modalStyle}
			// avoidKeyboard
		>
			<View style={styles.modalContainer}>
				<View style={styles.handleBar} />
				<ScrollView showsVerticalScrollIndicator={false}>
					<View style={styles.headerRow}>
						<Text style={styles.title}>{name || "Recommendation"}</Text>
						{canEdit && (
							<Pressable onPress={handleEdit} style={styles.editIcon}>
								<Feather name="edit-2" size={22} color={theme.colors.primary} />
							</Pressable>
						)}
					</View>
					<View style={styles.metaContainer}>
						<View style={styles.categoryContainer}>
							<Feather name="tag" size={18} color={theme.colors.textMuted} />
							<Text style={styles.detailText}>{categoryLabel}</Text>
						</View>
						<StarRatingDisplay rating={rating} style={styles.ratingDisplay} />
					</View>
					{description && (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>Description</Text>
							<Text style={styles.descriptionText}>{description}</Text>
						</View>
					)}
					{attributeTags && attributeTags.length > 0 && (
						<View style={styles.section}>
							<Text style={styles.sectionTitle}>Features / Tags</Text>
							<View style={styles.tagsContainer}>
								{attributeTags.map((tag, index) => (
									<TagChip key={index} label={tag} />
								))}
							</View>
						</View>
					)}
					{/* Gallery Section - Conditionally render or show "Add" button */}
					{(photos && photos.length > 0) ||
						(canEdit && (
							<View style={styles.section}>
								<Text style={styles.sectionTitle}>Gallery</Text>
								{photos && photos.length > 0 ? (
									<View style={styles.galleryPlaceholder}>
										{/* Placeholder for actual image display */}
										<Feather
											name="image"
											size={40}
											color={theme.colors.textMuted}
										/>
										<Text style={styles.placeholderText}>
											{photos.length} image(s)
										</Text>
									</View>
								) : (
									// Show if 'canEdit' is true and no photos yet
									<Pressable
										style={styles.addPhotosButton}
										onPress={() => alert("Add photos - TBI")}
									>
										<Feather
											name="plus-circle"
											size={20}
											color={theme.colors.primary}
										/>
										<Text style={styles.addPhotosButtonText}>Add Photos</Text>
									</Pressable>
								)}
							</View>
						))}

					<View style={{ height: 20 }} />
				</ScrollView>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	modalStyle: {
		margin: 0,
		justifyContent: "flex-end",
	},
	modalContainer: {
		backgroundColor: theme.colors.background,
		borderTopLeftRadius: theme.radius.lg,
		borderTopRightRadius: theme.radius.lg,
		paddingHorizontal: theme.space.lg,
		paddingTop: theme.space.sm,
		paddingBottom: theme.space.md,
		maxHeight: "85%",
	},
	handleBar: {
		width: 40,
		height: 5,
		borderRadius: 2.5,
		backgroundColor: theme.colors.inputBorder,
		alignSelf: "center",
		marginBottom: theme.space.md,
	},
	headerRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: theme.space.sm,
	},
	title: {
		fontSize: 22,
		fontWeight: "bold",
		color: theme.colors.text,
		flex: 1,
	},
	editIcon: {
		padding: theme.space.xs,
	},
	metaContainer: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: theme.space.lg,
	},
	categoryContainer: {
		flexDirection: "row",
		alignItems: "center",
	},
	detailText: {
		// For category text
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
		marginLeft: theme.space.sm,
	},
	ratingDisplay: {
		// Stars will align with category due to alignItems: 'center' in metaContainer
	},
	section: {
		marginBottom: theme.space.lg,
	},
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
		// backgroundColor: `${theme.colors.primary}20`,
		backgroundColor: `${theme.colors.primary}20`,
		paddingHorizontal: theme.space.sm,
		paddingVertical: theme.space.xs,
		borderRadius: theme.radius.full,
	},
	tagChipText: {
		color: theme.colors.primary,
		fontSize: theme.fontSize.sm,
	},
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
