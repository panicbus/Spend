const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

const ICLOUD_PATH_MARKERS = [
  '/Documents/',
  '/Desktop/',
  '/Library/Mobile Documents/',
];

function isIcloudSyncedPath(filePath) {
  return ICLOUD_PATH_MARKERS.some((marker) => filePath.includes(marker));
}

function stripExtendedAttributes(appBundle) {
  const q = shellQuote(appBundle);

  execSync(
    `/usr/bin/find ${q} \\( -name '._*' -o -name '.DS_Store' \\) -delete 2>/dev/null || true`,
    { stdio: 'inherit', shell: true, env: process.env }
  );

  try {
    execSync(`/usr/bin/dot_clean -s ${q}`, { stdio: 'inherit', env: process.env });
  } catch {
    /* optional */
  }

  execSync(`/usr/bin/xattr -cr ${q}`, { stdio: 'inherit', env: process.env });

  // macOS Sequoia+ may leave com.apple.provenance; -cr does not always remove it.
  execSync(
    `/usr/bin/find ${q} -print0 | /usr/bin/xargs -0 -I {} /bin/sh -c '/usr/bin/xattr -d com.apple.provenance "$1" 2>/dev/null || true; /usr/bin/xattr -d com.apple.FinderInfo "$1" 2>/dev/null || true' _ {}`,
    { stdio: 'inherit', shell: true, env: process.env }
  );
}

/** Re-copy bundle without xattrs/resource forks (helps iCloud-synced output paths). */
function rewriteBundleWithoutMetadata(appBundle) {
  const staging = `${appBundle}.xattrclean`;
  const q = shellQuote(appBundle);
  const qs = shellQuote(staging);
  execSync(`rm -rf ${qs}`, { stdio: 'inherit', shell: true, env: process.env });
  execSync(`/usr/bin/ditto --norsrc --noextattr ${q} ${qs}`, {
    stdio: 'inherit',
    env: process.env,
  });
  execSync(`rm -rf ${q} && mv ${qs} ${q}`, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
}

/**
 * Remove Finder/iCloud extended attributes before codesign.
 * Fixes: "resource fork, Finder information, or similar detritus not allowed"
 */
exports.default = async function afterPack(context) {
  if (process.platform !== 'darwin') return;

  const productName = context.packager?.appInfo?.productFilename ?? 'Spend';
  const appBundle = path.join(context.appOutDir, `${productName}.app`);

  if (!fs.existsSync(appBundle)) {
    throw new Error(`[afterPack] App bundle not found: ${appBundle}`);
  }

  console.log('[afterPack] Clearing extended attributes:', appBundle);

  if (isIcloudSyncedPath(appBundle)) {
    console.warn(
      '[afterPack] Output is under iCloud/Documents — rewriting bundle before sign.'
    );
    rewriteBundleWithoutMetadata(appBundle);
  }

  stripExtendedAttributes(appBundle);
};
