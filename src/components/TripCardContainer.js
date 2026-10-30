import useViewerUnits from "@/src/hooks/useViewerUnits";
// components/TripCardContainer.js
import useTripSocial from "@/src/hooks/useTripSocial";
import { calcAvgSpeed, isoToDate, kmOrMiles, msToDuration, speedUnit } from "@/src/utils/format";
import { lineStringToCoords } from "@/src/utils/geo";
import TripCard from "./TripCard";

/**
 * Wraps the dumb <TripCard/> with formatted numbers
 * and the shared social-state actions.
 */
export default function TripCardContainer({ trip, onOpenSheet, onPress, userNameOverride, user, canAct, shareOwnerId, primeOnMount = true }) {
	const units = useViewerUnits();
	const { likesCount, commentsCount, recommendationCount, isLiked, likePending, toggleLike } = useTripSocial(trip, primeOnMount);

	/* ---- format everything exactly like the old page did ---- */
	const distanceLabel = kmOrMiles(trip.distanceMeters, units);
	const durationLabel = msToDuration(trip.durationMillis);
	const avgSpeedLabel = calcAvgSpeed(trip.distanceMeters, trip.durationMillis, units);
	const coords = lineStringToCoords(trip.simplifiedRoute);

	const displayUser = userNameOverride || trip?.user?.username || "Unknown User";

	return (
		<TripCard
			/* static trip info */
			user={user}
			tripId={trip._id}
			title={trip.title}
			userName={displayUser}
			visibility={trip.defaultTripVisibility}
			description={trip.description}
			date={isoToDate(trip.startDate)}
			distanceKm={distanceLabel}
			durationStr={durationLabel}
			avgSpeed={avgSpeedLabel}
			avgSpeedUnit={speedUnit(units)}
			travelMode={trip.defaultTravelMode}
			coords={coords}
			/* live counts */
			likes={likesCount}
			comments={commentsCount}
			recommendationsCount={recommendationCount}
			isLikedByCurrentUser={isLiked}
			likePending={likePending}
			/* actions */
			onLikePress={() => { if (!canAct || canAct()) return toggleLike(); }}
			onOpenLikersModalPress={() => onOpenSheet("likers", trip)}
			onCommentPress={() => onOpenSheet("comments", trip)}
			onRecommendPress={() => onOpenSheet("recs", trip)}
			shareTrip={trip}
			canShareAction={canAct}
			shareOwnerId={shareOwnerId}
			onPress={onPress}
		/>
	);
}
