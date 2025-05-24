import { theme } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
/**
 * StarRating component allows users to select a rating from 1 to 5 stars.
 * @param {Object} props - Component properties.
 * @param {number} props.rating - Current rating value (1-5).
 * @param {function} props.onRatingChange - Callback function to handle rating changes.
 */

export const StarRating = ({ rating, onRatingChange }) => {
	return (
		<View style={{ flexDirection: "row", marginVertical: theme.space.sm }}>
			{[1, 2, 3, 4, 5].map((star) => (
				<Pressable
					key={star}
					onPress={() => onRatingChange(star)}
					style={{ marginRight: theme.space.xs }}
				>
					<Ionicons
						name={rating >= star ? "star" : "star-outline"}
						size={24}
						color={rating >= star ? "#FCD34D" : theme.colors.textMuted}
					/>
				</Pressable>
			))}
		</View>
	);
};
