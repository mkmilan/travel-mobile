// Match the server's trimmed Trip metadata limits without truncating saved text.
export const TRIP_TITLE_MAX_LENGTH = 100;
export const TRIP_DESCRIPTION_MAX_LENGTH = 2000;

export function validateTripMetadata({ title = "", description = "" } = {}) {
	const invalid = message => { throw Object.assign(new Error(message), { code: "TRIP_METADATA_INVALID" }); };
	if (typeof title !== "string" || typeof description !== "string") invalid("Enter text for the trip title and description.");
	// An empty title retains the existing date-based upload fallback; whitespace
	// alone is truthy and would otherwise fail the server's required-title check.
	if (title && !title.trim()) invalid("Enter a trip title, or clear the field to use the default title.");
	if (title.trim().length > TRIP_TITLE_MAX_LENGTH) invalid(`Trip title must be ${TRIP_TITLE_MAX_LENGTH} characters or fewer. Shorten it, then save again.`);
	if (description.trim().length > TRIP_DESCRIPTION_MAX_LENGTH) invalid(`Trip description must be ${TRIP_DESCRIPTION_MAX_LENGTH} characters or fewer. Shorten it, then save again.`);
}
