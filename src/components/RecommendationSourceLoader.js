import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import useProfileContext from "@/src/hooks/useProfileContext";
import { getRecommendationByIdApi } from "@/src/services/api";

// Resolve a gallery source once, not by fetching every recommendation page.
// The API enforces visibility; the owner check also rejects a mismatched link.
export default function RecommendationSourceLoader({ recommendationId, userId, onFound, onCancel }) {
	const context = useProfileContext(userId);
	const [attempt, setAttempt] = useState(0);
	const [error, setError] = useState(null);
	const operation = useRef(null);
	const callbacks = useRef({ onFound, onCancel });
	callbacks.current = { onFound, onCancel };
	useEffect(() => {
		const request = { active: true };
		operation.current = request;
		setError(null);
		const current = () => request.active && operation.current === request && context.isCurrent();
		void (async () => {
			try {
				if (!current()) return;
				const rec = await getRecommendationByIdApi(recommendationId);
				if (!current()) return;
				const ownerId = typeof rec?.user === "string" ? rec.user : rec?.user?._id;
				if (rec?._id !== recommendationId || ownerId !== userId) throw new Error("Recommendation unavailable");
				callbacks.current.onFound(rec);
			} catch (_) {
				if (current()) setError("Could not open this recommendation. It may have been removed or made private, or the connection failed.");
			}
		})();
		return () => { request.active = false; };
	}, [context, recommendationId, userId, attempt]);
	return (
		<View style={{ padding: 16 }}>
			{error ? <>
				<Text accessibilityRole="alert">{error}</Text>
				<Pressable accessibilityRole="button" onPress={() => { if (context.isCurrent()) setAttempt((value) => value + 1); }} style={{ minHeight: 48, justifyContent: "center" }}><Text>Retry opening recommendation</Text></Pressable>
			</> : <><ActivityIndicator /><Text>Opening recommendation…</Text></>}
			<Pressable accessibilityRole="button" onPress={() => { if (context.isCurrent()) { if (operation.current) operation.current.active = false; callbacks.current.onCancel(); } }} style={{ minHeight: 48, justifyContent: "center" }}><Text>Cancel</Text></Pressable>
		</View>
	);
}
