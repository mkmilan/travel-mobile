import uuid from 'react-native-uuid';

// This names a local selection, not its contents. The server independently binds
// the key to the uploaded bytes. Reusing an immutable URI after a lost response
// therefore retries the same operation without reading image bytes in JS.
const PHOTO_UPLOAD_NAMESPACE = '80f63e9b-3347-4fb9-9253-3e0b370c55f6';
export function photoUploadId(ownerId, kind, targetId, localUri) {
  if (!ownerId || !targetId || !['trip', 'recommendation'].includes(kind)
    || typeof localUri !== 'string' || !/^(file|content):\/\//i.test(localUri)) {
    throw new Error('A saved item and local photo are required for upload');
  }
  return uuid.v5(JSON.stringify([String(ownerId), kind, String(targetId), localUri]), PHOTO_UPLOAD_NAMESPACE);
}

export function assertPhotoUploadReceipt(data, expectedId) {
  if (data?.photoUploadProtocol !== 1 || data?.photoUploadId !== expectedId
    || !Array.isArray(data.photoIds) || data.photoIds.length !== 1
    || typeof data.photoIds[0] !== 'string' || !data.photoIds[0]) {
    throw new Error('Photo upload confirmation was incomplete. Keep this form open and retry the same photo.');
  }
  return data;
}
