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

export const useTripSocialStore = create((set, get) => ({
	trips: {}, // { [tripId]: {likesCount, isLikedByCurrentUser, ...} }

	/* -------- likes -------- */
	toggleLike: async (tripId) => {
		const trip = get().trips[tripId] || {};
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
			// revert on error
			set((s) => ({ trips: { ...s.trips, [tripId]: trip } }));
		}
	},

	loadLikers: async (tripId) => {
		const data = await getTripLikers(tripId);
		set((s) => ({
			trips: { ...s.trips, [tripId]: { ...s.trips[tripId], likers: data ?? [] } },
		}));
	},

	/* -------- comments -------- */
	loadComments: async (tripId, page = 1) => {
		const data = await getTripComments(tripId, page); // ← array
		set((s) => ({
			trips: {
				...s.trips,
				[tripId]: {
					...s.trips[tripId],
					comments: data ?? [],
					commentsCount: (data ?? []).length, // 🔑 keep counter in sync
				},
			},
		}));
	},
	addComment: async (tripId, text) => {
		const comment = await addTripComment(tripId, text);
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
		// call the new endpoint that returns the full trip JSON
		const trip = await getTripJsonById(tripId); // ← uses your API
		// console.log(`[tripSocialStore] loadRecommendations for trip `, trip);

		const list = trip?.recommendations ?? []; // always an array

		set((s) => ({
			trips: {
				...s.trips,
				[tripId]: {
					...s.trips[tripId],
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
					...s.trips[tripId],
					isLikedByCurrentUser: isLiked,
					likesCount: count,
				},
			},
		})),

	setCommentCount: (tripId, count) =>
		set((s) => ({
			trips: { ...s.trips, [tripId]: { ...s.trips[tripId], commentsCount: count } },
		})),

	setRecCount: (tripId, count) =>
		set((s) => ({
			trips: { ...s.trips, [tripId]: { ...s.trips[tripId], recommendationCount: count } },
		})),

	/* -------- helper to prime cache from list endpoints -------- */
	primeCounts: (trip) =>
		set((s) => ({
			trips: {
				...s.trips,
				[trip._id]: {
					...s.trips[trip._id],
					likesCount: trip.likesCount,
					commentsCount: trip.commentsCount,
					recommendationCount: trip.recommendationCount,
					isLikedByCurrentUser: trip.isLikedByCurrentUser,
				},
			},
		})),

	/* ─────────── RESET (for logout) ─────────── */
	reset: () => set({ trips: {} }),
}));
