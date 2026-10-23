import { theme } from "@/src/theme";
import { POI_NOTE_MAX_LENGTH, validatePoiNote } from "@/src/utils/poiNote";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput } from "react-native";
import RecordingFormModal from "./RecordingFormModal";

const AddPoiModal = forwardRef(({ onSubmit }, ref) => {
	const [visible, setVisible] = useState(false);
	const [note, setNote] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(null);
	const [title, setTitle] = useState("Add POI");
	const savingRef = useRef(false);

	useImperativeHandle(ref, () => ({
		open(initialNote = "", options = {}) {
			if (savingRef.current) return;
			setNote(initialNote);
			setTitle(options.title || "Add POI");
			setError(null);
			setVisible(true);
		},
	}));

	const handleSubmit = async () => {
		if (savingRef.current) return;
		try {
			validatePoiNote(note);
		} catch (validationError) {
			setError(validationError.message);
			return;
		}
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
		<RecordingFormModal visible={visible} onClose={() => setVisible(false)} busy={saving} title={title}>
			<ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
				<TextInput
					value={note}
					onChangeText={(value) => { setNote(value); setError(null); }}
					multiline
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
				<Text style={{ color: theme.colors.textMuted, marginBottom: theme.space.sm }}>
					{note.length}/{POI_NOTE_MAX_LENGTH} characters
				</Text>
				{note.length > POI_NOTE_MAX_LENGTH && (
					<Text accessibilityRole="alert" style={{ color: theme.colors.error, marginBottom: theme.space.sm }}>
						Shorten this note to {POI_NOTE_MAX_LENGTH} characters or fewer before saving. Your original note is kept until you save.
					</Text>
				)}
			</ScrollView>
			{error && <Text accessibilityRole="alert" style={{ color: theme.colors.error, marginBottom: theme.space.sm }}>{error}</Text>}
			<Pressable
				onPress={handleSubmit}
				testID="poi-save"
				accessibilityRole="button"
				disabled={saving || note.length > POI_NOTE_MAX_LENGTH}
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
