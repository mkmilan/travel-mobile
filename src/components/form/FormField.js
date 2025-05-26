import { theme } from "@/src/theme";
import { StyleSheet, Text, TextInput, View } from "react-native";

export default function FormField({
	label,
	value,
	onChange,
	placeholder = "",
	multiline = false,
	error = "",
}) {
	return (
		<View style={{ marginBottom: theme.space.md }}>
			<Text
				style={{
					fontSize: theme.fontSize.sm,
					fontWeight: "600",
					marginBottom: 4,
					color: theme.colors.text,
				}}
			>
				{label}
			</Text>
			<TextInput
				value={value}
				onChangeText={onChange}
				placeholder={placeholder}
				placeholderTextColor={theme.colors.textMuted}
				style={[
					styles.input,
					multiline && { minHeight: 90, textAlignVertical: "top" },
				]}
				multiline={multiline}
			/>
			{!!error && (
				<Text
					style={{ color: theme.colors.error, fontSize: theme.fontSize.xs }}
				>
					{error}
				</Text>
			)}
		</View>
	);
}

// const styles = StyleSheet.create({
// 	input: {
// 		borderWidth: 1,
// 		borderColor: theme.colors.inputBorder,
// 		backgroundColor: theme.colors.inputBackground,
// 		borderRadius: theme.radius.md,
// 		padding: theme.space.sm,
// 		fontSize: theme.fontSize.sm,
// 		color: theme.colors.text,
// 	},
// });
const styles = StyleSheet.create({
	input: {
		borderWidth: 0,
		backgroundColor: theme.colors.inputBackground,
		borderRadius: theme.radius.md,
		padding: theme.space.md,
		fontSize: theme.fontSize.sm,
		color: theme.colors.text,
		elevation: 1,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.06,
		shadowRadius: 2,
	},
});
