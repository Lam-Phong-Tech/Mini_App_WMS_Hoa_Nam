/** Regression for the real production Web crash, not the fixture-only alias. */
export {};
declare const __dirname: string;
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'src', 'features', 'nfc');
test('P07 UI never executes a CommonJS image require in browser ESM', () => {
  const flow = fs.readFileSync(path.join(root, 'P07NativeFlow.tsx'), 'utf8');
  expect(flow).toContain("import { P07_ASSETS } from './p07Assets'");
  expect(flow).not.toMatch(/require\(\s*['"]\.\/assets\//);
  expect(flow).toContain('source={P07_ASSETS.productBox}');
  expect(flow).toContain('source={P07_ASSETS.artwork}');
});
test('native and Web resolve the same original locked image files', () => {
  const native = fs.readFileSync(path.join(root, 'p07Assets.ts'), 'utf8');
  const web = fs.readFileSync(path.join(root, 'p07Assets.web.ts'), 'utf8');
  expect(web).not.toMatch(/\brequire\(/);
  for (const filename of ['B07-artwork-source.png', 'product-box-demo.png']) {
    expect(native).toContain("require('./assets/" + filename + "')");
    expect(web).toContain("new URL('./assets/" + filename + "', import.meta.url)");
    expect(fs.existsSync(path.join(root, 'assets', filename))).toBe(true);
  }
});
