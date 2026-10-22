import { theme } from "@/src/theme";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

export default function ProfileListStatus({ loading, error, onRetry, emptyMessage }) {
	if (loading) return <ActivityIndicator testID="profile-list-loading" style={{ margin: 24 }} />;
	return (
		<View style={{ padding: 24, alignItems: "center" }}>
			<Text accessibilityRole={error ? "alert" : undefined} style={{ textAlign: "center", color: error ? theme.colors.error : theme.colors.textMuted }}>
				{error ? `Could not load this list: ${error}` : emptyMessage}
			</Text>
			{error && <Pressable accessibilityRole="button" accessibilityLabel="Retry loading list" onPress={onRetry} style={{ padding: 12 }}>
				<Text style={{ color: theme.colors.link }}>Retry</Text>
			</Pressable>}
		</View>
	);
}
