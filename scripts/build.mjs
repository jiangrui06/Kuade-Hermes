import { build as bundle } from 'esbuild';
import { build } from 'vite';
await bundle({ entryPoints: ['src/main/index.ts'], outfile: 'dist/main/index.js', platform: 'node', format: 'esm', bundle: true, packages: 'external', sourcemap: true });
await bundle({ entryPoints: ['src/runtime/identity-plugin.ts'], outfile: 'dist/runtime/identity-plugin.mjs', platform: 'node', format: 'esm', bundle: true });
await bundle({ entryPoints: ['src/runtime/capabilities-plugin.ts'], outfile: 'dist/runtime/capabilities-plugin.mjs', platform: 'node', target: 'node22', format: 'esm', bundle: true, packages: 'external' });
await bundle({ entryPoints: ['src/iteration/watchdog.ts'], outfile: 'dist/runtime/update-watchdog.mjs', platform: 'node', target: 'node22', format: 'esm', bundle: true });
await bundle({ entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload/index.cjs', platform: 'node', format: 'cjs', bundle: true, external: ['electron'] });
await build();
