/** Marks dist-electron/src/* as CommonJS (tsc emit) while root stays ESM (main.js). */
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'dist-electron/src');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, 'package.json'),
  `${JSON.stringify({ type: 'commonjs' })}\n`
);
