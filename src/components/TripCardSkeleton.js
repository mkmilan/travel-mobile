import { theme } from "@/src/theme";
import { StyleSheet, View } from "react-native";

export default function TripCardSkeleton() {
	return <View style={styles.skel} />;
}

const styles = StyleSheet.create({
	skel: {
		height: 140,
		backgroundColor: theme.colors.inputBorder,
		borderRadius: theme.radius.md,
		marginBottom: theme.space.lg,
		opacity: 0.3,
	},
});
