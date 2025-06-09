import UserHeader from "@/src/components/ui/UserHeader";
import { searchUsersApi } from "@/src/services/api";
import { theme } from "@/src/theme";
import { debounce } from "@/src/utils/debounce";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function SearchUsersScreen() {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const router = useRouter();

	const doSearch = useCallback(
		debounce(async (q) => {
			if (q.trim().length < 2) {
				setResults([]);
				setError(null);
				return;
			}
			setLoading(true);
			try {
				const res = await searchUsersApi(q);
				setResults(res);
			} catch (err) {
				setError(err.message || "Error searching");
			} finally {
				setLoading(false);
			}
		}, 400),
		[]
	);

	return (
		<View style={styles.container}>
			<View style={styles.inputWrapper}>
				<Feather name="search" size={20} color={theme.colors.primary} style={styles.inputIcon} />
				<TextInput
					style={styles.input}
					placeholder="Search users…"
					value={query}
					onChangeText={(t) => {
						setQuery(t);
						doSearch(t);
					}}
					placeholderTextColor={theme.colors.textMuted}
				/>
			</View>

			{loading && <ActivityIndicator style={styles.spinner} color={theme.colors.primary} pointerEvents="none" />}
			{error && <Text style={styles.error}>{error}</Text>}
			{!loading && !error && results.length === 0 && query.length >= 2 && (
				<Text style={styles.empty}>No users found.</Text>
			)}

			<FlatList
				data={results}
				keyExtractor={(u) => u._id}
				renderItem={({ item }) => (
					<TouchableOpacity
						style={styles.userCard}
						activeOpacity={0.85}
						onPress={() => router.push(`/(tabs)/user/${item._id}`)}
					>
						<View style={styles.cardHeader}>
							<UserHeader user={item} showLocation={true} size={40} />
						</View>
					</TouchableOpacity>
				)}
				contentContainerStyle={{ paddingBottom: 32 }}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.space.md },
	inputWrapper: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#f5f7fa",
		borderRadius: theme.radius.md,
		paddingHorizontal: theme.space.sm,
		paddingVertical: 2,
		borderWidth: 1,
		borderColor: theme.colors.inputBorder,
		marginBottom: theme.space.md,
	},
	inputIcon: {
		marginRight: 6,
	},
	input: {
		flex: 1,
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
		paddingVertical: theme.space.sm,
		backgroundColor: "transparent",
	},
	userCard: {
		backgroundColor: "#fff",
		borderRadius: theme.radius.md,
		padding: theme.space.md,
		marginBottom: theme.space.sm,
		shadowColor: "#000",
		shadowOpacity: 0.04,
		shadowRadius: 4,
		elevation: 1,
	},
	cardHeader: {
		flexDirection: "row",
		alignItems: "center",
	},
	userName: {
		fontSize: theme.fontSize.md,
		color: theme.colors.default,
		fontWeight: "700",
	},
	userId: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.textMuted,
		marginTop: 2,
	},
	error: { color: theme.colors.error, textAlign: "center", marginTop: 24 },
	empty: { color: theme.colors.textMuted, textAlign: "center", marginTop: 24 },
	spinner: { position: "absolute", top: "45%", alignSelf: "center", zIndex: 1 },
});
