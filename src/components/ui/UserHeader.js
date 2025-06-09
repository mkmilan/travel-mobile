import { theme } from "@/src/theme";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Avatar from "./Avatar";

const UserHeader = ({ user, onPress, showLocation = false, size = 28, navigateOnPress = false }) => {
	const handlePress = (event) => {
		event?.stopPropagation?.();
		if (onPress) {
			onPress(event);
		} else if (navigateOnPress && user?._id) {
			router.push(`/user/${user._id}`);
		}
	};
	const isPressable = !!onPress || navigateOnPress;

	const Container = isPressable ? Pressable : View;
	return (
		<Container
			{...(isPressable ? { onPress: handlePress } : {})}
			style={{ flexDirection: "row", alignItems: "center", marginBottom: theme.space.sm }}
		>
			<Avatar user={user} profilePictureUrl={user.profilePictureUrl} size={size} />
			<View style={{ marginLeft: theme.space.sm }}>
				<Text style={{ color: theme.colors.text, fontWeight: "600", fontSize: theme.fontSize.sm }}>
					{user.username || "Anonymous"}
				</Text>
				{showLocation && user?.city && user?.country && (
					<Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.xs }}>
						{user.city}, {user.country}
					</Text>
				)}
			</View>
		</Container>
	);
};

export default UserHeader;
