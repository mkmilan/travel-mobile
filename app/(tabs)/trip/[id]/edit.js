// // ...existing code...
// import {
// 	travelModeOptions,
// 	tripVisibilityOptions,
// } from "@/src/constants/settingsOptions";
// import { getTripJsonById, updateTripJson } from "@/src/services/api"; // Corrected: updateTripJson
// import { useAuthStore } from "@/src/stores/auth";
// import { theme } from "@/src/theme";
// import { Feather } from "@expo/vector-icons";
// import { Picker } from "@react-native-picker/picker";
// import { useLocalSearchParams, useRouter } from "expo-router";
// import { useEffect, useState } from "react";
// import {
// 	ActivityIndicator,
// 	Alert,
// 	Pressable,
// 	ScrollView,
// 	StyleSheet,
// 	Text,
// 	TextInput,
// 	View,
// } from "react-native";
// import TransportIcon from "../../../../src/components/TransportIcon"; // Corrected path to TransportIcon

// // Helper for visibility icons and labels
// const getVisibilityInfo = (value) => {
// 	const option = tripVisibilityOptions.find((opt) => opt.value === value);
// 	const label = option ? option.label : "Unknown";
// 	let iconName = "help-circle";
// 	switch (value) {
// 		case "public":
// 			iconName = "eye";
// 			break;
// 		case "followers_only":
// 			iconName = "users";
// 			break;
// 		case "private":
// 			iconName = "lock";
// 			break;
// 	}
// 	return { iconName, label };
// };

// // Helper for transport mode labels (icon is handled by TransportIcon component)
// const getTransportModeLabel = (value) => {
// 	const option = travelModeOptions.find((opt) => opt.value === value);
// 	return option ? option.label : "Unknown";
// };

// export default function EditTripScreen() {
// 	const router = useRouter();
// 	const { id: tripId } = useLocalSearchParams();
// 	const { user: currentUser } = useAuthStore();

// 	const [trip, setTrip] = useState(null);
// 	const [title, setTitle] = useState("");
// 	const [description, setDescription] = useState("");
// 	const [visibility, setVisibility] = useState("public");
// 	const [transportMode, setTransportMode] = useState("car");

// 	const [loading, setLoading] = useState(true);
// 	const [saving, setSaving] = useState(false);
// 	const [error, setError] = useState(null);

// 	useEffect(() => {
// 		if (tripId) {
// 			fetchTripDetails();
// 		} else {
// 			setError("Trip ID is missing.");
// 			setLoading(false);
// 		}
// 	}, [tripId]);

// 	const fetchTripDetails = async () => {
// 		setLoading(true);
// 		setError(null);
// 		try {
// 			const data = await getTripJsonById(tripId);
// 			if (data.user?._id !== currentUser?._id) {
// 				setError("You are not authorized to edit this trip.");
// 				Alert.alert("Unauthorized", "You cannot edit this trip.");
// 				router.back();
// 				return;
// 			}
// 			setTrip(data);
// 			setTitle(data.title || "");
// 			setDescription(data.description || "");
// 			setVisibility(data.defaultTripVisibility || "public");
// 			setTransportMode(data.defaultTravelMode || "car");
// 		} catch (err) {
// 			console.error("Failed to fetch trip details for editing:", err);
// 			setError(err.message || "Could not load trip details.");
// 			Alert.alert("Error", "Could not load trip details for editing.");
// 		} finally {
// 			setLoading(false);
// 		}
// 	};

// 	const handleSaveChanges = async () => {
// 		if (!trip) return;
// 		setSaving(true);
// 		setError(null);

// 		const payload = {
// 			title: title.trim(),
// 			description: description.trim(),
// 			defaultTripVisibility: visibility,
// 			defaultTravelMode: transportMode,
// 		};

// 		try {
// 			// Using your existing updateTripJson function
// 			await updateTripJson(tripId, payload);
// 			Alert.alert("Success", "Trip updated successfully!");
// 			router.back();
// 		} catch (err) {
// 			console.error("Failed to save trip changes:", err);
// 			const errorMessage =
// 				err.message || "Could not save changes. Please try again.";
// 			setError(errorMessage);
// 			Alert.alert("Error", errorMessage);
// 		} finally {
// 			setSaving(false);
// 		}
// 	};

// 	if (loading) {
// 		return (
// 			<View style={styles.centered}>
// 				<ActivityIndicator size="small" color={theme.colors.primary} />
// 			</View>
// 		);
// 	}

// 	if (error && !trip) {
// 		return (
// 			<View style={styles.centered}>
// 				<Text style={styles.errorText}>{error}</Text>
// 				<Pressable style={styles.buttonSecondary} onPress={() => router.back()}>
// 					<Text style={styles.buttonSecondaryText}>Go Back</Text>
// 				</Pressable>
// 			</View>
// 		);
// 	}

// 	if (!trip) {
// 		return (
// 			<View style={styles.centered}>
// 				<Text style={styles.errorText}>Trip data not available.</Text>
// 				<Pressable style={styles.buttonSecondary} onPress={() => router.back()}>
// 					<Text style={styles.buttonSecondaryText}>Go Back</Text>
// 				</Pressable>
// 			</View>
// 		);
// 	}

// 	const selectedVisibilityInfo = getVisibilityInfo(visibility);
// 	// const selectedTransportModeLabel = getTransportModeLabel(transportMode);

// 	return (
// 		<ScrollView
// 			style={styles.container}
// 			contentContainerStyle={styles.contentContainer}
// 			keyboardShouldPersistTaps="handled"
// 		>
// 			<Text style={styles.header}>Edit Trip</Text>

// 			{error && <Text style={styles.inlineErrorText}>{error}</Text>}

// 			<Text style={styles.label}>Title</Text>
// 			<TextInput
// 				style={styles.input}
// 				value={title}
// 				onChangeText={setTitle}
// 				placeholder="Enter trip title"
// 				placeholderTextColor={theme.colors.textMuted}
// 			/>

// 			<Text style={styles.label}>Description</Text>
// 			<TextInput
// 				style={[styles.input, styles.textArea]}
// 				value={description}
// 				onChangeText={setDescription}
// 				placeholder="Enter trip description"
// 				placeholderTextColor={theme.colors.textMuted}
// 				multiline
// 			/>

// 			<Text style={styles.label}>Visibility</Text>
// 			<View style={styles.pickerInputDisplay}>
// 				<Feather
// 					name={selectedVisibilityInfo.iconName}
// 					size={16}
// 					color={theme.colors.textMuted}
// 					style={styles.pickerIconStyle} // Renamed for clarity
// 				/>
// 				<Picker
// 					selectedValue={visibility}
// 					onValueChange={(itemValue) => setVisibility(itemValue)}
// 					style={styles.picker}
// 					itemStyle={styles.pickerItem} // For iOS dropdown items
// 				>
// 					{tripVisibilityOptions.map((option) => (
// 						<Picker.Item
// 							key={option.value}
// 							label={option.label} // Using direct label from settingsOptions
// 							value={option.value}
// 						/>
// 					))}
// 				</Picker>
// 			</View>

// 			<Text style={styles.label}>Transport Mode</Text>
// 			<View style={styles.pickerInputDisplay}>
// 				<TransportIcon
// 					mode={transportMode}
// 					size={16}
// 					color={theme.colors.textMuted}
// 					style={styles.pickerIconStyle} // Renamed for clarity
// 				/>
// 				<Picker
// 					selectedValue={transportMode}
// 					onValueChange={(itemValue) => setTransportMode(itemValue)}
// 					style={styles.picker}
// 					itemStyle={styles.pickerItem} // For iOS dropdown items
// 				>
// 					{travelModeOptions.map((option) => (
// 						<Picker.Item
// 							key={option.value}
// 							label={option.label} // Using direct label from settingsOptions
// 							value={option.value}
// 						/>
// 					))}
// 				</Picker>
// 			</View>

// 			<Pressable
// 				style={({ pressed }) => [
// 					styles.buttonPrimary,
// 					pressed && styles.buttonPressed,
// 					saving && styles.buttonDisabled,
// 				]}
// 				onPress={handleSaveChanges}
// 				disabled={saving}
// 			>
// 				<Text style={styles.buttonPrimaryText}>
// 					{saving ? "Saving..." : "Save Changes"}
// 				</Text>
// 			</Pressable>

// 			<Pressable
// 				style={({ pressed }) => [
// 					styles.buttonSecondary,
// 					pressed && styles.buttonPressed,
// 					saving && styles.buttonDisabled,
// 					{ marginTop: theme.space.sm },
// 				]}
// 				onPress={() => router.back()}
// 				disabled={saving}
// 			>
// 				<Text style={styles.buttonSecondaryText}>Cancel</Text>
// 			</Pressable>
// 		</ScrollView>
// 	);
// }

// const styles = StyleSheet.create({
// 	container: {
// 		flex: 1,
// 		backgroundColor: theme.colors.background,
// 	},
// 	contentContainer: {
// 		padding: theme.space.md,
// 	},
// 	centered: {
// 		flex: 1,
// 		justifyContent: "center",
// 		alignItems: "center",
// 		padding: theme.space.md,
// 		backgroundColor: theme.colors.background,
// 	},
// 	header: {
// 		fontSize: theme.fontSize.lg,
// 		fontWeight: "bold",
// 		color: theme.colors.text,
// 		marginBottom: theme.space.md,
// 		textAlign: "center",
// 	},
// 	errorText: {
// 		fontSize: theme.fontSize.sm,
// 		color: theme.colors.error,
// 		textAlign: "center",
// 		marginBottom: theme.space.sm,
// 	},
// 	inlineErrorText: {
// 		fontSize: theme.fontSize.xs,
// 		color: theme.colors.error,
// 		textAlign: "center",
// 		marginBottom: theme.space.sm,
// 		backgroundColor: theme.colors.errorBackground,
// 		padding: theme.space.xs,
// 		borderRadius: theme.radius.xs,
// 	},
// 	label: {
// 		fontSize: theme.fontSize.sm,
// 		color: theme.colors.text,
// 		marginBottom: theme.space.xs,
// 		fontWeight: "500",
// 	},
// 	input: {
// 		backgroundColor: theme.colors.inputBackground,
// 		color: theme.colors.text,
// 		paddingHorizontal: theme.space.sm,
// 		paddingVertical: theme.space.xs,
// 		borderRadius: theme.radius.sm,
// 		borderWidth: 1,
// 		borderColor: theme.colors.inputBorder,
// 		fontSize: theme.fontSize.sm,
// 		marginBottom: theme.space.md,
// 		minHeight: 36,
// 	},
// 	textArea: {
// 		minHeight: 70,
// 		textAlignVertical: "top",
// 	},
// 	pickerInputDisplay: {
// 		flexDirection: "row",
// 		alignItems: "center",
// 		backgroundColor: theme.colors.inputBackground,
// 		borderRadius: theme.radius.sm,
// 		borderWidth: 1,
// 		borderColor: theme.colors.inputBorder,
// 		marginBottom: theme.space.md,
// 		minHeight: 36, // Ensure this is tall enough for the icon + text
// 		// paddingHorizontal: theme.space.sm, // Keep padding for the container
// 	},
// 	pickerIconStyle: {
// 		// Style for the icon itself
// 		marginLeft: theme.space.sm, // Add some space before the icon
// 		marginRight: theme.space.xs,
// 	},
// 	picker: {
// 		flex: 1,
// 		color: theme.colors.text,
// 		height: 36,
// 		// On Android, the picker text might not perfectly align vertically with the icon.
// 		// Adjusting padding/margins on the icon or picker might be needed.
// 		// On iOS, the selected value is usually centered by default.
// 	},
// 	pickerItem: {
// 		color: theme.colors.text,
// 		fontSize: theme.fontSize.sm,
// 		// height: 80, // This was an attempt to fix iOS text cut-off, may not be needed if labels are short
// 	},
// 	buttonPrimary: {
// 		backgroundColor: theme.colors.primary,
// 		paddingVertical: theme.space.sm,
// 		paddingHorizontal: theme.space.md,
// 		borderRadius: theme.radius.sm,
// 		alignItems: "center",
// 		justifyContent: "center",
// 		minHeight: 38,
// 	},
// 	buttonPrimaryText: {
// 		color: theme.colors.background,
// 		fontSize: theme.fontSize.sm,
// 		fontWeight: "600",
// 	},
// 	buttonSecondary: {
// 		backgroundColor: theme.colors.inputBackground,
// 		paddingVertical: theme.space.sm,
// 		paddingHorizontal: theme.space.md,
// 		borderRadius: theme.radius.sm,
// 		alignItems: "center",
// 		justifyContent: "center",
// 		borderWidth: 1,
// 		borderColor: theme.colors.primary,
// 		minHeight: 38,
// 	},
// 	buttonSecondaryText: {
// 		color: theme.colors.primary,
// 		fontSize: theme.fontSize.sm,
// 		fontWeight: "600",
// 	},
// 	buttonPressed: {
// 		opacity: 0.8,
// 	},
// 	buttonDisabled: {
// 		opacity: 0.5,
// 	},
// });
// // ...existing code...
import {
	travelModeOptions,
	tripVisibilityOptions,
} from "@/src/constants/settingsOptions";
import { getTripJsonById, updateTripJson } from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import TransportIcon from "../../../../src/components/TransportIcon";

// Chip component similar to your modals but smaller
const Chip = ({ label, selected, onPress, children, compact = false }) => (
	<Pressable
		onPress={onPress}
		style={[
			styles.chip,
			selected && styles.chipSelected,
			compact && styles.chipCompact,
		]}
	>
		{children}
		<Text style={[styles.chipText, selected && styles.chipTextSelected]}>
			{label}
		</Text>
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

	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(null);

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

		const payload = {
			title: title.trim(),
			description: description.trim(),
			defaultTripVisibility: visibility,
			defaultTravelMode: transportMode,
		};

		try {
			await updateTripJson(tripId, payload);
			Alert.alert("Success", "Trip updated successfully!");
			router.back();
		} catch (err) {
			console.error("Failed to save trip changes:", err);
			const errorMessage =
				err.message || "Could not save changes. Please try again.";
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
							color={
								option.value === visibility
									? theme.colors.primary
									: theme.colors.textMuted
							}
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
							color={
								option.value === transportMode
									? theme.colors.primary
									: theme.colors.textMuted
							}
							style={styles.chipIcon}
						/>
					</Chip>
				))}
			</View>

			{/* Buttons */}
			<Pressable
				style={({ pressed }) => [
					styles.buttonPrimary,
					pressed && styles.buttonPressed,
					saving && styles.buttonDisabled,
				]}
				onPress={handleSaveChanges}
				disabled={saving}
			>
				<Text style={styles.buttonPrimaryText}>
					{saving ? "Saving..." : "Save"}
				</Text>
			</Pressable>

			<Pressable
				style={({ pressed }) => [
					styles.buttonSecondary,
					pressed && styles.buttonPressed,
					saving && styles.buttonDisabled,
				]}
				onPress={() => router.back()}
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
});
