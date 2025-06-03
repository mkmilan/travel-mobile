/* ------------------------------------------------------------------ *
 * SettingsScreen – Expo SDK 53
 * ------------------------------------------------------------------ */
import ChoiceTabs from "@/src/components/form/ChoiceTabs";
import TransportIcon from "@/src/components/TransportIcon";
import {
	dateFormatOptions,
	languageOptions,
	preferredUnitOptions,
	themePreferenceOptions,
	timeFormatOptions,
	travelModeOptions,
	tripVisibilityOptions,
} from "@/src/constants/settingsOptions";
import useRequireAuth from "@/src/hooks/useRequireAuth";
import { updateUserSettings } from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { theme } from "@/src/theme";
import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

/* ---------------------------------------------------- *
 * helper – attach a Feather icon to every option        *
 * ---------------------------------------------------- */
const FEATHER_ICONS = {
	/* trip visibility */
	public: "globe",
	followers_only: "users",
	private: "lock",

	/* units */
	metric: "thermometer",
	imperial: "thermometer",

	/* theme pref */
	system: "smartphone",
	light: "sun",
	dark: "moon",

	/* date / time */
	"MM/DD/YYYY": "calendar",
	"DD/MM/YYYY": "calendar",
	"YYYY-MM-DD": "calendar",
	"12h": "clock",
	"24h": "clock",

	/* language */
	en: "globe",
	fr: "globe",
	es: "globe",
	de: "globe",
	it: "globe",
};

const withIcon = (arr) =>
	arr.map((o) => ({
		...o,
		icon: FEATHER_ICONS[o.value] ?? "circle",
	}));

/* ------------------------------------------------------------------ */
export default function SettingsScreen() {
	/* guard */
	const ready = useRequireAuth();
	if (!ready) return <View style={styles.blank} />;

	const router = useRouter();
	const user = useAuthStore((s) => s.user);
	const updateUser = useAuthStore((s) => s.updateUser);
	const isAuth = useAuthStore((s) => s.isAuthenticated);

	/* ---------- guard ---------- */
	useEffect(() => {
		if (!isAuth || !user) {
			router.replace("/(auth)/login");
		}
	}, [isAuth, user, router]);

	if (!isAuth || !user) return <View style={styles.blank} />;

	/* local draft of the settings being edited */
	const [s, setS] = useState({ ...user.settings });

	const updateField = (k, v) => setS((p) => ({ ...p, [k]: v }));

	const save = async () => {
		try {
			// const updated = await updateUserSettings(true, { settings: s });
			const updated = await updateUserSettings(true, s);
			console.log("[SettingsScreen] save settings before put", s);
			await updateUser(updated); // bullet-proof merge inside the store
			router.back();
		} catch (e) {
			Alert.alert("Error", e.message);
		}
	};

	/* ---------------------------------------------------------------- */
	return (
		<ScrollView
			style={styles.container}
			contentContainerStyle={{ padding: theme.space.md }}
			showsVerticalScrollIndicator={false}
		>
			{/* ── Visibility / mode ───────────────────────── */}
			<Text style={styles.sectionHdr}>Default trip visibility</Text>
			<View style={{ height: theme.space.xs }} />
			<ChoiceTabs
				value={s.defaultTripVisibility}
				options={withIcon(tripVisibilityOptions)}
				onChange={(v) => updateField("defaultTripVisibility", v)}
				size="sm"
			/>

			<Text style={styles.sectionHdr}>Default travel mode</Text>
			<View style={{ height: theme.space.xs }} />
			<ChoiceTabs
				value={s.defaultTravelMode}
				options={travelModeOptions.map((o) => ({
					...o,
					customIcon: (
						<TransportIcon
							mode={o.value}
							size={16}
							color={o.value === s.defaultTravelMode ? theme.colors.text : theme.colors.textMuted}
							style={{ marginRight: 6 }}
						/>
					),
				}))}
				onChange={(v) => updateField("defaultTravelMode", v)}
				size="sm"
			/>

			{/* ── Units / theme ───────────────────────────── */}
			<Text style={styles.sectionHdr}>Preferred units</Text>
			<View style={{ height: theme.space.xs }} />
			<ChoiceTabs
				value={s.preferredUnits}
				options={withIcon(preferredUnitOptions)}
				onChange={(v) => updateField("preferredUnits", v)}
				size="sm"
				iconRenderer={(name, color) => <Feather name={name} size={16} color={color} style={{ marginRight: 6 }} />}
			/>

			<Text style={styles.sectionHdr}>Theme preference</Text>
			<View style={{ height: theme.space.xs }} />
			<ChoiceTabs
				value={s.themePreference}
				options={withIcon(themePreferenceOptions)}
				onChange={(v) => updateField("themePreference", v)}
				size="sm"
				iconRenderer={(name, color) => <Feather name={name} size={16} color={color} style={{ marginRight: 6 }} />}
			/>

			{/* ── Date / time / language ──────────────────── */}
			<Text style={styles.sectionHdr}>Date format</Text>
			<View style={{ height: theme.space.xs }} />
			<ChoiceTabs
				value={s.dateFormat}
				options={withIcon(dateFormatOptions)}
				onChange={(v) => updateField("dateFormat", v)}
				size="sm"
				iconRenderer={(name, color) => <Feather name={name} size={16} color={color} style={{ marginRight: 6 }} />}
			/>

			<Text style={styles.sectionHdr}>Time format</Text>
			<View style={{ height: theme.space.xs }} />
			<ChoiceTabs
				value={s.timeFormat}
				options={withIcon(timeFormatOptions)}
				onChange={(v) => updateField("timeFormat", v)}
				size="sm"
				iconRenderer={(name, color) => <Feather name={name} size={16} color={color} style={{ marginRight: 6 }} />}
			/>

			<Text style={styles.sectionHdr}>Language</Text>
			<View style={{ height: theme.space.xs }} />
			<ChoiceTabs
				value={s.language}
				options={withIcon(languageOptions)}
				onChange={(v) => updateField("language", v)}
				size="sm"
				iconRenderer={(name, color) => <Feather name={name} size={16} color={color} style={{ marginRight: 6 }} />}
			/>

			{/* ── Save button ─────────────────────────────── */}
			<TouchableOpacity style={styles.button} onPress={save}>
				<Text style={styles.buttonTxt}>Save settings</Text>
			</TouchableOpacity>
		</ScrollView>
	);
}

/* ------------------------------------------------------------------ *
 * styles                                                             *
 * ------------------------------------------------------------------ */
const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: theme.colors.background },
	sectionHdr: {
		fontSize: theme.fontSize.sm,
		fontWeight: "600",
		color: theme.colors.text,
		marginTop: theme.space.md,
		marginBottom: theme.space.md,
	},
	button: {
		backgroundColor: theme.colors.primary,
		paddingVertical: theme.space.md,
		borderRadius: theme.radius.md,
		marginTop: theme.space.lg,
		alignItems: "center",
	},
	buttonTxt: {
		color: "#fff",
		fontWeight: "600",
		fontSize: theme.fontSize.md,
	},
});
