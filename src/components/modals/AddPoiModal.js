import { theme } from "@/src/theme";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput } from "react-native";
import RecordingFormModal from "./RecordingFormModal";

const AddPoiModal = forwardRef(({ onSubmit }, ref) => {
	const [visible, setVisible] = useState(false);
	const [note, setNote] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(null);
	const savingRef = useRef(false);

	useImperativeHandle(ref, () => ({
		open() {
			if (savingRef.current) return;
			setNote("");
			setError(null);
			setVisible(true);
		},
	}));

	const handleSubmit = async () => {
		if (savingRef.current) return;
		savingRef.current = true;
		setSaving(true);
		setError(null);
		try {
			await onSubmit({ note });
			setVisible(false);
		} catch {
			setError("Could not save this POI. Your note is still here; please try again.");
		} finally {
			savingRef.current = false;
			setSaving(false);
		}
	};

	return (
		<RecordingFormModal visible={visible} onClose={() => setVisible(false)} busy={saving} title="Add POI">
			<ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
				<TextInput
					value={note}
					onChangeText={setNote}
					editable={!saving}
					accessibilityLabel="POI note"
					placeholder="Note..."
					style={{
						borderWidth: 1,
						borderColor: theme.colors.inputBorder,
						backgroundColor: theme.colors.inputBackground,
						color: theme.colors.text,
						borderRadius: 10,
						padding: 10,
						marginBottom: 20,
					}}
				/>
			</ScrollView>
			{error && <Text accessibilityRole="alert" style={{ color: theme.colors.error, marginBottom: theme.space.sm }}>{error}</Text>}
			<Pressable
				onPress={handleSubmit}
				testID="poi-save"
				accessibilityRole="button"
				disabled={saving}
				style={{ backgroundColor: theme.colors.primary, borderRadius: 12, paddingVertical: 12 }}
			>
				<Text style={{ color: "#fff", textAlign: "center", fontWeight: "600" }}>
					{saving ? "Saving…" : "Save POI"}
				</Text>
			</Pressable>
		</RecordingFormModal>
	);
});

export default AddPoiModal;
