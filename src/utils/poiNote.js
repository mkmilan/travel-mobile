// Matches the API's POI description limit. Do not truncate existing notes:
// rejected legacy drafts must remain available for the owner to edit.
export const POI_NOTE_MAX_LENGTH = 500;

export function validatePoiNote(note = "") {
	if (typeof note !== "string") throw new Error("Enter a text note for this POI.");
	if (note.length > POI_NOTE_MAX_LENGTH) {
		throw new Error(`POI note must be ${POI_NOTE_MAX_LENGTH} characters or fewer. Shorten the note, then save again.`);
	}
	return note;
}

// Local recordings use note; the server returns that same text as description.
export const getPoiNote = (poi) => poi?.note ?? poi?.description ?? "";
