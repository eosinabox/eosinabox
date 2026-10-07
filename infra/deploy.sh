#!/bin/bash
# Build the wallet and publish client/src to eosinabox.com, with the production chain list.
#   infra/deploy.sh user@host
# The target can also come from DEPLOY_TARGET, or from infra/deploy.private.env (gitignored).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

[ -f infra/deploy.private.env ] && . infra/deploy.private.env
TARGET="${1:-${DEPLOY_TARGET:-}}"
[ -n "$TARGET" ] || { echo "usage: infra/deploy.sh user@host" >&2; exit 2; }
WEBROOT=/var/www/eosinabox.com

npm run -s build
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -r client/src/. "$STAGE/"
cp infra/chains.production.js "$STAGE/chains.js"

# mktemp makes the staging directory private; publish world-readable files.
rsync -a --delete --chmod=D755,F644 "$STAGE/" "$TARGET:$WEBROOT/"
echo "deployed $(git rev-parse --short HEAD) -> $TARGET:$WEBROOT"
