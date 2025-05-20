import { theme } from "@/src/theme";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";

export default function VerifyEmailScreen() {
	const { email } = useLocalSearchParams(); // email passed as query param
	const router = useRouter();

	return (
		<View
			style={{
				flex: 1,
				justifyContent: "center",
				padding: theme.space.lg,
				backgroundColor: theme.colors.background,
			}}
		>
			<Text
				style={{
					fontSize: theme.fontSize.lg,
					textAlign: "center",
					marginBottom: theme.space.lg,
				}}
			>
				🎉 Registration successful!
			</Text>

			<Text
				style={{
					textAlign: "center",
					lineHeight: 22,
					marginBottom: theme.space.lg,
				}}
			>
				We’ve sent a verification link to{" "}
				<Text style={{ fontWeight: "bold" }}>{email}</Text>.{"\n"}
				Please confirm your e-mail, then log in.
			</Text>

			<TouchableOpacity onPress={() => router.replace("/(auth)/login")}>
				<Text style={{ textAlign: "center", color: theme.colors.link }}>
					Go to Login
				</Text>
			</TouchableOpacity>
		</View>
	);
}
