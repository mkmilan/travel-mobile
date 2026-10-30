/** Export policy is deliberately stricter than in-app viewing permission. */
export function canShareJourney(trip, session) {
	return !!(trip?._id && session?.isAuthenticated && !session.isSessionChanging && session.token
		&& session.user?._id && trip.user?._id === session.user._id);
}

/** My Trips' authenticated projection omits the owner. This explicit hint
 * permits loading details only, never capture/export without verified ownership. */
export function canPrepareJourneyShare(trip, session, ownerIdHint) {
	return canShareJourney(trip, session) || !!(trip?._id && !trip.user && session?.isAuthenticated
		&& !session.isSessionChanging && session.token && session.user?._id && ownerIdHint === session.user._id);
}

export function journeyShareTitle(title) {
	// Bound layout work without splitting surrogate pairs (emoji/non-Latin text).
	const clean = typeof title === "string" ? title.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "";
	return Array.from(clean || "My journey").slice(0, 180).join("");
}

export function journeySharePhotoId(trip) {
	// Saved server photos only. Never accept arbitrary URLs or local paths from trip JSON.
	return Array.isArray(trip?.photos) ? trip.photos.find(id => typeof id === "string" && /^[a-f\d]{24}$/i.test(id)) : undefined;
}

export function journeyShareWarning(visibility) {
	return visibility === "public"
		? "This image can be saved or forwarded outside the app."
		: `This ${visibility === "private" ? "private" : visibility === "followers_only" ? "followers-only" : "restricted"} journey stays unchanged in the app, but exporting its image leaves the app’s privacy controls. Anyone receiving it can save or forward it.`;
}

/** One preview's async lifetime. Native operations cannot be cancelled; late
 * results are discarded and can never trigger another export automatically. */
export function createJourneyShareController({ isCurrent, capture, share, discard, onChange }) {
	let cancelled = false, preparing = false, sharing = false, uri = null;
	const current = () => !cancelled && isCurrent();
	const change = patch => { if (current()) onChange(patch); };
	return {
		async prepare(view) {
			if (!current() || preparing || uri) return;
			preparing = true;
			change({ status: "preparing", uri: null, error: null });
			try {
				const result = await capture(view);
				if (!current()) { await discard(result); return; }
				uri = result;
				change({ status: "ready", uri, error: null });
			} catch {
				change({ status: "error", uri: null, error: "Couldn’t create the image. Please try again." });
			} finally { preparing = false; }
		},
		async share() {
			if (!current() || !uri || sharing || preparing) return;
			sharing = true;
			change({ status: "sharing", uri, error: null });
			try {
				const result = await share(uri, current);
				change({ status: "ready", uri, error: result === "unavailable" ? "Sharing isn’t available on this device." : null });
			} catch {
				change({ status: "ready", uri, error: "Couldn’t open sharing. Please try again." });
			} finally { sharing = false; }
		},
		cancel() {
			cancelled = true;
			if (uri) { void discard(uri); uri = null; }
		},
	};
}
