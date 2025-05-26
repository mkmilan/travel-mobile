import ChoiceTabs from "@/src/components/form/ChoiceTabs";
import {
	dateFormatOptions,
	languageOptions,
	preferredUnitOptions,
	themePreferenceOptions,
	timeFormatOptions,
	travelModeOptions,
	tripVisibilityOptions,
} from "@/src/constants/settingsOptions";
import { updateUserById } from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
	Alert,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
} from "react-native";

import TransportIcon from "@/src/components/TransportIcon";

const OPT_ICONS = {
	public: { icon: "globe" },
	followers_only: { icon: "users" },
	private: { icon: "lock" },

	metric: { icon: "thermometer" },
	imperial: { icon: "thermometer" },

	system: { icon: "smartphone" },
	light: { icon: "sun" },
	dark: { icon: "moon" },

	"MM/DD/YYYY": { icon: "calendar" },
	"DD/MM/YYYY": { icon: "calendar" },
	"YYYY-MM-DD": { icon: "calendar" },

	"12h": { icon: "clock" },
	"24h": { icon: "clock" },

	en: { icon: "globe" },
	fr: { icon: "globe" },
	es: { icon: "globe" },
	de: { icon: "globe" },
	it: { icon: "globe" },
};

const ICONS = {
	public: "globe",
	followers_only: "users",
	private: "lock",
	motorhome: "home",
	campervan: "truck",
	car: "car",
	motorcycle: "navigation",
	bicycle: "activity",
	walking: "footsteps",
	metric: "ruler",
	imperial: "ruler",
	system: "smartphone",
	light: "sun",
	dark: "moon",
	"MM/DD/YYYY": "calendar",
	"DD/MM/YYYY": "calendar",
	"YYYY-MM-DD": "calendar",
	"12h": "clock",
	"24h": "clock",
	en: "globe",
	fr: "globe",
	es: "globe",
	de: "globe",
	it: "globe",
};

const mapOptions = (arr) =>
	arr.map((o) => ({
		...o,
		...(OPT_ICONS[o.value] || {}),
	}));

export default function SettingsScreen() {
	const router = useRouter();
	const user = useAuthStore((s) => s.user);
	const setUser = useAuthStore((s) => s.setUser);

	/* draft copy of all settings */
	const [s, setS] = useState({ ...user.settings });

	const updateField = (k, v) => setS((p) => ({ ...p, [k]: v }));

	const save = async () => {
		try {
			const updated = await updateUserById(true, { settings: s });
			setUser(updated);
			router.back();
		} catch (e) {
			Alert.alert("Error", e.message);
		}
	};

	return (
		<ScrollView
			style={styles.container}
			contentContainerStyle={{ padding: theme.space.md }}
		>
			{/** ======== Visibility / Mode ======== */}
			<Text style={styles.sectionHdr}>Default trip visibility</Text>
			<ChoiceTabs
				value={s.defaultTripVisibility}
				options={mapOptions(tripVisibilityOptions)}
				onChange={(v) => updateField("defaultTripVisibility", v)}
			/>
			<Text style={styles.sectionHdr}>Default travel mode</Text>
			<ChoiceTabs
				value={s.defaultTravelMode}
				options={travelModeOptions.map((o) => ({
					...o,
					customIcon: (
						<TransportIcon
							mode={o.value}
							size={16}
							color={
								o.value === s.defaultTravelMode
									? theme.colors.primary
									: theme.colors.textMuted
							}
							style={{ marginRight: 6 }}
						/>
					),
				}))}
				onChange={(v) => updateField("defaultTravelMode", v)}
			/>

			{/** ======== Units / Theme ======== */}
			<Text style={styles.sectionHdr}>Preferred Units</Text>
			<ChoiceTabs
				value={s.preferredUnits}
				options={preferredUnitOptions.map((o) => ({
					...o,
					customIcon: (
						<TransportIcon
							mode={o.value}
							size={16}
							color={
								o.value === s.preferredUnits
									? theme.colors.primary
									: theme.colors.textMuted
							}
							style={{ marginRight: 6 }}
						/>
					),
				}))}
				onChange={(v) => updateField("preferredUnits", v)}
			/>
			<Text style={styles.sectionHdr}>Theme Preference</Text>
			<ChoiceTabs
				value={s.themePreference}
				options={themePreferenceOptions.map((o) => ({
					...o,
					customIcon: (
						<TransportIcon
							mode={o.value}
							size={16}
							color={
								o.value === s.themePreference
									? theme.colors.primary
									: theme.colors.textMuted
							}
							style={{ marginRight: 6 }}
						/>
					),
				}))}
				onChange={(v) => updateField("themePreference", v)}
			/>

			{/** ======== Date / Time / Lang ======== */}
			<Text style={styles.sectionHdr}>Date Format</Text>
			<ChoiceTabs
				value={s.dateFormat}
				options={dateFormatOptions.map((o) => ({
					...o,
					customIcon: (
						<TransportIcon
							mode={o.value}
							size={16}
							color={
								o.value === s.dateFormat
									? theme.colors.primary
									: theme.colors.textMuted
							}
							style={{ marginRight: 6 }}
						/>
					),
				}))}
				onChange={(v) => updateField("dateFormat", v)}
			/>
			<Text style={styles.sectionHdr}>Time Format</Text>
			<ChoiceTabs
				value={s.timeFormat}
				options={timeFormatOptions.map((o) => ({
					...o,
					customIcon: (
						<TransportIcon
							mode={o.value}
							size={16}
							color={
								o.value === s.timeFormat
									? theme.colors.primary
									: theme.colors.textMuted
							}
							style={{ marginRight: 6 }}
						/>
					),
				}))}
				onChange={(v) => updateField("timeFormat", v)}
			/>
			<Text style={styles.sectionHdr}>Language</Text>
			<ChoiceTabs
				value={s.language}
				options={languageOptions.map((o) => ({
					...o,
					customIcon: (
						<TransportIcon
							mode={o.value}
							size={16}
							color={
								o.value === s.language
									? theme.colors.primary
									: theme.colors.textMuted
							}
							style={{ marginRight: 6 }}
						/>
					),
				}))}
				onChange={(v) => updateField("language", v)}
			/>

			{/** ======== Save ======== */}
			<TouchableOpacity style={styles.button} onPress={save}>
				<Text style={styles.buttonTxt}>Save Settings</Text>
			</TouchableOpacity>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: theme.colors.background },
	button: {
		backgroundColor: theme.colors.primary,
		paddingVertical: theme.space.md,
		borderRadius: theme.radius.md,
		marginTop: theme.space.lg,
		alignItems: "center",
	},
	sectionHdr: {
		fontSize: theme.fontSize.sm,
		fontWeight: "600",
		color: theme.colors.text,
		marginTop: theme.space.md,
	},
	buttonTxt: { color: "#fff", fontWeight: "600", fontSize: theme.fontSize.md },
});
