import useTripSocial from "@/src/hooks/useTripSocial";
import { deleteTripComment } from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { isoToDate } from "@/src/utils/format"; // same util TripDetail uses
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
	ActivityIndicator,
	FlatList,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Avatar from "../ui/Avatar";
import BaseSheet from "./BaseSheet";

export default function CommentsSheet({ trip, visible, onClose }) {
	const { user } = useAuthStore(); // current logged-in user
	const insets = useSafeAreaInsets();
	const router = useRouter();
	/* ---- social slice ---- */
	const { comments, loadComments, addComment } = useTripSocial(trip || {});

	/* ---- local state ---- */
	const [text, setText] = React.useState("");
	const [busy, setBusy] = React.useState(false);

	/* ---- fetch when sheet becomes visible ---- */
	React.useEffect(() => {
		if (visible && trip?._id) loadComments();
	}, [visible, trip?._id]);

	/* ------------------------------------------------------------------ */
	/* handlers                                                            */
	/* ------------------------------------------------------------------ */
	const onSend = async () => {
		console.log("AM I HERE");

		if (!text.trim() || !trip?._id || busy) return;
		setBusy(true);
		await addComment(text.trim()); // store does POST + refresh
		setText("");
		setBusy(false);
	};

	const onDelete = async (commentId) => {
		try {
			await deleteTripComment(trip._id, commentId);
			await loadComments(); // refresh list + counts
		} catch (e) {
			console.error("deleteTripComment failed:", e);
		}
	};

	/* ------------------------------------------------------------------ */
	/* render items                                                        */
	/* ------------------------------------------------------------------ */
	const renderItem = ({ item }) => {
		const mine = item.user._id === user?._id;
		const avatarUser = item.user || item; // fallback if user is missing
		const avatarProfilePictureUrl = item.profilePictureUrl || item.user?.profilePictureUrl;
		return (
			<View style={styles.commentCard}>
				<View style={styles.commentHeader}>
					<Avatar
						user={avatarUser}
						profilePictureUrl={avatarProfilePictureUrl}
						size={26}
						style={{ marginRight: theme.space.sm }}
						onPress={() => router.push(`/user/${mine}`)}
					/>
					<Text style={styles.author}>{item.user.username}</Text>
					<Text style={styles.date}>{isoToDate(item.createdAt)}</Text>
					{mine && (
						<Pressable onPress={() => onDelete(item._id)} hitSlop={6}>
							<Feather name="trash-2" size={16} color={theme.colors.error} />
						</Pressable>
					)}
				</View>
				<Text style={styles.body}>{item.text}</Text>
			</View>
		);
	};

	const list = comments ?? [];

	/* ------------------------------------------------------------------ */
	/* Sheet layout                                                        */
	/* ------------------------------------------------------------------ */
	return (
		<BaseSheet title="Comments" visible={visible} onClose={onClose}>
			{comments === undefined ? (
				<ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
			) : (
				<>
					{list.length === 0 ? (
						<Text style={styles.center}>No comments yet.</Text>
					) : (
						<FlatList
							data={list}
							keyExtractor={(c) => c._id}
							renderItem={renderItem}
							contentContainerStyle={{ paddingBottom: 80 }}
						/>
					)}

					{/* ----- input bar (Keyboard-aware) ----- */}
					<KeyboardAvoidingView
						behavior={Platform.OS === "ios" ? "padding" : "height"}
						keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
					>
						<View style={[styles.inputBar, { paddingBottom: insets.bottom || 8 }]}>
							<TextInput
								style={styles.input}
								placeholder="Add a comment…"
								value={text}
								onChangeText={setText}
								editable={!busy}
							/>
							<Pressable onPress={onSend} disabled={busy || !text.trim()}>
								<Text style={styles.sendTxt}>Send</Text>
							</Pressable>
						</View>
					</KeyboardAvoidingView>
				</>
			)}
		</BaseSheet>
	);
}

/* ------------------------------------------------------------------ */
/* styles                                                              */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
	center: {
		textAlign: "center",
		marginTop: 40,
		color: theme.colors.textMuted,
	},
	commentCard: {
		paddingVertical: 8,
		paddingHorizontal: 16,
		borderBottomWidth: 1,
		borderColor: theme.colors.inputBorder,
	},
	commentHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 2,
	},
	author: { fontWeight: "600", color: theme.colors.text, marginRight: 6 },
	date: { color: theme.colors.textMuted, fontSize: 12, flex: 1 },
	body: { color: theme.colors.text },
	inputBar: {
		flexDirection: "row",
		alignItems: "center",
		padding: theme.space.sm,
		borderTopWidth: 1,
		borderColor: theme.colors.inputBorder,
		backgroundColor: theme.colors.inputBackground,
		paddingTop: theme.space.sm,
	},
	input: { flex: 1, padding: 8 },
	sendTxt: { color: theme.colors.primary, fontWeight: "600", paddingHorizontal: 12 },
});
