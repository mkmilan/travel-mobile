import { createTripDeletion } from "@/src/utils/tripDeletion";
import { reconcileDeletedServerTrip, rememberPendingTripDeletion, settlePendingTripDeletion } from "@/src/db/tripDao";
import { ENABLE_POI_UI, ENABLE_SAFE_TRIP_DELETE } from "@/src/constants/featureFlags";
// ...existing imports...
import CommentList from "@/src/components/CommentList";
import TripRecommendationCard from "@/src/components/trip/TripRecommendationCard";
import TransportIcon from "@/src/components/TransportIcon";
// import InteractiveTripMap from "@/src/components/map/InteractiveTripMap";
import TripMapThumbnail from "@/src/components/TripMapThumbnail";
import AddCommentModal from "@/src/components/modals/AddCommentModal";
import AddRecommendationModal from "@/src/components/modals/AddRecommendationModal";
import LikersModal from "@/src/components/modals/LikersModal";
import MapModal from "@/src/components/modals/MapModal";
import RecommendationDetailModal from "@/src/components/modals/RecommendationDetailModal";
import IconStatDisplay from "@/src/components/trip/IconStatDisplay";
import PhotoGallery from "@/src/components/trip/PhotoGallery";
import Section from "@/src/components/trip/Section";
import SocialButton from "@/src/components/trip/SocialButton";
import Avatar from "@/src/components/ui/Avatar";
import {
	addRecommendation,
	addTripComment,
	deleteRecommendation,
	deleteServerTrip,
	deleteTripComment,
	deleteTripPhoto,
	getTripComments,
	getTripJsonById,
	getTripLikers,
	likeTrip,
	unlikeTrip,
	updateRecommendation,
} from "@/src/services/api";
import { useAuthStore } from "@/src/stores/auth";
import { useTripSocialStore } from "@/src/stores/tripSocialStore";
import { theme } from "@/src/theme";
import { calcAvgSpeed, isoToDate, kmOrMiles, msToDuration } from "@/src/utils/format";
import { lineStringToCoords } from "@/src/utils/geo";
import { getPoiNote } from "@/src/utils/poiNote";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	BackHandler,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";

const DropdownMenu = ({ isVisible, onClose, onEdit, onDelete, onAddRecommendation }) => {
	return (
		<Modal transparent visible={isVisible} onRequestClose={onClose} animationType="fade">
			<Pressable style={styles.modalOverlay} onPress={onClose}>
				<View style={styles.dropdownMenu}>
					<Pressable style={styles.dropdownItem} onPress={onEdit}>
						<Feather name="edit-2" size={18} color={theme.colors.text} />
						<Text style={styles.dropdownItemText}>Edit Trip</Text>
					</Pressable>

					<Pressable style={styles.dropdownItem} onPress={onAddRecommendation}>
						<Feather name="star" size={18} color={theme.colors.warning} />
						<Text style={styles.dropdownItemText}>Add a place</Text>
					</Pressable>

					<Pressable style={styles.dropdownItem} onPress={onDelete}>
						<Feather name="trash-2" size={18} color={theme.colors.error} />
						<Text style={[styles.dropdownItemText, { color: theme.colors.error }]}>Delete Trip</Text>
					</Pressable>
				</View>
			</Pressable>
		</Modal>
	);
};

// --- Main Screen Component ---
export default function TripDetailScreen() {
	const router = useRouter();
	const rootNavigation = useNavigation("/");
	const { id: tripId } = useLocalSearchParams();
	const { user: currentUser, token, isAuthenticated, sessionEpoch, isSessionChanging } = useAuthStore();
	const { setRecCount, setLikeState, setCommentCount } = useTripSocialStore();

	const [loadedTrip, setTrip] = useState(null); // Full trip data belongs to its loading context.
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [refreshError, setRefreshError] = useState(null);

	const [selectedRecommendation, setSelectedRecommendation] = useState(null);
	const [isRecDetailModalVisible, setIsRecDetailModalVisible] = useState(false);
	const [isDropdownVisible, setIsDropdownVisible] = useState(false);
	const [showAllPois, setShowAllPois] = useState(false);
	const [showAllRecommendations, setShowAllRecommendations] = useState(false);

	// --- Likers State ---
	const [isLikersModalVisible, setIsLikersModalVisible] = useState(false);
	const [likers, setLikers] = useState([]); // For the modal list
	const [likersLoading, setLikersLoading] = useState(false);
	const [likersError, setLikersError] = useState("");
	const [isLikedByCurrentUser, setIsLikedByCurrentUser] = useState(false);
	const [optimisticLikesCount, setOptimisticLikesCount] = useState(0);

	// --- Comments State ---
	const [comments, setComments] = useState([]); // This will hold fully populated comments
	const [commentsLoading, setCommentsLoading] = useState(false);
	const [commentsError, setCommentsError] = useState("");
	const [isAddCommentModalVisible, setIsAddCommentModalVisible] = useState(false);
	const [isCommentsSectionVisible, setIsCommentsSectionVisible] = useState(false);
	const [isCommentListExpanded, setIsCommentListExpanded] = useState(false);
	const screenContext = useRef(null);
	const recommendationContext = useRef(null);
	const screenMounted = useRef(true);
	const commentsRequest = useRef(null);
	const commentsData = useRef(null);
	if (!screenContext.current || screenContext.current.tripId !== tripId || screenContext.current.userId !== currentUser?._id || screenContext.current.token !== token || screenContext.current.sessionEpoch !== sessionEpoch) {
		screenContext.current = { tripId, userId: currentUser?._id, token, sessionEpoch, key: (screenContext.current?.key || 0) + 1 };
	}
	const renderContext = screenContext.current;
	if (commentsData.current?.context !== renderContext || isSessionChanging) {
		commentsData.current = { context: renderContext, loaded: false, count: 0, revision: 0, ids: new Set(), changes: new Map() };
	}
	// Hidden tab routes can be reused for another ID or login without unmounting.
	// Gate data during render, before effects run, rather than showing the old trip.
	const tripDataContext = useRef(renderContext);
	const errorContext = useRef(renderContext);
	const trip = !isSessionChanging && tripDataContext.current === renderContext && loadedTrip?._id === tripId ? loadedTrip : null;
	const currentError = errorContext.current === renderContext ? error : null;
	const likeRequest = useRef(null);
	const likeRevision = useRef(0);
	const likersRequest = useRef(null);
	const [likePending, setLikePending] = useState(false);
	const isCurrentContext = (context) => {
		const session = useAuthStore.getState();
		return screenMounted.current && context === screenContext.current && session.token === context.token && session.user?._id === context.userId && session.sessionEpoch === context.sessionEpoch && !session.isSessionChanging;
	};
	const isCurrentTrip = (context = renderContext) => isCurrentContext(context) && tripDataContext.current === context && trip?._id === context.tripId;
	useEffect(() => {
		setIsAddCommentModalVisible(false);
		setIsDropdownVisible(false);
		setIsRecDetailModalVisible(false);
		setSelectedRecommendation(null);
		setIsLikersModalVisible(false);
		setLikers([]);
		setLikersError("");
		setLikersLoading(false);
		setMapModalVisible(false);
		setComments([]);
		setCommentsError("");
		setCommentsLoading(false);
		setIsCommentsSectionVisible(false);
		setIsCommentListExpanded(false);
		setShowAllPois(false);
		setShowAllRecommendations(false);
		setLikePending(false);
	}, [tripId, currentUser?._id, token, sessionEpoch, isSessionChanging]);
	useEffect(() => {
		screenMounted.current = true;
		return () => { screenMounted.current = false; };
	}, []);
	// --- Map Modal State ---
	const [isMapModalVisible, setMapModalVisible] = useState(false);

	const addRecommendationModalRef = useRef(null);

	useFocusEffect(useCallback(() => {
		let focused = true;
		const backAction = () => {
			if (!focused) return false;
			// Only Search-origin tabs have source-aware history. Preserve the
			// existing Trips return elsewhere (including direct/deep links).
			const rootState = rootNavigation.getState();
			const fromSearch = rootState.routes[rootState.index - 1]?.name === "search/index";
			if (fromSearch && router.canGoBack()) router.back();
			else router.replace("/(tabs)/trips/");
			return true;
		};

		const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);

		return () => { focused = false; backHandler.remove(); };
	}, [router, rootNavigation]));

	// Retry thumbnails only after a successful current load, not local trip edits
	// or failed refreshes. The same request identity protects data, errors and
	// loading settlement as well as thumbnail retries from overlapping reads.
	const latestTripPhotoRequest = useRef(null);
	const tripPhotoRefreshIdentity = useRef(null);

	const fetchTripDetails = async (isRefetch = false, context = renderContext) => {
		if (!isCurrentContext(context)) return;
		if (!context.tripId) {
			errorContext.current = context;
			setError("Trip ID is missing.");
			setLoading(false);
			return;
		}
		// Focus callbacks retain their first render; carry loaded status through the
		// current request rather than relying on their captured trip value.
		const photoRequest = { context, commentsRevision: commentsData.current.revision, hasData: latestTripPhotoRequest.current?.context === context && latestTripPhotoRequest.current.hasData };
		latestTripPhotoRequest.current = photoRequest;
		if (!isRefetch) {
			// Only show main loading indicator on initial load
			setLoading(true);
		}
		if (isRefetch) setRefreshError(null);
		else setError(null);
		try {
			const data = await getTripJsonById(context.tripId);
			if (!isCurrentContext(context) || latestTripPhotoRequest.current !== photoRequest) return;
			if (data?._id !== context.tripId) throw new Error("The loaded trip did not match this page.");
			errorContext.current = context;
			setError(null); // A successful focus/retry also recovers an earlier initial-load error.
			const likesArray = data.likes || [];
			// Get comment COUNT from initial trip load, but not the comment objects themselves for display
			const initialCommentsArray = data.comments || [];
			// A read started before a confirmed comment action cannot undo its count.
			const collection = commentsData.current;
			if (collection.revision === photoRequest.commentsRevision) {
				if (collection.count !== initialCommentsArray.length) collection.loaded = false;
				collection.count = initialCommentsArray.length;
				collection.ids = new Set(initialCommentsArray.map(comment => typeof comment === "string" ? comment : comment?._id));
			}

			photoRequest.hasData = true;
			tripPhotoRefreshIdentity.current = photoRequest;
			tripDataContext.current = context;
			likeRevision.current += 1;
			setTrip({
				...data,
				likesCount: likesArray.length,
				commentsCount: collection.count,
				// Do NOT store data.comments directly in trip state if they are not populated
			});

			setOptimisticLikesCount(likesArray.length);
			// This accepted server snapshot also supersedes any older optimistic
			// rollback in the shared cache, not only the detail's local heart.
			setLikeState(context.tripId, { isLiked: !!context.userId && likesArray.includes(context.userId), count: likesArray.length });
			if (context.userId) {
				setIsLikedByCurrentUser(likesArray.includes(context.userId));
			} else {
				setIsLikedByCurrentUser(false);
			}

			// If comments are already visible/expanded and need to be (re)loaded
			if (
				isCommentListExpanded ||
				(isCommentsSectionVisible && initialCommentsArray.length > 0 && comments.length === 0)
			) {
				await fetchCommentsData(context); // Keep follow-on reads in the same screen/session.
			}
		} catch (err) {
			if (isCurrentContext(context) && latestTripPhotoRequest.current === photoRequest) {
				const message = err?.message || "Could not load trip details.";
				if (isRefetch && photoRequest.hasData) setRefreshError({ context, message });
				else { errorContext.current = context; setError(message); }
			}
		} finally {
			// The newest refetch may supersede the initial load; it owns its spinner too.
			if (isCurrentContext(context) && latestTripPhotoRequest.current === photoRequest) {
				setLoading(false);
			}
		}
	};

	useEffect(() => {
		fetchTripDetails();
	}, [tripId, currentUser?._id, token, sessionEpoch, isSessionChanging]); // Reload when the screen or auth session changes.

	const deletionActive = useRef(true);
	const deletionController = useRef(null);
	const [deletionState, setDeletionState] = useState(null);

	useFocusEffect(
		useCallback(() => {
			// Refetch trip details when the screen comes into focus to sync server state
			deletionActive.current = true;
			fetchTripDetails(true);
			return () => { deletionActive.current = false; deletionController.current = null; };
		}, [tripId, currentUser?._id, token, sessionEpoch, isSessionChanging])
	);

	const isOwner = isAuthenticated && trip && trip.user?._id === currentUser?._id;

	const handleToggleLike = async () => {
		const context = renderContext;
		if (!isCurrentTrip(context)) return;
		if (!isAuthenticated) {
			Alert.alert("Login Required", "You need to be logged in to like a trip.");
			return;
		}

		if (likeRequest.current?.context === context) return;
		const operation = { context, revision: likeRevision.current };
		likeRequest.current = operation;
		setLikePending(true);
		const isCurrent = () => isCurrentTrip(context) && likeRequest.current === operation;
		const originalLikedState = isLikedByCurrentUser;
		const currentLikes = optimisticLikesCount;

		setIsLikedByCurrentUser(!originalLikedState);
		setOptimisticLikesCount(!originalLikedState ? currentLikes + 1 : Math.max(0, currentLikes - 1));

		// push optimistic state to the slice immediately
		setLikeState(context.tripId, {
			isLiked: !originalLikedState,
			count: !originalLikedState ? currentLikes + 1 : Math.max(0, currentLikes - 1),
		});
		operation.cacheRevision = useTripSocialStore.getState().trips[context.tripId]?.likeRevision;
		try {
			if (!originalLikedState) {
				await likeTrip(context.tripId);
			} else {
				await unlikeTrip(context.tripId);
			}
			// Optionally, the API for like/unlike could return the updated trip/likesCount
			// For now, useFocusEffect will eventually sync.
		} catch (err) {
			// Never roll an old account, route, request, or refreshed snapshot back.
			if (!isCurrent() || likeRevision.current !== operation.revision || useTripSocialStore.getState().trips[context.tripId]?.likeRevision !== operation.cacheRevision) return;
			console.error("Failed to update like status:", err);
			Alert.alert("Error", "Could not update like status. Please try again.");
			setIsLikedByCurrentUser(originalLikedState);
			setOptimisticLikesCount(currentLikes);
			setLikeState(context.tripId, { isLiked: originalLikedState, count: currentLikes });
		} finally {
			if (likeRequest.current === operation) {
				likeRequest.current = null;
				if (isCurrentTrip(context)) setLikePending(false);
			}
		}
	};

	const fetchLikersData = async (context = renderContext) => {
		if (!isCurrentTrip(context)) return;
		const operation = { context };
		likersRequest.current = operation;
		const isCurrent = () => isCurrentTrip(context) && likersRequest.current === operation;
		setLikersLoading(true);
		setLikersError("");
		try {
			const likersData = await getTripLikers(context.tripId); // This API fetches user objects
			if (isCurrent()) setLikers(likersData || []);
		} catch (err) {
			if (isCurrent()) setLikersError(err?.message || "Could not load likers.");
		} finally {
			if (isCurrent()) setLikersLoading(false);
		}
	};

	const handleOpenLikersModal = () => {
		if (!isCurrentTrip()) return;
		fetchLikersData();
		setIsLikersModalVisible(true);
	};

	// Full-list reads are single-flight per screen/session. Reconcile confirmed
	// mutations newer than the read, but let subsequent snapshots be authoritative
	// so a comment removed elsewhere is not retained indefinitely.
	const fetchCommentsData = (context = renderContext) => {
		if (!context.tripId || !isCurrentContext(context)) return Promise.resolve();
		if (commentsRequest.current?.context === context) return commentsRequest.current.promise;
		const operation = { context, revision: commentsData.current.revision };
		commentsRequest.current = operation;
		setCommentsLoading(true);
		setCommentsError("");
		operation.promise = (async () => {
			try {
				const populatedComments = await getTripComments(context.tripId);
				if (!isCurrentContext(context) || commentsRequest.current !== operation) return;
				const collection = commentsData.current;
				const snapshot = populatedComments || [];
				for (const [id, change] of collection.changes) {
					if (change.revision <= operation.revision) collection.changes.delete(id);
				}
				const serverIds = new Set(snapshot.map(comment => comment._id));
				const reconciled = snapshot.filter(comment => collection.changes.get(comment._id)?.comment !== null);
				for (const [id, { comment }] of collection.changes) {
					if (comment && !serverIds.has(id)) reconciled.unshift(comment);
				}
				collection.loaded = true;
				collection.count = reconciled.length;
				collection.ids = new Set(reconciled.map(comment => comment._id));
				collection.revision += 1;
				const count = collection.count;
				setComments(reconciled);
				setTrip((prevTrip) => isCurrentContext(context) && prevTrip?._id === context.tripId
					? { ...prevTrip, commentsCount: count } : prevTrip);
				setCommentCount(context.tripId, count);
			} catch (err) {
				if (isCurrentContext(context) && commentsRequest.current === operation) {
					setCommentsError(`Could not load all comments. ${err?.message || "Please try again."}`);
					// A refresh failure does not discard a successfully posted comment.
				}
			} finally {
				if (commentsRequest.current === operation) {
					commentsRequest.current = null;
					if (isCurrentContext(context)) setCommentsLoading(false);
				}
			}
		})();
		return operation.promise;
	};

	const handleToggleCommentsSection = () => {
		if (!isCurrentTrip()) return;
		const newVisibility = !isCommentsSectionVisible;
		setIsCommentsSectionVisible(newVisibility);
		if (newVisibility && (trip?.comments || []).length === 0 && (trip?.commentsCount || 0) > 0 && !commentsLoading) {
			fetchCommentsData();
		}
		if (!newVisibility) {
			setIsCommentListExpanded(false);
		}
	};

	const handleToggleCommentList = () => {
		if (!isCurrentTrip()) return;
		const newExpandedState = !isCommentListExpanded;
		setIsCommentListExpanded(newExpandedState);
		if (newExpandedState && (!commentsData.current.loaded || commentsError || comments.length !== (trip?.commentsCount || 0))) {
			fetchCommentsData();
		}
	};

	const handleAddCommentSubmit = async (text) => {
		const context = renderContext;
		const isCurrent = () => isCurrentTrip(context);
		if (!isCurrent()) throw new Error("The trip or account changed. Reopen the comment form.");
		if (!tripId || !isAuthenticated) {
			Alert.alert("Error", "You must be logged in to comment.");
			throw new Error("Not authenticated");
		}
		try {
			const newComment = await addTripComment(context.tripId, text);
			if (!isCurrent()) return;
			const collection = commentsData.current;
			// A concurrent GET may already include this saved comment before its
			// POST response arrives. Do not count that same record twice.
			collection.revision += 1;
			if (!collection.ids.has(newComment._id)) {
				collection.changes.set(newComment._id, { comment: newComment, revision: collection.revision });
				collection.ids.add(newComment._id);
				collection.count += 1;
			}
			const count = collection.count;
			setComments((prevComments) => isCurrent() ? [newComment, ...(prevComments || []).filter(comment => comment._id !== newComment._id)] : prevComments);
			if (trip) {
				setTrip((prevTrip) => isCurrent() && prevTrip?._id === context.tripId ? {
					...prevTrip,
					commentsCount: count,
				} : prevTrip);
				setCommentCount(context.tripId, count);
			}
			if (!isCommentListExpanded) setIsCommentListExpanded(true);
			if (!isCommentsSectionVisible) setIsCommentsSectionVisible(true);
			// Posting succeeded: close the form without coupling its success to this
			// read. Retry below only reloads comments; it never repeats the POST.
			if (!collection.loaded || commentsError) fetchCommentsData(context);
		} catch (err) {
			if (isCurrent()) Alert.alert("Error", err?.message || "Could not post comment.");
			throw err;
		}
	};

	const handleDeleteComment = async (commentId) => {
		const context = renderContext;
		const isCurrent = () => isCurrentTrip(context);
		if (!isAuthenticated || !isCurrent()) return;
		Alert.alert("Delete Comment", "Are you sure you want to delete this comment?", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Delete",
				style: "destructive",
				onPress: async () => {
					if (!isCurrent()) return;
					try {
						await deleteTripComment(context.tripId, commentId);
						if (!isCurrent()) return;
						const collection = commentsData.current;
						collection.revision += 1;
						collection.changes.set(commentId, { comment: null, revision: collection.revision });
						if (!collection.loaded || collection.ids.has(commentId)) collection.count = Math.max(0, collection.count - 1);
						collection.ids.delete(commentId);
						const count = collection.count;
						setComments((prevComments) => isCurrent() ? (prevComments || []).filter((comment) => comment._id !== commentId) : prevComments);
						if (trip && typeof trip.commentsCount === "number" && trip.commentsCount > 0) {
							setTrip((prevTrip) => isCurrent() && prevTrip?._id === context.tripId ? {
								...prevTrip,
								commentsCount: count,
							} : prevTrip);
							setCommentCount(context.tripId, count);
						}
					} catch (err) {
						if (isCurrent()) Alert.alert("Error", err?.message || "Could not delete comment.");
					}
				},
			},
		]);
	};

	const handleEdit = () => {
		if (!isCurrentTrip() || !isOwner) return;
		setIsDropdownVisible(false);
		router.push(`/trip/${tripId}/edit`);
	};

	// Confirmation callbacks belong to this screen, route and login epoch.
	const getDeletionController = () => {
		const context = renderContext;
		if (deletionController.current?.context === context) return deletionController.current.action;
		const entry = { context };
		const isSessionCurrent = () => {
			const session = useAuthStore.getState();
			return !!context.userId && !!context.token && session.user?._id === context.userId && session.token === context.token && session.sessionEpoch === context.sessionEpoch && !session.isSessionChanging;
		};
		entry.action = createTripDeletion({
			context: { ...context, isSessionCurrent, isCurrent: () => isCurrentContext(context) && deletionActive.current && deletionController.current === entry },
			remove: deleteServerTrip,
			prepare: rememberPendingTripDeletion,
			settle: settlePendingTripDeletion,
			reconcile: reconcileDeletedServerTrip,
			invalidate: id => useTripSocialStore.getState().invalidateDeletedTrip(id),
			onChange: state => setDeletionState({ ...state, context, identity: entry }),
			onComplete: (localError, receipt) => {
				if (receipt.cleanupPending || localError) Alert.alert(receipt.cleanupPending ? "Trip removed; cleanup pending" : "Trip deleted online", [receipt.cleanupPending ? "Some associated content still needs cleanup. Use Retry cleanup in My Trips; no automatic cleanup worker is running. If cleanup stays pending, storage may need review." : null, localError].filter(Boolean).join("\n\n"));
				router.replace("/(tabs)/trips/");
			},
		});
		deletionController.current = entry;
		return entry.action;
	};
	const currentDeletion = deletionState?.context === renderContext && deletionState.identity === deletionController.current ? deletionState : null;
	const handleDelete = () => {
		setIsDropdownVisible(false);
		if (!isCurrentContext(renderContext) || !deletionActive.current || trip?._id !== tripId || String(trip?.user?._id || trip?.user) !== String(currentUser?._id)) return;
		if (!ENABLE_SAFE_TRIP_DELETE) { Alert.alert("Deletion unavailable", "Safe trip deletion is not available yet. Your trip has not been changed."); return; }
		const action = getDeletionController();
		if (action.getState().pending || action.getState().completed) return;
		Alert.alert("Permanently delete trip?", "This permanently deletes this trip, its route, your associated places, comments and likes, and your photos that are not used elsewhere. This cannot be undone. Unsynced and active recordings on this phone are kept.", [
			{ text: "Cancel", style: "cancel" },
			{ text: "Delete permanently", style: "destructive", onPress: () => action.run() },
		]);
	};

	const handleAddRecommendation = () => {
		if (!isCurrentTrip() || !isOwner) return;
		setIsDropdownVisible(false);
		addRecommendationModalRef.current?.open(null, tripId, {
			requireLocationSelection: true,
			routeCoordinates: trip.simplifiedRoute?.coordinates,
		});
	};

	const handleEditRecommendation = (recommendation) => {
		if (!isCurrentTrip() || !trip.recommendations?.some(rec => rec._id === recommendation?._id)) return;
		addRecommendationModalRef.current?.openEdit(recommendation);
	};

	const handleRecommendationSubmit = async (
		recommendationData,
		isEditMode = false,
		shouldRefreshImmediately = true
	) => {
		const context = renderContext;
		const isCurrent = () => isCurrentTrip(context);
		if (!context.tripId || !isAuthenticated || !isCurrent()) {
			throw new Error("The trip or account changed. Reopen the place form.");
		}
		// Refresh in the background: a full loading screen would unmount the
		// submitting modal before its photo uploads can finish.
		const refreshCallback = () => {
			if (isCurrent()) return fetchTripDetails(true, context);
		};
		try {
			if (isEditMode) {
				const updatedRecommendation = await updateRecommendation(recommendationData._id, recommendationData);
				if (!isCurrent()) return;
				if (shouldRefreshImmediately) void refreshCallback();
				return { ...updatedRecommendation, refreshCallback };
			}
			const newRecommendation = await addRecommendation({ ...recommendationData, tripId: context.tripId });
			if (!isCurrent()) return;
			if (shouldRefreshImmediately) void refreshCallback();
			setRecCount(context.tripId, (trip?.recommendations?.length || 0) + 1);
			return { ...newRecommendation, refreshCallback };
		} catch (error) {
			if (isCurrent()) Alert.alert("Error", isEditMode ? "Failed to update the place" : "Failed to add a place");
			throw error;
		}
	};

	const handleShare = () => { if (isCurrentTrip()) Alert.alert("Share", "Share functionality to be implemented."); };

	const handleViewRecommendationDetail = (rec) => {
		if (!isCurrentTrip()) return;
		recommendationContext.current = renderContext;
		const freshRec = trip.recommendations?.find((r) => r._id === rec._id) || rec;
		console.log("🔍 Opening recommendation detail:", freshRec.name, "photos:", freshRec.photos?.length || 0);
		setSelectedRecommendation(freshRec);
		setIsRecDetailModalVisible(true);
	};

	// Handle recommendation deletion
	const handleDeleteRecommendation = async (recommendation) => {
		const context = renderContext;
		const isCurrent = () => isCurrentTrip(context);
		if (!isOwner || !isCurrent()) return; // Only trip owner can delete recommendations

		Alert.alert(
			"Delete place",
			`Are you sure you want to delete "${recommendation.name || "this place"}"?`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: async () => {
						if (!isCurrent()) return;
						try {
							await deleteRecommendation(recommendation._id);
							if (!isCurrent()) return;

							// Update trip state immediately
							setTrip((prevTrip) => {
								if (!isCurrent() || prevTrip?._id !== context.tripId) return prevTrip;

								const updatedRecommendations =
									prevTrip.recommendations?.filter((rec) => rec._id !== recommendation._id) || [];

								return {
									...prevTrip,
									recommendations: updatedRecommendations,
								};
							});

							// Update store count
							setRecCount(tripId, (trip?.recommendations?.length || 1) - 1);

							Alert.alert("Success", "Place deleted successfully");
						} catch (error) {
							if (isCurrent()) Alert.alert("Error", "Failed to delete the place");
						}
					},
				},
			]
		);
	};

	//  Handle long press on recommendation card
	const handleRecommendationLongPress = (rec) => {
		if (isOwner) {
			handleDeleteRecommendation(rec);
		}
	};

	// console.log("Trip details TRIP{ID} PAGE:", trip?.recommendations);
	if (!trip && (loading || !currentError)) {
		// Show loading only if trip is not yet set
		return (
			<View style={styles.centered}>
				<ActivityIndicator size="large" color={theme.colors.primary} />
			</View>
		);
	}

	if (currentError) {
		// Show error if error state is set
		return (
			<View style={styles.centered}>
				<Text style={styles.errorText}>{currentError}</Text>
				<Pressable onPress={() => router.back()} style={styles.button}>
					<Text style={styles.buttonText}>Go Back</Text>
				</Pressable>
			</View>
		);
	}

	if (!trip) {
		// Fallback if trip is null after loading and no error (should be rare)
		return (
			<View style={styles.centered}>
				<Text style={styles.errorText}>Trip not found.</Text>
				<Pressable onPress={() => router.back()} style={styles.button}>
					<Text style={styles.buttonText}>Go Back</Text>
				</Pressable>
			</View>
		);
	}

	// --- Derived Data for Display (now that trip is guaranteed to be non-null) ---
	const tripUser = trip.user || {};
	const distance = kmOrMiles(trip.distanceMeters);
	const duration = msToDuration(trip.durationMillis);
	const avgSpeedDisplay = `${calcAvgSpeed(trip.distanceMeters, trip.durationMillis)} ${
		kmOrMiles(1000).endsWith("km") ? "km/h" : "mph"
	}`;
	const mapCoords = lineStringToCoords(trip.simplifiedRoute);
	const travelMode = trip.defaultTravelMode || "car";

	let visibilityIcon = "eye";
	let visibilityText = "Public";
	if (trip.defaultTripVisibility === "followers_only") {
		visibilityIcon = "users";
		visibilityText = "Followers Only";
	} else if (trip.defaultTripVisibility === "private") {
		visibilityIcon = "lock";
		visibilityText = "Private";
	}

	const recommendations = trip.recommendations || [];
	const pois = trip.pointsOfInterest || []; // Corrected from your JSON: pointsOfInterest

	/* helper only for owner */
	const handleRemovePhoto = async (photoId) => {
		const context = renderContext;
		const isCurrent = () => isCurrentTrip(context);
		if (!isOwner || !isCurrent()) return;
		try {
			await deleteTripPhoto(context.tripId, photoId);
			if (!isCurrent()) return;
			setTrip((t) => isCurrent() && t?._id === context.tripId ? { ...t, photos: (t.photos || []).filter((id) => id !== photoId) } : t);
		} catch (e) {
			if (isCurrent()) Alert.alert("Delete failed", e?.message || "Could not delete photo.");
		}
	};

	// Apply only a confirmed photo deletion from the detail modal.
	const handlePhotoDeleted = (recommendationId, photoId) => {
		if (!isCurrentTrip()) return;
		// Keep the trip and its open recommendation in sync after confirmation.
		setTrip((prevTrip) => {
			if (!prevTrip) return prevTrip;

			const updatedRecommendations =
				prevTrip.recommendations?.map((rec) => {
					if (rec._id === recommendationId) {
						return {
							...rec,
							photos: rec.photos?.filter((id) => id !== photoId) || [],
						};
					}
					return rec;
				}) || [];

			return {
				...prevTrip,
				recommendations: updatedRecommendations,
			};
		});

		// Also update selectedRecommendation if it's the same one
		setSelectedRecommendation((prevSelected) => {
			if (prevSelected?._id === recommendationId) {
				return {
					...prevSelected,
					photos: prevSelected.photos?.filter((id) => id !== photoId) || [],
				};
			}
			return prevSelected;
		});
	};

	return (
		<ScrollView style={styles.container} nestedScrollEnabled={true}>
			{currentDeletion?.pending && <Text accessibilityRole="alert" testID="trip-delete-pending">Deleting trip and associated content… Please wait for confirmation.</Text>}
			{currentDeletion?.error && <View testID="trip-delete-error">
				<Text accessibilityRole="alert" style={styles.errorTextSmall}>{currentDeletion.error}</Text>
				<Pressable testID="trip-delete-retry" disabled={currentDeletion.pending} onPress={currentDeletion.completed ? () => { if (isCurrentContext(renderContext) && deletionActive.current) router.replace("/(tabs)/trips/"); } : handleDelete} style={styles.button}><Text style={styles.buttonText}>{currentDeletion.completed ? "Back to trips" : "Retry deletion"}</Text></Pressable>
			</View>}
			{refreshError?.context === renderContext && (
				<View testID="trip-refresh-error">
					<Text accessibilityRole="alert" style={styles.errorTextSmall}>{refreshError.message}</Text>
					<Pressable testID="trip-refresh-retry" onPress={() => fetchTripDetails(true, renderContext)} style={styles.button}>
						<Text style={styles.buttonText}>Retry refresh</Text>
					</Pressable>
				</View>
			)}
			<View style={styles.header}>
				<Pressable onPress={() => { if (isCurrentTrip()) router.push(`/user/${tripUser._id}`); }} style={styles.userInfo}>
					<Avatar
						user={tripUser}
						photoId={tripUser.profilePictureUrl}
						size={28}
						style={{ marginRight: theme.space.sm }}
					/>
					<Text style={styles.userName}>{tripUser.username || "Unknown User"}</Text>
				</Pressable>
				{isOwner && (
					<Pressable disabled={currentDeletion?.pending} onPress={() => { if (isCurrentTrip()) setIsDropdownVisible(true); }} style={styles.menuButton}>
						<Feather name="more-vertical" size={24} color={theme.colors.text} />
					</Pressable>
				)}
			</View>

			<Text style={styles.tripTitle}>{trip.title || "Untitled Trip"}</Text>
			{(trip.startLocationName || trip.endLocationName) && (
				<Text style={styles.routeText}>
					From: {trip.startLocationName || "N/A"} → To: {trip.endLocationName || "N/A"}
				</Text>
			)}
			<Text style={styles.dateText}>{isoToDate(trip.startDate || trip.createdAt)}</Text>

			{trip.description && <Text style={styles.description}>{trip.description}</Text>}

			<Section title="Route Map">
				{/* <InteractiveTripMap routeCoords={mapCoords} pois={pois} style={{ marginBottom: theme.space.md }} /> */}
				<TouchableOpacity onPress={() => { if (isCurrentTrip()) setMapModalVisible(true); }}>
					<TripMapThumbnail coords={mapCoords} style={{ height: 300, marginBottom: theme.space.md }} />
				</TouchableOpacity>
			</Section>

			<View style={styles.statsGrid}>
				<IconStatDisplay
					customIcon={<TransportIcon mode={travelMode} size={20} color={theme.colors.textMuted} />}
					value={travelMode.charAt(0).toUpperCase() + travelMode.slice(1)}
					label="Mode"
				/>
				<IconStatDisplay iconName={visibilityIcon} value={visibilityText} label="Visibility" />
				<IconStatDisplay iconName="map-pin" value={distance} label="Distance" />
				<IconStatDisplay iconName="clock" value={duration} label="Duration" />
				<IconStatDisplay iconName="activity" value={avgSpeedDisplay} label="Avg. Speed" />
			</View>

			{/* Social Bar */}
			<View style={styles.socialBar}>
				<View style={styles.likeButtonContainer}>
					<TouchableOpacity onPress={handleToggleLike} disabled={likePending} style={styles.socialIconPressable}>
						<Feather
							name="heart"
							size={20}
							color={optimisticLikesCount > 0 ? theme.colors.error : theme.colors.textMuted}
							fill={isLikedByCurrentUser ? theme.colors.error : "none"}
						/>
					</TouchableOpacity>
					<TouchableOpacity onPress={handleOpenLikersModal} style={styles.socialCountPressable}>
						<Text
							style={[
								styles.socialCountText,
								(isLikedByCurrentUser || optimisticLikesCount > 0) && { color: theme.colors.error },
							]}
						>
							{optimisticLikesCount}
						</Text>
					</TouchableOpacity>
				</View>
				<SocialButton iconName="message-circle" count={trip.commentsCount || 0} onPress={handleToggleCommentsSection} />
				{/* <SocialButton iconName="star" countComponent={<SocialCount trip={trip} type="recs" />} /> */}
				<SocialButton iconName="star" count={trip.recommendations?.length || 0} />
				<SocialButton iconName="share-2" onPress={handleShare} />
			</View>

			{/* Comments Section */}
			{isCommentsSectionVisible && (
				<Section title="Comments">
					<TouchableOpacity style={styles.addCommentCard} onPress={() => { if (isCurrentTrip()) setIsAddCommentModalVisible(true); }}>
						<Feather name="plus-circle" size={20} color={theme.colors.primary} />
						<Text style={styles.addCommentCardText}>
							{(trip.commentsCount || 0) === 0 ? "Be the first to comment!" : "Add a comment"}
						</Text>
					</TouchableOpacity>

					{(trip.commentsCount || 0) > 0 && (
						<TouchableOpacity onPress={handleToggleCommentList} style={styles.viewCommentsButton}>
							<Text style={styles.viewCommentsButtonText}>
								{isCommentListExpanded ? "Hide comments" : `View all ${trip.commentsCount} comments`}
							</Text>
							<Feather
								name={isCommentListExpanded ? "chevron-up" : "chevron-down"}
								size={20}
								color={theme.colors.primary}
							/>
						</TouchableOpacity>
					)}

					{isCommentListExpanded && (
						<View>
							{commentsLoading && <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: theme.space.md }} />}
							{!!commentsError && (
								<View>
									<Text style={styles.errorTextSmall} accessibilityRole="alert">{commentsError}</Text>
									<Pressable testID="trip-comments-retry" accessibilityRole="button" onPress={() => fetchCommentsData()}>
										<Text style={styles.viewCommentsButtonText}>Retry loading comments</Text>
									</Pressable>
								</View>
							)}
							{comments.length > 0 ? (
								<CommentList comments={comments} currentUserId={currentUser?._id} onDeleteComment={handleDeleteComment} />
							) : !commentsLoading && !commentsError && (trip.commentsCount || 0) > 0 ? (
								<Text style={styles.emptySectionText}>No comments found.</Text>
							) : null}
						</View>
					)}
				</Section>
			)}
			{ENABLE_POI_UI && <Section
				title="Points of Interest"
				onSeeAll={pois.length > 3 ? () => setShowAllPois(!showAllPois) : undefined}
				isExpanded={showAllPois}
			>
				{pois.length > 0 ? (
					(showAllPois ? pois : pois.slice(0, 3)).map((poi, index) => (
						<Pressable
							key={poi._id || `poi-${index}`}
							style={styles.listItem}
							onPress={() => Alert.alert("POI Detail", getPoiNote(poi) || "View POI")}
						>
							<Feather name="map-pin" size={16} color={theme.colors.primary} style={styles.listItemIcon} />
							<Text style={styles.listItemText}>{getPoiNote(poi) || `POI ${index + 1}`}</Text>
						</Pressable>
					))
				) : (
					<Text style={styles.emptySectionText}>No points of interest added.</Text>
				)}
			</Section>}

			{trip.photos?.length > 0 && (
				<View style={styles.gallery}>
					<PhotoGallery photoIds={trip.photos} canDelete={isOwner} onDelete={handleRemovePhoto} />
				</View>
			)}

			<Section
				title="Places from this trip"
				onSeeAll={recommendations.length > 3 ? () => setShowAllRecommendations(!showAllRecommendations) : undefined}
				isExpanded={showAllRecommendations}
			>
				{recommendations.length > 0 ? (
					(showAllRecommendations ? recommendations : recommendations.slice(0, 3)).map((rec) => (
						<TripRecommendationCard
							key={rec._id}
							rec={rec}
							photoRefreshIdentity={tripPhotoRefreshIdentity.current}
							onPress={() => handleViewRecommendationDetail(rec)}
							onLongPress={isOwner ? () => handleRecommendationLongPress(rec) : undefined}
						/>
					))
				) : (
					<Text style={styles.emptySectionText}>No places added.</Text>
				)}
			</Section>

			<View style={{ height: 50 }} />

			<DropdownMenu
				isVisible={isDropdownVisible}
				onClose={() => { if (isCurrentTrip()) setIsDropdownVisible(false); }}
				onEdit={handleEdit}
				onDelete={handleDelete}
				onAddRecommendation={handleAddRecommendation}
			/>
			<AddRecommendationModal key={screenContext.current.key} ref={addRecommendationModalRef} onSubmit={handleRecommendationSubmit} />
			<RecommendationDetailModal
				key={renderContext.key}
				isVisible={isRecDetailModalVisible && recommendationContext.current === renderContext}
				onClose={() => { if (isCurrentTrip()) setIsRecDetailModalVisible(false); }}
				recommendation={recommendationContext.current === renderContext ? selectedRecommendation : null}
				tripUserId={trip?.user?._id}
				onEdit={handleEditRecommendation}
				tripRouteCoordinates={mapCoords}
				onRefresh={() => fetchTripDetails(true)}
				onPhotoDeleted={handlePhotoDeleted}
			/>
			<LikersModal
				isVisible={isLikersModalVisible}
				onClose={() => { if (isCurrentTrip()) setIsLikersModalVisible(false); }}
				likers={likers} // This is the list of user objects for the modal
				isLoading={likersLoading}
				error={likersError}
			/>
			<AddCommentModal
				key={screenContext.current.key}
				isVisible={isAddCommentModalVisible}
				onClose={() => { if (isCurrentTrip()) setIsAddCommentModalVisible(false); }}
				onSubmit={handleAddCommentSubmit}
			/>
			<MapModal
				key={screenContext.current.key}
				visible={isMapModalVisible}
				onClose={() => { if (isCurrentTrip()) setMapModalVisible(false); }}
				routeCoords={mapCoords}
				pois={pois}
				recommendations={recommendations}
			/>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: theme.colors.background,
		paddingHorizontal: theme.space.md,
	},
	centered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		padding: theme.space.lg,
	},
	errorText: {
		fontSize: theme.fontSize.md,
		color: theme.colors.error,
		textAlign: "center",
		marginBottom: theme.space.md,
	},
	errorTextSmall: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.error,
		textAlign: "center",
		paddingVertical: theme.space.md,
	},
	button: {
		backgroundColor: theme.colors.primary,
		paddingVertical: theme.space.sm,
		paddingHorizontal: theme.space.md,
		borderRadius: theme.radius.sm,
	},
	buttonText: {
		color: "#fff",
		fontWeight: "600",
		fontSize: theme.fontSize.md,
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: theme.space.md,
	},
	userInfo: {
		flexDirection: "row",
		alignItems: "center",
	},
	profileImagePlaceholder: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: theme.colors.inputBorder,
		justifyContent: "center",
		alignItems: "center",
		marginRight: theme.space.sm,
	},
	userName: {
		fontSize: theme.fontSize.md,
		fontWeight: "600",
		color: theme.colors.text,
	},
	menuButton: {
		padding: theme.space.sm,
	},
	tripTitle: {
		fontSize: 24,
		fontWeight: "bold",
		color: theme.colors.text,
		marginBottom: theme.space.xs,
	},
	routeText: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.textMuted,
		marginBottom: theme.space.xs,
	},
	dateText: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.textMuted,
		marginBottom: theme.space.md,
	},
	description: {
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
		lineHeight: theme.fontSize.md * 1.5,
		marginBottom: theme.space.lg,
	},
	statsGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-around",
		marginBottom: theme.space.lg,
		backgroundColor: theme.colors.inputBackground,
		paddingVertical: theme.space.sm,
		borderRadius: theme.radius.md,
	},
	gallery: { marginBottom: theme.space.lg },
	socialBar: {
		flexDirection: "row",
		justifyContent: "space-around",
		alignItems: "center",
		paddingVertical: theme.space.sm,
		marginBottom: theme.space.md,
		backgroundColor: theme.colors.inputBackground,
		borderRadius: theme.radius.md,
	},
	likeButtonContainer: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: theme.space.sm,
	},
	socialIconPressable: {
		padding: theme.space.xs,
	},
	socialCountPressable: {
		paddingLeft: theme.space.xs,
		paddingVertical: theme.space.xs,
		alignItems: "center",
		justifyContent: "center",
	},
	socialCountText: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.textMuted,
		fontWeight: "500",
	},
	addCommentCard: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: theme.colors.inputBackground,
		borderRadius: theme.radius.md,
		padding: theme.space.md,
		marginBottom: theme.space.md,
		shadowColor: "#000",
		shadowOpacity: 0.05,
		shadowRadius: 4,
		elevation: 2,
	},
	addCommentCardText: {
		marginLeft: theme.space.sm,
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
		fontWeight: "600",
	},
	viewCommentsButton: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: theme.space.sm,
		paddingHorizontal: theme.space.xs,
		marginBottom: theme.space.md,
		backgroundColor: theme.colors.inputBackground,
		borderRadius: theme.radius.md,
	},
	viewCommentsButtonText: {
		color: theme.colors.primary,
		fontWeight: "500",
		fontSize: theme.fontSize.md,
		marginLeft: theme.space.sm,
	},
	listItem: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: theme.colors.inputBackground,
		padding: theme.space.md,
		borderRadius: theme.radius.sm,
		marginBottom: theme.space.sm,
	},
	listItemIcon: {
		marginRight: theme.space.sm,
	},
	listItemText: {
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
		flex: 1,
	},
	emptySectionText: {
		fontSize: theme.fontSize.sm,
		color: theme.colors.textMuted,
		textAlign: "center",
		paddingVertical: theme.space.md,
	},
	placeholderText: {
		textAlign: "center",
		color: theme.colors.textMuted,
		paddingVertical: theme.space.lg,
		fontStyle: "italic",
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		justifyContent: "flex-start",
		alignItems: "flex-end",
		paddingTop: 80,
		paddingRight: theme.space.md,
	},
	dropdownMenu: {
		backgroundColor: theme.colors.background,
		borderRadius: theme.radius.md,
		paddingVertical: theme.space.sm,
		minWidth: 180,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 5,
	},
	dropdownItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: theme.space.md,
		paddingVertical: theme.space.sm,
	},
	dropdownItemText: {
		marginLeft: theme.space.sm,
		fontSize: theme.fontSize.md,
		color: theme.colors.text,
		fontWeight: "500",
	},
});
