const { load } = require('./component-fixture.cjs');
module.exports = load('src/utils/photoUploadIdentity.js', '({photoUploadId, assertPhotoUploadReceipt})', {
  uuid: require('react-native-uuid').default,
});
