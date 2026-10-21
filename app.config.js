import * as dotenv from "dotenv";

// Variant selection is explicit and independent of NODE_ENV (release JS is production).
const isTest = process.env.APP_VARIANT === "test";
const isProd = process.env.APP_ENV === "production";
const testApiUrl = "https://travel-server-test.onrender.com/api";
if (process.env.EAS_BUILD_PROFILE === "travel-test" && !isTest) {
	throw new Error("travel-test requires APP_VARIANT=test");
}
if (isTest && process.env.EAS_BUILD === "true" && !process.env.TEST_GOOGLE_MAPS_KEY?.trim()) {
	throw new Error("Travel Test requires a restricted TEST_GOOGLE_MAPS_KEY before a cloud build");
}

// Load env file dynamically
if (!isTest) dotenv.config({
	path: isProd ? ".env.production" : ".env.development",
	quiet: true,
});

export default {
	expo: {
		name: isTest ? "Travel Test" : "Travel mobile",
		slug: "travel-mobile",
		version: "1.0.0",
		orientation: "portrait",
		icon: "./assets/images/icon.png",
		scheme: isTest ? "travel-test" : "mobile",
		// This side-by-side APK only runs its embedded bundle. Never publish to the old app.
		...(isTest ? { updates: { enabled: false }, runtimeVersion: "travel-test-sdk57-v1" } : {}),
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
			package: isTest ? "com.mkmilanmilan.travelmobile.test" : "com.mkmilanmilan.travelmobile",
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
			...(isTest ? [["expo-dev-client", { addGeneratedScheme: false }]] : []),
			"expo-router",
			"expo-font",
			"expo-image",
			["expo-build-properties", { android: { usesCleartextTraffic: !(isProd || isTest) } }],
			["react-native-maps", { androidGoogleMapsApiKey: isTest ? process.env.TEST_GOOGLE_MAPS_KEY : process.env.GOOGLE_MAPS_KEY }],
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
			API_URL: isTest ? testApiUrl : process.env.API_URL,
			APP_ENV: isTest ? "test" : isProd ? "production" : "development",
			eas: {
				projectId: "0cefaf69-249a-41a9-98b4-71f6eff5d7d3",
			},
		},
	},
};
