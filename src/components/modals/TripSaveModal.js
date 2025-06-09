import TransportIcon from "@/src/components/TransportIcon";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { forwardRef, useImperativeHandle, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Modal from "react-native-modal";

/* selectable chips --------------------------------------------------------*/
const MODES = ["motorhome", "campervan", "car", "motorcycle", "bicycle", "walking"];
const VISIBILITIES = ["public", "followers_only", "private"];

const Chip = ({ label, selected, onPress, children }) => (
	<Pressable
		onPress={onPress}
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
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState(""); // Add description state
	const [mode, setMode] = useState(defaults.defaultTravelMode || "motorhome");
	const [visibility, setVisibility] = useState(defaults.defaultTripVisibility || "public");

	useImperativeHandle(ref, () => ({
		open(initialTitle, initialMode, initialVisibility, initialDescription) {
			setTitle(initialTitle || "");
			setDescription(initialDescription || ""); // Initialize description
			setMode(initialMode || defaults.defaultTravelMode || "motorhome");
			setVisibility(initialVisibility || defaults.defaultTripVisibility || "public");
			setVisible(true);
		},
	}));

	const handleConfirm = () => {
		onConfirm({ title, description, mode, visibility }); // Include description
		setVisible(false);
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
			avoidKeyboard={true} // This helps with keyboard handling
		>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				style={{ flex: 1, justifyContent: "flex-end" }}
			>
				<View
					style={{
						backgroundColor: theme.colors.background,
						paddingTop: theme.space.sm,
						paddingHorizontal: theme.space.lg,
						paddingBottom: theme.space.lg,
						borderTopLeftRadius: theme.space.lg,
						borderTopRightRadius: theme.space.lg,
						maxHeight: "90%", // Increase max height slightly
					}}
				>
					<ScrollView
						showsVerticalScrollIndicator={false}
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
								<Chip key={m} label={m} selected={m === mode} onPress={() => setMode(m)}>
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
									key={v}
									label={v.replace("_", " ")}
									selected={v === visibility}
									onPress={() => setVisibility(v)}
								/>
							))}
						</View>
					</ScrollView>

					{/* save button ---------------------------------------------------- */}
					<Pressable
						onPress={handleConfirm}
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
							Save Trip
						</Text>
					</Pressable>
				</View>
			</KeyboardAvoidingView>
		</Modal>
	);
});

export default TripSaveModal;
