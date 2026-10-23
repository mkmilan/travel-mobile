import ProfileListStatus from "@/src/components/ProfileListStatus";
import useSocialSheetLoader from "@/src/hooks/useSocialSheetLoader";
import useTripSocial from "@/src/hooks/useTripSocial";
import { deleteTripComment } from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { isoToDate } from "@/src/utils/format"; // same util TripDetail uses
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import Avatar from "../ui/Avatar";
import BaseSheet from "./BaseSheet";

export default function CommentsSheet({ trip, visible, onClose }) {
	const { user, token } = useAuthStore(); // current logged-in user
	const router = useRouter();
	/* ---- social slice ---- */
	const { comments, loadComments, addComment } = useTripSocial(trip || {});
	const loader = useSocialSheetLoader({ tripId: trip?._id, visible, load: loadComments });

	/* ---- local state ---- */
	const [text, setText] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [refreshError, setRefreshError] = useState("");
	const request = useRef(null);
	const context = useRef({});
	if (context.current.tripId !== trip?._id || context.current.userId !== user?._id || context.current.token !== token || context.current.visible !== visible) {
		context.current = { tripId: trip?._id, userId: user?._id, token, visible };
		request.current = null;
	}
	useEffect(() => {
		setText("");
		setError("");
		setRefreshError("");
		setBusy(false);
	}, [trip?._id, user?._id, token, visible]);
	useEffect(() => () => { request.current = null; }, []);

	/* ------------------------------------------------------------------ */
	/* handlers                                                            */
	/* ------------------------------------------------------------------ */
	const close = () => { if (!request.current) onClose(); };
	const onSend = async () => {
		if (!text.trim() || !trip?._id || request.current || !context.current.visible) return;
		const operation = {};
		request.current = operation;
		setBusy(true);
		setError("");
		setRefreshError("");
		try {
			const result = await addComment(text.trim());
			if (request.current !== operation) return;
			setText("");
			if (result?.refreshError) setRefreshError("Comment posted, but the list could not refresh.");
		} catch (error) {
			if (request.current === operation) setError(error?.message || "Could not post comment. Please retry.");
		} finally {
			if (request.current === operation) {
				request.current = null;
				setBusy(false);
			}
		}
	};
	const retryPostedRefresh = async () => {
		if (request.current) return;
		const operation = {};
		request.current = operation;
		setBusy(true);
		try {
			await loadComments();
			if (request.current === operation) setRefreshError("");
		} catch (_) {
			// Keep the successful-send message and retry only the list GET.
		} finally {
			if (request.current === operation) {
				request.current = null;
				setBusy(false);
			}
		}
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
		const mine = Boolean(user?._id) && item.user?._id === user._id;

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
						onPress={() => {
							if (!item.user?._id || request.current) return;
							onClose();
							router.push(`/user/${item.user._id}`);
						}}
					/>
					<Text style={styles.author}>{item.user?.username || "Unknown user"}</Text>
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
		<BaseSheet title="Comments" visible={visible} onClose={close}>
			{error ? <Text accessibilityRole="alert" style={styles.center}>{error}</Text> : null}
			{refreshError ? <View>
				<Text accessibilityRole="alert" style={styles.center}>{refreshError}</Text>
				<Pressable testID="comments-refresh-posted" onPress={retryPostedRefresh} disabled={busy}>
					<Text style={styles.sendTxt}>Retry list refresh</Text>
				</Pressable>
			</View> : null}
			{loader.error ? <ProfileListStatus error={loader.error} onRetry={loader.retry} /> : null}
			{comments === undefined ? (
				loader.loading ? <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} /> : null
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

					{/* BottomModal owns safe-area and keyboard avoidance. */}
					<View style={styles.inputBar}>
						<TextInput
							style={styles.input}
							placeholder="Add a comment…"
							value={text}
							onChangeText={setText}
							editable={!busy}
						/>
						<Pressable testID="comments-send" onPress={onSend} disabled={busy || !text.trim()}>
							<Text style={styles.sendTxt}>Send</Text>
						</Pressable>
					</View>
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
