import useTripSocial from "@/src/hooks/useTripSocial";
import { Text } from "react-native";

/**
 * Props
 *  trip   – raw trip object (required)
 *  type   – 'likes' | 'comments' | 'recs'  (required)
 *
 * Usage:
 *   <SocialCount trip={trip} type="likes" />
 */
export default function SocialCount({ trip, type }) {
	const { likesCount, commentsCount, recommendationCount } = useTripSocial(trip);

	let value = 0;
	if (type === "likes") value = likesCount;
	if (type === "comments") value = commentsCount;
	if (type === "recs") value = recommendationCount;

	return <Text>{value}</Text>;
}
