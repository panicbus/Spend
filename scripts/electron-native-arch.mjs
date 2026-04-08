import { execSync } from 'node:child_process';

/**
 * Arch string for `electron-rebuild --arch`.
 * On Apple Silicon, terminals running under Rosetta report `uname -m` as x86_64
 * but Electron is typically arm64 — use `sysctl hw.optional.arm64` on macOS.
 */
function arch() {
  if (process.platform === 'win32') {
    return process.arch === 'ia32' ? 'ia32' : 'x64';
  }

  if (process.platform === 'darwin') {
    try {
      const hw = execSync('sysctl -n hw.optional.arm64', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (hw === '1') return 'arm64';
    } catch {
      /* sysctl failed, fall through */
    }
  }

  const m = execSync('uname -m', { encoding: 'utf8' }).trim();
  if (m === 'arm64' || m === 'aarch64') return 'arm64';
  return 'x64';
}

process.stdout.write(arch());
