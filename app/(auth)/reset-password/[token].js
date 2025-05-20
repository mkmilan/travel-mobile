import AuthInput from "@/src/components/AuthInput";
import { resetPasswordRequest } from "@/src/services/auth";
import { theme } from "@/src/theme";
import { toast } from "@/src/utils/toast";
import { validatePassword } from "@/src/utils/validation";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	StyleSheet,
	Text,
	TouchableOpacity,
} from "react-native";

export default function ResetPassword() {
	const { token } = useLocalSearchParams();
	const router = useRouter();

	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [errors, setErrors] = useState({ password: null, confirm: null });
	const [saving, setSaving] = useState(false);

	const onPassword = (val) => {
		setPassword(val);
		setErrors((e) => ({ ...e, password: validatePassword(val) }));
	};
	const onConfirm = (val) => {
		setConfirm(val);
		setErrors((e) => ({
			...e,
			confirm: val === password ? null : "Passwords do not match",
		}));
	};

	const formValid = !errors.password && !errors.confirm && password && confirm;

	const handleSave = async () => {
		setSaving(true);
		try {
			const res = await resetPasswordRequest(token, password);
			toast({ type: "success", title: "Done!", msg: res.message });
			router.replace("/(auth)/login");
		} catch (err) {
			toast({ type: "danger", title: "Error", msg: err.message });
		} finally {
			setSaving(false);
		}
	};

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === "ios" ? "padding" : "height"}
			style={styles.container}
		>
			<AuthInput
				value={password}
				onChangeText={onPassword}
				placeholder="New Password"
				secureTextEntry
				error={errors.password}
			/>
			<AuthInput
				value={confirm}
				onChangeText={onConfirm}
				placeholder="Confirm Password"
				secureTextEntry
				error={errors.confirm}
			/>

			<TouchableOpacity
				onPress={handleSave}
				disabled={!formValid || saving}
				style={[styles.button, (!formValid || saving) && { opacity: 0.5 }]}
			>
				{saving ? (
					<ActivityIndicator color="#fff" />
				) : (
					<Text style={styles.buttonText}>Reset Password</Text>
				)}
			</TouchableOpacity>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: "center",
		padding: theme.space.lg,
		backgroundColor: theme.colors.background,
	},
	button: {
		backgroundColor: theme.colors.primary,
		padding: theme.space.md,
		borderRadius: theme.radius.md,
		alignItems: "center",
	},
	buttonText: { color: "#fff", fontSize: 16 },
});
