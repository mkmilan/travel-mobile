// src/components/AddPoiModal.js
import { theme } from "@/src/theme";
import { forwardRef, useImperativeHandle, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Modal from "react-native-modal";

const AddPoiModal = forwardRef(({ onSubmit }, ref) => {
	const [visible, setVisible] = useState(false);
	const [note, setNote] = useState("");

	useImperativeHandle(ref, () => ({
		open() {
			setNote("");
			setVisible(true);
		},
	}));

	return (
		<Modal
			isVisible={visible}
			onBackdropPress={() => setVisible(false)}
			animationIn="slideInUp"
			animationOut="slideOutDown"
			style={{ margin: 0, justifyContent: "flex-end" }}
		>
			<View
				style={{
					backgroundColor: theme.colors.background,
					padding: 24,
					borderTopLeftRadius: 20,
					borderTopRightRadius: 20,
				}}
			>
				<Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 12 }}>
					Add POI
				</Text>

				<TextInput
					value={note}
					onChangeText={setNote}
					placeholder="Note..."
					style={{
						borderWidth: 1,
						borderColor: theme.colors.inputBorder,
						backgroundColor: theme.colors.inputBackground,
						borderRadius: 10,
						padding: 10,
						marginBottom: 20,
					}}
				/>

				<Pressable
					onPress={() => {
						onSubmit({ note });
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
						Save POI
					</Text>
				</Pressable>
			</View>
		</Modal>
	);
});

export default AddPoiModal;
