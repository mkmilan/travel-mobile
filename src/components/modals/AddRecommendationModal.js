import BottomModal from "@/src/components/modals/BottomModal"; // <- shared wrapper
import ModalHeader from "@/src/components/modals/ModalHeader";
import { RECOMMENDATION_CATEGORIES, RECOMMENDATION_TAGS } from "@/src/constants/recommendationConstants";
import { theme } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { forwardRef, useImperativeHandle, useState } from "react";
import {
	Alert,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { StarRating } from "../helpers/StarRating";

// Category Selector Component
const CategorySelector = ({ selectedCategory, onCategoryChange }) => {
	const [showCategories, setShowCategories] = useState(false);
	const [open, setOpen] = useState(false);

	const selectedCategoryLabel =
		RECOMMENDATION_CATEGORIES.find((cat) => cat.value === selectedCategory)?.label || "Select Category";

	return (
		<View>
			<Text style={styles.label}>Category</Text>
			<Pressable
				// onPress={() => setShowCategories(true)}
				onPress={() => setOpen(true)}
				style={[
					styles.input,
					{
						flexDirection: "row",
						justifyContent: "space-between",
						alignItems: "center",
					},
				]}
			>
				<Text
					style={{
						color: selectedCategory ? theme.colors.text : theme.colors.textMuted,
						fontSize: theme.fontSize.sm,
					}}
				>
					{selectedCategoryLabel}
				</Text>
				<Ionicons name="chevron-down" size={20} color={theme.colors.textMuted} />
			</Pressable>
			{/* bottom-sheet */}
			<BottomModal visible={open} onClose={() => setOpen(false)}>
				<ModalHeader title="Select Category" onClose={() => setOpen(false)} />
				<View style={styles.categoryModal}>
					<ScrollView style={{ maxHeight: 1000 }}>
						{RECOMMENDATION_CATEGORIES.map((category) => (
							<Pressable
								key={category.value}
								onPress={() => {
									onCategoryChange(category.value);
									setOpen(false);
								}}
								style={[
									styles.categoryItem,
									selectedCategory === category.value && {
										backgroundColor: theme.colors.primary + "20",
									},
								]}
							>
								<Text
									style={[
										styles.categoryItemText,
										selectedCategory === category.value && {
											color: theme.colors.primary,
											fontWeight: "600",
										},
									]}
								>
									{category.label}
								</Text>
								{selectedCategory === category.value && (
									<Ionicons name="checkmark" size={18} color={theme.colors.primary} />
								)}
							</Pressable>
						))}
					</ScrollView>
				</View>
			</BottomModal>
		</View>
	);
};

// Tags Selector Component
const TagsSelector = ({ selectedTags, onTagsChange }) => {
	const [showTags, setShowTags] = useState(false);
	const [open, setOpen] = useState(false);

	const toggleTag = (tagValue) => {
		const newTags = selectedTags.includes(tagValue)
			? selectedTags.filter((tag) => tag !== tagValue)
			: [...selectedTags, tagValue];
		onTagsChange(newTags);
	};

	return (
		<View>
			<Text style={styles.label}>Features / Tags</Text>
			<Pressable
				onPress={() => setOpen(true)}
				style={[
					styles.input,
					{
						flexDirection: "row",
						justifyContent: "space-between",
						alignItems: "center",
					},
				]}
			>
				<Text
					style={{
						color: selectedTags.length ? theme.colors.text : theme.colors.textMuted,
						fontSize: theme.fontSize.sm,
					}}
				>
					{selectedTags.length > 0 ? `${selectedTags.length} selected` : "Select features"}
				</Text>
				<Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
			</Pressable>

			<BottomModal visible={open} onClose={() => setOpen(false)}>
				<ModalHeader title="Select Features" onClose={() => setOpen(false)} />
				<ScrollView style={{ maxHeight: 4000 }}>
					{RECOMMENDATION_TAGS.map((tag) => (
						<Pressable
							key={tag.value}
							onPress={() => toggleTag(tag.value)}
							style={[
								styles.categoryItem,
								selectedTags.includes(tag.value) && {
									backgroundColor: theme.colors.primary + "20",
								},
							]}
						>
							<Text
								style={[
									styles.categoryItemText,
									selectedTags.includes(tag.value) && {
										color: theme.colors.primary,
										fontWeight: "600",
									},
								]}
							>
								{tag.label}
							</Text>
							{selectedTags.includes(tag.value) && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
						</Pressable>
					))}
				</ScrollView>
				<Pressable
					onPress={() => setOpen(false)}
					style={[
						styles.button,
						{
							marginTop: theme.space.md,
							backgroundColor: theme.colors.primary,
						},
					]}
				>
					<Text style={styles.buttonText}>Done</Text>
				</Pressable>
			</BottomModal>
		</View>
	);
};

const AddRecommendationModal = forwardRef(({ onSubmit }, ref) => {
	const [visible, setVisible] = useState(false);
	const [isEditMode, setIsEditMode] = useState(false);
	const [editingRecommendationId, setEditingRecommendationId] = useState(null);
	const [associatedTrip, setAssociatedTrip] = useState(null);
	const [formData, setFormData] = useState({
		name: "",
		description: "",
		rating: 0,
		primaryCategory: "",
		attributeTags: [],
		lat: null,
		lon: null,
	});

	const [mapRegion, setMapRegion] = useState({
		// Added state for map region
		latitude: 37.78825,
		longitude: -122.4324,
		latitudeDelta: 0.0922,
		longitudeDelta: 0.0421,
	});

	useImperativeHandle(ref, () => ({
		open(locationData = null, tripId = null) {
			setIsEditMode(false);
			setEditingRecommendationId(null);
			setAssociatedTrip(tripId);
			const initialLat = locationData?.lat || null;
			const initialLon = locationData?.lon || null;
			setFormData({
				name: "",
				description: "",
				rating: 0,
				primaryCategory: "",
				attributeTags: [],
				lat: initialLat,
				lon: initialLon,
				associatedTrip: tripId || null,
			});
			if (initialLat && initialLon) {
				setMapRegion({
					// Set the whole region object for consistent zoom
					latitude: initialLat,
					longitude: initialLon,
					latitudeDelta: 0.02, // Adjust for a reasonable default zoom
					longitudeDelta: 0.02,
				});
			} else {
				// Reset to a default region or fetch trip's region if needed
				setMapRegion({
					latitude: 37.78825, // Default latitude
					longitude: -122.4324, // Default longitude
					latitudeDelta: 0.0922,
					longitudeDelta: 0.0421,
				});
			}
			setVisible(true);
		},
		openEdit(recommendation) {
			setIsEditMode(true);
			setEditingRecommendationId(recommendation._id);
			setAssociatedTrip(recommendation.associatedTrip);
			const initialLat = recommendation.location?.coordinates?.[1] || null;
			const initialLon = recommendation.location?.coordinates?.[0] || null;
			setFormData({
				name: recommendation.name || "",
				description: recommendation.description || "",
				rating: recommendation.rating || 0,
				primaryCategory: recommendation.primaryCategory || "",
				attributeTags: recommendation.attributeTags || [],
				lat: initialLat,
				lon: initialLon,
			});
			if (initialLat && initialLon) {
				setMapRegion({
					// Also set consistent zoom for edit mode
					latitude: initialLat,
					longitude: initialLon,
					latitudeDelta: 0.02,
					longitudeDelta: 0.02,
				});
			}
			setVisible(true);
		},
	}));

	const handleMapPress = (e) => {
		const { latitude, longitude } = e.nativeEvent.coordinate;
		updateField("lat", latitude);
		updateField("lon", longitude);
	};
	const handleSubmit = () => {
		// Validation
		if (!formData.name.trim()) {
			Alert.alert("Error", "Please enter a name for the recommendation");
			return;
		}
		if (!formData.description.trim()) {
			Alert.alert("Error", "Please enter a description");
			return;
		}
		if (formData.rating === 0) {
			Alert.alert("Error", "Please provide a rating");
			return;
		}
		if (!formData.primaryCategory) {
			Alert.alert("Error", "Please select a category");
			return;
		}
		if (formData.attributeTags.length === 0) {
			Alert.alert("Error", "Please select at least one feature");
			return;
		}
		if (formData.lat === null || formData.lon === null) {
			Alert.alert("Error", "Please select a location on the map"); // Updated error message
			return;
		}

		// Transform data to match backend expectations
		const recommendationData = {
			latitude: formData.lat,
			longitude: formData.lon,
			primaryCategory: formData.primaryCategory,
			attributeTags: formData.attributeTags,
			rating: formData.rating,
			name: formData.name,
			description: formData.description,
			associatedTrip: associatedTrip,
		};

		// Add the ID if we're in edit mode
		if (isEditMode && editingRecommendationId) {
			recommendationData._id = editingRecommendationId;
		}

		// console.log(
		// 	isEditMode ? "ADD REC MODAL Updating recommendation:" : "Submitting recommendation:",
		// 	recommendationData
		// );

		onSubmit(recommendationData, isEditMode);
		setVisible(false);
	};

	const updateField = (field, value) => {
		setFormData((prev) => ({ ...prev, [field]: value }));
	};

	return (
		<BottomModal visible={visible} onClose={() => setVisible(false)}>
			<ModalHeader
				title={isEditMode ? "Edit Recommendation" : "Add Recommendation"}
				onClose={() => setVisible(false)}
			/>

			{/* Keyboard handling */}
			<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={{ paddingBottom: theme.space.lg }}
					keyboardShouldPersistTaps="handled"
				>
					{/* Name ------------------------------------------------ */}
					<View style={styles.field}>
						<Text style={styles.label}>Name / Title</Text>
						<TextInput
							value={formData.name}
							onChangeText={(v) => updateField("name", v)}
							placeholder="Enter recommendation name…"
							placeholderTextColor={theme.colors.textMuted}
							style={styles.input}
							maxLength={120}
						/>
					</View>

					{/* Description ---------------------------------------- */}
					<View style={styles.field}>
						<Text style={styles.label}>Description</Text>
						<TextInput
							value={formData.description}
							onChangeText={(v) => updateField("description", v)}
							placeholder="Describe this place…"
							placeholderTextColor={theme.colors.textMuted}
							style={[styles.input, { minHeight: 70 }]}
							multiline
							textAlignVertical="top"
							maxLength={2000}
						/>
					</View>

					{/* Map ----------------------------------------------- */}
					<View style={styles.field}>
						<Text style={styles.label}>Location</Text>
						<View style={styles.mapContainer}>
							<MapView
								style={StyleSheet.absoluteFill}
								region={mapRegion}
								onRegionChangeComplete={setMapRegion}
								onPress={handleMapPress}
								showsUserLocation
							>
								{formData.lat && formData.lon && (
									<Marker
										coordinate={{
											latitude: formData.lat,
											longitude: formData.lon,
										}}
										pinColor={theme.colors.primary}
									/>
								)}
							</MapView>
						</View>
						{formData.lat && formData.lon && (
							<Text style={styles.coords}>
								Lat: {formData.lat.toFixed(4)} Lon: {formData.lon.toFixed(4)}
							</Text>
						)}
					</View>

					{/* Rating -------------------------------------------- */}
					<View style={styles.field}>
						<Text style={styles.label}>Rating</Text>
						<StarRating rating={formData.rating} onRatingChange={(r) => updateField("rating", r)} />
					</View>

					{/* Category / Tags ----------------------------------- */}
					<View style={styles.field}>
						<CategorySelector
							selectedCategory={formData.primaryCategory}
							onCategoryChange={(c) => updateField("primaryCategory", c)}
						/>
					</View>
					<View style={styles.field}>
						<TagsSelector selectedTags={formData.attributeTags} onTagsChange={(t) => updateField("attributeTags", t)} />
					</View>

					{/* Submit -------------------------------------------- */}
					<Pressable onPress={handleSubmit} style={[styles.button, { backgroundColor: theme.colors.primary }]}>
						<Text style={styles.buttonText}>{isEditMode ? "Update Recommendation" : "Save Recommendation"}</Text>
					</Pressable>
				</ScrollView>
			</KeyboardAvoidingView>
		</BottomModal>
	);
});

/* ------------------------------------------------------------------ *
 * styles                                                             *
 * ------------------------------------------------------------------ */
const styles = StyleSheet.create({
	field: { marginBottom: theme.space.md },
	label: {
		fontSize: theme.fontSize.sm,
		fontWeight: "600",
		marginBottom: theme.space.sm,
		color: theme.colors.text,
	},
	input: {
		borderWidth: 1,
		borderColor: theme.colors.inputBorder,
		backgroundColor: theme.colors.inputBackground,
		borderRadius: theme.radius.md,
		padding: theme.space.sm,
		fontSize: theme.fontSize.sm,
		color: theme.colors.text,
	},
	mapContainer: {
		height: 250,
		borderRadius: theme.radius.md,
		overflow: "hidden",
		borderWidth: 1,
		borderColor: theme.colors.inputBorder,
	},
	coords: {
		fontSize: theme.fontSize.xs,
		color: theme.colors.textMuted,
		marginTop: theme.space.xs,
		textAlign: "center",
	},
	button: {
		borderRadius: theme.radius.md,
		paddingVertical: theme.space.md,
		marginTop: theme.space.sm,
	},
	buttonText: {
		color: "#fff",
		textAlign: "center",
		fontWeight: "600",
		fontSize: theme.fontSize.md,
	},
	categoryModal: {
		backgroundColor: theme.colors.background,
		padding: theme.space.lg,
		borderTopLeftRadius: theme.space.lg,
		borderTopRightRadius: theme.space.lg,
		maxHeight: "80%",
	},
	categoryModalTitle: {
		fontSize: theme.fontSize.lg,
		fontWeight: "600",
		marginBottom: theme.space.lg,
		color: theme.colors.text,
		textAlign: "center",
	},
	categoryItem: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: theme.space.md,
		paddingHorizontal: theme.space.sm,
		borderRadius: theme.radius.sm,
		marginBottom: theme.space.xs,
	},
	categoryItemText: {
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
	},
});

export default AddRecommendationModal;
