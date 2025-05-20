import { View } from "react-native";

import { useThemeColor } from "@/src/hooks/useThemeColor";

export function ThemedView({ style, lightColor, darkColor, ...otherProps }) {
	const backgroundColor = useThemeColor(
		{ light: lightColor, dark: darkColor },
		"background"
	);

	return (
		<View
			style={[{ backgroundColor }, style]}
			{...otherProps}
		/>
	);
}
