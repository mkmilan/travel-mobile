// src/utils/systemUI.js
//
// One place to configure the OS chrome (status-bar + nav-bar) colours
// so every screen in the app inherits the same look.

import * as NavigationBar from "expo-navigation-bar"; // Android-only
import { StatusBar } from "expo-status-bar"; // Expo SDK 53
import { Platform } from "react-native";

export function SystemUI() {
	/*  ---- STATUS-BAR (top) ----
	 *  dark   = dark icons for light backgrounds
	 *  light  = light icons for dark backgrounds
	 */
	return <StatusBar style="dark" backgroundColor="#ffffff" />;
}

/* Call this once on Android to recolour nav buttons / gesture pill */
export async function configureAndroidNavBar() {
	if (Platform.OS !== "android") return;
	try {
		/* 1️⃣  stop edge-to-edge for the nav-bar itself */
		await NavigationBar.setBehaviorAsync("inset-swipe"); // content above bar

		/* 2️⃣  make bar opaque white */
		await NavigationBar.setBackgroundColorAsync("#ffffff");

		/* 3️⃣  dark icons/pill */
		await NavigationBar.setButtonStyleAsync("dark");
	} catch (e) {
		console.warn("NavigationBar config failed", e);
	}
}
