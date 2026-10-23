import { theme } from "@/src/theme";
import { useEffect, useRef } from "react";
import {
	Animated,
	Dimensions,
	KeyboardAvoidingView,
	Modal,
	Platform,
	Pressable,
	StyleSheet,
	View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const SCREEN_HEIGHT = Dimensions.get("window").height;

export default function BottomModal({ visible, onClose, children, style }) {
	const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

	useEffect(() => {
		Animated.timing(translateY, {
			toValue: visible ? 0 : SCREEN_HEIGHT,
			duration: 250,
			useNativeDriver: true,
		}).start();
	}, [visible]);

	return (
		<Modal animationType="none" transparent visible={visible} onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
			<SafeAreaProvider>
				{/* The backdrop stays a sibling, never an ancestor of form controls. */}
				<Pressable testID="bottom-modal-backdrop" style={styles.backdrop} onPress={onClose} accessible={false} />
				<SafeAreaView edges={["top", "left", "right"]} style={styles.wrapper} pointerEvents="box-none">
					{/* Android's modal window resizes for the keyboard natively. */}
					<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} pointerEvents="box-none" style={styles.wrapper}>
						<Animated.View style={[styles.container, { transform: [{ translateY }] }, style]}>
							{/* Keep system-navigation clearance inside per-modal style overrides. */}
							<SafeAreaView edges={["bottom"]} style={styles.safeContent} accessibilityViewIsModal>
								<View style={styles.handle} />
								<View style={styles.content}>{children}</View>
							</SafeAreaView>
						</Animated.View>
					</KeyboardAvoidingView>
				</SafeAreaView>
			</SafeAreaProvider>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "#0005",
	},
	wrapper: {
		flex: 1,
		justifyContent: "flex-end",
	},
	container: {
		flex: 1, // 🔑 makes modal grow to available space
		maxHeight: "90%",
		backgroundColor: theme.colors.background,
		paddingHorizontal: theme.space.md,
		paddingTop: theme.space.lg,
		borderTopLeftRadius: theme.radius.lg,
		borderTopRightRadius: theme.radius.lg,
	},
	safeContent: {
		flex: 1,
		paddingBottom: theme.space.lg + 10,
	},
	handle: {
		width: 40,
		height: 4,
		borderRadius: 2,
		backgroundColor: theme.colors.inputBorder,
		alignSelf: "center",
		marginBottom: theme.space.md,
	},
	content: {
		flex: 1, // allows children (ScrollView) to fill
	},
});
