#!/usr/bin/env bash
# Build and release to a Docker host: a new timestamped release, `current` repointed, container recreated.
# Earlier releases stay in /opt/sakura-fantasy/releases for rollback (repoint `current`, then recreate).
# compose.yaml is installed at /opt/sakura-fantasy/, where its ./current and ./deploy paths resolve. The container
# joins an external Docker network shared with a reverse proxy (gateway.caddy is that proxy's site block); it is
# copied but not reloaded, so validate and reload the proxy by hand after changing it.
# The target comes from the environment or from deploy/target.local (not committed):
#   HOST=user@host   KEY=/path/to/ssh-key   SITE=https://your.host/ (checked after the release)
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f deploy/target.local ] && . deploy/target.local
: "${HOST:?set HOST (and KEY) in the environment or in deploy/target.local}"
KEY=${KEY:-$HOME/.ssh/id_ed25519}
STAMP=$(date +%Y%m%d-%H%M%S)

npm run build
ssh -i "$KEY" "$HOST" 'mkdir -p ~/sakura-upload'
rsync -az --delete -e "ssh -i $KEY" dist/ "$HOST:sakura-upload/dist/"
rsync -az --delete --exclude target.local -e "ssh -i $KEY" deploy/ "$HOST:sakura-upload/deploy/"
ssh -i "$KEY" "$HOST" "STAMP=$STAMP bash -s" <<'REMOTE'
set -euo pipefail
R=/opt/sakura-fantasy
sudo mkdir -p $R/releases $R/deploy
sudo cp -a ~/sakura-upload/dist $R/releases/$STAMP
sudo cp ~/sakura-upload/deploy/Caddyfile ~/sakura-upload/deploy/gateway.caddy $R/deploy/
sudo cp ~/sakura-upload/deploy/compose.yaml $R/compose.yaml
sudo ln -sfn releases/$STAMP $R/current
sudo chown -R root:root $R
sudo chmod -R a+rX $R
# the bind mount resolves `current` when the container starts
cd $R && sudo docker compose up -d --force-recreate
for i in $(seq 1 30); do sudo docker exec sakura-fantasy wget -q -O - http://127.0.0.1:8080/healthz 2>/dev/null && break; sleep 1; done
echo
echo "released $STAMP"
REMOTE
if [ -n "${SITE:-}" ]; then curl -fsS -o /dev/null -w "live %{http_code}\n" "$SITE"; fi
