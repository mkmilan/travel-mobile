const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
// Execute the installed Expo JS adapters; no native module or real file access.
function expoModule(relative, injected = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../node_modules/expo/src', relative), 'utf8');
  const code = babel.transformSync(source, {
    filename: relative, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-typescript', '@babel/plugin-transform-modules-commonjs'],
  }).code;
  const exports = {};
  vm.runInNewContext(code, { exports, Blob, Uint8Array, TextEncoder, ...injected });
  return exports;
}
function fixture() {
  const reads = [];
  class NativeFile {
    constructor(uri) { this.uri = uri; }
    get type() { return ''; }
    async bytes() { reads.push(this.uri); return new Uint8Array([1, 2, 3]); }
  }
  class RNFormData { constructor() { this._parts = []; } }
  const { installFormDataPatch } = expoModule('winter/FormData.ts');
  const ExpoFormData = installFormDataPatch(RNFormData);
  const { convertFormDataAsync } = expoModule('winter/fetch/convertFormData.ts', {
    require: () => ({ blobToArrayBufferAsync: (blob) => blob.arrayBuffer() }),
  });
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/photoFormData.js'), 'utf8').replace(/^import .*;\n/, '').replace('export async function', 'async function');
  const createPhotoFormData = vm.runInNewContext(source + '\ncreatePhotoFormData', { File: NativeFile, FormData: ExpoFormData });
  return { createPhotoFormData, reads, convertFormDataAsync, NativeFile };
}
test('photo URI becomes an Expo File part with preserved filename and MIME', async () => {
  const f = fixture(); const form = await f.createPhotoFormData('photos', 'file:///cache/trip.png');
  const part = form.get('photos'); assert.ok(part instanceof f.NativeFile); assert.equal(part.name, 'trip.png');
  assert.equal(part.type, 'image/png'); assert.deepEqual([...await part.bytes()], [1, 2, 3]);
  assert.deepEqual(f.reads, ['file:///cache/trip.png']);
});
test('Android content URI supports extension-free images without remote fetching', async () => {
  const f = fixture(); const form = await f.createPhotoFormData('photo', 'content://media/external/images/42');
  assert.equal(form.get('photo').type, 'image/jpeg'); assert.equal(form.get('photo').name, '42');
});
test('remote and malformed image sources are rejected before file reads', async () => {
  const f = fixture();
  for (const uri of ['https://example.invalid/private.jpg', '', undefined, 'javascript:alert(1)']) {
    await assert.rejects(f.createPhotoFormData('photo', uri), /local file or content URI/);
  }
  assert.deepEqual(f.reads, []);
});
test('installed Expo multipart encoder accepts File bytes and emits filename and MIME', async () => {
  const f = fixture(); const form = await f.createPhotoFormData('photos', 'file:///cache/trip.png');
  const { body } = await f.convertFormDataAsync(form, 'test-boundary');
  const encoded = Buffer.from(body).toString('utf8');
  assert.match(encoded, /name="photos"; filename="trip.png"/);
  assert.match(encoded, /content-type: image\/png/);
  assert.ok(encoded.includes('\u0001\u0002\u0003'));
  assert.deepEqual(f.reads, ['file:///cache/trip.png']);
});
test('all live profile/trip/recommendation uploads use the compatible builder', () => {
  const api = fs.readFileSync(path.join(__dirname, '../src/services/api.js'), 'utf8');
  assert.equal((api.match(/await createPhotoFormData\(/g) || []).length, 3);
  assert.doesNotMatch(api, /form\.append\([^\n]+\{\s*uri/);
});
