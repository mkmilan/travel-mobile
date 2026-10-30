import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import uuid from "react-native-uuid";

/**
 * Copy an image into FileSystem.cacheDirectory and shrink the longer edge to 1600 px.
 * Returns the new local `file://` URI (ready for <Image/>).
 */
export async function copyAndResizeAsync(originalUri) {
	// Each selection owns an immutable file. Reusing an original basename could
	// overwrite the bytes of a pending upload and invalidate its retry identity.
	const filename = `photo_${uuid.v4()}.jpg`;
	const target = FileSystem.cacheDirectory + filename;

	// 2. Resize (keeps aspect ratio)
	const { uri: resizedUri } = await ImageManipulator.manipulateAsync(
		originalUri,
		// [{ resize: { width: 1600, height: 1600 } }],
		[],
		{ compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
	);

	// 3. Copy into cache dir so RN can read it even if it came from content://
	await FileSystem.copyAsync({ from: resizedUri, to: target });
	return target;
}
