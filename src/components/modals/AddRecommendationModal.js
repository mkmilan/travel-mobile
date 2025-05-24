import {
	RECOMMENDATION_CATEGORIES,
	RECOMMENDATION_TAGS,
} from "@/src/constants/recommendationConstants";
import { theme } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { forwardRef, useImperativeHandle, useState } from "react";
import {
	Alert,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	Text,
	TextInput,
	View,
} from "react-native";
import Modal from "react-native-modal";

// Star Rating Component
const StarRating = ({ rating, onRatingChange }) => {
	return (
		<View style={{ flexDirection: "row", marginVertical: theme.space.sm }}>
			{[1, 2, 3, 4, 5].map((star) => (
				<Pressable
					key={star}
					onPress={() => onRatingChange(star)}
					style={{ marginRight: theme.space.xs }}
				>
					<Ionicons
						name={rating >= star ? "star" : "star-outline"}
						size={24}
						color={rating >= star ? "#FCD34D" : theme.colors.textMuted}
					/>
				</Pressable>
			))}
		</View>
	);
};

// Category Selector Component
const CategorySelector = ({ selectedCategory, onCategoryChange }) => {
	const [showCategories, setShowCategories] = useState(false);

	const selectedCategoryLabel =
		RECOMMENDATION_CATEGORIES.find((cat) => cat.value === selectedCategory)
			?.label || "Select Category";

	return (
		<View>
			<Text style={styles.label}>Category</Text>
			<Pressable
				onPress={() => setShowCategories(true)}
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
						color: selectedCategory
							? theme.colors.text
							: theme.colors.textMuted,
					}}
				>
					{selectedCategoryLabel}
				</Text>
				<Ionicons
					name="chevron-down"
					size={20}
					color={theme.colors.textMuted}
				/>
			</Pressable>

			<Modal
				isVisible={showCategories}
				onBackdropPress={() => setShowCategories(false)}
				style={{ margin: 0, justifyContent: "flex-end" }}
			>
				<View style={styles.categoryModal}>
					<Text style={styles.categoryModalTitle}>Select Category</Text>
					<ScrollView style={{ maxHeight: 300 }}>
						{RECOMMENDATION_CATEGORIES.map((category) => (
							<Pressable
								key={category.value}
								onPress={() => {
									onCategoryChange(category.value);
									setShowCategories(false);
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
									<Ionicons
										name="checkmark"
										size={20}
										color={theme.colors.primary}
									/>
								)}
							</Pressable>
						))}
					</ScrollView>
				</View>
			</Modal>
		</View>
	);
};

// Tags Selector Component
const TagsSelector = ({ selectedTags, onTagsChange }) => {
	const [showTags, setShowTags] = useState(false);

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
				onPress={() => setShowTags(true)}
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
						color: selectedTags.length
							? theme.colors.text
							: theme.colors.textMuted,
					}}
				>
					{selectedTags.length > 0
						? `${selectedTags.length} selected`
						: "Select features"}
				</Text>
				<Ionicons
					name="chevron-down"
					size={20}
					color={theme.colors.textMuted}
				/>
			</Pressable>

			<Modal
				isVisible={showTags}
				onBackdropPress={() => setShowTags(false)}
				style={{ margin: 0, justifyContent: "flex-end" }}
			>
				<View style={styles.categoryModal}>
					<Text style={styles.categoryModalTitle}>Select Features</Text>
					<ScrollView style={{ maxHeight: 400 }}>
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
								{selectedTags.includes(tag.value) && (
									<Ionicons
										name="checkmark"
										size={20}
										color={theme.colors.primary}
									/>
								)}
							</Pressable>
						))}
					</ScrollView>
					<Pressable
						onPress={() => setShowTags(false)}
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
				</View>
			</Modal>
		</View>
	);
};

const AddRecommendationModal = forwardRef(({ onSubmit }, ref) => {
	const [visible, setVisible] = useState(false);
	const [formData, setFormData] = useState({
		name: "",
		description: "",
		rating: 0,
		primaryCategory: "",
		attributeTags: [],
		lat: null,
		lon: null,
	});

	useImperativeHandle(ref, () => ({
		open(locationData = null) {
			setFormData({
				name: "",
				description: "",
				rating: 0,
				primaryCategory: "",
				attributeTags: [],
				lat: locationData?.lat || null,
				lon: locationData?.lon || null,
			});
			setVisible(true);
		},
	}));

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
		// if (!formData.lat || !formData.lon) {
		// 	Alert.alert("Error", "Location is required for recommendations");
		// 	return;
		// }
		// Transform data to match backend expectations
		const recommendationData = {
			latitude: formData.lat,
			longitude: formData.lon,
			primaryCategory: formData.primaryCategory,
			attributeTags: formData.attributeTags,
			rating: formData.rating,
			name: formData.name,
			description: formData.description,
		};
		console.log(
			"Submitting recommendation: AddRecommendationModal recommendationData",
			recommendationData
		);

		onSubmit(recommendationData);
		setVisible(false);
	};

	const updateField = (field, value) => {
		setFormData((prev) => ({ ...prev, [field]: value }));
	};

	return (
		<Modal
			isVisible={visible}
			onBackdropPress={() => setVisible(false)}
			onSwipeComplete={() => setVisible(false)}
			swipeDirection={["down"]}
			animationIn="slideInUp"
			animationOut="slideOutDown"
			style={{ margin: 0, justifyContent: "flex-end" }}
			propagateSwipe
			avoidKeyboard={true}
		>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				style={{ flex: 1, justifyContent: "flex-end" }}
			>
				<View style={styles.container}>
					<ScrollView
						showsVerticalScrollIndicator={false}
						keyboardShouldPersistTaps="handled"
					>
						<Text style={styles.title}>Add Recommendation</Text>

						{/* Name */}
						<View style={styles.fieldContainer}>
							<Text style={styles.label}>Name / Title</Text>
							<TextInput
								value={formData.name}
								onChangeText={(value) => updateField("name", value)}
								placeholder="Enter recommendation name..."
								placeholderTextColor={theme.colors.textMuted}
								style={styles.input}
								maxLength={120}
							/>
						</View>

						{/* Description */}
						<View style={styles.fieldContainer}>
							<Text style={styles.label}>Description</Text>
							<TextInput
								value={formData.description}
								onChangeText={(value) => updateField("description", value)}
								placeholder="Describe this place..."
								placeholderTextColor={theme.colors.textMuted}
								style={[styles.input, { minHeight: 80 }]}
								multiline
								textAlignVertical="top"
								maxLength={2000}
							/>
						</View>

						{/* Rating */}
						<View style={styles.fieldContainer}>
							<Text style={styles.label}>Rating</Text>
							<StarRating
								rating={formData.rating}
								onRatingChange={(rating) => updateField("rating", rating)}
							/>
						</View>

						{/* Category */}
						<View style={styles.fieldContainer}>
							<CategorySelector
								selectedCategory={formData.primaryCategory}
								onCategoryChange={(category) =>
									updateField("primaryCategory", category)
								}
							/>
						</View>

						{/* Tags */}
						<View style={styles.fieldContainer}>
							<TagsSelector
								selectedTags={formData.attributeTags}
								onTagsChange={(tags) => updateField("attributeTags", tags)}
							/>
						</View>

						{/* Submit Button */}
						<Pressable
							onPress={handleSubmit}
							style={[styles.button, { backgroundColor: theme.colors.primary }]}
						>
							<Text style={styles.buttonText}>Save Recommendation</Text>
						</Pressable>
					</ScrollView>
				</View>
			</KeyboardAvoidingView>
		</Modal>
	);
});

const styles = {
	container: {
		backgroundColor: theme.colors.background,
		paddingTop: theme.space.sm,
		paddingHorizontal: theme.space.lg,
		paddingBottom: theme.space.lg,
		borderTopLeftRadius: theme.space.lg,
		borderTopRightRadius: theme.space.lg,
		maxHeight: "90%",
	},
	title: {
		fontSize: theme.fontSize.lg,
		fontWeight: "600",
		marginBottom: theme.space.lg,
		color: theme.colors.text,
		textAlign: "center",
	},
	fieldContainer: {
		marginBottom: theme.space.lg,
	},
	label: {
		fontSize: theme.fontSize.md,
		fontWeight: "600",
		marginBottom: theme.space.sm,
		color: theme.colors.text,
	},
	input: {
		borderWidth: 1,
		borderColor: theme.colors.inputBorder,
		backgroundColor: theme.colors.inputBackground,
		borderRadius: theme.radius.md,
		padding: theme.space.md,
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
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
};

export default AddRecommendationModal;
