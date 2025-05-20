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

import AuthInput from "@/src/components/AuthInput";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { toast } from "@/src/utils/toast";
import {
	validateEmail,
	validatePassword,
	validateUsername,
} from "@/src/utils/validation";

export default function RegisterScreen() {
	/* ─── local form state ─── */
	const [username, setUsername] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [errors, setErrors] = useState({
		username: null,
		email: null,
		password: null,
	});
	const [submitting, setSubmitting] = useState(false);

	const router = useRouter();
	const register = useAuthStore((s) => s.register);

	/* ─── inline validation handlers ─── */
	const onUsername = (val) => {
		setUsername(val);
		setErrors((e) => ({ ...e, username: validateUsername(val) }));
	};
	const onEmail = (val) => {
		setEmail(val);
		setErrors((e) => ({ ...e, email: validateEmail(val) }));
	};
	const onPassword = (val) => {
		setPassword(val);
		setErrors((e) => ({ ...e, password: validatePassword(val) }));
	};

	const formValid =
		!errors.username &&
		!errors.email &&
		!errors.password &&
		username &&
		email &&
		password;

	/* ─── submit ─── */
	const handleRegister = async () => {
		setSubmitting(true);
		try {
			const res = await register(username.trim(), email.trim(), password);
			if (res?.success) {
				toast({ type: "success", title: "Almost there!", msg: res.message });
				router.replace({
					pathname: "/(auth)/verify-email",
					params: { email },
				});
			} else {
				toast({
					type: "danger",
					title: "Oops",
					msg: res?.message || "Failed.",
				});
			}
		} catch (err) {
			toast({ type: "danger", title: "Error", msg: err.message });
		} finally {
			setSubmitting(false);
		}
	};

	/* ─── render ─── */
	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === "ios" ? "padding" : "height"}
			style={styles.container}
		>
			<AuthInput
				value={username}
				onChangeText={onUsername}
				placeholder="Username"
				error={errors.username}
			/>
			<AuthInput
				value={email}
				onChangeText={onEmail}
				placeholder="Email"
				keyboardType="email-address"
				error={errors.email}
			/>
			<AuthInput
				value={password}
				onChangeText={onPassword}
				placeholder="Password"
				secureTextEntry
				error={errors.password}
			/>

			<TouchableOpacity
				onPress={handleRegister}
				disabled={!formValid || submitting}
				style={[styles.button, (!formValid || submitting) && { opacity: 0.5 }]}
			>
				{submitting ? (
					<ActivityIndicator color="#fff" />
				) : (
					<Text style={styles.buttonText}>Register</Text>
				)}
			</TouchableOpacity>

			<TouchableOpacity
				onPress={() => router.push("/login")}
				style={{ marginTop: theme.space.md }}
			>
				<Text style={{ textAlign: "center", color: theme.colors.link }}>
					Already have an account? Login
				</Text>
			</TouchableOpacity>
		</KeyboardAvoidingView>
	);
}

/* ─── styles ─── */
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
	buttonText: {
		color: "#fff",
		fontSize: 16,
	},
});
