import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuthStore } from "@/src/stores/auth";
import useViewerUnits from "@/src/hooks/useViewerUnits";
import { canPrepareJourneyShare, canShareJourney, journeySharePhotoId, journeyShareTitle } from "@/src/utils/journeyShare";
import { getTripJsonById } from "@/src/services/api";
import BottomModal from "@/src/components/modals/BottomModal";
import ModalHeader from "@/src/components/modals/ModalHeader";
import { theme } from "@/src/theme";
import JourneySharePreview from "./JourneySharePreview";

const tripInputKey = trip => JSON.stringify([trip?._id, trip?.user?._id, journeyShareTitle(trip?.title),
	trip?.distanceMeters, journeySharePhotoId(trip), Array.isArray(trip?.photos), trip?.defaultTripVisibility]);

export default function JourneyShareAction({ trip, canAct, ownerIdHint, showLabel = false }) {
	const session = useAuthStore();
	const units = useViewerUnits();
	const inputKey = tripInputKey(trip);
	const [selection, setSelection] = useState(null);
	const [detail, setDetail] = useState(null);
	const selected = useRef(null);
	const request = useRef(null);
	const mounted = useRef(true);
	const focused = useRef(true);
	const latest = useRef(null);
	latest.current = { trip, canAct, ownerIdHint };
	const close = useCallback(() => { selected.current = null; request.current = null; setSelection(null); setDetail(null); }, []);
	const isCurrent = item => {
		const state = useAuthStore.getState();
		return mounted.current && focused.current && selected.current === item && item?.tripId === latest.current.trip?._id && item.inputKey === tripInputKey(latest.current.trip)
			&& item.epoch === state.sessionEpoch && item.userId === state.user?._id && item.token === state.token
			&& canPrepareJourneyShare(latest.current.trip, state, latest.current.ownerIdHint)
			&& (!latest.current.canAct || latest.current.canAct());
	};
	useEffect(() => { if (selection && !isCurrent(selection)) close(); });
	useEffect(() => {
		mounted.current = true;
		return () => { mounted.current = false; selected.current = null; request.current = null; };
	}, []);
	useFocusEffect(useCallback(() => {
		focused.current = true;
		return () => { focused.current = false; close(); };
	}, [close]));
	const loadDetails = async item => {
		if (!isCurrent(item) || request.current?.selection === item) return;
		const work = { selection: item }; request.current = work;
		setDetail(null);
		try {
			const fullTrip = await getTripJsonById(item.tripId);
			if (!isCurrent(item) || request.current !== work) return;
			if (fullTrip?._id !== item.tripId || !canShareJourney(fullTrip, useAuthStore.getState())) {
				setDetail({ selection: item, error: "Only journeys you own can be exported." });
				return;
			}
			setDetail({ selection: item, trip: fullTrip });
		} catch {
			if (isCurrent(item) && request.current === work) setDetail({ selection: item, error: "Couldn’t load this journey. Check your connection and try again." });
		} finally { if (request.current === work) request.current = null; }
	};
	const open = event => {
		event?.stopPropagation?.();
		const state = useAuthStore.getState();
		if (!mounted.current || !focused.current || inputKey !== tripInputKey(latest.current.trip) || state.sessionEpoch !== session.sessionEpoch || state.token !== session.token || state.user?._id !== session.user?._id) return;
		if (selected.current || !canPrepareJourneyShare(latest.current.trip, state, latest.current.ownerIdHint) || (latest.current.canAct && !latest.current.canAct())) return;
		const item = { inputKey, tripId: latest.current.trip._id, userId: state.user._id, epoch: state.sessionEpoch, token: state.token };
		selected.current = item; setSelection(item);
		// List projections omit photos (and My Trips also omits user). An explicit
		// own-list hint enables preparation only; the full response verifies export.
		if (canShareJourney(trip, state) && Array.isArray(trip.photos)) setDetail({ selection: item, trip });
		else void loadDetails(item);
	};
	if (!canPrepareJourneyShare(trip, session, ownerIdHint)) return null;
	const currentDetail = detail?.selection === selection ? detail : null;
	const confirmedTrip = currentDetail?.trip;
	const closeSelection = () => { if (selected.current === selection) close(); };
	return (
		<>
			<Pressable onPress={open} style={styles.action} accessibilityRole="button" accessibilityLabel="Share journey">
				<Feather name="share-2" size={18} color={theme.colors.primary} />
				{showLabel && <Text style={styles.label}>Share journey</Text>}
			</Pressable>
			{selection && isCurrent(selection) && <BottomModal visible onClose={closeSelection}>
				<ModalHeader title="Share journey" onClose={closeSelection} />
				{confirmedTrip ? <JourneySharePreview
					key={JSON.stringify([selection.epoch, selection.tripId, confirmedTrip.title, confirmedTrip.distanceMeters, journeySharePhotoId(confirmedTrip), confirmedTrip.defaultTripVisibility])}
					trip={confirmedTrip} units={units} isCurrent={() => isCurrent(selection) && canShareJourney(confirmedTrip, useAuthStore.getState())
						&& (useAuthStore.getState().user?.settings?.preferredUnits === "imperial" ? "imperial" : "metric") === units}
				/> : <View style={styles.loading}>
					{currentDetail?.error ? <>
						<Text accessibilityRole="alert" style={styles.error}>{currentDetail.error}</Text>
						<Pressable onPress={() => loadDetails(selection)} accessibilityRole="button" style={styles.action}><Text style={styles.label}>Try again</Text></Pressable>
					</> : <><ActivityIndicator color={theme.colors.primary} /><Text style={styles.note}>Preparing your journey…</Text></>}
					<Pressable onPress={closeSelection} accessibilityRole="button" style={styles.action}><Text style={styles.label}>Cancel</Text></Pressable>
				</View>}
			</BottomModal>}
		</>
	);
}
const styles = StyleSheet.create({
	action: { minWidth: 44, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 8 },
	label: { color: theme.colors.primary, fontSize: 14, fontWeight: "600" },
	loading: { padding: 24, gap: 16, alignItems: "center" },
	note: { color: theme.colors.textMuted, fontSize: 14 },
	error: { color: theme.colors.error, fontSize: 14, textAlign: "center" },
});
