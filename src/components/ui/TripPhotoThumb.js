import { usePhotoSource } from "@/src/hooks/usePhotoSource";
import { theme } from "@/src/theme";
import { Image, Pressable, StyleSheet } from "react-native";

export default function TripPhotoThumb({ photoId, size = 80, onPress }) {
	const { getPhotoSource, mediaKey } = usePhotoSource();
	return (
		<Pressable onPress={onPress} style={[styles.wrapper, { width: size, height: size }]}>
			<Image key={`${mediaKey}-${photoId}`} source={getPhotoSource(photoId)} style={{ width: size, height: size, borderRadius: 4 }} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	wrapper: {
		marginRight: theme.space.sm,
		marginBottom: theme.space.sm,
	},
});
