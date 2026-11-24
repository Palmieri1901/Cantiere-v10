#!/usr/bin/env bash
# Ricostruisce il gestionale sul PC (installazione senza Docker) dopo il git pull dell'updater.
# Variabili (impostate da installa-aggiornamenti.sh nel servizio systemd):
#   PROJECT_DIR, PC_SERVICES (servizi systemd da riavviare), BACKEND_PIP, FRONTEND_BUILD (1 = yarn build)
set -euo pipefail
cd "$PROJECT_DIR"

echo "== Dipendenze backend"
PIP="${BACKEND_PIP:-}"
if [ -z "$PIP" ]; then
  for c in backend/venv/bin/pip backend/.venv/bin/pip venv/bin/pip .venv/bin/pip; do [ -x "$c" ] && PIP="$c" && break; done
fi
PIP="${PIP:-pip3}"
"$PIP" install -q -r backend/requirements.txt --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/

if [ "${FRONTEND_BUILD:-1}" = "1" ] && [ -f frontend/package.json ]; then
  echo "== Frontend"
  cd frontend
  RUN_USER="$(stat -c %U .)"
  CMD="yarn install --frozen-lockfile --network-timeout 600000 && REACT_APP_COMMIT=${APP_COMMIT:-} yarn build"
  if [ "$(id -u)" = "0" ] && [ "$RUN_USER" != "root" ]; then sudo -u "$RUN_USER" -H bash -lc "$CMD"; else bash -lc "$CMD"; fi
  cd ..
fi

echo "== Riavvio servizi: ${PC_SERVICES:-nessuno}"
for s in ${PC_SERVICES:-}; do systemctl restart "$s"; done
echo "== Fatto"
