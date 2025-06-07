import { followUser, getUserFollowers, getUserFollowing, unfollowUser } from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from "react-native";
import Avatar from "../ui/Avatar";
import BottomModal from "./BottomModal";
import ModalHeader from "./ModalHeader";

export default function UserListModal({ visible, stat, userId, onClose, onStatsUpdate }) {
	const [loading, setLoading] = useState(false);
	const [users, setUsers] = useState([]);
	const [page, setPage] = useState(1);
	const [hasNext, setHasNext] = useState(true);
	const [refreshing, setRefreshing] = useState(false);

	const authUser = useAuthStore((s) => s.user);
	const router = useRouter();
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
			if (onStatsUpdate) onStatsUpdate();
		} catch (e) {
			// Optionally show error
		}
	};

	const renderItem = ({ item }) => {
		const isFollowing = item.followers?.some((id) => id === authUser._id);

		const handleUserPress = () => {
			onClose?.();
			router.push(`/(tabs)/user/${item._id}`);
		};

		return (
			<View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10 }}>
				<TouchableOpacity
					style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
					onPress={handleUserPress}
					activeOpacity={0.7}
				>
					<Avatar user={item} size={48} style={{ marginRight: 12 }} />
					<Text style={{ flex: 1, fontSize: 16 }}>{item.username}</Text>
				</TouchableOpacity>
				{item._id !== authUser._id && (
					<TouchableOpacity
						onPress={() => handleFollowToggle(item)}
						activeOpacity={0.8}
						style={{
							flexDirection: "row",
							alignItems: "center",
							paddingHorizontal: 10,
							paddingVertical: 4,
							borderRadius: 14,
							backgroundColor: isFollowing ? "#e5e7eb" : theme.colors.primary,
							marginLeft: 8,
						}}
					>
						<Feather
							name={isFollowing ? "check" : "user-plus"}
							size={15}
							color={isFollowing ? theme.colors.textMuted : "#fff"}
							style={{ marginRight: 4 }}
						/>
						<Text
							style={{
								fontSize: 13,
								color: isFollowing ? theme.colors.textMuted : "#fff",
								fontWeight: "400",
							}}
						>
							{isFollowing ? "Following" : "Follow"}
						</Text>
					</TouchableOpacity>
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
