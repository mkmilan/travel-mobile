import TransportIcon from "@/src/components/TransportIcon";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { validateTripMetadata } from "@/src/utils/tripMetadata";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import RecordingFormModal from "./RecordingFormModal";

/* selectable chips --------------------------------------------------------*/
const MODES = ["motorhome", "campervan", "car", "motorcycle", "bicycle", "walking"];
const VISIBILITIES = ["public", "followers_only", "private"];

const Chip = ({ label, selected, onPress, disabled, children }) => (
	<Pressable
		onPress={onPress}
		disabled={disabled}
		accessibilityRole="button"
		accessibilityState={{ selected, disabled }}
		style={{
			flexDirection: "row",
			alignItems: "center",
			borderWidth: 1,
			borderColor: theme.colors.inputBorder,
			borderRadius: theme.radius.md,
			paddingVertical: theme.space.sm,
			paddingHorizontal: theme.space.md,
			marginRight: theme.space.sm,
			marginBottom: theme.space.sm,
			backgroundColor: selected ? theme.colors.secondary + "20" : "transparent", // Using theme colors
		}}
	>
		{children}
		<Text
			style={{
				marginLeft: children ? theme.space.sm : 0,
				color: theme.colors.text,
				fontSize: theme.fontSize.sm,
			}}
		>
			{label}
		</Text>
	</Pressable>
);

const TripSaveModal = forwardRef(({ onConfirm }, ref) => {
	const user = useAuthStore((s) => s.user) || {};
	const defaults = user?.settings || {};

	const [visible, setVisible] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(null);
	const savingRef = useRef(false);
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState(""); // Add description state
	const [mode, setMode] = useState(defaults.defaultTravelMode || "motorhome");
	const [visibility, setVisibility] = useState(defaults.defaultTripVisibility || "public");

	useImperativeHandle(ref, () => ({
		reopen() {
			if (!savingRef.current) setVisible(true);
		},
		open(initialTitle, initialMode, initialVisibility, initialDescription) {
			if (savingRef.current) return;
			setError(null);
			setTitle(initialTitle || "");
			setDescription(initialDescription || ""); // Initialize description
			setMode(initialMode || defaults.defaultTravelMode || "motorhome");
			setVisibility(initialVisibility || defaults.defaultTripVisibility || "public");
			setVisible(true);
		},
	}));

	const handleConfirm = async () => {
		if (savingRef.current) return;
		savingRef.current = true;
		setSaving(true);
		setError(null);
		try {
			validateTripMetadata({ title, description });
			await onConfirm({ title, description, mode, visibility });
			setVisible(false);
		} catch (error) {
			setError(error?.code === "TRIP_METADATA_INVALID" ? error.message : "Could not save this trip. Your entries are still here; please try again.");
		} finally {
			savingRef.current = false;
			setSaving(false);
		}
	};

	return (
		<RecordingFormModal visible={visible} onClose={() => setVisible(false)} busy={saving} title="Save trip">
			<ScrollView
				showsVerticalScrollIndicator={false}
				style={{ flexShrink: 1 }}
				keyboardShouldPersistTaps="handled" // This prevents the keyboard from dismissing when tapping other elements
			>
				{/* title ----------------------------------------------------------- */}
				<Text
					style={{
						fontSize: theme.fontSize.lg,
						fontWeight: "600",
						marginBottom: theme.space.sm,
						color: theme.colors.text,
					}}
				>
					Trip Title
				</Text>

				<TextInput
					editable={!saving}
					value={title}
					onChangeText={setTitle}
					placeholder="Enter trip title..."
					placeholderTextColor={theme.colors.textMuted}
					style={{
						borderWidth: 1,
						borderColor: theme.colors.inputBorder,
						backgroundColor: theme.colors.inputBackground,
						borderRadius: theme.radius.md,
						padding: theme.space.md,
						marginBottom: theme.space.lg,
						fontSize: theme.fontSize.md,
						color: theme.colors.text,
					}}
					returnKeyType="next"
					blurOnSubmit={false}
				/>

				{/* description ----------------------------------------------------- */}
				<Text
					style={{
						fontSize: theme.fontSize.lg,
						fontWeight: "600",
						marginBottom: theme.space.sm,
						color: theme.colors.text,
					}}
				>
					Description (Optional)
				</Text>

				<TextInput
					editable={!saving}
					value={description}
					onChangeText={setDescription}
					placeholder="Add a description for your trip..."
					placeholderTextColor={theme.colors.textMuted}
					multiline={true}
					numberOfLines={3}
					textAlignVertical="top"
					style={{
						borderWidth: 1,
						borderColor: theme.colors.inputBorder,
						backgroundColor: theme.colors.inputBackground,
						borderRadius: theme.radius.md,
						padding: theme.space.md,
						marginBottom: theme.space.lg,
						fontSize: theme.fontSize.md,
						color: theme.colors.text,
						minHeight: 80, // Fixed height for multiline
					}}
					returnKeyType="done"
				/>

				{/* mode ------------------------------------------------------------ */}
				<Text
					style={{
						fontSize: theme.fontSize.lg,
						fontWeight: "600",
						marginBottom: theme.space.sm,
						color: theme.colors.text,
					}}
				>
					Transport Mode
				</Text>
				<View
					style={{
						flexDirection: "row",
						flexWrap: "wrap",
						marginBottom: theme.space.lg,
					}}
				>
					{MODES.map((m) => (
						<Chip disabled={saving} key={m} label={m} selected={m === mode} onPress={() => setMode(m)}>
							<TransportIcon mode={m} size={18} />
						</Chip>
					))}
				</View>

				{/* visibility ------------------------------------------------------ */}
				<Text
					style={{
						fontSize: theme.fontSize.lg,
						fontWeight: "600",
						marginBottom: theme.space.sm,
						color: theme.colors.text,
					}}
				>
					Visibility
				</Text>
				<View
					style={{
						flexDirection: "row",
						flexWrap: "wrap",
						marginBottom: theme.space.lg,
					}}
				>
					{VISIBILITIES.map((v) => (
						<Chip
							disabled={saving}
							key={v}
							label={v.replace("_", " ")}
							selected={v === visibility}
							onPress={() => setVisibility(v)}
						/>
					))}
				</View>
			</ScrollView>

			{error && <Text accessibilityRole="alert" style={{ color: theme.colors.error, marginTop: theme.space.sm }}>{error}</Text>}

			{/* save button ---------------------------------------------------- */}
			<Pressable
				onPress={handleConfirm}
				testID="trip-save"
				accessibilityRole="button"
				disabled={saving}
				style={{
					backgroundColor: theme.colors.primary,
					borderRadius: theme.radius.md,
					paddingVertical: theme.space.md,
					marginTop: theme.space.sm,
				}}
			>
				<Text
					style={{
						color: "#fff",
						textAlign: "center",
						fontWeight: "600",
						fontSize: theme.fontSize.md,
					}}
				>
					{saving ? "Saving…" : "Save Trip"}
				</Text>
			</Pressable>
		</RecordingFormModal>
	);
});

export default TripSaveModal;
