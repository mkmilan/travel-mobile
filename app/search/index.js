import ProfileListStatus from "@/src/components/ProfileListStatus";
import RecommendationCard from "@/src/components/RecommendationCard";
import TripCardContainer from "@/src/components/TripCardContainer";
import BottomModal from "@/src/components/modals/BottomModal";
import ModalHeader from "@/src/components/modals/ModalHeader";
import RecommendationDetailModal from "@/src/components/modals/RecommendationDetailModal";
import CommentsSheet from "@/src/components/sheets/CommentsSheet";
import LikersSheet from "@/src/components/sheets/LikersSheet";
import RecommendationsSheet from "@/src/components/sheets/RecommendationsSheet";
import UserHeader from "@/src/components/ui/UserHeader";
import { RECOMMENDATION_CATEGORIES, getRecommendationCategoryLabel } from "@/src/constants/recommendationConstants";
import useProfileContext from "@/src/hooks/useProfileContext";
import useSearchResults from "@/src/hooks/useSearchResults";
import { useTripSocialStore } from "@/src/stores/tripSocialStore";
import { theme } from "@/src/theme";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

const TABS = [{ value: "trips", label: "Trips" }, { value: "recommendations", label: "Places" }, { value: "users", label: "People" }];

export default function SearchScreen() {
	const account = useProfileContext("search-form");
	const [draft, setDraft] = useState(null);
	// Screen-local only: Back retains the search, a different login never does.
	const { query = "", type = "trips", category = "" } = draft?.account === account ? draft : {};
	const change = patch => { if (account.isCurrent()) setDraft({ account, query, type, category, ...patch }); };
	const results = useSearchResults(query, type, category);
	const { identity, context, items, eligible, loading, initialLoading, refreshing, error, refreshIdentity, retry, refresh, loadMore } = results;
	const router = useRouter();
	const input = useRef(null);
	const [selection, setSelection] = useState(null);
	const [categoryPicker, setCategoryPicker] = useState(null);
	const selected = selection?.identity === identity && context.isCurrent() ? selection : null;
	const selectedTrip = selected?.type !== "detail" ? selected?.item : null;
	const canAct = () => context.isCurrent();
	const openSheet = (sheetType, item) => { if (canAct()) { Keyboard.dismiss(); setSelection({ identity, type: sheetType, item }); } };
	const closeSheet = () => setSelection(null);
	const navigate = path => { if (canAct()) { Keyboard.dismiss(); closeSheet(); router.push(path); } };
	const primeCounts = useTripSocialStore(state => state.primeCounts);
	const primed = useRef({ identity: null, items: new Map() });
	useEffect(() => {
		if (type !== "trips" || !context.isCurrent()) return;
		if (primed.current.identity !== identity) primed.current = { identity, items: new Map() };
		items.forEach(item => {
			// Appending a page must not reset an earlier card's just-toggled like.
			if (primed.current.items.get(item._id) !== item) primeCounts(item);
			primed.current.items.set(item._id, item);
		});
	}, [items, type, identity, context, primeCounts]);
	const label = TABS.find(tab => tab.value === type).label.toLowerCase();

	return (
		<View style={styles.container}>
			<View style={styles.controls}>
				<View style={styles.inputWrapper}>
					<Feather name="search" size={20} color={theme.colors.primary} style={styles.inputIcon} />
					<TextInput ref={input} style={styles.input} placeholder={`Search ${label}…`} accessibilityLabel={`Search ${label}`}
						value={query} onChangeText={text => change({ query: text })} maxLength={120}
						returnKeyType="search" autoCorrect={false} autoCapitalize="none"
						onSubmitEditing={() => { Keyboard.dismiss(); void results.submit(); }}
						placeholderTextColor={theme.colors.textMuted} />
					{query.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Clear search"
						onPress={() => { change({ query: "" }); input.current?.focus(); }} style={styles.clear}>
						<Text style={styles.link}>Clear</Text>
					</Pressable>}
				</View>
				<View style={styles.tabs} accessibilityRole="tablist" accessibilityLabel="Search type">
					{TABS.map(tab => <Pressable key={tab.value} accessibilityRole="tab" accessibilityState={{ selected: type === tab.value }}
						onPress={() => { if (type !== tab.value) change({ type: tab.value }); }}
						style={[styles.tab, type === tab.value && styles.selectedTab]}>
						<Text style={[styles.tabText, type === tab.value && styles.selectedTabText]}>{tab.label}</Text>
					</Pressable>)}
				</View>
				{type === "recommendations" && <Pressable accessibilityRole="button" accessibilityLabel="Choose place category"
					onPress={() => { Keyboard.dismiss(); setCategoryPicker(identity); }} style={styles.categoryButton}>
					<Text style={styles.link}>Category: {category ? getRecommendationCategoryLabel(category) : "All categories"}</Text>
				</Pressable>}
			</View>
			<FlatList key={`${account.sessionEpoch}:${account.userId || "signed-out"}:${results.key}`}
				data={items} keyExtractor={item => item._id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
				renderItem={({ item }) => type === "trips" ? (
					<TripCardContainer trip={item} user={item.user} canAct={canAct} primeOnMount={false} onOpenSheet={openSheet} onPress={() => navigate(`/trip/${item._id}`)} />
				) : type === "recommendations" ? (
					<RecommendationCard rec={item} photoRefreshIdentity={refreshIdentity} onPress={() => openSheet("detail", item)} />
				) : (
					<Pressable accessibilityRole="button" accessibilityLabel={`View ${item.username}'s profile`} style={styles.userCard} onPress={() => navigate(`/(tabs)/user/${item._id}`)}>
						<UserHeader user={item} showLocation={true} size={40} />
					</Pressable>
				)}
				contentContainerStyle={styles.list} onEndReached={loadMore} onEndReachedThreshold={0.3}
				refreshControl={eligible ? <RefreshControl refreshing={refreshing} onRefresh={refresh} /> : undefined}
				ListFooterComponent={items.length ? loading ? <ActivityIndicator style={styles.status} color={theme.colors.primary} /> : error ? <ProfileListStatus error={error} onRetry={retry} /> : null : null}
				ListEmptyComponent={<ProfileListStatus loading={initialLoading || loading} error={error} onRetry={retry}
					emptyMessage={!eligible ? "Enter at least 2 characters to search." : `No ${label} found${type === "recommendations" && category ? " in this category" : ""}.`} />}
			/>
			<LikersSheet trip={selectedTrip} visible={selected?.type === "likers"} onClose={closeSheet} primeOnMount={false} />
			<CommentsSheet trip={selectedTrip} visible={selected?.type === "comments"} onClose={closeSheet} primeOnMount={false} />
			<RecommendationsSheet trip={selectedTrip} userId={selectedTrip?.user?._id} visible={selected?.type === "recs"} onClose={closeSheet} primeOnMount={false} />
			<RecommendationDetailModal isVisible={selected?.type === "detail"} recommendation={selected?.type === "detail" ? selected.item : null}
				onClose={closeSheet} onNavigateClose={closeSheet} tripUserId={selected?.item?.user?._id} tripRouteCoordinates={[]} readOnly={true} />
			<BottomModal visible={categoryPicker === identity && type === "recommendations"} onClose={() => setCategoryPicker(null)}>
				<ModalHeader title="Category" onClose={() => setCategoryPicker(null)} />
				<ScrollView keyboardShouldPersistTaps="handled">
					{[{ value: "", label: "All categories" }, ...RECOMMENDATION_CATEGORIES].map(option => (
						<Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: category === option.value }}
							style={[styles.categoryOption, category === option.value && styles.selectedTab]}
							onPress={() => { change({ category: option.value }); setCategoryPicker(null); }}>
							<Text style={[styles.categoryText, category === option.value && styles.selectedTabText]}>{option.label}</Text>
						</Pressable>
					))}
				</ScrollView>
			</BottomModal>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: theme.colors.background },
	controls: { padding: theme.space.md, paddingBottom: theme.space.sm },
	inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.inputBackground,
		borderRadius: theme.radius.md, paddingHorizontal: theme.space.sm, borderWidth: 1, borderColor: theme.colors.inputBorder },
	inputIcon: { marginRight: 6 },
	input: { flex: 1, minWidth: 0, minHeight: 48, fontSize: theme.fontSize.md, color: theme.colors.text, paddingVertical: theme.space.sm },
	clear: { minHeight: 44, paddingHorizontal: theme.space.sm, justifyContent: "center" },
	link: { color: theme.colors.primary, fontSize: theme.fontSize.sm },
	tabs: { flexDirection: "row", marginTop: theme.space.sm, padding: theme.space.xs, borderWidth: 1,
		borderColor: theme.colors.inputBorder, borderRadius: theme.radius.lg },
	tab: { flexGrow: 1, flexShrink: 1, minHeight: 44, paddingHorizontal: theme.space.xs, paddingVertical: theme.space.sm,
		alignItems: "center", justifyContent: "center", borderRadius: theme.radius.md },
	selectedTab: { backgroundColor: theme.colors.primary },
	tabText: { color: theme.colors.primary, fontSize: theme.fontSize.sm, fontWeight: "600", textAlign: "center" },
	selectedTabText: { color: theme.colors.inputBackground },
	categoryButton: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: theme.space.sm },
	categoryOption: { minHeight: 48, padding: theme.space.md, borderRadius: theme.radius.md, justifyContent: "center" },
	categoryText: { fontSize: theme.fontSize.md, color: theme.colors.text },
	list: { flexGrow: 1, paddingHorizontal: theme.space.md, paddingTop: theme.space.sm, paddingBottom: 32 },
	userCard: { backgroundColor: theme.colors.inputBackground, borderRadius: theme.radius.md, padding: theme.space.md, marginBottom: theme.space.sm },
	status: { margin: theme.space.md },
});
