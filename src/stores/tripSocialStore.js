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
let socialSession = null;
// Cache entries carry an opaque identity, not credentials. Auth subscribers can
// immediately reject old-session lists without waiting for a replacement GET.
export const getSocialSessionScope = () => {
	const { token, user } = useAuthStore.getState();
	if (!socialSession || socialSession.token !== token || socialSession.userId !== user?._id) {
		socialSession = { token, userId: user?._id, scope: {} };
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
	trips: {}, // { [tripId]: {likesCount, isLikedByCurrentUser, ...} }

	/* -------- likes -------- */
	toggleLike: async (tripId) => {
		const isCurrentSession = captureSession();
		const trip = scopedTrip(get(), tripId);
		const liked = !trip.isLikedByCurrentUser;
		// optimistic
		set((s) => ({
			trips: {
				...s.trips,
				[tripId]: {
					...trip,
					isLikedByCurrentUser: liked,
					likesCount: (trip.likesCount || 0) + (liked ? 1 : -1),
				},
			},
		}));
		try {
			liked ? await likeTrip(tripId) : await unlikeTrip(tripId);
		} catch (e) {
			if (!isCurrentSession()) return;
			// revert on error
			set((s) => ({ trips: { ...s.trips, [tripId]: trip } }));
		}
	},

	loadLikers: async (tripId) => {
		const isCurrent = beginLoad("likers", tripId);
		const data = await getTripLikers(tripId);
		if (!isCurrent()) return;
		set((s) => ({
			trips: { ...s.trips, [tripId]: { ...scopedTrip(s, tripId), likers: data ?? [] } },
		}));
	},

	/* -------- comments -------- */
	loadComments: async (tripId, page = 1) => {
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
		set((s) => ({
			trips: {
				...s.trips,
				[tripId]: {
					...scopedTrip(s, tripId),
					isLikedByCurrentUser: isLiked,
					likesCount: count,
				},
			},
		})),

	setCommentCount: (tripId, count) =>
		set((s) => ({
			trips: { ...s.trips, [tripId]: { ...scopedTrip(s, tripId), commentsCount: count } },
		})),

	setRecCount: (tripId, count) =>
		set((s) => ({
			trips: { ...s.trips, [tripId]: { ...scopedTrip(s, tripId), recommendationCount: count } },
		})),

	/* -------- helper to prime cache from list endpoints -------- */
	primeCounts: (trip) =>
		set((s) => ({
			trips: {
				...s.trips,
				[trip._id]: {
					...scopedTrip(s, trip._id),
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
		set({ trips: {} });
	},
}));
