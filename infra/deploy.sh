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

# The account service: code only. Its environment file and systemd unit are installed by hand
# (infra/eosinabox-accounts.service, service/README.md); restart it if it is running.
rsync -a --delete --chmod=D755,F644 --exclude node_modules service/ "$TARGET:/opt/eosinabox/service/"
ssh "$TARGET" 'cd /opt/eosinabox/service && npm install --omit=dev --no-audit --no-fund >/dev/null \
  && if systemctl is-active --quiet eosinabox-accounts; then sudo systemctl restart eosinabox-accounts; fi'
echo "deployed the account service -> $TARGET:/opt/eosinabox/service"
