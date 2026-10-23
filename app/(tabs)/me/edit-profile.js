import FormField from "@/src/components/form/FormField";
import Avatar from "@/src/components/ui/Avatar";
import useProfileContext from "@/src/hooks/useProfileContext";
import useRequireAuth from "@/src/hooks/useRequireAuth";
import { getUserById, updateUserById, uploadProfilePhoto } from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
	const dirtyFields = useRef(new Set());
	const profileReady = useRef(false);

	const [username, setUsername] = useState(user?.username || "");
	const [bio, setBio] = useState(user?.bio || "");
	const [avatarId, setAvatarId] = useState(user?.profilePictureUrl || "");
	const [saving, setSaving] = useState(false);
	const [avatarUploading, setAvatarUploading] = useState(false);
	const [city, setCity] = useState(user?.city || "");
	const [country, setCountry] = useState(user?.country || "");
	const [profileStatus, setProfileStatus] = useState("loading");
	const [profileError, setProfileError] = useState("");
	const [loadAttempt, setLoadAttempt] = useState(0);

	// Login data is deliberately smaller than the full profile. Never allow
	// its missing optional fields to become destructive blank-save defaults.
	useEffect(() => {
		profileReady.current = false;
		if (!ready || !session || !context.isCurrent() || !authStore.isSessionCurrent(session)) return;
		let active = true;
		const isCurrent = () => active && context.isCurrent()
			&& useAuthStore.getState().isSessionCurrent(session);
		setProfileStatus("loading");
		setProfileError("");
		(async () => {
			try {
				const profile = await getUserById(session.userId);
				if (!isCurrent()) return;
				if (!profile || String(profile._id) !== String(session.userId)) {
					throw new Error("Could not load your profile. Please retry.");
				}
				// A slow load/retry must not replace text already typed by the user.
				for (const [field, setter] of Object.entries({
					username: setUsername, bio: setBio, city: setCity,
					country: setCountry, profilePictureUrl: setAvatarId,
				})) {
					if (!dirtyFields.current.has(field)) setter(profile[field] ?? "");
				}
				profileReady.current = true;
				setProfileStatus("ready");
			} catch (error) {
				if (!isCurrent()) return;
				setProfileError(error.message || "Could not load your profile.");
				setProfileStatus("error");
			}
		})();
		return () => { active = false; profileReady.current = false; };
	}, [ready, session, context, loadAttempt]);

	const changeField = (field, setter) => (value) => {
		dirtyFields.current.add(field);
		setter(value);
	};
	const profileLoaded = profileStatus === "ready";

	if (!ready || !user || !context.isCurrent() || !authStore.isSessionCurrent(session)) return <View style={styles.blank} />;

	// One mutation at a time, including the native picker (before React can
	// rerender disabled buttons). Old-render handlers keep their original login.
	const begin = () => {
		if (!profileLoaded || !profileReady.current || pending.current || !context.isCurrent() || !authStore.isSessionCurrent(session)) return null;
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
			{profileStatus === "loading" && (
				<View accessibilityLiveRegion="polite">
					<ActivityIndicator color={theme.colors.primary} />
					<Text style={styles.loadMessage}>Loading your profile…</Text>
				</View>
			)}
			{profileStatus === "error" && (
				<View accessibilityLiveRegion="polite">
					<Text style={styles.loadMessage}>{profileError} Your changes have not been saved.</Text>
					<TouchableOpacity accessibilityRole="button" onPress={() => setLoadAttempt(value => value + 1)} style={styles.retry}>
						<Text style={styles.buttonTxt}>Retry loading profile</Text>
					</TouchableOpacity>
				</View>
			)}
			{/* avatar picker */}
			<TouchableOpacity style={styles.avatarWrapper} onPress={pickAvatar} disabled={!profileLoaded || avatarUploading || saving}>
				<Avatar photoId={avatarId} size={120} />
				{avatarUploading && (
					<ActivityIndicator style={StyleSheet.absoluteFill} size="large" color={theme.colors.primary} />
				)}
				<Text style={styles.avatarHint}>Tap to change avatar</Text>
			</TouchableOpacity>

			{/* form fields */}
			<FormField label="Username" value={username} onChange={changeField("username", setUsername)} />
			<FormField label="City" value={city} onChange={changeField("city", setCity)} />
			<FormField label="Country" value={country} onChange={changeField("country", setCountry)} />
			<FormField label="Bio" value={bio} onChange={changeField("bio", setBio)} multiline />

			<TouchableOpacity style={[styles.button, !profileLoaded && styles.disabled]} onPress={save} disabled={!profileLoaded || saving || avatarUploading}>
				<Text style={styles.buttonTxt}>{saving ? "Saving…" : "Save Changes"}</Text>
			</TouchableOpacity>
		</ScrollView>
	);
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
	blank: { flex: 1, backgroundColor: theme.colors.background },

	container: { flex: 1, backgroundColor: theme.colors.background },
	loadMessage: { color: theme.colors.text, marginVertical: theme.space.sm },
	retry: { backgroundColor: theme.colors.primary, padding: theme.space.md, borderRadius: theme.radius.md, alignItems: "center", minHeight: 48 },
	disabled: { opacity: 0.5 },

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
