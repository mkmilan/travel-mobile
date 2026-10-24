// Only a verified completion receipt may remove a trip from local UI state.
// Shared promises also prevent duplicate requests across a detail-screen remount.
const requests = new Map();
export function createTripDeletion({ context, remove, reconcile, invalidate, onChange, onComplete, prepare = async () => {}, settle = async () => {} }) {
	let state = { pending: false, error: null, completed: false };
	const update = patch => {
		state = { ...state, ...patch };
		if (context.isCurrent()) onChange(state);
	};
	return {
		getState: () => state,
		async run() {
			if (!context.isCurrent() || state.pending || state.completed) return false;
			update({ pending: true, error: null });
			const key = JSON.stringify([context.userId, context.sessionEpoch, context.tripId]);
			let confirmed = false;
			try {
				let request = requests.get(key);
				if (!request) {
					request = Promise.resolve().then(async () => {
						if (!context.isCurrent()) throw new Error("Screen or account changed; deletion cancelled.");
						await prepare(context.tripId, context.userId);
						if (!context.isCurrent()) throw new Error("Screen or account changed; deletion cancelled.");
						return remove(context.tripId, context.userId, { isCurrent: context.isCurrent });
					});
					requests.set(key, request);
					request.finally(() => { if (requests.get(key) === request) requests.delete(key); }).catch(() => {});
				}
				const receipt = await request;
				if (receipt?.deleted !== true || receipt.tripId !== context.tripId || typeof receipt.cleanupPending !== "boolean") {
					throw new Error("The server has not confirmed permanent deletion. Please retry.");
				}
				confirmed = true;
				if (!context.isSessionCurrent()) return false;
				invalidate(context.tripId);
				let localError = null;
				try {
					await reconcile(context.tripId, context.userId);
					await settle(context.tripId, context.userId, receipt);
				}
				catch (_) { localError = "The online trip was deleted, but its uploaded copy could not be removed from this phone."; }
				update({ completed: true });
				if (context.isCurrent()) onComplete(localError, receipt);
				return true;
			} catch (error) {
				update(confirmed
					? { completed: true, error: "The trip was deleted online, but this screen could not finish refreshing. Return to your trips." }
					: { error: `Deletion was not confirmed. Keep this screen and retry. ${error?.message || "Check your connection."}` });
				return confirmed;
			} finally { update({ pending: false }); }
		},
	};
}
