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
	},
	space: {
		sm: 8,
		md: 16,
		lg: 24,
	},
	radius: {
		sm: 6,
		md: 10,
	},
	fontSize: {
		sm: 14,
		md: 16,
		lg: 20,
	},
};
export const darkTheme = {
	...theme,
	colors: {
		...theme.colors,
		background: "#1E1E1E",
		text: "#FFFFFF",
		inputBackground: "#333333",
		inputBorder: "#555555",
	},
};
