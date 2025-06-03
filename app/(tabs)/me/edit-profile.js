// import FormField from "@/src/components/form/FormField";
// import { updateUserById } from "@/src/services/api";
// import { useAuthStore } from "@/src/stores/auth";
// import { theme } from "@/src/theme";
// // import * as ImagePicker from "expo-image-picker";
// import { useRouter } from "expo-router";
// import { useEffect, useState } from "react";
// import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// export default function EditProfileScreen() {
// 	const router = useRouter();
// 	const user = useAuthStore((s) => s.user);
// 	const updateUser = useAuthStore((s) => s.updateUser);
// 	const isAuth = useAuthStore((s) => s.isAuthenticated);

// 	const [username, setUsername] = useState(user.username);
// 	const [bio, setBio] = useState(user.bio || "");
// 	const [avatar, setAvatar] = useState(user.profilePictureUrl || "");
// 	const [saving, setSaving] = useState(false);

// 	/* ---------- bail-out if logged out ---------- */
// 	useEffect(() => {
// 		if (!isAuth || !user) {
// 			router.replace("/(auth)/login");
// 		}
// 	}, [isAuth, user, router]);

// 	if (!isAuth || !user) {
// 		// while redirecting – render nothing to avoid touching null.user
// 		return <View style={styles.blank} />;
// 	}

// 	const save = async () => {
// 		try {
// 			setSaving(true);
// 			const payload = { username, bio, profilePictureUrl: avatar };
// 			const updated = await updateUserById(true, payload);
// 			await updateUser(updated);
// 			router.back();
// 		} catch (e) {
// 			Alert.alert("Error", e.message);
// 		} finally {
// 			setSaving(false);
// 		}
// 	};

// 	return (
// 		<ScrollView style={styles.container} contentContainerStyle={{ padding: theme.space.md }}>
// 			{/* avatar pick */}
// 			<TouchableOpacity
// 				style={styles.avatarWrapper}
// 				// onPress={pickAvatar}
// 			>
// 				{avatar ? (
// 					<Image source={{ uri: avatar }} style={styles.avatar} />
// 				) : (
// 					<View style={[styles.avatar, styles.avatarPlaceholder]}>
// 						<Text style={{ fontSize: 32, color: theme.colors.textMuted }}>+</Text>
// 					</View>
// 				)}
// 				<Text style={styles.avatarHint}>Tap to change avatar</Text>
// 			</TouchableOpacity>

// 			<FormField label="Username" value={username} onChange={setUsername} />
// 			<FormField label="Bio" value={bio} onChange={setBio} multiline />

// 			<TouchableOpacity style={styles.button} onPress={save} disabled={saving}>
// 				<Text style={styles.buttonTxt}>{saving ? "Saving…" : "Save Changes"}</Text>
// 			</TouchableOpacity>
// 		</ScrollView>
// 	);
// }

// const styles = StyleSheet.create({
// 	container: { flex: 1, backgroundColor: theme.colors.background },
// 	avatarWrapper: { alignItems: "center", marginBottom: theme.space.lg },
// 	avatar: {
// 		width: 120,
// 		height: 120,
// 		borderRadius: 60,
// 		overflow: "hidden",
// 		elevation: 2,
// 		shadowColor: "#000",
// 		shadowOpacity: 0.08,
// 		shadowOffset: { width: 0, height: 2 },
// 	},
// 	avatarPlaceholder: {
// 		flex: 1,
// 		justifyContent: "center",
// 		alignItems: "center",
// 		backgroundColor: theme.colors.inputBorder,
// 	},
// 	avatarHint: {
// 		marginTop: theme.space.xs,
// 		fontSize: theme.fontSize.xs,
// 		color: theme.colors.textMuted,
// 	},
// 	button: {
// 		backgroundColor: theme.colors.primary,
// 		paddingVertical: theme.space.md,
// 		borderRadius: theme.radius.md,
// 		marginTop: theme.space.lg,
// 		alignItems: "center",
// 	},
// 	buttonTxt: { color: "#fff", fontWeight: "600", fontSize: theme.fontSize.md },
// });
import FormField from "@/src/components/form/FormField";
import Avatar from "@/src/components/ui/Avatar";
import useRequireAuth from "@/src/hooks/useRequireAuth";
import { updateUserById, uploadProfilePhoto } from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function EditProfileScreen() {
	/* guard */
	const ready = useRequireAuth();
	if (!ready) return <View style={styles.blank} />;

	/* ---------- auth & nav ---------- */
	const router = useRouter();
	const authStore = useAuthStore();
	const user = authStore.user;
	const isAuth = authStore.isAuthenticated;

	const [username, setUsername] = useState(user?.username || "");
	const [bio, setBio] = useState(user?.bio || "");
	const [avatarId, setAvatarId] = useState(user?.profilePictureUrl || "");
	const [saving, setSaving] = useState(false);
	const [avatarUploading, setAvatarUploading] = useState(false); // NEW

	/* ---------- redirect if not logged-in ---------- */
	useEffect(() => {
		if (!isAuth) router.replace("/(auth)/login");
	}, [isAuth, router]);
	if (!isAuth) return <View style={styles.blank} />;

	/* ---------- pick + upload avatar ---------- */
	const pickAvatar = async () => {
		const res = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ImagePicker.MediaTypeOptions.Images,
			allowsEditing: true,
			aspect: [1, 1],
			quality: 0.8,
		});
		if (res.canceled) return;

		try {
			setAvatarUploading(true);
			const updated = await uploadProfilePhoto(res.assets[0].uri);
			const freshUser = updated.user ?? updated;
			authStore.updateUser(freshUser);
			setAvatarId(freshUser.profilePictureUrl || avatarId);
		} catch (e) {
			console.warn("Avatar upload failed:", e);
			Alert.alert("Upload failed", e.message);
		} finally {
			setAvatarUploading(false);
		}
	};

	/* ---------- save username / bio ---------- */
	const save = async () => {
		try {
			setSaving(true);
			const payload = { username, bio, profilePictureUrl: avatarId };
			const updated = await updateUserById(true, payload);
			authStore.updateUser(updated);
			router.back();
			// router.push("/(tabs)/me/profile");
		} catch (e) {
			Alert.alert("Error", e.message);
		} finally {
			setSaving(false);
		}
	};

	/* ---------- render ---------- */
	return (
		<ScrollView style={styles.container} contentContainerStyle={{ padding: theme.space.md }}>
			{/* avatar picker */}
			<TouchableOpacity style={styles.avatarWrapper} onPress={pickAvatar} disabled={avatarUploading}>
				<Avatar photoId={avatarId} size={120} />
				{avatarUploading && (
					<ActivityIndicator style={StyleSheet.absoluteFill} size="large" color={theme.colors.primary} />
				)}
				<Text style={styles.avatarHint}>Tap to change avatar</Text>
			</TouchableOpacity>

			{/* form fields */}
			<FormField label="Username" value={username} onChange={setUsername} />
			<FormField label="Bio" value={bio} onChange={setBio} multiline />

			<TouchableOpacity style={styles.button} onPress={save} disabled={saving}>
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
