const test = require('node:test');
const assert = require('node:assert/strict');
const { load, read } = require('./helpers/component-fixture.cjs');
const { profileDistance } = load('src/utils/profileData.js', '({profileDistance})');
const { kmOrMiles } = load('src/utils/format.js', '({kmOrMiles})', {
  useAuthStore: {getState: () => ({user: {settings: {preferredUnits: 'metric'}}})},
});

test('profile distance uses whole meters below one kilometer and one decimal above it', () => {
  for (const [meters, expected] of [[0,'0 m'],[0.49,'0 m'],[0.5,'1 m'],[8.89,'9 m'],[47.801,'48 m'],
    [543.413,'543 m'],[999.49,'999 m'],[999.5,'1000 m'],[1000,'1.0 km'],[1250,'1.3 km'],
    [1638.779,'1.6 km'],[2238.884,'2.2 km'],[2239,'2.2 km'],[1234567,'1234.6 km']]) {
    assert.equal(profileDistance(meters), expected);
  }
});

test('invalid profile measurements are not displayed as zero, NaN or Infinity', () => {
  for (const input of [undefined,null,NaN,Infinity,-Infinity,-1,'543',{},[]]) {
    assert.equal(profileDistance(input),'–');
  }
});

test('profile overview and distance sheet use the same complete label', () => {
  assert.match(read('src/screens/profile/ProfileSummary.js'), /profileDistance\(stats\.totalDistance\)/);
  assert.match(read('src/components/modals/ProfileStatModal.js'), /profileDistance\(stats\.totalDistance\)/);
  const stats = Object.freeze({totalDistance:2239});
  assert.equal(profileDistance(stats.totalDistance),'2.2 km');
  assert.equal(stats.totalDistance,2239);
});

test('existing trip formatter remains unchanged, including short-trip rounding', () => {
  for (const [meters, expected] of [[543.413,'0.5 km'],[1638.779,'1.6 km'],[47.801,'0.0 km'],[8.89,'0.0 km']]) {
    assert.equal(kmOrMiles(meters), expected);
  }
  assert.match(read('src/components/TripCardContainer.js'), /kmOrMiles\(trip\.distanceMeters\)/);
  assert.match(read('app/(tabs)/trip/[id].js'), /const distance = kmOrMiles\(trip\.distanceMeters\)/);
});
