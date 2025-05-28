import FormField from "@/src/components/form/FormField";
import { updateUserById } from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
// import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function EditProfileScreen() {
	const router = useRouter();
	const user = useAuthStore((s) => s.user);
	const updateUser = useAuthStore((s) => s.updateUser);
	const isAuth = useAuthStore((s) => s.isAuthenticated);

	const [username, setUsername] = useState(user.username);
	const [bio, setBio] = useState(user.bio || "");
	const [avatar, setAvatar] = useState(user.profilePictureUrl || "");
	const [saving, setSaving] = useState(false);

	/* ---------- bail-out if logged out ---------- */
	useEffect(() => {
		if (!isAuth || !user) {
			router.replace("/(auth)/login");
		}
	}, [isAuth, user, router]);

	if (!isAuth || !user) {
		// while redirecting – render nothing to avoid touching null.user
		return <View style={styles.blank} />;
	}

	/* pick image from gallery (local uri only – upload handled server-side later) */
	// const pickAvatar = async () => {
	// 	const res = await ImagePicker.launchImageLibraryAsync({
	// 		mediaTypes: ImagePicker.MediaTypeOptions.Images,
	// 		quality: 0.7,
	// 	});
	// 	if (!res.canceled) setAvatar(res.assets[0].uri);
	// };

	const save = async () => {
		try {
			setSaving(true);
			const payload = { username, bio, profilePictureUrl: avatar };
			const updated = await updateUserById(true, payload);
			await updateUser(updated);
			router.back();
		} catch (e) {
			Alert.alert("Error", e.message);
		} finally {
			setSaving(false);
		}
	};

	return (
		<ScrollView style={styles.container} contentContainerStyle={{ padding: theme.space.md }}>
			{/* avatar pick */}
			<TouchableOpacity
				style={styles.avatarWrapper}
				// onPress={pickAvatar}
			>
				{avatar ? (
					<Image source={{ uri: avatar }} style={styles.avatar} />
				) : (
					<View style={[styles.avatar, styles.avatarPlaceholder]}>
						<Text style={{ fontSize: 32, color: theme.colors.textMuted }}>+</Text>
					</View>
				)}
				<Text style={styles.avatarHint}>Tap to change avatar</Text>
			</TouchableOpacity>

			<FormField label="Username" value={username} onChange={setUsername} />
			<FormField label="Bio" value={bio} onChange={setBio} multiline />

			<TouchableOpacity style={styles.button} onPress={save} disabled={saving}>
				<Text style={styles.buttonTxt}>{saving ? "Saving…" : "Save Changes"}</Text>
			</TouchableOpacity>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: theme.colors.background },
	avatarWrapper: { alignItems: "center", marginBottom: theme.space.lg },
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
	buttonTxt: { color: "#fff", fontWeight: "600", fontSize: theme.fontSize.md },
});
