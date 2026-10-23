// filepath: /home/mkmilan/Documents/my/travel-2/mobile/src/components/AddCommentModal.js
import { theme } from "@/src/theme";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import BottomModal from "./BottomModal";
import ModalHeader from "./ModalHeader";

export default function AddCommentModal({
	isVisible,
	onClose,
	onSubmit, // (text) => Promise<void>
}) {
	const [text, setText] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");
	const request = useRef(null);
	const visibility = useRef(isVisible);
	if (visibility.current !== isVisible) {
		visibility.current = isVisible;
		request.current = null;
	}
	useEffect(() => () => { request.current = null; }, []);

	useEffect(() => {
		if (isVisible) {
			setText("");
			setError("");
			setIsSubmitting(false);
		}
	}, [isVisible]);

	const handleSubmit = async () => {
		if (request.current || !visibility.current) return;
		if (!text.trim()) {
			setError("Comment cannot be empty.");
			return;
		}
		const operation = {};
		request.current = operation;
		setError("");
		setIsSubmitting(true);
		try {
			await onSubmit(text.trim());
			if (request.current === operation) onClose();
		} catch (err) {
			if (request.current === operation) setError(err?.message || "Failed to post comment.");
		} finally {
			if (request.current === operation) {
				request.current = null;
				setIsSubmitting(false);
			}
		}
	};

	const handleClose = () => {
		if (!request.current) onClose();
	};

	return (
		<BottomModal visible={isVisible} onClose={handleClose}>
			<ModalHeader title="Add Comment" onClose={handleClose} />
			<View style={styles.contentView}>
				<TextInput
					style={styles.textInput}
					placeholder="Write your comment..."
					placeholderTextColor={theme.colors.textMuted}
					value={text}
					onChangeText={setText}
					editable={!isSubmitting}
					multiline
					maxLength={500}
					autoFocus={true}
				/>

				{error ? <Text style={styles.errorText} accessibilityRole="alert">{error}</Text> : null}

				<TouchableOpacity
					testID="comment-submit"
					style={[styles.submitButton, (isSubmitting || !text.trim()) && styles.submitButtonDisabled]}
					onPress={handleSubmit}
					disabled={isSubmitting || !text.trim()}
				>
					{isSubmitting ? (
						<ActivityIndicator color="#fff" size="small" />
					) : (
						<Text style={styles.submitButtonText}>Post Comment</Text>
					)}
				</TouchableOpacity>
			</View>
		</BottomModal>
	);
}

const styles = StyleSheet.create({
	contentView: {
		paddingBottom: theme.space.sm, // Ensure submit button is not too close to bottom
	},
	textInput: {
		minHeight: 100,
		borderWidth: 1,
		borderColor: theme.colors.inputBorder,
		borderRadius: theme.radius.sm,
		padding: theme.space.sm,
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
		marginBottom: theme.space.md,
		textAlignVertical: "top",
	},
	submitButton: {
		backgroundColor: theme.colors.primary,
		paddingVertical: theme.space.sm,
		borderRadius: theme.radius.sm,
		alignItems: "center",
	},
	submitButtonDisabled: {
		backgroundColor: theme.colors.primaryMuted,
	},
	submitButtonText: {
		color: "#fff",
		fontWeight: "600",
		fontSize: theme.fontSize.md,
	},
	errorText: {
		color: theme.colors.error,
		fontSize: theme.fontSize.sm,
		marginBottom: theme.space.sm,
		textAlign: "center",
	},
});
