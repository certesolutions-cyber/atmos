#!/usr/bin/env bash
set -euo pipefail

# Publish all @certe/atmos-* packages to npm in dependency order.
# Usage:
#   ./scripts/publish.sh          # bump patch, publish for real
#   ./scripts/publish.sh --dry-run # bump patch, preview only

DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
  echo "=== DRY RUN ==="
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGES=(math core renderer physics animation assets terrain clipmap-terrain trees terrain-detail editor)

# Bump patch version across all packages
CURRENT=$(node -e "console.log(require('./packages/math/package.json').version)")
NEW=$(node -e "const [ma,mi,pa]='$CURRENT'.split('.').map(Number); console.log(ma+'.'+mi+'.'+(pa+1))")
echo "Version bump: $CURRENT → $NEW"

for pkg in "${PACKAGES[@]}"; do
  PKG_JSON="$ROOT/packages/$pkg/package.json"
  node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('$PKG_JSON', 'utf-8'));
    p.version = '$NEW';
    // Update inter-package dependencies
    for (const [k,v] of Object.entries(p.dependencies || {})) {
      if (k.startsWith('@certe/atmos-')) p.dependencies[k] = '^$NEW';
    }
    fs.writeFileSync('$PKG_JSON', JSON.stringify(p, null, 2) + '\n');
  "
done
echo "All packages bumped to $NEW"

# Commit version bump
git add packages/*/package.json
git commit -m "release: v$NEW"

# Build all packages
echo ""
echo "Building packages..."
npm run build --prefix "$ROOT"

# Run tests
echo "Running tests..."
npx vitest run --root "$ROOT"

# Swap exports from src/ to dist/ for publishing, then restore after
swap_to_dist() {
  for pkg in "${PACKAGES[@]}"; do
    PKG_JSON="$ROOT/packages/$pkg/package.json"
    cp "$PKG_JSON" "$PKG_JSON.bak"
    node -e "
      const fs = require('fs');
      const p = JSON.parse(fs.readFileSync('$PKG_JSON', 'utf-8'));
      // Apply publishConfig overrides
      if (p.publishConfig) {
        if (p.publishConfig.main) p.main = p.publishConfig.main;
        if (p.publishConfig.types) p.types = p.publishConfig.types;
        if (p.publishConfig.exports) p.exports = p.publishConfig.exports;
        delete p.publishConfig;
      }
      fs.writeFileSync('$PKG_JSON', JSON.stringify(p, null, 2) + '\n');
    "
  done
}

restore_from_backup() {
  for pkg in "${PACKAGES[@]}"; do
    PKG_JSON="$ROOT/packages/$pkg/package.json"
    if [[ -f "$PKG_JSON.bak" ]]; then
      mv "$PKG_JSON.bak" "$PKG_JSON"
    fi
  done
}

# Always restore on exit (even on error)
trap restore_from_backup EXIT

echo ""
echo "Swapping exports to dist/ for publishing..."
swap_to_dist

# Publish in dependency order (leaves first)
for pkg in "${PACKAGES[@]}"; do
  echo ""
  echo "--- Publishing @certe/atmos-$pkg@$NEW ---"
  npm publish --access public $DRY_RUN -w "packages/$pkg"
done

echo ""
echo "Done! Published v$NEW"
