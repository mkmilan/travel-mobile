// Temporarily keep the app English/light-only. Retain the original preferences
// and controls for later; this gate changes presentation, not account settings.
// CommonJS lets Expo's native config and the app share the same switch.
const ENABLE_LANGUAGE_AND_THEME_PREFERENCES = false;

function getAppThemePreference(savedPreference = "system") {
	return ENABLE_LANGUAGE_AND_THEME_PREFERENCES ? savedPreference : "light";
}

function getAppLanguage(savedLanguage = "en") {
	return ENABLE_LANGUAGE_AND_THEME_PREFERENCES ? savedLanguage : "en";
}

function resolveAppTheme(savedPreference, systemTheme) {
	const preference = getAppThemePreference(savedPreference);
	return (preference === "system" ? systemTheme : preference) === "dark" ? "dark" : "light";
}

function getEditableSettings(settings = {}) {
	const editable = { ...settings };
	if (!ENABLE_LANGUAGE_AND_THEME_PREFERENCES) {
		// The settings API patches only supplied fields. Saving another setting
		// must not rewrite a hidden preference, even when its old value is dark.
		delete editable.themePreference;
		delete editable.language;
	}
	return editable;
}

module.exports = {
	ENABLE_LANGUAGE_AND_THEME_PREFERENCES,
	getAppThemePreference,
	getAppLanguage,
	resolveAppTheme,
	getEditableSettings,
};
