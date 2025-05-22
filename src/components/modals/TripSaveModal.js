import TransportIcon from "@/src/components/TransportIcon";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme"; // ← uses your theme :contentReference[oaicite:0]{index=0}
import { forwardRef, useImperativeHandle, useState } from "react";
import {
	Platform,
	Pressable,
	ScrollView,
	Text,
	TextInput,
	View,
} from "react-native";
import Modal from "react-native-modal";

/* selectable chips --------------------------------------------------------*/
const MODES = [
	"motorhome",
	"campervan",
	"car",
	"motorcycle",
	"bicycle",
	"walking",
];
const VISIBILITIES = ["public", "followers_only", "private"];

const Chip = ({ label, selected, onPress, children }) => (
	<Pressable
		onPress={onPress}
		style={{
			flexDirection: "row",
			alignItems: "center",
			borderWidth: 1,
			borderColor: theme.colors.inputBorder,
			borderRadius: 12,
			paddingVertical: 6,
			paddingHorizontal: 12,
			marginRight: 8,
			marginBottom: 8,
			backgroundColor: selected ? "#e0e0e0" : "transparent",
		}}
	>
		{children}
		<Text style={{ marginLeft: children ? 6 : 0 }}>{label}</Text>
	</Pressable>
);

const TripSaveModal = forwardRef(({ onConfirm }, ref) => {
	const user = useAuthStore((s) => s.user) || {};
	const defaults = user?.settings || {};

	const [visible, setVisible] = useState(false);
	const [title, setTitle] = useState("");
	const [mode, setMode] = useState(defaults.defaultTravelMode || "motorhome");
	const [visibility, setVisibility] = useState(
		defaults.defaultTripVisibility || "public"
	);

	useImperativeHandle(ref, () => ({
		open(initialTitle, initialMode, initialVisibility) {
			setTitle(initialTitle);
			setMode(initialMode || defaults.defaultTravelMode || "motorhome");
			setVisibility(
				initialVisibility || defaults.defaultTripVisibility || "public"
			);
			setVisible(true);
		},
	}));

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
		>
			<View
				style={{
					backgroundColor: theme.colors.background,
					paddingTop: 8,
					paddingHorizontal: 20,
					paddingBottom: 24,
					borderTopLeftRadius: 20,
					borderTopRightRadius: 20,
					maxHeight: "85%",
				}}
			>
				<ScrollView>
					{/* title ----------------------------------------------------------- */}
					<Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 8 }}>
						{`Trip title (${
							Platform.OS === "ios" ? "return" : "enter"
						} to save)`}
					</Text>

					<TextInput
						value={title}
						onChangeText={setTitle}
						style={{
							borderWidth: 1,
							borderColor: theme.colors.inputBorder,
							backgroundColor: theme.colors.inputBackground,
							borderRadius: 12,
							padding: 10,
							marginBottom: 16,
						}}
						returnKeyType="done"
					/>

					{/* mode ------------------------------------------------------------ */}
					<Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 8 }}>
						Transport mode
					</Text>
					<View
						style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 24 }}
					>
						{MODES.map((m) => (
							<Chip
								key={m}
								label={m}
								selected={m === mode}
								onPress={() => setMode(m)}
							>
								<TransportIcon
									mode={m}
									size={18}
								/>
							</Chip>
						))}
					</View>

					{/* visibility ------------------------------------------------------ */}
					<Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 8 }}>
						Visibility
					</Text>
					<View
						style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 24 }}
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

				{/* save -------------------------------------------------------------- */}
				<Pressable
					onPress={() => {
						onConfirm({ title, mode, visibility });
						setVisible(false);
					}}
					style={{
						backgroundColor: theme.colors.primary,
						borderRadius: 12,
						paddingVertical: 12,
					}}
				>
					<Text
						style={{
							color: "#fff",
							textAlign: "center",
							fontWeight: "600",
						}}
					>
						Save trip
					</Text>
				</Pressable>
			</View>
		</Modal>
	);
});

export default TripSaveModal;
