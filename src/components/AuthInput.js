import { theme } from "@/src/theme";
import { StyleSheet, Text, TextInput, View } from "react-native";

export default function AuthInput({
	value,
	onChangeText,
	placeholder,
	secureTextEntry,
	keyboardType,
	error,
}) {
	return (
		<View style={styles.inputWrapper}>
			<TextInput
				style={styles.input}
				value={value}
				onChangeText={onChangeText}
				placeholder={placeholder}
				placeholderTextColor={theme.colors.inputBorder}
				secureTextEntry={secureTextEntry}
				autoCapitalize="none"
				keyboardType={keyboardType || "default"}
			/>
			{error && <Text style={styles.errorText}>{error}</Text>}
		</View>
	);
}

const styles = StyleSheet.create({
	inputWrapper: {
		width: "100%",
		marginBottom: theme.space.md,
	},
	input: {
		backgroundColor: theme.colors.inputBackground,
		borderColor: theme.colors.inputBorder,
		borderWidth: 1,
		padding: theme.space.md,
		borderRadius: theme.radius.md,
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
	},
	errorText: {
		color: theme.colors.error, // uses "#D14343" from theme
		marginTop: theme.space.sm,
		fontSize: 12,
		textAlign: "center",
	},
});
