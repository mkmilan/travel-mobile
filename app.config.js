import * as dotenv from "dotenv";

const isProd = process.env.APP_ENV === "production";

// Load env file dynamically
dotenv.config({
	path: isProd ? ".env.production" : ".env.development",
});

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
			package: "com.mkmilanmilan.travelmobile",
			config: {
				googleMaps: {
					apiKey: process.env.GOOGLE_MAPS_KEY, // pulled from .env.production
				},
			},
			usesCleartextTraffic: true,
			edgeToEdgeEnabled: true,
			permissions: [
				"ACCESS_COARSE_LOCATION",
				"ACCESS_FINE_LOCATION",
				"ACCESS_BACKGROUND_LOCATION",
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
			typedRoutes: false,
		},
		extra: {
			API_URL: process.env.API_URL,
			APP_ENV: process.env.APP_ENV,
			eas: {
				projectId: "0cefaf69-249a-41a9-98b4-71f6eff5d7d3",
			},
		},
	},
};
