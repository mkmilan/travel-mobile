import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Alert, Pressable, Text, View } from "react-native";
import { ENABLE_SAFE_TRIP_DELETE } from "../constants/featureFlags";
import { useAuthStore } from "../stores/auth";
import { useTripSocialStore } from "../stores/tripSocialStore";
import { deleteServerTrip, getPendingTripDeletionsApi } from "../services/api";
import { getPendingTripDeletions, rememberPendingTripDeletion, settlePendingTripDeletion, reconcileDeletedServerTrip } from "../db/tripDao";

// Owner-driven retries only. Rows survive restart and never appear to another account.
export default function PendingTripDeletions() {
	const { user, token, sessionEpoch, isSessionChanging } = useAuthStore();
	const [result, setResult] = useState(null);
	const active = useRef(null);
	const running = useRef(false);
	const sessionCurrent = context => {
		const session = useAuthStore.getState();
		return session.user?._id === context.userId && session.token === context.token && session.sessionEpoch === context.epoch && !session.isSessionChanging;
	};
	const focusedCurrent = context => active.current === context && sessionCurrent(context);
	useFocusEffect(useCallback(() => {
		const context = { userId: user?._id, token, epoch: sessionEpoch };
		active.current = context;
		if (ENABLE_SAFE_TRIP_DELETE && context.userId && token && !isSessionChanging) {
			(async () => {
				let rows = [];
				try {
					rows = await getPendingTripDeletions(context.userId);
					if (!focusedCurrent(context)) return;
					setResult({ context, rows });
					const pending = await getPendingTripDeletionsApi(context.userId, { isCurrent: () => focusedCurrent(context) });
					for (const { tripId } of pending) {
						if (!focusedCurrent(context)) return;
						await rememberPendingTripDeletion(tripId, context.userId);
					}
					rows = await getPendingTripDeletions(context.userId);
					if (focusedCurrent(context)) setResult({ context, rows });
				} catch (_) {
					if (focusedCurrent(context)) setResult({ context, rows, error: rows.length
						? "Could not check all pending deletions. Saved retries are kept; reopen My Trips to check again."
						: "Could not check deletion status. Reopen My Trips to check again." });
				}
			})();
		}
		return () => { if (active.current === context) active.current = null; };
	}, [user?._id, token, sessionEpoch, isSessionChanging]));
	if (!ENABLE_SAFE_TRIP_DELETE || !result || !focusedCurrent(result.context) || (!result.rows.length && !result.error)) return null;
	const retry = async () => {
		const context = result.context;
		if (!focusedCurrent(context) || running.current) return;
		running.current = true;
		setResult({ ...result, busy: true, error: null });
		try {
			let failures = 0;
			for (const { trip_id: tripId } of result.rows) {
				if (!focusedCurrent(context)) return;
				try {
					const receipt = await deleteServerTrip(tripId, context.userId, { isCurrent: () => focusedCurrent(context) });
					// A verified receipt still updates this session after navigation, but
					// never authorizes another DELETE or updates the abandoned screen.
					if (!sessionCurrent(context)) return;
					useTripSocialStore.getState().invalidateDeletedTrip(tripId);
					await reconcileDeletedServerTrip(tripId, context.userId);
					if (!sessionCurrent(context)) return;
					await settlePendingTripDeletion(tripId, context.userId, receipt);
				} catch (_) { failures++; }
			}
			if (!focusedCurrent(context)) return;
			const rows = await getPendingTripDeletions(context.userId);
			if (focusedCurrent(context)) setResult({ context, rows, error: failures ? `${failures} deletion or cleanup request(s) could not be confirmed. Saved retries are kept.` : rows.length ? "Cleanup is still pending. You can retry later. If cleanup stays pending, storage may need review." : null });
		} catch (error) {
			if (focusedCurrent(context)) setResult({ ...result, error: `Deletion or cleanup was not completed: ${error.message}` });
		} finally {
			running.current = false;
			if (focusedCurrent(context)) setResult(previous => previous?.context === context ? { ...previous, busy: false } : previous);
		}
	};
	return <View testID="pending-trip-deletions" accessibilityRole="summary">
		{!!result.rows.length && <Text>Previously requested trip deletions need confirmation or cleanup. No automatic retry is running. If cleanup stays pending, storage may need review.</Text>}
		{result.error && <Text accessibilityRole="alert">{result.error}</Text>}
		{!!result.rows.length && <Pressable disabled={result.busy} onPress={() => Alert.alert("Retry requested deletions?", "This retries permanently deleting the trips you previously selected and cleaning up their associated content.", [
			{ text: "Cancel", style: "cancel" }, { text: "Retry cleanup", style: "destructive", onPress: retry },
		])}><Text>{result.busy ? "Retrying…" : "Retry cleanup"}</Text></Pressable>}
	</View>;
}
