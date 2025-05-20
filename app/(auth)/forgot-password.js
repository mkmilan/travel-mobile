import AuthInput from "@/src/components/AuthInput";
import { forgotPasswordRequest } from "@/src/services/auth";
import { theme } from "@/src/theme";
import { toast } from "@/src/utils/toast";
import { validateEmail } from "@/src/utils/validation";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	StyleSheet,
	Text,
	TouchableOpacity,
} from "react-native";

export default function ForgotPassword() {
	const [email, setEmail] = useState("");
	const [error, setError] = useState(null);
	const [sending, setSending] = useState(false);
	const [showNotice, setShowNotice] = useState(false);
	const router = useRouter();

	const onEmail = (val) => {
		setEmail(val);
		setError(validateEmail(val));
	};

	const formValid = !error && email;

	const handleSubmit = async () => {
		setSending(true);
		try {
			const res = await forgotPasswordRequest(email.trim());
			toast({ type: "success", title: "Check your inbox!", msg: res.message });
			// router.replace("/(auth)/login");
			setShowNotice(true);
		} catch (err) {
			toast({ type: "danger", title: "Error", msg: err.message });
		} finally {
			setSending(false);
		}
	};

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === "ios" ? "padding" : "height"}
			style={styles.container}
		>
			{showNotice && (
				<Text style={{ textAlign: "center", marginBottom: theme.space.md }}>
					If an account with that e-mail exists, a reset link has been sent.
				</Text>
			)}
			<AuthInput
				value={email}
				onChangeText={onEmail}
				placeholder="Email"
				keyboardType="email-address"
				error={error}
			/>

			<TouchableOpacity
				onPress={handleSubmit}
				disabled={!formValid || sending}
				style={[styles.button, (!formValid || sending) && { opacity: 0.5 }]}
			>
				{sending ? (
					<ActivityIndicator color="#fff" />
				) : (
					<Text style={styles.buttonText}>Send Reset Link</Text>
				)}
			</TouchableOpacity>

			<TouchableOpacity
				onPress={() => router.back()}
				style={{ marginTop: theme.space.md }}
			>
				<Text style={{ textAlign: "center", color: theme.colors.link }}>
					Back to Login
				</Text>
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
