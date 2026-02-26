#!/usr/bin/env bash
set -euo pipefail

# Publish all @atmos packages to npm in dependency order.
# Usage:
#   ./scripts/publish.sh          # publish for real
#   ./scripts/publish.sh --dry-run # preview what would be published

DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="--dry-run"
  echo "=== DRY RUN ==="
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Build all packages
echo "Building packages..."
npm run build --prefix "$ROOT"

# Run tests
echo "Running tests..."
npx vitest run --root "$ROOT"

# Publish in dependency order (leaves first)
PACKAGES=(math core renderer physics animation assets terrain editor)

for pkg in "${PACKAGES[@]}"; do
  echo ""
  echo "--- Publishing @atmos/$pkg ---"
  npm publish --access public $DRY_RUN -w "packages/$pkg"
done

echo ""
echo "Done!"
