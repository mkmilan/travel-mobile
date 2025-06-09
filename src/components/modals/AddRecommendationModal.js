import BottomModal from "@/src/components/modals/BottomModal";
import ModalHeader from "@/src/components/modals/ModalHeader";
import TripPhotoThumb from "@/src/components/ui/TripPhotoThumb";
import { RECOMMENDATION_CATEGORIES, RECOMMENDATION_TAGS } from "@/src/constants/recommendationConstants";
import usePhotoManager from "@/src/hooks/usePhotoManager";
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
	const [open, setOpen] = useState(false);
	const selectedCategoryLabel =
		RECOMMENDATION_CATEGORIES.find((cat) => cat.value === selectedCategory)?.label || "Select Category";

	return (
		<View>
			<Text style={styles.label}>Category</Text>
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
						color: selectedCategory ? theme.colors.text : theme.colors.textMuted,
						fontSize: theme.fontSize.sm,
					}}
				>
					{selectedCategoryLabel}
				</Text>
				<Ionicons name="chevron-down" size={20} color={theme.colors.textMuted} />
			</Pressable>
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

// PhotoSection: Renders photos and add button
const PhotoSection = ({ photos, uploading, addPhotos, removePhoto, maxPhotos = 5 }) => (
	<View style={styles.field}>
		<Text style={styles.label}>
			Photos ({photos.length}/{maxPhotos})
		</Text>
		<View style={styles.photoWrap}>
			{photos.map((photoId) => (
				<TripPhotoThumb
					key={photoId}
					photoId={photoId}
					onPress={() =>
						Alert.alert("Remove photo?", "", [
							{ text: "Cancel", style: "cancel" },
							{ text: "Delete", style: "destructive", onPress: () => removePhoto(photoId) },
						])
					}
				/>
			))}
			{photos.length < maxPhotos && (
				<Pressable onPress={addPhotos} style={[styles.addBox, uploading && { opacity: 0.4 }]} disabled={uploading}>
					<Ionicons name="add" size={28} color={theme.colors.textMuted} />
				</Pressable>
			)}
		</View>
	</View>
);

const AddRecommendationModal = forwardRef(({ onSubmit, disablePhotos = false }, ref) => {
	const [visible, setVisible] = useState(false);
	const [isEditMode, setIsEditMode] = useState(false);
	const [associatedTrip, setAssociatedTrip] = useState(null);
	const [editingRecommendationId, setEditingRecommendationId] = useState(null);
	const [initialPhotosForManager, setInitialPhotosForManager] = useState([]);

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
		latitude: 37.78825,
		longitude: -122.4324,
		latitudeDelta: 0.0922,
		longitudeDelta: 0.0421,
	});

	const {
		photos,
		uploading,
		addPhotos,
		removePhoto,
		setPhotos: setManagerPhotos,
		uploadPendingPhotos,
	} = usePhotoManager({
		context: "recommendation",
		id: editingRecommendationId,
		max: 5,
		initial: initialPhotosForManager,
	});

	useImperativeHandle(ref, () => ({
		open(locationData = null, tripId = null) {
			setIsEditMode(false);
			setEditingRecommendationId(null);
			setAssociatedTrip(tripId);

			// Reset photo state
			setInitialPhotosForManager([]);
			setManagerPhotos([]);

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
					latitude: initialLat,
					longitude: initialLon,
					latitudeDelta: 0.02,
					longitudeDelta: 0.02,
				});
			} else {
				setMapRegion({
					latitude: 37.78825,
					longitude: -122.4324,
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

			// Set existing photos for editing
			const existingPhotos = recommendation.photos || [];
			setInitialPhotosForManager(existingPhotos);
			setManagerPhotos(existingPhotos);

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
					latitude: initialLat,
					longitude: initialLon,
					latitudeDelta: 0.02,
					longitudeDelta: 0.02,
				});
			}
			setVisible(true);
		},
	}));

	const updateField = (field, value) => {
		setFormData((prev) => ({ ...prev, [field]: value }));
	};

	const handleMapPress = (e) => {
		const { latitude, longitude } = e.nativeEvent.coordinate;
		updateField("lat", latitude);
		updateField("lon", longitude);
	};

	const handleSubmit = async () => {
		// Basic validation
		if (!formData.name.trim()) return Alert.alert("Error", "Please enter a name for the recommendation");
		if (!formData.description.trim()) return Alert.alert("Error", "Please enter a description");
		if (formData.rating === 0) return Alert.alert("Error", "Please provide a rating");
		if (!formData.primaryCategory) return Alert.alert("Error", "Please select a category");
		if (formData.attributeTags.length === 0) return Alert.alert("Error", "Please select at least one feature");
		if (formData.lat === null || formData.lon === null)
			return Alert.alert("Error", "Please select a location on the map");

		if (uploading) return Alert.alert("Please wait", "Photos are still uploading…");

		// Get server photo IDs only (ignore local files for now)
		const serverPhotoIds = photos.filter((p) => !p.startsWith("file://"));
		const localFiles = photos.filter((p) => p.startsWith("file://"));

		const buildPayload = (photoIds) => ({
			latitude: formData.lat,
			longitude: formData.lon,
			primaryCategory: formData.primaryCategory,
			attributeTags: formData.attributeTags,
			rating: formData.rating,
			name: formData.name,
			description: formData.description,
			associatedTrip,
			photoIds,
		});

		try {
			if (isEditMode) {
				// For editing: include existing server photos
				const updatedRec = await onSubmit({ ...buildPayload(serverPhotoIds), _id: editingRecommendationId }, true);
				// Upload any new local files
				if (localFiles.length > 0) {
					await uploadPendingPhotos(editingRecommendationId);
				}

				//  Trigger refresh after editing (same pattern as new recommendations)
				if (typeof updatedRec?.refreshCallback === "function") {
					updatedRec.refreshCallback();
				}

				Alert.alert("Success", "Recommendation updated!");
				setVisible(false);
				return updatedRec;
			} else {
				// For new: create recommendation first
				const newRec = await onSubmit(buildPayload([]), false, false); // No immediate refresh

				if (newRec?._id) {
					// Upload photos if any
					if (localFiles.length > 0) {
						Alert.alert("Success", "Recommendation saved! Uploading photos...");
						await uploadPendingPhotos(newRec._id);
					} else {
						Alert.alert("Success", "Recommendation saved!");
					}

					// Trigger refresh and close
					if (typeof newRec.refreshCallback === "function") {
						newRec.refreshCallback();
					}
					setVisible(false);
					return newRec;
				} else {
					throw new Error("Failed to create recommendation");
				}
			}
		} catch (err) {
			console.error("Error saving recommendation:", err);
			Alert.alert("Error", err.message || "Could not save recommendation.");
		}
	};

	return (
		<BottomModal visible={visible} onClose={() => setVisible(false)}>
			<ModalHeader
				title={isEditMode ? "Edit Recommendation" : "Add Recommendation"}
				onClose={() => setVisible(false)}
			/>
			<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={{ paddingBottom: theme.space.lg }}
					keyboardShouldPersistTaps="handled"
				>
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

					<View style={styles.field}>
						<Text style={styles.label}>Rating</Text>
						<StarRating rating={formData.rating} onRatingChange={(r) => updateField("rating", r)} />
					</View>

					<View style={styles.field}>
						<CategorySelector
							selectedCategory={formData.primaryCategory}
							onCategoryChange={(c) => updateField("primaryCategory", c)}
						/>
					</View>
					<View style={styles.field}>
						<TagsSelector selectedTags={formData.attributeTags} onTagsChange={(t) => updateField("attributeTags", t)} />
					</View>
					{!disablePhotos && (
						<PhotoSection
							key={editingRecommendationId || "new-photo-section"}
							photos={photos}
							uploading={uploading}
							addPhotos={addPhotos}
							removePhoto={removePhoto}
							maxPhotos={5}
						/>
					)}

					{disablePhotos && (
						<Text style={{ color: "orange", marginTop: 8 }}>You can add images after uploading the trip.</Text>
					)}

					<Pressable onPress={handleSubmit} style={[styles.button, { backgroundColor: theme.colors.primary }]}>
						<Text style={styles.buttonText}>{isEditMode ? "Update Recommendation" : "Save Recommendation"}</Text>
					</Pressable>
				</ScrollView>
			</KeyboardAvoidingView>
		</BottomModal>
	);
});

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
		marginTop: theme.space.lg,
		marginBottom: theme.space.xl,
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
		borderTopLeftRadius: theme.radius.lg,
		borderTopRightRadius: theme.radius.lg,
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
	photoWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: theme.space.sm,
	},
	addBox: {
		width: 64,
		height: 64,
		borderRadius: theme.radius.sm,
		borderWidth: 1,
		borderColor: theme.colors.inputBorder,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: theme.colors.inputBackground,
	},
});

export default AddRecommendationModal;
