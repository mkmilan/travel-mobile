import { theme } from "@/src/theme";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

// Recording forms deliberately do not use swipe responders or animated overlay
// wrappers: the backdrop is a sibling, never an ancestor of the form controls.
export default function RecordingFormModal({ visible, onClose, busy = false, title, children }) {
	if (!visible) return null;
	const close = () => { if (!busy) onClose(); };
	return (
		<Modal transparent visible animationType="slide" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
			<SafeAreaProvider>
				<Pressable testID="recording-form-backdrop" style={styles.backdrop} onPress={close} accessible={false} />
				<SafeAreaView edges={["top", "left", "right"]} style={styles.viewport} pointerEvents="box-none">
					{/* Android Modal uses adjustResize; only iOS needs an extra keyboard offset. */}
					<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.viewport} pointerEvents="box-none">
						<SafeAreaView edges={["bottom"]} style={styles.sheet} accessibilityViewIsModal>
							<View style={styles.header}>
								<Text style={styles.title}>{title}</Text>
								<Pressable accessibilityRole="button" accessibilityLabel={`Cancel ${title}`} onPress={close} disabled={busy} hitSlop={8}>
									<Text style={{ color: busy ? theme.colors.textMuted : theme.colors.link }}>Cancel</Text>
								</Pressable>
							</View>
							{children}
						</SafeAreaView>
					</KeyboardAvoidingView>
				</SafeAreaView>
			</SafeAreaProvider>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "#0008" },
	viewport: { flex: 1, justifyContent: "flex-end" },
	sheet: {
		maxHeight: "90%",
		padding: theme.space.lg,
		backgroundColor: theme.colors.background,
		borderTopLeftRadius: theme.radius.lg,
		borderTopRightRadius: theme.radius.lg,
	},
	header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: theme.space.md },
	title: { fontSize: theme.fontSize.lg, fontWeight: "600", color: theme.colors.text },
});
