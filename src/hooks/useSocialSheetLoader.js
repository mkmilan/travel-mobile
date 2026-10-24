import { useAuthStore } from "@/src/stores/auth";
import { useEffect, useRef, useState } from "react";

// useTripSocial returns new action wrappers on every render. Observe the latest
// loader without making those wrappers a reason to fetch again.
export default function useSocialSheetLoader({ tripId, visible, load }) {
	const { token, user } = useAuthStore();
	const current = useRef(null);
	if (!current.current || current.current.tripId !== tripId || current.current.token !== token || current.current.userId !== user?._id || current.current.visible !== visible) {
		current.current = { tripId, token, userId: user?._id, visible };
	}
	const identity = current.current;
	const latestLoad = useRef(load);
	latestLoad.current = load;
	const pending = useRef(null);
	const [state, setState] = useState(null);

	const retry = () => {
		if (!visible || !tripId || current.current !== identity) return Promise.resolve();
		if (pending.current?.identity === identity) return pending.current.promise;
		setState(previous => ({ identity, loading: true, error: null, refreshIdentity: previous?.identity === identity ? previous.refreshIdentity : null }));
		const loader = latestLoad.current;
		const promise = Promise.resolve().then(() => {
			if (current.current === identity) return loader();
		}).then(() => {
			if (current.current === identity) setState({ identity, loading: false, error: null, refreshIdentity: {} });
		}, error => {
			if (current.current === identity) setState(previous => ({ ...previous, identity, loading: false, error: error?.message || "Could not load this list." }));
		}).finally(() => {
			if (pending.current?.promise === promise) pending.current = null;
		});
		pending.current = { identity, promise };
		return promise;
	};

	useEffect(() => {
		// React development StrictMode may replay setup after cleanup.
		if (!current.current) current.current = identity;
		void retry();
		return () => {
			if (current.current === identity) current.current = null;
		};
	}, [identity]);

	const snapshot = state?.identity === identity ? state : { loading: Boolean(visible && tripId), error: null };
	return { identity, refreshIdentity: snapshot.refreshIdentity, loading: snapshot.loading, error: snapshot.error, retry };
}
