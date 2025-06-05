import { buildPhotoUrl } from "@/src/services/api";
import { theme } from "@/src/theme";
import { Image, Pressable, StyleSheet } from "react-native";

export default function TripPhotoThumb({ photoId, size = 80, onPress }) {
	const uri = photoId.startsWith("file://") ? photoId : buildPhotoUrl(photoId);
	return (
		<Pressable onPress={onPress} style={[styles.wrapper, { width: size, height: size }]}>
			<Image source={{ uri }} style={{ width: size, height: size, borderRadius: 4 }} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	wrapper: {
		marginRight: theme.space.sm,
		marginBottom: theme.space.sm,
	},
});
