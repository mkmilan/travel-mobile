import TripPhotoThumb from "@/src/components/ui/TripPhotoThumb";
import { travelModeOptions, tripVisibilityOptions } from "@/src/constants/settingsOptions";
import usePhotoManager from "@/src/hooks/usePhotoManager";
import { getTripJsonById, updateTripJson } from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import TransportIcon from "../../../../src/components/TransportIcon";

// Chip component similar to your modals but smaller
const Chip = ({ label, selected, onPress, children, compact = false }) => (
	<Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected, compact && styles.chipCompact]}>
		{children}
		<Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
	</Pressable>
);

// Helper to get visibility icon
const getVisibilityIcon = (value) => {
	switch (value) {
		case "public":
			return "eye";
		case "followers_only":
			return "users";
		case "private":
			return "lock";
		default:
			return "help-circle";
	}
};

export default function EditTripScreen() {
	const router = useRouter();
	const { id: tripId } = useLocalSearchParams();
	const { user: currentUser } = useAuthStore();

	const [trip, setTrip] = useState(null);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [visibility, setVisibility] = useState("public");
	const [transportMode, setTransportMode] = useState("car");

	/* ► PHOTO MANAGER  ◄ */
	const stableInitialPhotos = useMemo(() => [], []);
	const {
		photos, // array of ids   (read-only)
		setPhotos, // setter we’ll call once after fetch
		uploading,
		addPhotos,
		removePhoto,
		uploadPendingPhotos,
	} = usePhotoManager({
		context: "trip",
		id: tripId,
		max: 5,
		initial: stableInitialPhotos, // start empty – we’ll hydrate later
	});

	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(null);
	// console.log("EditTripScreen mounted with trip:", trip);

	useEffect(() => {
		if (tripId) {
			fetchTripDetails();
		} else {
			setError("Trip ID is missing.");
			setLoading(false);
		}
	}, [tripId]);

	const fetchTripDetails = async () => {
		setLoading(true);
		setError(null);
		try {
			const data = await getTripJsonById(tripId);
			if (data.user?._id !== currentUser?._id) {
				setError("You are not authorized to edit this trip.");
				Alert.alert("Unauthorized", "You cannot edit this trip.");
				router.back();
				return;
			}
			setTrip(data);
			setTitle(data.title || "");
			setDescription(data.description || "");
			setVisibility(data.defaultTripVisibility || "public");
			setTransportMode(data.defaultTravelMode || "car");
			if (Array.isArray(data.photos)) setPhotos(data.photos);
			// setPhotos(data.photos || []);
		} catch (err) {
			console.error("Failed to fetch trip details for editing:", err);
			setError(err.message || "Could not load trip details.");
			Alert.alert("Error", "Could not load trip details for editing.");
		} finally {
			setLoading(false);
		}
	};

	const handleSaveChanges = async () => {
		if (!trip) return;
		setSaving(true);
		setError(null);

		try {
			// STEP 1: Upload any pending photos first
			await uploadPendingPhotos(tripId);

			// STEP 2: Get the final photo list (now all should be server IDs)
			// const finalPhotoIds = photos.filter((id) => !id.startsWith("file://"));

			const payload = {
				title: title.trim(),
				description: description.trim(),
				defaultTripVisibility: visibility,
				defaultTravelMode: transportMode,
				// photos: finalPhotoIds, // ← Add this line i think we dont need this for now server dont expect it
			};

			await updateTripJson(tripId, payload);
			Alert.alert("Success", "Trip updated successfully!");
			router.replace(`/(tabs)/trip/${tripId}`); // Redirect to trip detail page after saving
			// router.back();
		} catch (err) {
			console.error("Failed to save trip changes:", err);
			const errorMessage = err.message || "Could not save changes. Please try again.";
			setError(errorMessage);
			Alert.alert("Error", errorMessage);
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return (
			<View style={styles.centered}>
				<ActivityIndicator size="small" color={theme.colors.primary} />
			</View>
		);
	}

	if (error && !trip) {
		return (
			<View style={styles.centered}>
				<Text style={styles.errorText}>{error}</Text>
				<Pressable style={styles.buttonSecondary} onPress={() => router.back()}>
					<Text style={styles.buttonSecondaryText}>Go Back</Text>
				</Pressable>
			</View>
		);
	}

	if (!trip) {
		return (
			<View style={styles.centered}>
				<Text style={styles.errorText}>Trip data not available.</Text>
				<Pressable style={styles.buttonSecondary} onPress={() => router.back()}>
					<Text style={styles.buttonSecondaryText}>Go Back</Text>
				</Pressable>
			</View>
		);
	}

	return (
		<ScrollView
			style={styles.container}
			contentContainerStyle={styles.contentContainer}
			keyboardShouldPersistTaps="handled"
		>
			<Text style={styles.header}>Edit Trip</Text>

			{error && <Text style={styles.inlineErrorText}>{error}</Text>}

			{/* Title */}
			<Text style={styles.label}>Title</Text>
			<TextInput
				style={styles.input}
				value={title}
				onChangeText={setTitle}
				placeholder="Enter trip title"
				placeholderTextColor={theme.colors.textMuted}
			/>

			{/* Description */}
			<Text style={styles.label}>Description</Text>
			<TextInput
				style={[styles.input, styles.textArea]}
				value={description}
				onChangeText={setDescription}
				placeholder="Enter trip description"
				placeholderTextColor={theme.colors.textMuted}
				multiline
			/>

			{/* Visibility */}
			<Text style={styles.label}>Visibility</Text>
			<View style={styles.chipContainer}>
				{tripVisibilityOptions.map((option) => (
					<Chip
						key={option.value}
						label={option.label}
						selected={option.value === visibility}
						onPress={() => setVisibility(option.value)}
						compact
					>
						<Feather
							name={getVisibilityIcon(option.value)}
							size={14}
							color={option.value === visibility ? theme.colors.primary : theme.colors.textMuted}
							style={styles.chipIcon}
						/>
					</Chip>
				))}
			</View>

			{/* Transport Mode */}
			<Text style={styles.label}>Transport Mode</Text>
			<View style={styles.chipContainer}>
				{travelModeOptions.map((option) => (
					<Chip
						key={option.value}
						label={option.label}
						selected={option.value === transportMode}
						onPress={() => setTransportMode(option.value)}
						compact
					>
						<TransportIcon
							mode={option.value}
							size={14}
							color={option.value === transportMode ? theme.colors.primary : theme.colors.textMuted}
							style={styles.chipIcon}
						/>
					</Chip>
				))}
			</View>
			{/* Photos (max 5) */}
			<Text style={styles.label}>Photos ({photos.length}/5)</Text>
			<View style={{ flexDirection: "row", flexWrap: "wrap" }}>
				{photos.map((id) => (
					<TripPhotoThumb
						key={id}
						photoId={id}
						onPress={() =>
							Alert.alert("Remove photo?", "", [
								{ text: "Cancel", style: "cancel" },
								{ text: "Delete", style: "destructive", onPress: () => removePhoto(id) },
							])
						}
					/>
				))}
				{/* add-button */}
				{photos.length < 5 && (
					<Pressable onPress={addPhotos} style={[styles.addBox, uploading && { opacity: 0.5 }]} disabled={uploading}>
						<Feather name="plus" size={24} color={theme.colors.textMuted} />
					</Pressable>
				)}
			</View>

			{/* Buttons */}
			<Pressable
				style={({ pressed }) => [
					styles.buttonPrimary,
					pressed && styles.buttonPressed,
					(saving || uploading) && styles.buttonDisabled, // ← Add uploading check
				]}
				onPress={handleSaveChanges}
				disabled={saving || uploading}
			>
				<Text style={styles.buttonPrimaryText}> {saving || uploading ? "Saving..." : "Save"} </Text>
			</Pressable>

			<Pressable
				style={({ pressed }) => [
					styles.buttonSecondary,
					pressed && styles.buttonPressed,
					saving && styles.buttonDisabled,
				]}
				// onPress={() => router.back()}
				onPress={() => router.replace(`/(tabs)/trip/${tripId}`)}
				disabled={saving}
			>
				<Text style={styles.buttonSecondaryText}>Cancel</Text>
			</Pressable>
		</ScrollView>
	);
}

// ...existing code...

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: theme.colors.background,
	},
	contentContainer: {
		padding: theme.space.md,
	},
	centered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: theme.space.md,
		backgroundColor: theme.colors.background,
	},
	header: {
		fontSize: theme.fontSize.lg,
		fontWeight: "bold",
		color: theme.colors.text,
		marginBottom: theme.space.md,
		textAlign: "center",
	},
	errorText: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.error,
		textAlign: "center",
		marginBottom: theme.space.sm,
	},
	inlineErrorText: {
		fontSize: theme.fontSize.sm, // Changed from xs to sm
		color: theme.colors.error,
		textAlign: "center",
		marginBottom: theme.space.sm,
		backgroundColor: theme.colors.errorBackground || theme.colors.error + "20",
		padding: theme.space.sm, // Changed from xs to sm
		borderRadius: theme.radius.sm, // Changed from xs to sm
	},
	label: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.text,
		marginBottom: theme.space.sm, // Increased from xs to sm
		fontWeight: "500",
	},
	input: {
		backgroundColor: theme.colors.inputBackground,
		color: theme.colors.text,
		paddingHorizontal: theme.space.sm,
		paddingVertical: theme.space.sm, // Increased from xs to sm
		borderRadius: theme.radius.sm,
		borderWidth: 1,
		borderColor: theme.colors.inputBorder,
		fontSize: theme.fontSize.sm,
		marginBottom: theme.space.md,
		minHeight: 32,
	},
	textArea: {
		minHeight: 60,
		textAlignVertical: "top",
	},
	chipContainer: {
		flexDirection: "row",
		flexWrap: "wrap",
		marginBottom: theme.space.lg,
		// Remove gap property and add individual margins to chips instead
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		borderWidth: 1,
		borderColor: theme.colors.inputBorder,
		borderRadius: theme.radius.sm,
		paddingVertical: theme.space.sm * 0.5, // Smaller padding
		paddingHorizontal: theme.space.sm,
		backgroundColor: "transparent",
		marginRight: theme.space.sm, // Add spacing between chips
		marginBottom: theme.space.sm, // Add spacing between rows
	},
	chipCompact: {
		paddingVertical: theme.space.sm * 0.4, // Even smaller for compact
		paddingHorizontal: theme.space.sm * 0.8,
	},
	chipSelected: {
		backgroundColor: theme.colors.primary + "20",
		borderColor: theme.colors.primary,
	},
	chipIcon: {
		marginRight: theme.space.sm * 0.5,
	},
	chipText: {
		color: theme.colors.text,
		fontSize: theme.fontSize.sm, // Changed from xs to sm since xs doesn't exist
		fontWeight: "500",
	},
	chipTextSelected: {
		color: theme.colors.primary,
		fontWeight: "600",
	},
	buttonPrimary: {
		backgroundColor: theme.colors.primary,
		paddingVertical: theme.space.sm,
		paddingHorizontal: theme.space.lg,
		borderRadius: theme.radius.md,
		alignItems: "center",
		justifyContent: "center",
		marginTop: theme.space.lg,
		marginBottom: theme.space.sm,
	},
	buttonPrimaryText: {
		color: "#fff",
		fontSize: theme.fontSize.sm,
		fontWeight: "600",
	},
	buttonSecondary: {
		backgroundColor: "transparent",
		paddingVertical: theme.space.sm,
		paddingHorizontal: theme.space.lg,
		borderRadius: theme.radius.md,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderColor: theme.colors.primary,
	},
	buttonSecondaryText: {
		color: theme.colors.primary,
		fontSize: theme.fontSize.sm,
		fontWeight: "600",
	},
	buttonPressed: {
		opacity: 0.8,
	},
	buttonDisabled: {
		opacity: 0.5,
	},
	addBox: {
		width: 80,
		height: 80,
		borderRadius: 4,
		borderWidth: 1,
		borderColor: theme.colors.inputBorder,
		alignItems: "center",
		justifyContent: "center",
		marginRight: theme.space.sm,
		marginBottom: theme.space.sm,
	},
});
