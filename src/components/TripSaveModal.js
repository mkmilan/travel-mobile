import TransportIcon from "@/src/components/TransportIcon";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
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

const MODES = [
	"motorhome",
	"campervan",
	"car",
	"motorcycle",
	"bicycle",
	"walking",
];

const TripSaveModal = forwardRef(({ onConfirm }, ref) => {
	const user = useAuthStore((s) => s.user);
	const defaultMode = user?.settings?.defaultTravelMode || "motorhome";

	const [visible, setVisible] = useState(false);
	const [title, setTitle] = useState("");
	const [mode, setMode] = useState(defaultMode);

	useImperativeHandle(ref, () => ({
		/**
		 * Opens the modal.
		 * @param {string} initialTitle  – Auto-generated title
		 * @param {string} initialMode   – Fallback mode (optional)
		 */
		open(initialTitle, initialMode) {
			setTitle(initialTitle);
			setMode(initialMode || defaultMode);
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
			propagateSwipe /* lets the ScrollView scroll */
		>
			{/* ---- BODY ---------------------------------------------------------- */}
			<View
				style={{
					backgroundColor: theme.colors.background,
					paddingTop: 8,
					paddingHorizontal: 20,
					paddingBottom: 24,
					borderTopLeftRadius: 20,
					borderTopRightRadius: 20,
					maxHeight: "80%",
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
							borderColor: theme.colors.border,
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
							<Pressable
								key={m}
								onPress={() => setMode(m)}
								style={{
									flexDirection: "row",
									alignItems: "center",
									borderWidth: 1,
									borderColor: theme.colors.border,
									borderRadius: 12,
									paddingVertical: 6,
									paddingHorizontal: 12,
									marginRight: 8,
									marginBottom: 8,
									backgroundColor: m === mode ? "#e0e0e0" : "transparent",
								}}
							>
								<TransportIcon
									mode={m}
									size={18}
								/>
								<Text style={{ marginLeft: 6 }}>{m}</Text>
							</Pressable>
						))}
					</View>
				</ScrollView>

				{/* save -------------------------------------------------------------- */}
				<Pressable
					onPress={() => {
						onConfirm({ title, mode });
						setVisible(false);
					}}
					style={{
						backgroundColor: theme.colors.primary,
						borderRadius: 12,
						paddingVertical: 12,
					}}
				>
					<Text
						style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}
					>
						Save trip
					</Text>
				</Pressable>
			</View>
		</Modal>
	);
});

export default TripSaveModal;
