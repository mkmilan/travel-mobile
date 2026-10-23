import FormField from "@/src/components/form/FormField";
import Avatar from "@/src/components/ui/Avatar";
import useProfileContext from "@/src/hooks/useProfileContext";
import useRequireAuth from "@/src/hooks/useRequireAuth";
import { updateUserById, uploadProfilePhoto } from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function EditProfileScreen() {
	/* guard */
	const ready = useRequireAuth();

	/* ---------- auth & nav ---------- */
	const router = useRouter();
	const authStore = useAuthStore();
	const user = authStore.user;
	const context = useProfileContext("edit-profile");
	const draftSession = useRef(null);
	if (!draftSession.current) draftSession.current = authStore.captureSession();
	const session = draftSession.current;
	const pending = useRef(null);
	// console.log("EditProfileScreen user:", user);

	const [username, setUsername] = useState(user?.username || "");
	const [bio, setBio] = useState(user?.bio || "");
	const [avatarId, setAvatarId] = useState(user?.profilePictureUrl || "");
	const [saving, setSaving] = useState(false);
	const [avatarUploading, setAvatarUploading] = useState(false);
	const [city, setCity] = useState(user?.city || "");
	const [country, setCountry] = useState(user?.country || "");

	if (!ready || !user || !context.isCurrent() || !authStore.isSessionCurrent(session)) return <View style={styles.blank} />;

	// One mutation at a time, including the native picker (before React can
	// rerender disabled buttons). Old-render handlers keep their original login.
	const begin = () => {
		if (pending.current || !context.isCurrent() || !authStore.isSessionCurrent(session)) return null;
		const operation = { session };
		operation.isCurrent = () => pending.current === operation && context.isCurrent()
			&& useAuthStore.getState().isSessionCurrent(operation.session);
		pending.current = operation;
		return operation;
	};

	/* ---------- pick + upload avatar ---------- */
	const pickAvatar = async () => {
		const operation = begin();
		if (!operation) return;
		setAvatarUploading(true);
		try {
			const res = await ImagePicker.launchImageLibraryAsync({
				mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8,
			});
			if (!operation.isCurrent() || res.canceled) return;
			const updated = await uploadProfilePhoto(res.assets[0].uri);
			if (!operation.isCurrent()) return;
			const freshUser = updated.user ?? updated;
			const applied = await authStore.updateUser(freshUser, operation.session, operation.isCurrent);
			if (applied && operation.isCurrent()) setAvatarId(freshUser.profilePictureUrl || avatarId);
		} catch (e) {
			if (operation.isCurrent()) Alert.alert("Upload failed", e.message);
		} finally {
			if (operation.isCurrent()) setAvatarUploading(false);
			if (pending.current === operation) pending.current = null;
		}
	};

	/* ---------- save username / bio ---------- */
	const save = async () => {
		const operation = begin();
		if (!operation) return;
		setSaving(true);
		try {
			const payload = { username, bio, profilePictureUrl: avatarId, city, country };
			const updated = await updateUserById(true, payload);
			if (!operation.isCurrent()) return;
			const applied = await authStore.updateUser(updated, operation.session, operation.isCurrent);
			if (applied && operation.isCurrent()) router.push(`/(tabs)/user/${operation.session.userId}`);
		} catch (e) {
			if (operation.isCurrent()) Alert.alert("Error", e.message);
		} finally {
			if (operation.isCurrent()) setSaving(false);
			if (pending.current === operation) pending.current = null;
		}
	};

	/* ---------- render ---------- */
	return (
		<ScrollView style={styles.container} contentContainerStyle={{ padding: theme.space.md }}>
			{/* avatar picker */}
			<TouchableOpacity style={styles.avatarWrapper} onPress={pickAvatar} disabled={avatarUploading || saving}>
				<Avatar photoId={avatarId} size={120} />
				{avatarUploading && (
					<ActivityIndicator style={StyleSheet.absoluteFill} size="large" color={theme.colors.primary} />
				)}
				<Text style={styles.avatarHint}>Tap to change avatar</Text>
			</TouchableOpacity>

			{/* form fields */}
			<FormField label="Username" value={username} onChange={setUsername} />
			<FormField label="City" value={city} onChange={setCity} />
			<FormField label="Country" value={country} onChange={setCountry} />
			<FormField label="Bio" value={bio} onChange={setBio} multiline />

			<TouchableOpacity style={styles.button} onPress={save} disabled={saving || avatarUploading}>
				<Text style={styles.buttonTxt}>{saving ? "Saving…" : "Save Changes"}</Text>
			</TouchableOpacity>
		</ScrollView>
	);
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
	blank: { flex: 1, backgroundColor: theme.colors.background },

	container: { flex: 1, backgroundColor: theme.colors.background },

	avatarWrapper: {
		alignItems: "center",
		marginBottom: theme.space.lg,
		marginTop: theme.space.md,
	},

	avatar: {
		width: 120,
		height: 120,
		borderRadius: 60,
		overflow: "hidden",
		elevation: 2,
		shadowColor: "#000",
		shadowOpacity: 0.08,
		shadowOffset: { width: 0, height: 2 },
	},

	avatarPlaceholder: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: theme.colors.inputBorder,
	},

	plus: { fontSize: 32, color: theme.colors.textMuted },

	avatarHint: {
		marginTop: theme.space.xs,
		fontSize: theme.fontSize.xs,
		color: theme.colors.textMuted,
	},

	button: {
		backgroundColor: theme.colors.primary,
		paddingVertical: theme.space.md,
		borderRadius: theme.radius.md,
		marginTop: theme.space.lg,
		alignItems: "center",
	},

	buttonTxt: {
		color: "#fff",
		fontWeight: "600",
		fontSize: theme.fontSize.md,
	},
});
