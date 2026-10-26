const {load} = require('./component-fixture.cjs');
function recordingFixture(get, set, extra = {}) {
  const markers = load('src/utils/activeTrip.js', '({getActiveTrip,setActiveTrip,clearActiveTrip,claimRecordingCleanup,finishRecordingCleanup})', {
    SecureStore: {
      getItemAsync: async()=>JSON.stringify(get()),
      setItemAsync: async(_key,json)=>set(JSON.parse(json)),
      deleteItemAsync: async()=>set({}),
    },
  });
  const recording = load('src/utils/recordingAttempt.js','({stopAbandonedRecording,readRecordingTaskState,acquireRecordingTransition})', {
    readActiveTrip:markers.getActiveTrip,claimCleanup:markers.claimRecordingCleanup,finishCleanup:markers.finishRecordingCleanup,
    setTimeout,clearTimeout,...extra,
  });
  return {...markers,...recording};
}
module.exports = {recordingFixture};
