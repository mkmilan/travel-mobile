import { PixelRatio, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { captureRef, releaseCapture } from "react-native-view-shot";

const directory = FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}journey-shares/` : null;
export const SHARE_RETENTION_MS = 24 * 60 * 60 * 1000;
const livePreviews = new Set();
const activeShares = new Set();
const filePattern = /^(preview|shared)-(\d+)-[a-z0-9]+\.png$/;
const newFile = kind => `${directory}${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
const ownFile = uri => directory && typeof uri === "string" && uri.startsWith(directory) && filePattern.test(uri.slice(directory.length));
const ensureDirectory = async () => {
	if (!directory) throw new Error("Image cache unavailable");
	await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
};

export async function pruneJourneyImages(now = Date.now()) {
	if (!directory) return;
	try {
		await ensureDirectory();
		for (const name of await FileSystem.readDirectoryAsync(directory)) {
			const match = filePattern.exec(name), uri = `${directory}${name}`;
			if (match && now - Number(match[2]) > SHARE_RETENTION_MS && !livePreviews.has(uri) && !activeShares.has(uri)) {
				await FileSystem.deleteAsync(uri, { idempotent: true });
			}
		}
	} catch { /* Cache cleanup must not block a new preview. */ }
}

export async function discardJourneyImage(uri) {
	if (!ownFile(uri) || !uri.slice(directory.length).startsWith("preview-")) return;
	livePreviews.delete(uri);
	try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { /* Retry through age-based cleanup later. */ }
}

export async function captureJourneyImage(view) {
	await ensureDirectory();
	// Wait for React/native to commit the loaded photo or fallback and current units.
	await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	let temporary, output;
	try {
		// Capture this allowlisted card only, not the screen, route or original image.
		// Native bitmap -> fresh PNG encoding never copies the photo's GPS/EXIF data.
		// v5.1.0 iOS dimensions are points; Android dimensions are pixels.
		const scale = Platform.OS === "ios" ? PixelRatio.get() : 1;
		temporary = await captureRef(view, { format: "png", result: "tmpfile", width: 1080 / scale, height: 1350 / scale });
		const source = temporary.startsWith("file://") ? temporary : `file://${temporary}`;
		output = newFile("preview");
		livePreviews.add(output);
		await FileSystem.copyAsync({ from: source, to: output });
		return output;
	} catch (error) {
		if (output) await discardJourneyImage(output);
		throw error;
	} finally {
		if (temporary) releaseCapture(temporary);
	}
}

export async function shareJourneyImage(uri, isCurrent) {
	if (!ownFile(uri) || !isCurrent()) return "cancelled";
	if (!(await Sharing.isAvailableAsync())) return "unavailable";
	if (!isCurrent()) return "cancelled";
	// A separate, timestamped handoff copy survives closing the preview or logout.
	// Android can resolve shareAsync while another app is still reading the file.
	const output = newFile("shared");
	activeShares.add(output);
	let handedOff = false;
	try {
		await FileSystem.copyAsync({ from: uri, to: output });
		if (!isCurrent()) {
			await FileSystem.deleteAsync(output, { idempotent: true });
			return "cancelled";
		}
		handedOff = true;
		await Sharing.shareAsync(output, { mimeType: "image/png", UTI: "public.png", dialogTitle: "Share journey" });
		// No success/posting assertion: native cancellation is not distinguished.
		return "closed";
	} finally {
		activeShares.delete(output);
		if (!handedOff) {
			try { await FileSystem.deleteAsync(output, { idempotent: true }); } catch { /* Age-based retry. */ }
		}
		// Retain even on a native error after invocation (handoff may have begun).
		// Pruned on a later preview, after at least 24 hours; never saved to Photos.
	}
}
