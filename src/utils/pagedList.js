// One request lifetime per profile/session. Empty and failed first pages are
// completed attempts, not a reason for a focus effect to request forever.
export function createPagedList(loadPage, enabled = true, discardSuperseded = false) {
	let state = { items: [], nextPage: 1, hasNext: true, loaded: !enabled, loading: false, refreshing: false, error: null };
	let inFlight = null;
	let generation = 0;
	let queuedRefresh = null;
	const listeners = new Set();
	const uniqueItems = (items) => {
		const positions = new Map();
		const result = [];
		for (const item of items) {
			const id = item?._id ?? item?.photoId;
			if (id != null && positions.has(id)) result[positions.get(id)] = item;
			else {
				if (id != null) positions.set(id, result.length);
				result.push(item);
			}
		}
		return result;
	};
	const update = (patch) => {
		state = { ...state, ...patch };
		listeners.forEach((listener) => listener());
	};
	const request = (page, replace, refreshing = false) => {
		if (!enabled) return Promise.resolve();
		if (inFlight) return inFlight;
		const requestGeneration = generation;
		// Defer invocation so even synchronous loader failures release the lock.
		inFlight = Promise.resolve()
			.then(() => loadPage(page))
			.then((result) => {
				if (requestGeneration !== generation) return;
				if (!Array.isArray(result?.data)) throw new Error("Invalid list response");
				update({
					items: uniqueItems(replace ? result.data : [...state.items, ...result.data]),
					nextPage: page + 1,
					hasNext: result.hasNext ?? page < result.totalPages,
					loaded: true,
					error: null,
				});
			})
			.catch((error) => {
				if (requestGeneration === generation) update({ loaded: true, error: error?.message || "Could not load this list", hasNext: false });
			})
			.finally(() => {
				inFlight = null;
				update({ loading: false, refreshing: false });
			});
		update({ loading: true, refreshing, error: null });
		return inFlight;
	};
	const refresh = () => {
		if (inFlight) {
			// Mutations/refresher can request fresh data while pagination is running.
			// Coalesce them to one replacement AFTER that older response settles.
			// Gallery must not briefly resurrect deleted photos from an older GET.
			if (discardSuperseded) generation++;
			if (!queuedRefresh) queuedRefresh = inFlight.then(() => {
				queuedRefresh = null;
				return request(1, true, true);
			});
			return queuedRefresh;
		}
		return request(1, true, true);
	};
	return {
		getSnapshot: () => state,
		subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
		ensureLoaded: () => state.loaded ? Promise.resolve() : request(1, true),
		loadMore: () => !state.loaded || !state.hasNext || state.error ? Promise.resolve() : request(state.nextPage, false),
		refresh,
		setItems: (value) => update({ items: typeof value === "function" ? value(state.items) : value }),
	};
}
