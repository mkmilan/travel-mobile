import TransportIcon from "@/src/components/TransportIcon";
import TripMapThumbnail from "@/src/components/TripMapThumbnail";
import { theme } from "@/src/theme";
import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function TripCard({
	title,
	description,
	date,
	distanceKm,
	durationStr,
	avgSpeed,
	likes,
	comments,
	coords,
	travelMode,
	onPress,
}) {
	return (
		<TouchableOpacity
			onPress={onPress}
			style={styles.card}
		>
			{/* Header */}
			<Text style={styles.title}>{title}</Text>
			<Text style={styles.meta}>{date}</Text>

			{/* Body */}
			<Text
				numberOfLines={2}
				style={styles.desc}
			>
				{description}
			</Text>
			<TripMapThumbnail coords={coords} />
			<View style={styles.statsRow}>
				<TransportIcon mode={travelMode} />
				<Stat
					label="Km"
					value={distanceKm}
				/>
				<Stat
					label="Dur"
					value={durationStr}
				/>
				<Stat
					label="Avg"
					value={`${avgSpeed} km/h`}
				/>
			</View>

			{/* Footer */}
			<View style={styles.footer}>
				<FooterIcon
					icon="heart"
					value={likes}
				/>
				<FooterIcon
					icon="message-circle"
					value={comments}
				/>
				<Feather
					name="share-2"
					size={18}
					color={theme.colors.text}
				/>
			</View>
		</TouchableOpacity>
	);
}

/* --- sub-components --- */
function Stat({ label, value }) {
	return (
		<View style={styles.stat}>
			<Text style={styles.statVal}>{value}</Text>
			<Text style={styles.statLabel}>{label}</Text>
		</View>
	);
}
function FooterIcon({ icon, value }) {
	return (
		<View style={styles.footerItem}>
			<Feather
				name={icon}
				size={18}
				color={theme.colors.text}
			/>
			<Text style={styles.footerText}>{value}</Text>
		</View>
	);
}

/* --- styles --- */
const styles = StyleSheet.create({
	card: {
		backgroundColor: theme.colors.inputBackground,
		borderRadius: theme.radius.md,
		padding: theme.space.md,

		marginBottom: theme.space.md,
		shadowColor: "#000",
		shadowOpacity: 0.05,
		shadowRadius: 4,
		elevation: 2,
	},
	title: {
		fontSize: theme.fontSize.lg,
		fontWeight: "600",
		color: theme.colors.text,
	},
	meta: {
		fontSize: 12,
		color: theme.colors.textMuted,
		marginBottom: theme.space.sm,
	},
	desc: {
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
		marginBottom: theme.space.md,
	},
	statsRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: theme.space.md,
	},
	stat: { alignItems: "center", flex: 1 },
	statVal: { fontWeight: "600", color: theme.colors.text },
	statLabel: { fontSize: 12, color: theme.colors.textMuted },
	footer: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	footerItem: { flexDirection: "row", alignItems: "center" },
	footerText: { marginLeft: 4, fontSize: 12, color: theme.colors.text },
});
