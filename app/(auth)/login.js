import AuthInput from "@/src/components/AuthInput";
import { loginRequest } from "@/src/services/auth";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity } from "react-native";

export default function LoginScreen() {
	// local form state
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState(null);
	const [submitting, setSubmitting] = useState(false);
	const router = useRouter();
	// Zustand actions
	const login = useAuthStore((s) => s.login);

	async function handleLogin() {
		setSubmitting(true);
		setError(null);
		try {
			const user = await loginRequest(email, password);
			await login(user); // persists to SecureStore + Zustand

			// router.replace("/(tabs)/feed"); // go to main app
		} catch (err) {
			setError(err.message);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === "ios" ? "padding" : "height"}
			style={{ flex: 1, justifyContent: "center", padding: 20 }}
		>
			<AuthInput value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" />
			<AuthInput value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />

			<TouchableOpacity
				onPress={handleLogin}
				style={{
					backgroundColor: theme.colors.primary,
					padding: theme.space.md,
					borderRadius: theme.radius.md,
					opacity: submitting ? 0.7 : 1,
				}}
				disabled={submitting}
			>
				{/* <Text
					style={{
						color: "#fff",
						textAlign: "center",
						fontSize: theme.fontSize.md,
					}}
				>
					Login
				</Text> */}
				{submitting ? (
					<ActivityIndicator color="#fff" />
				) : (
					<Text
						style={{
							color: "#fff",
							textAlign: "center",
							fontSize: theme.fontSize.md,
						}}
					>
						Login
					</Text>
				)}
			</TouchableOpacity>
			{error && <Text style={styles.error}>{error}</Text>}
			<TouchableOpacity onPress={() => router.push("/register")} style={{ marginTop: theme.space.md }}>
				<Text style={{ textAlign: "center", color: "blue" }}>Don't have an account? Register</Text>
			</TouchableOpacity>

			<TouchableOpacity onPress={() => router.push("/forgot-password")} style={{ marginTop: theme.space.sm }}>
				<Text style={{ textAlign: "center", color: theme.colors.link }}>Forgot Password?</Text>
			</TouchableOpacity>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, padding: 24, justifyContent: "center" },
	title: { fontSize: 24, marginBottom: 24, textAlign: "center" },
	input: {
		borderWidth: 1,
		borderColor: "#ccc",
		borderRadius: 6,
		padding: 12,
		marginBottom: 16,
		color: "#fff",
	},
	error: { color: "red", marginBottom: 12, marginTop: 12 },
});
