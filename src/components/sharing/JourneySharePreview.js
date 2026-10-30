import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Constants from "expo-constants";
import { usePhotoSource } from "@/src/hooks/usePhotoSource";
import { kmOrMiles } from "@/src/utils/format";
import { createJourneyShareController, journeySharePhotoId, journeyShareTitle, journeyShareWarning } from "@/src/utils/journeyShare";
import { captureJourneyImage, discardJourneyImage, pruneJourneyImages, shareJourneyImage } from "@/src/services/journeyShareFiles";
import { theme } from "@/src/theme";
import JourneyShareCard from "./JourneyShareCard";

export const PHOTO_WAIT_MS = 8000;

export default function JourneySharePreview({ trip, units, isCurrent }) {
	const { width: windowWidth } = useWindowDimensions();
	const width = Math.min(360, windowWidth - 48);
	const title = journeyShareTitle(trip.title);
	const distance = kmOrMiles(trip.distanceMeters, units);
	const appName = Constants.expoConfig?.name || "Travel mobile";
	const photoId = journeySharePhotoId(trip);
	const { getPhotoSource, mediaKey } = usePhotoSource();
	const [attempt, setAttempt] = useState(0);
	const [photoStatus, setPhotoStatus] = useState(photoId ? "loading" : "missing");
	const [layoutReady, setLayoutReady] = useState(false);
	const [consent, setConsent] = useState(false);
	const [result, setResult] = useState(null);
	const [displayedUri, setDisplayedUri] = useState(null);
	const [previewFailed, setPreviewFailed] = useState(null);
	const card = useRef(null);
	const live = useRef(null);
	const photoSource = useMemo(() => photoId ? getPhotoSource(photoId) : undefined, [photoId, mediaKey, attempt]);
	const photoKey = JSON.stringify([photoId, mediaKey, attempt]);
	const key = JSON.stringify([title, distance, width, photoKey, photoStatus]);
	live.current = { key, photoKey, isCurrent };
	const controller = useMemo(() => createJourneyShareController({
		isCurrent: () => live.current?.key === key && live.current.isCurrent(),
		capture: captureJourneyImage, share: shareJourneyImage, discard: discardJourneyImage,
		onChange: value => setResult({ ...value, key }),
	}), [key]);
	const currentResult = result?.key === key ? result : null;
	const ready = currentResult?.status === "ready" && displayedUri === currentResult.uri && previewFailed !== currentResult.uri;
	const privateExport = trip.defaultTripVisibility !== "public";
	const busy = currentResult?.status === "sharing";

	useEffect(() => { void pruneJourneyImages(); }, []);
	useEffect(() => () => controller.cancel(), [controller]);
	useEffect(() => () => { live.current = null; }, []);
	useEffect(() => {
		if (photoStatus !== "loading") return;
		const timer = setTimeout(() => settlePhoto("fallback"), PHOTO_WAIT_MS);
		return () => clearTimeout(timer);
	}, [photoStatus, photoKey]);
	useEffect(() => {
		if (layoutReady && photoStatus !== "loading") void controller.prepare(card);
	}, [controller, layoutReady, photoStatus]);
	const retry = () => {
		if (live.current?.key !== key || !isCurrent()) return;
		live.current.key = null; live.current.photoKey = null;
		// Retrying remounts the native Image: cache=reload must finish again.
		if (photoStatus === "ready") setPhotoStatus("loading");
		setDisplayedUri(null); setPreviewFailed(null); setAttempt(value => value + 1);
	};
	const retryPhoto = () => {
		if (live.current?.key !== key || !isCurrent()) return;
		setPhotoStatus("loading"); retry();
	};
	const settlePhoto = status => {
		if (live.current?.photoKey !== photoKey || !live.current.isCurrent()) return;
		setPhotoStatus(previous => previous === "loading" ? status : previous);
	};
	const share = () => {
		if (!ready || (privateExport && !consent) || !isCurrent()) return;
		void controller.share();
	};

	return (
		<ScrollView contentContainerStyle={styles.content}>
			<Text style={styles.intro}>A little snapshot of your journey.</Text>
			<View style={{ width, height: width * 1.25, alignSelf: "center" }} onLayout={event => setLayoutReady(event.nativeEvent.layout.width > 0 && event.nativeEvent.layout.height > 0)}>
				<JourneyShareCard key={`${mediaKey}-${attempt}`} ref={card} width={width} title={title} distance={distance} appName={appName}
					photoSource={photoStatus === "ready" || photoStatus === "loading" ? photoSource : undefined}
					onPhotoLoad={() => settlePhoto("ready")}
					onPhotoError={() => settlePhoto("fallback")} />
				{currentResult?.uri && <Image key={currentResult.uri} source={{ uri: currentResult.uri }} style={[StyleSheet.absoluteFillObject, styles.preview]} resizeMode="contain"
					accessibilityLabel="Image preview to share"
					onLoad={() => { if (live.current?.key === key && live.current.isCurrent()) setDisplayedUri(currentResult.uri); }}
					onError={() => { if (live.current?.key === key && live.current.isCurrent()) setPreviewFailed(currentResult.uri); }} />}
			</View>
			{photoStatus === "loading" ? <View style={styles.status}>
				<ActivityIndicator color={theme.colors.primary} /><Text style={styles.note}>Loading your photo…</Text>
				<Pressable onPress={() => settlePhoto("fallback")} accessibilityRole="button"><Text style={styles.link}>Use illustration instead</Text></Pressable>
			</View> : <>
				{photoStatus !== "ready" && <Text style={styles.note}>{photoStatus === "missing" ? "No trip photo — an illustration is included instead." : "Photo unavailable — an illustration is included instead."}</Text>}
				{photoId && photoStatus === "fallback" && <Pressable onPress={retryPhoto} disabled={busy} accessibilityRole="button"><Text style={styles.link}>Retry photo</Text></Pressable>}
				{(!currentResult || currentResult.status === "preparing") && <View style={styles.status}><ActivityIndicator color={theme.colors.primary} /><Text style={styles.note}>Creating your image…</Text></View>}
			</>}
			<Text style={styles.note}>No route or location metadata is included. Your title or photo may still reveal places.</Text>
			<View style={[styles.warning, privateExport && styles.privateWarning]}>
				<Text style={styles.warningText}>{journeyShareWarning(trip.defaultTripVisibility)}</Text>
				{privateExport && <Pressable onPress={() => setConsent(value => !value)} disabled={busy} accessibilityRole="checkbox"
					accessibilityState={{ checked: consent, disabled: busy }} style={styles.consent}>
					<Text style={styles.check}>{consent ? "☑" : "☐"}</Text><Text style={styles.warningText}>I understand and want to export this image.</Text>
				</Pressable>}
			</View>
			{(currentResult?.error || (currentResult?.uri && previewFailed === currentResult.uri)) && <Text accessibilityRole="alert" style={styles.error}>{currentResult?.error || "Couldn’t display the image. Please try again."}</Text>}
			{(currentResult?.status === "error" || (currentResult?.uri && previewFailed === currentResult.uri)) && <Pressable onPress={retry} accessibilityRole="button" style={styles.secondary}><Text style={styles.link}>Create image again</Text></Pressable>}
			<Pressable onPress={share} disabled={!ready || (privateExport && !consent)} accessibilityRole="button"
				accessibilityState={{ disabled: !ready || (privateExport && !consent), busy }}
				style={[styles.share, (!ready || (privateExport && !consent)) && styles.disabled]}>
				<Text style={styles.shareText}>{busy ? "Opening share menu…" : "Share image"}</Text>
			</Pressable>
		</ScrollView>
	);
}
const styles = StyleSheet.create({
	content: { paddingBottom: 8, gap: 12 },
	intro: { color: theme.colors.textMuted, fontSize: 14, textAlign: "center" },
	preview: { borderRadius: 16, backgroundColor: "white" },
	note: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 },
	status: { gap: 8, alignItems: "center" },
	link: { color: theme.colors.primary, fontWeight: "600", paddingVertical: 6 },
	warning: { padding: 12, borderRadius: 12, backgroundColor: "#E8F3FC" },
	privateWarning: { backgroundColor: "#FFF2D9" },
	warningText: { color: theme.colors.text, fontSize: 13, lineHeight: 19, flexShrink: 1 },
	consent: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, minHeight: 44 },
	check: { color: theme.colors.primary, fontSize: 24 },
	error: { color: theme.colors.error, fontSize: 14 },
	secondary: { alignItems: "center", minHeight: 44 },
	share: { minHeight: 48, borderRadius: 12, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center", padding: 12 },
	disabled: { opacity: 0.45 },
	shareText: { color: "white", fontWeight: "700", fontSize: 16 },
});
