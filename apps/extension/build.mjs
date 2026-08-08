/**
 * Bundler for the side panel.
 *
 * Only ONE file in this extension needs building. The service worker, the content
 * script and everything in `src/` are plain ES modules that Chrome loads directly —
 * that is deliberate, because it keeps "edit a file, hit reload" true for most work.
 *
 * The side panel is the exception: it imports `@elevenlabs/client` from npm, and MV3
 * enforces `script-src 'self'`, so there is no CDN escape hatch. It has to be bundled
 * into `dist/sidepanel.js`.
 *
 *   node build.mjs            one-shot build
 *   node build.mjs --watch    rebuild on change (still needs an extension reload)
 */

import * as esbuild from 'esbuild';

const options = {
  entryPoints: ['src/sidepanel.js'],
  bundle: true,
  outfile: 'dist/sidepanel.js',
  format: 'esm',
  // Chrome 114 is the floor anyway (chrome.sidePanel), so there is no reason to
  // down-level past it — and shipping modern output keeps the bundle small.
  target: 'chrome114',
  platform: 'browser',
  // The SDK ships a browser-specific entry; without this condition esbuild resolves
  // the "default" one, which reaches for Node APIs that do not exist here.
  conditions: ['browser', 'import'],
  legalComments: 'none',
  sourcemap: process.argv.includes('--watch') ? 'inline' : false,
  minify: !process.argv.includes('--watch'),
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const context = await esbuild.context(options);
  await context.watch();
  console.log('watching src/sidepanel.js — reload the extension after each rebuild');
} else {
  await esbuild.build(options);
  console.log('built dist/sidepanel.js');
}
