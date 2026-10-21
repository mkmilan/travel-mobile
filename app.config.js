import * as dotenv from "dotenv";

const isProd = process.env.APP_ENV === "production";

// Load env file dynamically
dotenv.config({
	path: isProd ? ".env.production" : ".env.development",
	quiet: true,
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
					NSAllowsArbitraryLoads: !isProd,
				},
			},
		},
		android: {
			adaptiveIcon: {
				foregroundImage: "./assets/images/adaptive-icon.png",
				backgroundColor: "#ffffff",
			},
			package: "com.mkmilanmilan.travelmobile",
			permissions: [
				"android.permission.FOREGROUND_SERVICE",
				"android.permission.FOREGROUND_SERVICE_LOCATION",
				"android.permission.ACCESS_COARSE_LOCATION",
				"android.permission.ACCESS_FINE_LOCATION",
				"android.permission.ACCESS_BACKGROUND_LOCATION",
			],
		},
		web: {
			bundler: "metro",
			output: "static",
			favicon: "./assets/images/favicon.png",
		},
		plugins: [
			"expo-router",
			"expo-font",
			"expo-image",
			["expo-build-properties", { android: { usesCleartextTraffic: !isProd } }],
			["react-native-maps", { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_KEY }],
			"expo-secure-store",
			"expo-sqlite",
			"expo-web-browser",
			["expo-status-bar", { style: "dark" }],
			["expo-navigation-bar", { style: "dark", enforceContrast: false }],
			["expo-image-picker", {
				photosPermission: "Choose photos to attach to your trips and profile.",
				cameraPermission: false,
				microphonePermission: false,
			}],
			["expo-location", {
				locationAlwaysAndWhenInUsePermission: "Allow background location to record your trip while the app is in the background.",
				isIosBackgroundLocationEnabled: true,
				isAndroidBackgroundLocationEnabled: true,
				isAndroidForegroundServiceEnabled: true,
			}],
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
			APP_ENV: isProd ? "production" : "development",
			eas: {
				projectId: "0cefaf69-249a-41a9-98b4-71f6eff5d7d3",
			},
		},
	},
};
