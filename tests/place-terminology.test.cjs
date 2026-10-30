const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

// Scan parsed text, not identifiers/comments: internal APIs, schemas, route names,
// test IDs and diagnostics deliberately retain their existing contracts.
function files(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : file.endsWith('.js') ? [file] : [];
  });
}
test('mobile-owned display copy consistently says place/places; legacy words are internal only', () => {
  const root = path.join(__dirname, '..'), unexpected = [];
  for (const file of [...files(path.join(root, 'app')), ...files(path.join(root, 'src'))]) {
    const ast = babel.parseSync(fs.readFileSync(file, 'utf8'), {configFile: false, babelrc: false, parserOpts: {plugins: ['jsx']}});
    babel.traverse(ast, {enter(nodePath) {
      const node = nodePath.node;
      if (!['StringLiteral', 'JSXText', 'TemplateElement'].includes(node.type)) return;
      const value = node.type === 'TemplateElement' ? node.value.cooked : node.value;
      if (!/\b(recommendations?|recs)\b/i.test(value)) return;
      if (nodePath.findParent(p => p.isCallExpression() && p.node.callee?.object?.name === 'console')) return;
      const displayProp = nodePath.findParent(p => (p.isJSXAttribute() || p.isObjectProperty())
        && ['title', 'label', 'placeholder', 'accessibilityLabel', 'emptyMessage'].includes(p.node.name?.name || p.node.key?.name));
      if ((!displayProp || nodePath.parentPath.isBinaryExpression()) && /^(recommendation|recommendations|recs|Recs)$/.test(value)) return;
      if (!displayProp && /^recommendation-[\w-]*$/.test(value)) return;
      if (file.endsWith('src/services/api.js') && value.startsWith('/v2/recommendations/')) return;
      if (file.includes('/src/db/') && /^\s*(CREATE|ALTER|SELECT|INSERT|DELETE)\b/.test(value)) return;
      unexpected.push(`${path.relative(root, file)}:${node.loc.start.line} ${JSON.stringify(value)}`);
    }});
  }
  assert.deepEqual(unexpected, []);
});
