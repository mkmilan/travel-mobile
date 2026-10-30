import { forwardRef } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { theme } from "@/src/theme";

// This is the entire export allowlist. No route, coordinates, profile, date,
// photo URI text, description or app chrome belongs inside this view.
const JourneyShareCard = forwardRef(function JourneyShareCard({ width, title, distance, appName, photoSource, onPhotoLoad, onPhotoError }, ref) {
	return (
		<View ref={ref} collapsable={false} style={[styles.card, { width, height: width * 1.25 }]} testID="journey-image-card">
			<View style={styles.hero}>
				<View style={styles.sun} />
				<View style={[styles.mountain, styles.farMountain]} />
				<View style={[styles.mountain, styles.nearMountain]} />
				{photoSource && <Image source={photoSource} resizeMode="cover" style={StyleSheet.absoluteFillObject}
					onLoad={onPhotoLoad} onError={onPhotoError} accessibilityLabel="Journey photo" />}
			</View>
			<View style={styles.content}>
				<Text allowFontScaling={false} style={styles.title} numberOfLines={3} ellipsizeMode="tail">{title}</Text>
				<Text allowFontScaling={false} style={styles.distance} numberOfLines={1} adjustsFontSizeToFit>{distance}</Text>
				<View style={styles.brandRow}>
					<View style={styles.brandMark}><View style={styles.brandDot} /></View>
					<Text allowFontScaling={false} style={styles.brand} numberOfLines={1}>{appName}</Text>
				</View>
			</View>
		</View>
	);
});
export default JourneyShareCard;

const styles = StyleSheet.create({
	card: { backgroundColor: theme.colors.inputBackground, borderRadius: 16, overflow: "hidden" },
	hero: { height: "44%", backgroundColor: "#DFF2FF", overflow: "hidden" },
	sun: { position: "absolute", width: 58, height: 58, borderRadius: 29, right: "15%", top: "17%", backgroundColor: "#FFD78E" },
	mountain: { position: "absolute", width: 240, height: 240, transform: [{ rotate: "45deg" }], borderRadius: 22 },
	farMountain: { backgroundColor: "#A0CEE8", top: 95, right: -25 },
	nearMountain: { backgroundColor: "#377FA8", top: 95, left: -90 },
	content: { flex: 1, padding: 16, justifyContent: "space-between" },
	title: { fontSize: 22, lineHeight: 26, fontWeight: "700", color: theme.colors.text },
	distance: { fontSize: 28, lineHeight: 34, fontWeight: "700", color: theme.colors.primary, marginVertical: 6 },
	brandRow: { flexDirection: "row", alignItems: "center", gap: 7 },
	brandMark: { width: 18, height: 18, borderRadius: 6, backgroundColor: theme.colors.primary, justifyContent: "center", alignItems: "center" },
	brandDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "white" },
	brand: { flex: 1, fontSize: 12, fontWeight: "600", color: theme.colors.textMuted },
});
