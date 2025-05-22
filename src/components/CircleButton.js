// src/components/CircleButton.js
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity } from "react-native";

export default function CircleButton({
	icon,
	color,
	size = 28,
	onPress,
	style = {},
}) {
	return (
		<TouchableOpacity
			onPress={onPress}
			style={[
				{
					borderRadius: 50,
					padding: 14,
					backgroundColor: color,
					justifyContent: "center",
					alignItems: "center",
				},
				style,
			]}
		>
			<Ionicons
				name={icon}
				size={size}
				color="#fff"
			/>
		</TouchableOpacity>
	);
}
