import { theme } from "@/src/theme";
import { usePhotoSource } from "@/src/hooks/usePhotoSource";
import { useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import UserHeader from "./ui/UserHeader";

/** Shared presentation; navigation and owner actions stay with each screen. */
export default function RecommendationCard({ rec, photoRefreshIdentity, onPress, onLongPress }) {
	const { getPhotoSource, mediaKey } = usePhotoSource();
	// Recommendation payloads supply GridFS IDs, not public URLs. Reuse authenticated image
	// requests; never fetch recommendation details just to render this card.
	const photoId = Array.isArray(rec.photos)
		? rec.photos.find((id) => typeof id === "string" && /^[a-f\d]{24}$/i.test(id))
		: undefined;
	const source = photoId ? getPhotoSource(photoId) : undefined;
	const imageKey = JSON.stringify([rec._id, mediaKey, source?.uri]);
	const currentImage = useRef(null);
	// A fresh identity also rejects late callbacks after A → B → A reuse.
	if (currentImage.current?.key !== imageKey || currentImage.current?.refreshIdentity !== photoRefreshIdentity) {
		currentImage.current = {
			key: imageKey,
			refreshIdentity: photoRefreshIdentity,
			generation: (currentImage.current?.generation || 0) + 1,
		};
	}
	const imageIdentity = currentImage.current;
	const [failedImage, setFailedImage] = useState(null);
	const showImage = source && failedImage !== imageIdentity;
	const category = rec.primaryCategory
		? rec.primaryCategory.charAt(0).toUpperCase() + rec.primaryCategory.slice(1)
		: undefined;
	return (
		<Pressable style={styles.card} onPress={onPress} onLongPress={onLongPress}>
			<UserHeader user={rec.user || {}} showLocation={true} size={30} />
			<View style={styles.body}>
				<View style={styles.content}>
					<Text style={styles.name}>{rec.name || "Unnamed place"}</Text>
					<View style={styles.meta}>
						{category && <Text style={styles.category}>{category}</Text>}
						<View style={styles.stars} accessibilityLabel={`${rec.rating || 0} out of 5 stars`}>
							{[1, 2, 3, 4, 5].map((star) => (
								<Ionicons key={star} name={rec.rating >= star ? "star" : "star-outline"}
									size={14} color={rec.rating >= star ? "#FCD34D" : theme.colors.textMuted} />
							))}
						</View>
					</View>
					{rec.description ? <Text numberOfLines={2} style={styles.description}>{rec.description}</Text> : null}
				</View>
				{showImage && <Image key={JSON.stringify([imageKey, imageIdentity.generation])} source={source} style={styles.thumbnail}
					resizeMode="cover" pointerEvents="none" accessible={false}
					onError={() => {
						if (currentImage.current === imageIdentity) setFailedImage(imageIdentity);
					}} />}
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: { backgroundColor: theme.colors.inputBackground, borderRadius: theme.radius.md,
		padding: theme.space.md, marginBottom: theme.space.md, shadowColor: "#000",
		shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
	body: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
	content: { flex: 1, minWidth: 0 },
	thumbnail: { width: 88, height: 88, borderRadius: theme.radius.sm },
	name: { fontSize: theme.fontSize.md, fontWeight: "600", color: theme.colors.text },
	meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 8 },
	category: { fontSize: theme.fontSize.xs, color: theme.colors.primary,
		backgroundColor: theme.colors.primary + "20", paddingHorizontal: theme.space.xs,
		borderRadius: theme.radius.sm, flexShrink: 1 },
	stars: { flexDirection: "row", gap: 1 },
	description: { fontSize: theme.fontSize.sm, color: theme.colors.textMuted, marginTop: 8 },
});
