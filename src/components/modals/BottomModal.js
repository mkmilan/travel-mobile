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
	const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

	useEffect(() => {
		Animated.timing(translateY, {
			toValue: visible ? 0 : SCREEN_HEIGHT,
			duration: 250,
			useNativeDriver: true,
		}).start();
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
					style={[
						styles.container,
						{ transform: [{ translateY }] },
						style, // allow per-modal overrides
					]}
				>
					{/* drag handle */}
					<View style={styles.handle} />

					{/* flex-grow content so ScrollView gets space */}
					<View style={styles.content}>{children}</View>
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
		flex: 1, // 🔑 makes modal grow to available space
		maxHeight: MAX_HEIGHT,
		backgroundColor: theme.colors.background,
		paddingHorizontal: theme.space.md,
		paddingTop: theme.space.lg,
		paddingBottom: theme.space.lg + 10,
		borderTopLeftRadius: theme.radius.lg,
		borderTopRightRadius: theme.radius.lg,
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
