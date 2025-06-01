// src/components/ui/Avatar.js
import { buildPhotoUrl } from "@/src/services/api"; // helper added earlier
import { theme } from "@/src/theme";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * Re-usable round avatar.
 *
 * Props
 * -----
 * - user      – user object (expects .profilePictureUrl & .username)
 * - photoId   – override user; raw GridFS id string
 * - size      – diameter in px (default 32)
 * - onPress   – optional press handler
 * - style     – extra style for the outer wrapper
 */
export default function Avatar({ user, photoId, size = 32, onPress, style }) {
	/* resolve source ---------------------------------------------------- */
	const id = photoId || user?.profilePictureUrl || "";
	const uri = buildPhotoUrl(id);
	const name = user?.username || "";

	/* styles ------------------------------------------------------------ */
	const diameter = size;
	const sx = StyleSheet.compose(
		{
			width: diameter,
			height: diameter,
			borderRadius: diameter / 2,
			overflow: "hidden",
			backgroundColor: theme.colors.inputBorder,
			alignItems: "center",
			justifyContent: "center",
		},
		style
	);

	/* placeholder (first letter) --------------------------------------- */
	const renderFallback = () => (
		<View style={sx}>
			<Text style={{ color: theme.colors.textMuted, fontSize: diameter / 2 }}>
				{name ? name.charAt(0).toUpperCase() : "?"}
			</Text>
		</View>
	);

	const Img = uri ? <Image source={{ uri }} style={sx} /> : renderFallback();

	/* wrap with touchable if needed ------------------------------------ */
	return onPress ? (
		<TouchableOpacity onPress={onPress} activeOpacity={0.8}>
			{Img}
		</TouchableOpacity>
	) : (
		Img
	);
}
