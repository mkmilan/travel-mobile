// stores/tripSocialStore.js
import {
	addTripComment,
	getTripComments,
	getTripJsonById,
	getTripLikers,
	likeTrip,
	unlikeTrip,
} from "@/src/services/api";
import { create } from "zustand";
import { useAuthStore } from "@/src/stores/auth";

/**
 * Slice that tracks live social state per trip.
 *
 *   trips = {
 *     [tripId]: {
 *       likesCount,
 *       commentsCount,
 *       recommendationCount,
 *       isLikedByCurrentUser,
 *       comments,          // array
 *       likers,            // array
 *       recommendations,   // array
 *     }
 *   }
 */

let cacheGeneration = 0;
const loadVersions = new Map();
const likeRequests = new Map();
let socialSession = null;
// Cache entries carry an opaque identity, not credentials. Auth subscribers can
// immediately reject old-session lists without waiting for a replacement GET.
export const getSocialSessionScope = () => {
	const { token, user, sessionEpoch } = useAuthStore.getState();
	if (!socialSession || socialSession.token !== token || socialSession.userId !== user?._id || socialSession.epoch !== sessionEpoch) {
		socialSession = { token, userId: user?._id, epoch: sessionEpoch, scope: {} };
	}
	return socialSession.scope;
};
const scopedTrip = (state, tripId) => {
	const scope = getSocialSessionScope();
	return state.trips[tripId]?.session === scope ? state.trips[tripId] : { session: scope };
};
const captureSession = () => {
	const generation = cacheGeneration;
	const scope = getSocialSessionScope();
	return () => generation === cacheGeneration && scope === getSocialSessionScope();
};
const beginLoad = (kind, tripId) => {
	const key = `${kind}:${tripId}`;
	const version = (loadVersions.get(key) || 0) + 1;
	loadVersions.set(key, version);
	const isCurrentSession = captureSession();
	return () => isCurrentSession() && loadVersions.get(key) === version;
};

export const useTripSocialStore = create((set, get) => ({
	deletionRevision: 0,
	deletedTripIds: {},
	invalidateDeletedTrip: (tripId) => {
		cacheGeneration++; // Also reject in-flight social responses for the deleted trip.
		loadVersions.clear();
		likeRequests.delete(tripId);
		set(s => { const trips = { ...s.trips }; delete trips[tripId]; return { trips, deletedTripIds: { ...s.deletedTripIds, [tripId]: true }, deletionRevision: s.deletionRevision + 1 }; });
	},
	trips: {}, // { [tripId]: {likesCount, isLikedByCurrentUser, ...} }

	/* -------- likes -------- */
	toggleLike: async (tripId) => {
		const auth = useAuthStore.getState();
		if (!auth.token || !auth.user?._id || auth.isSessionChanging || auth.isAuthenticated === false || get().deletedTripIds[tripId]) return;
		const scope = getSocialSessionScope();
		// One write per trip/session, shared across every mounted card. Ignore
		// duplicate/stale presses even before React has rendered the disabled heart.
		if (likeRequests.get(tripId)?.scope === scope) return;
		const operation = { scope };
		likeRequests.set(tripId, operation);
		const isCurrent = () => likeRequests.get(tripId) === operation
			&& scope === getSocialSessionScope() && !useAuthStore.getState().isSessionChanging;
		const trip = scopedTrip(get(), tripId);
		const liked = !trip.isLikedByCurrentUser;
		const likeRevision = (trip.likeRevision || 0) + 1;
		// optimistic
		set((s) => ({
			trips: {
				...s.trips,
				[tripId]: {
					...trip,
					likeRevision,
					likePending: true,
					isLikedByCurrentUser: liked,
					likesCount: Math.max(0, (trip.likesCount || 0) + (liked ? 1 : -1)),
				},
			},
		}));
		try {
			liked ? await likeTrip(tripId) : await unlikeTrip(tripId);
		} catch (e) {
			if (!isCurrent() || scopedTrip(get(), tripId).likeRevision !== likeRevision) return;
			// Revert only this Like, retaining newer comments/recommendations. A
			// later Like or accepted server snapshot owns its own revision.
			set((s) => ({ trips: { ...s.trips, [tripId]: {
				...scopedTrip(s, tripId),
				likeRevision: likeRevision + 1,
				isLikedByCurrentUser: trip.isLikedByCurrentUser,
				likesCount: trip.likesCount,
			} } }));
		} finally {
			// A failed write is never queued/replayed automatically: its outcome
			// may be ambiguous. Release only our own lock so an explicit retry works.
			if (likeRequests.get(tripId) === operation) {
				const current = isCurrent();
				likeRequests.delete(tripId);
				if (current) set(s => ({ trips: { ...s.trips, [tripId]: {
					...scopedTrip(s, tripId), likePending: false,
				} } }));
			}
		}
	},

	loadLikers: async (tripId) => {
		if (get().deletedTripIds[tripId]) return;
		const isCurrent = beginLoad("likers", tripId);
		const data = await getTripLikers(tripId);
		if (!isCurrent()) return;
		set((s) => ({
			trips: { ...s.trips, [tripId]: { ...scopedTrip(s, tripId), likers: data ?? [] } },
		}));
	},

	/* -------- comments -------- */
	loadComments: async (tripId, page = 1) => {
		if (get().deletedTripIds[tripId]) return;
		const isCurrent = beginLoad("comments", tripId);
		const data = await getTripComments(tripId, page);
		if (!isCurrent()) return;
		set((s) => ({
			trips: {
				...s.trips,
				[tripId]: {
					...scopedTrip(s, tripId),
					comments: data ?? [],
					commentsCount: (data ?? []).length, // 🔑 keep counter in sync
				},
			},
		}));
	},
	addComment: async (tripId, text) => {
		if (get().deletedTripIds[tripId]) throw new Error("This trip was deleted.");
		const isCurrentSession = captureSession();
		const comment = await addTripComment(tripId, text);
		if (!isCurrentSession()) return { comment, refreshError: "Session changed; list was not refreshed." };
		// A committed POST must not look like a failed send if the following GET
		// fails: retrying the mutation would create the comment twice.
		try {
			await get().loadComments(tripId);
			return { comment, refreshError: null };
		} catch (error) {
			return { comment, refreshError: error?.message || "Could not refresh comments." };
		}
	},

	/* -------- recommendations -------- */
	loadRecommendations: async (tripId) => {
		if (get().deletedTripIds[tripId]) return;
		const isCurrent = beginLoad("recommendations", tripId);
		// call the new endpoint that returns the full trip JSON
		const trip = await getTripJsonById(tripId);
		if (!isCurrent()) return;
		// console.log(`[tripSocialStore] loadRecommendations for trip `, trip);

		const list = trip?.recommendations ?? []; // always an array

		set((s) => ({
			trips: {
				...s.trips,
				[tripId]: {
					...scopedTrip(s, tripId),
					recommendations: list,
					// keep the counter in sync (optional but handy)
					recommendationCount: list.length,
				},
			},
		}));
	},

	/* -------- external setters so detail screens can sync counts ------- */
	setLikeState: (tripId, { isLiked, count }) =>
		set((s) => s.deletedTripIds[tripId] ? {} : ({
			trips: {
				...s.trips,
				[tripId]: {
					...scopedTrip(s, tripId),
					likeRevision: (scopedTrip(s, tripId).likeRevision || 0) + 1,
					isLikedByCurrentUser: isLiked,
					likesCount: count,
				},
			},
		})),

	setCommentCount: (tripId, count) =>
		set((s) => s.deletedTripIds[tripId] ? {} : ({
			trips: { ...s.trips, [tripId]: { ...scopedTrip(s, tripId), commentsCount: count } },
		})),

	setRecCount: (tripId, count) =>
		set((s) => s.deletedTripIds[tripId] ? {} : ({
			trips: { ...s.trips, [tripId]: { ...scopedTrip(s, tripId), recommendationCount: count } },
		})),

	/* -------- helper to prime cache from list endpoints -------- */
	primeCounts: (trip) =>
		set((s) => s.deletedTripIds[trip._id] ? {} : ({
			trips: {
				...s.trips,
				[trip._id]: {
					...scopedTrip(s, trip._id),
					likeRevision: (scopedTrip(s, trip._id).likeRevision || 0) + 1,
					likesCount: trip.likesCount,
					commentsCount: trip.commentsCount,
					recommendationCount: trip.recommendationCount,
					isLikedByCurrentUser: trip.isLikedByCurrentUser,
				},
			},
		})),

	/* ─────────── RESET (for logout) ─────────── */
	reset: () => {
		cacheGeneration++;
		loadVersions.clear();
		likeRequests.clear();
		set({ trips: {}, deletedTripIds: {} });
	},
}));
