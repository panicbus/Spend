'use strict';
const { execSync } = require('child_process');

if (process.platform === 'win32') {
  process.stdout.write(process.arch === 'ia32' ? 'ia32' : 'x64');
} else {
  const m = execSync('uname -m', { encoding: 'utf8' }).trim();
  process.stdout.write(m === 'arm64' || m === 'aarch64' ? 'arm64' : 'x64');
}
