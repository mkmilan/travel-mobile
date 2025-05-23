import "dotenv/config";

export default {
	expo: {
		name: "Travel mobile",
		slug: "travel-mobile",
		version: "1.0.0",
		orientation: "portrait",
		icon: "./assets/images/icon.png",
		scheme: "mobile",
		userInterfaceStyle: "automatic",
		newArchEnabled: true,
		ios: {
			supportsTablet: true,
			infoPlist: {
				NSLocationWhenInUseUsageDescription:
					"This app records your track while it is open.",
				NSLocationAlwaysAndWhenInUseUsageDescription:
					"Allow background location so your trip continues when the app is closed.",
				NSLocationAlwaysUsageDescription:
					"Allow background location so your trip continues when the app is in the background.",
				UIBackgroundModes: ["location"],
				NSAppTransportSecurity: {
					NSAllowsArbitraryLoads: true,
				},
			},
		},
		android: {
			adaptiveIcon: {
				foregroundImage: "./assets/images/adaptive-icon.png",
				backgroundColor: "#ffffff",
			},
			usesCleartextTraffic: true,
			edgeToEdgeEnabled: true,
			permissions: [
				"ACCESS_COARSE_LOCATION",
				"ACCESS_FINE_LOCATION",
				"ACCESS_BACKGROUND_LOCATION",
				// "FOREGROUND_SERVICE", // Required for Android 12+ to use background location
				// "FOREGROUND_SERVICE_LOCATION", //last two from copilot maybe old
			],
			foregroundService: {
				notificationTitle: "Recording trip",
				notificationBody: "Motorhome Mapper is tracking your route.",
			},
		},
		web: {
			bundler: "metro",
			output: "static",
			favicon: "./assets/images/favicon.png",
		},
		plugins: [
			"expo-router",
			[
				"expo-splash-screen",
				{
					image: "./assets/images/splash-icon.png",
					imageWidth: 200,
					resizeMode: "contain",
					backgroundColor: "#ffffff",
				},
			],
		],
		experiments: {
			typedRoutes: false, // Changed from true to false
		},

		extra: {
			API_URL: process.env.API_URL,
			APP_ENV: process.env.APP_ENV,
		},
	},
};
