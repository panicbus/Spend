/**
 * Build the UI + main bundle, then pack an unsigned .app for this machine's CPU * (arm64 → release/mac-arm64, x64 → release/mac) so Apple Silicon gets a native app by default.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ebCli = path.join(repoRoot, 'node_modules', 'electron-builder', 'cli.js');
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';

const build = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  cwd: repoRoot,
  shell: process.platform === 'win32',
});
if (build.status !== 0) process.exit(build.status ?? 1);

const pack = spawnSync(process.execPath, [ebCli, '--mac', '--dir', `--${arch}`], {
  stdio: 'inherit',
  cwd: repoRoot,
});
process.exit(pack.status ?? 1);
