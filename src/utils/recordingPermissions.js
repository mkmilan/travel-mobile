/** Check both permissions before creating/resuming a track. Dependencies are
 * injected so tests never trigger native permission prompts or collect location.
 * isCurrentSession must retain the caller's original login epoch and mounted
 * operation from before its first await, not recapture credentials on completion. */
export async function ensureRecordingPermissions({ location, isCurrentSession, confirmBackground, onBlocked }) {
  if (!isCurrentSession()) return false;
  let foreground = await location.getForegroundPermissionsAsync();
  if (!isCurrentSession()) return false;
  if (foreground.status !== 'granted') {
    if (foreground.canAskAgain === false) {
      onBlocked('foreground', true);
      return false;
    }
    foreground = await location.requestForegroundPermissionsAsync();
    if (!isCurrentSession()) return false;
    if (foreground.status !== 'granted') {
      onBlocked('foreground', foreground.canAskAgain === false);
      return false;
    }
  }
  let background = await location.getBackgroundPermissionsAsync();
  if (!isCurrentSession()) return false;
  if (background.status !== 'granted') {
    if (background.canAskAgain === false) {
      onBlocked('background', true);
      return false;
    }
    // Android may open Settings; explain why before handing control to the OS.
    const accepted = await confirmBackground();
    if (!accepted || !isCurrentSession()) return false;
    background = await location.requestBackgroundPermissionsAsync();
    if (!isCurrentSession()) return false;
    if (background.status !== 'granted') {
      onBlocked('background', background.canAskAgain === false);
      return false;
    }
  }
  return isCurrentSession();
}
