import TripCard from "@/src/components/TripCard";
import { getTripsByUser } from "@/src/services/api";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList } from "react-native";

export default function TripsTab({ userId }) {
	const [page, setPage] = useState(1);
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancel = false;
		(async () => {
			try {
				const res = await getTripsByUser(userId, page);
				const newItems = Array.isArray(res.items) ? res.items : res;
				if (!cancel) setItems((p) => [...p, ...newItems]);
			} finally {
				if (!cancel) setLoading(false);
			}
		})();
		return () => {
			cancel = true;
		};
	}, [page, userId]);

	if (loading && items.length === 0) return <ActivityIndicator style={{ marginTop: 40 }} />;

	return (
		<FlatList
			data={items}
			keyExtractor={(t) => t._id}
			renderItem={({ item }) => <TripCard trip={item} />}
			onEndReachedThreshold={0.3}
			onEndReached={() => setPage((p) => p + 1)}
			ListFooterComponent={loading ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null}
		/>
	);
}
