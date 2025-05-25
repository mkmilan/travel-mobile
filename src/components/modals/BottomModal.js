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

const SCREEN_HEIGHT = Dimensions.get("window").height;
const MAX_HEIGHT = SCREEN_HEIGHT * 0.9; // never cover full screen

export default function BottomModal({ visible, onClose, children, style }) {
	/* ---------- simple slide-up animation ---------- */
	const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

	useEffect(() => {
		if (visible) {
			Animated.timing(translateY, {
				toValue: 0,
				duration: 250,
				useNativeDriver: true,
			}).start();
		} else {
			Animated.timing(translateY, {
				toValue: SCREEN_HEIGHT,
				duration: 200,
				useNativeDriver: true,
			}).start();
		}
	}, [visible]);

	return (
		<Modal
			animationType="none"
			transparent
			visible={visible}
			onRequestClose={onClose}
			statusBarTranslucent
		>
			{/* dimmed backdrop */}
			<Pressable style={styles.backdrop} onPress={onClose} />

			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : undefined}
				keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
				pointerEvents="box-none"
				style={styles.wrapper}
			>
				<Animated.View
					style={[styles.container, { transform: [{ translateY }] }, style]}
				>
					{/* drag handle */}
					<View style={styles.handle} />

					{children}
				</Animated.View>
			</KeyboardAvoidingView>
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
		maxHeight: MAX_HEIGHT,
		backgroundColor: theme.colors.background,
		paddingHorizontal: theme.space.md,
		paddingTop: theme.space.lg,
		paddingBottom: theme.space.lg + 10, // breathing room above home-bar
		borderTopLeftRadius: theme.radius.lg,
		borderTopRightRadius: theme.radius.lg,
	},
	handle: {
		width: 36,
		height: 4,
		borderRadius: 2,
		backgroundColor: theme.colors.inputBorder,
		alignSelf: "center",
		marginBottom: theme.space.md,
	},
});
