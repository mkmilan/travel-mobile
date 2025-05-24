import { theme } from "@/src/theme";
import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text } from "react-native";

export default function SocialButton({ iconName, count, onPress, label }) {
	return (
		<Pressable
			onPress={onPress}
			style={styles.socialButton}
		>
			<Feather
				name={iconName}
				size={20}
				color={theme.colors.text}
			/>
			{count !== undefined && <Text style={styles.socialCount}>{count}</Text>}
			{label && <Text style={styles.socialLabel}>{label}</Text>}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	socialButton: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: theme.space.sm,
	},
	socialCount: {
		marginLeft: theme.space.xs,
		fontSize: theme.fontSize.sm,
		color: theme.colors.text,
		fontWeight: "500",
	},
	socialLabel: {
		marginLeft: theme.space.xs,
		fontSize: theme.fontSize.sm,
		color: theme.colors.text,
	},
});
