#!/usr/bin/env bash
set -euo pipefail

# Publish all @certe/atmos-* packages to npm in dependency order.
# Usage:
#   ./scripts/publish.sh          # bump minor, publish for real
#   ./scripts/publish.sh --dry-run # bump minor, preview only

DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
  echo "=== DRY RUN ==="
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGES=(math core renderer physics animation assets terrain editor)

# Bump minor version across all packages
CURRENT=$(node -e "console.log(require('./packages/math/package.json').version)")
NEW=$(node -e "const [ma,mi,pa]='$CURRENT'.split('.').map(Number); console.log(ma+'.'+(mi+1)+'.0')")
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

# Build all packages
echo ""
echo "Building packages..."
npm run build --prefix "$ROOT"

# Run tests
echo "Running tests..."
npx vitest run --root "$ROOT"

# Publish in dependency order (leaves first)
for pkg in "${PACKAGES[@]}"; do
  echo ""
  echo "--- Publishing @certe/atmos-$pkg@$NEW ---"
  npm publish --access public $DRY_RUN -w "packages/$pkg"
done

echo ""
echo "Done! Published v$NEW"
