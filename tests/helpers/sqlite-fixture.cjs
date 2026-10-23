const { DatabaseSync } = require('node:sqlite');
const { load } = require('./component-fixture.cjs');

// Execute production migrations and DAO SQL in actual SQLite, using synthetic
// in-memory/file fixtures only. The adapter matches Expo's async method shape.
async function sqliteFixture(filename = ':memory:') {
  const sqlite = new DatabaseSync(filename);
  const db = {
    execAsync: async sql => sqlite.exec(sql),
    getAllAsync: async (sql, params = []) => sqlite.prepare(sql).all(...params),
    runAsync: async (sql, params = []) => sqlite.prepare(sql).run(...params),
  };
  let nextId=0, active = {};
  const dependencies = {getActiveTrip:async()=>active,openDatabase:async()=>db,uuid:{v4:()=>`synthetic-trip-${++nextId}`}};
  const migrate = load('src/db/migrations.js','runMigrations',dependencies);
  await migrate();
  const dao = load('src/db/tripDao.js','({startTrip,stopTrip,finishTrip,getLocalTrip,getPendingTrips,buildTripJsonForUpload,hasConfirmedTripMetadata,tripMetadataDefaults,insertTrackPoint,addPoi,deleteTrip,markTripUploaded,setTripRecordingStatus})',dependencies);
  return {sqlite,db,dao,migrate,setActive:value=>{active=value;},close:()=>sqlite.close()};
}
module.exports = {sqliteFixture};
