import BottomModal from "@/src/components/modals/BottomModal";
import ModalHeader from "@/src/components/modals/ModalHeader";
import TripPhotoThumb from "@/src/components/ui/TripPhotoThumb";
import { RECOMMENDATION_CATEGORIES, RECOMMENDATION_TAGS } from "@/src/constants/recommendationConstants";
import usePhotoManager from "@/src/hooks/usePhotoManager";
import { theme } from "@/src/theme";
import { useAuthStore } from "@/src/stores/auth";
import { Ionicons } from "@expo/vector-icons";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
	Alert,
	ActivityIndicator,
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
	const { token, user } = useAuthStore();
	const activeContext = useRef(null);
	if (!activeContext.current || activeContext.current.token !== token || activeContext.current.userId !== user?._id) {
		activeContext.current = { token, userId: user?._id };
	}
	const renderContext = activeContext.current;
	const mounted = useRef(true);
	const draftContext = useRef(null);
	useEffect(() => {
		mounted.current = true;
		return () => { mounted.current = false; };
	}, []);
	const isCurrent = (context) => {
		const session = useAuthStore.getState();
		return mounted.current && activeContext.current === context && context?.token && context?.userId
			&& session.token === context.token && session.user?._id === context.userId;
	};
	const [visible, setVisible] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState("");
	const submitting = useRef(null);
	// Keep the server identity after create, even if a later photo upload fails.
	// Do not change the photo manager's initial-id prop: that would reset its draft.
	const createdRecommendation = useRef(null);
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
		getPhotos,
	} = usePhotoManager({
		context: "recommendation",
		id: editingRecommendationId,
		max: 5,
		initial: initialPhotosForManager,
	});

	useImperativeHandle(ref, () => ({
		open(locationData = null, tripId = null) {
			if (submitting.current && isCurrent(submitting.current.context)) return;
			submitting.current = null;
			setSaving(false);
			draftContext.current = renderContext;
			createdRecommendation.current = null;
			setSaveError("");
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
			if (submitting.current && isCurrent(submitting.current.context)) return;
			submitting.current = null;
			setSaving(false);
			draftContext.current = renderContext;
			createdRecommendation.current = null;
			setSaveError("");
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

	const refreshSource = (recommendation) => {
		// A failed refresh must not turn a committed save into another create.
		try { Promise.resolve(recommendation?.refreshCallback?.()).catch(() => {}); } catch {}
	};

	const handleClose = () => {
		if (!submitting.current && !uploading) setVisible(false);
	};

	const updateField = (field, value) => {
		if (submitting.current || !isCurrent(renderContext)) return;
		setFormData((prev) => ({ ...prev, [field]: value }));
	};

	const handleMapPress = (e) => {
		const { latitude, longitude } = e.nativeEvent.coordinate;
		updateField("lat", latitude);
		updateField("lon", longitude);
	};

	const handleSubmit = async () => {
		const context = renderContext;
		if (submitting.current || uploading || draftContext.current !== context || !isCurrent(context)) return;
		// Basic validation
		if (!formData.name.trim()) return Alert.alert("Error", "Please enter a name for the recommendation");
		if (!formData.description.trim()) return Alert.alert("Error", "Please enter a description");
		if (formData.rating === 0) return Alert.alert("Error", "Please provide a rating");
		if (!formData.primaryCategory) return Alert.alert("Error", "Please select a category");
		if (formData.attributeTags.length === 0) return Alert.alert("Error", "Please select at least one feature");
		if (formData.lat === null || formData.lon === null)
			return Alert.alert("Error", "Please select a location on the map");


		// Get server photo IDs only (ignore local files for now)
		const currentPhotos = getPhotos();
		const serverPhotoIds = currentPhotos.filter((p) => !p.startsWith("file://"));
		const localFiles = currentPhotos.filter((p) => p.startsWith("file://"));

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

		const operation = { context };
		submitting.current = operation;
		setSaving(true);
		setSaveError("");
		try {
			const existingId = isEditMode ? editingRecommendationId : createdRecommendation.current?._id;
			let savedRecommendation;
			if (existingId) {
				savedRecommendation = await onSubmit({ ...buildPayload(serverPhotoIds), _id: existingId }, true);
				if (!isCurrent(context)) return;
				if (!savedRecommendation) throw new Error("The recommendation update was not confirmed. Please try again.");
				if (createdRecommendation.current) {
					createdRecommendation.current = { ...createdRecommendation.current, ...savedRecommendation, _id: existingId };
				}
			} else {
				savedRecommendation = await onSubmit(buildPayload([]), false, false);
				if (!isCurrent(context)) return;
				if (!savedRecommendation?._id) throw new Error("Failed to create recommendation");
				createdRecommendation.current = savedRecommendation;
			}

			if (localFiles.length > 0) {
				await uploadPendingPhotos(existingId || savedRecommendation._id);
			}
			if (!isCurrent(context)) return;
			refreshSource(savedRecommendation);
			Alert.alert("Success", isEditMode ? "Recommendation updated!" : "Recommendation saved!");
			setVisible(false);
			return savedRecommendation;
		} catch (err) {
			if (!isCurrent(context)) return;
			console.error("Error saving recommendation:", err);
			if (createdRecommendation.current) refreshSource(createdRecommendation.current);
			const prefix = createdRecommendation.current ? "The recommendation already exists. " : "";
			setSaveError(prefix + (err?.message || "Could not save recommendation. Please try again."));
		} finally {
			if (submitting.current === operation) {
				submitting.current = null;
				if (isCurrent(context)) setSaving(false);
			}
		}
	};

	return (
		<BottomModal visible={visible && draftContext.current === renderContext} onClose={handleClose}>
			<ModalHeader
				title={isEditMode ? "Edit Recommendation" : "Add Recommendation"}
				onClose={handleClose}
			/>
			<View style={{ flex: 1 }} pointerEvents={saving ? "none" : "auto"}>
				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={{ paddingBottom: theme.space.lg }}
					keyboardShouldPersistTaps="handled"
				>
					<View style={styles.field}>
						<Text style={styles.label}>Name / Title</Text>
						<TextInput
							editable={!saving}
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
							editable={!saving}
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

					{saveError ? <Text accessibilityRole="alert" style={{ color: theme.colors.error }}>{saveError}</Text> : null}
					<Pressable testID="recommendation-save" onPress={handleSubmit} disabled={saving || uploading} style={[styles.button, { backgroundColor: theme.colors.primary, opacity: saving ? 0.5 : 1 }]}>
						{saving && <ActivityIndicator color="#fff" />}
						<Text style={styles.buttonText}>{isEditMode ? "Update Recommendation" : "Save Recommendation"}</Text>
					</Pressable>
				</ScrollView>
			</View>
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
