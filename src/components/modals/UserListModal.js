import { followUser, getUserFollowers, getUserFollowing, unfollowUser } from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import Avatar from "../ui/Avatar";
import BottomModal from "./BottomModal";
import ModalHeader from "./ModalHeader";

export default function UserListModal({ visible, stat, userId, onClose }) {
	const [loading, setLoading] = useState(false);
	const [users, setUsers] = useState([]);
	const [page, setPage] = useState(1);
	const [hasNext, setHasNext] = useState(true);
	const [refreshing, setRefreshing] = useState(false);

	const authUser = useAuthStore((s) => s.user);

	useEffect(() => {
		if (!visible) return;
		setUsers([]);
		setPage(1);
		setHasNext(true);
		loadUsers(1, true);
	}, [visible, stat, userId]);

	const loadUsers = async (pageToLoad = 1, replace = false) => {
		setLoading(true);
		try {
			let res;
			if (stat === "Followers") {
				res = await getUserFollowers(userId, pageToLoad, 15);
			} else if (stat === "Following") {
				res = await getUserFollowing(userId, pageToLoad, 15);
			} else {
				setUsers([]);
				setHasNext(false);
				return;
			}
			setUsers((prev) => (replace ? res.data : [...prev, ...res.data]));
			setHasNext(pageToLoad < res.totalPages);
			setPage(pageToLoad + 1);
		} catch (e) {
			setUsers([]);
			setHasNext(false);
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	};

	const handleFollowToggle = async (targetUser) => {
		const isFollowing = targetUser.followers?.some((id) => id === authUser._id);
		try {
			if (isFollowing) {
				await unfollowUser(targetUser._id);
			} else {
				await followUser(targetUser._id);
			}
			// Optimistically update UI
			setUsers((prev) =>
				prev.map((u) =>
					u._id === targetUser._id
						? {
								...u,
								followers: isFollowing
									? u.followers.filter((id) => id !== authUser._id)
									: [...u.followers, authUser._id],
						  }
						: u
				)
			);
		} catch (e) {
			// Optionally show error
		}
	};

	const renderItem = ({ item }) => {
		const isFollowing = item.followers?.some((id) => id === authUser._id);
		return (
			<View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10 }}>
				<Avatar user={item} size={48} style={{ marginRight: 12 }} />
				<Text style={{ flex: 1, fontSize: 16 }}>{item.username}</Text>
				{item._id !== authUser._id && (
					<Text
						onPress={() => handleFollowToggle(item)}
						style={{
							paddingHorizontal: 16,
							paddingVertical: 6,
							borderRadius: 16,
							backgroundColor: isFollowing ? theme.colors.inputBorder : theme.colors.primary,
							color: isFollowing ? theme.colors.text : "#fff",
							fontWeight: "600",
							overflow: "hidden",
						}}
					>
						{isFollowing ? "Following" : "Follow"}
					</Text>
				)}
			</View>
		);
	};

	return (
		<BottomModal visible={visible} onClose={onClose}>
			<ModalHeader title={stat} onClose={onClose} />
			{loading && users.length === 0 ? (
				<ActivityIndicator style={{ marginTop: 32 }} />
			) : (
				<FlatList
					data={users}
					keyExtractor={(u) => u._id}
					renderItem={renderItem}
					onEndReached={() => hasNext && loadUsers(page)}
					onEndReachedThreshold={0.5}
					refreshing={refreshing}
					onRefresh={() => {
						setRefreshing(true);
						loadUsers(1, true);
					}}
					ListEmptyComponent={
						!loading && (
							<Text style={{ textAlign: "center", marginTop: 32, color: theme.colors.textMuted }}>No users found.</Text>
						)
					}
				/>
			)}
		</BottomModal>
	);
}
