#!/usr/bin/env bash
# Package the extension into a ZIP ready for the Chrome Web Store / sharing.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./manifest.json').version")
OUT="x-article-export-pdf-v${VERSION}.zip"

rm -f "$OUT"

zip -r "$OUT" \
  manifest.json \
  icons \
  src \
  LICENSE \
  README.md \
  PRIVACY.md \
  -x '*.DS_Store' >/dev/null

echo "Created $OUT"
