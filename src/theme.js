export const theme = {
	colors: {
		background: "#F5F7FA",
		text: "#333",
		primary: "#0077cc", // Travel-themed calm blue
		textMuted: "#555",
		secondary: "#4A90E2",
		inputBackground: "#fff",
		inputBorder: "#ccc",
		link: "#0077cc",
		error: "#D14343",
		warning: "#FFA500", // Orange for warnings
		info: "#17A2B8", // Light blue for infor
	},
	space: {
		xs: 4,
		sm: 8,
		md: 12,
		lg: 18,
		xl: 24,
	},
	radius: {
		sm: 4,
		md: 8,
		lg: 16,
		full: 999,
	},
	fontSize: {
		xs: 12,
		sm: 14,
		md: 16,
		lg: 18,
		xl: 22,
	},
};
export const darkTheme = {
	...theme,
	colors: {
		...theme.colors,
		background: "#1E1E1E",
		text3e: "#3e3e3e",
		text: "#FFFFFF",
		inputBackground: "#333333",
		inputBorder: "#555555",
	},
};
