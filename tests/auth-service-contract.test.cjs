const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('native password reset uses the backend PUT contract without authentication', async () => {
 const source = fs.readFileSync(require('node:path').join(__dirname, '../src/services/auth.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
 let captured;
 const api = vm.runInNewContext(source + ';({resetPasswordRequest});', {
  Constants: { expoConfig: {extra: {API_URL: 'https://example.invalid'}} },
  apiFetch: async (url, options) => { captured = { url, options }; return {success:true}; }
 });
 await api.resetPasswordRequest('synthetic-token', 'synthetic-password');
 assert.equal(captured.url, '/auth/resetpassword/synthetic-token');
 assert.equal(captured.options.method, 'PUT');
 assert.equal(captured.options.auth, false);
 assert.equal(captured.options.csrf, true);
 assert.deepEqual(JSON.parse(captured.options.body), {password: 'synthetic-password'});
});
