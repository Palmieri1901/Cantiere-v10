#!/usr/bin/env bash
# Installa una volta sola il servizio aggiornamenti sul PC Ubuntu (installazione senza Docker).
# Uso, dalla cartella del programma:   sudo bash deploy/pc/installa-aggiornamenti.sh
set -euo pipefail
[ "$(id -u)" = "0" ] || { echo "Avvialo con sudo: sudo bash deploy/pc/installa-aggiornamenti.sh"; exit 1; }

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$PROJECT_DIR/backend/.env"
cd "$PROJECT_DIR"
[ -d .git ] || { echo "La cartella $PROJECT_DIR non è un clone GitHub (manca .git): servono git clone del repository."; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Non trovo $ENV_FILE"; exit 1; }
git config --global --add safe.directory "$PROJECT_DIR"

if ! command -v mongodump >/dev/null; then
  echo "== Installo gli strumenti di backup MongoDB (mongodump)"
  apt-get update -qq && apt-get install -y -qq mongodb-database-tools || echo "ATTENZIONE: installa mongodb-database-tools a mano (serve per il backup prima di ogni aggiornamento)"
fi

leggi() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' || true; }
MONGO_URL="$(leggi MONGO_URL)"; DB_NAME="$(leggi DB_NAME)"
REPO="$(git remote get-url origin 2>/dev/null || true)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "== Servizi del gestionale trovati su questo PC:"
systemctl list-units --type=service --all --no-legend | awk '{print $1}' | grep -iE "geb|nautic|portomare|backend|frontend|gestional" || echo "  (nessuno trovato automaticamente)"
read -r -p "Nomi dei servizi da riavviare dopo l'aggiornamento (separati da spazio): " PC_SERVICES
read -r -p "Il frontend va ricostruito con 'yarn build'? [S/n]: " FB
[[ "${FB,,}" == "n" ]] && FRONTEND_BUILD=0 || FRONTEND_BUILD=1

TOKEN="$(leggi UPDATER_TOKEN)"; [ -n "$TOKEN" ] || TOKEN="$(openssl rand -hex 24)"
grep -q "^UPDATER_URL=" "$ENV_FILE" || printf '\nUPDATER_URL=http://127.0.0.1:9000\n' >> "$ENV_FILE"
grep -q "^UPDATER_TOKEN=" "$ENV_FILE" || printf 'UPDATER_TOKEN=%s\n' "$TOKEN" >> "$ENV_FILE"
chmod +x deploy/pc/ricostruisci.sh

cat > /etc/systemd/system/gebnautica-updater.service <<EOF
[Unit]
Description=GEBnautica - servizio aggiornamenti
After=network-online.target

[Service]
Environment=UPDATER_MODE=locale
Environment=PROJECT_DIR=$PROJECT_DIR
Environment=UPDATER_TOKEN=$TOKEN
Environment=UPDATE_REPO=$REPO
Environment=UPDATE_BRANCH=$BRANCH
Environment=MONGO_URL=$MONGO_URL
Environment=DB_NAME=$DB_NAME
Environment="PC_SERVICES=$PC_SERVICES"
Environment=FRONTEND_BUILD=$FRONTEND_BUILD
Environment=HOME=/root
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/usr/bin/python3 $PROJECT_DIR/deploy/updater/updater.py
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now gebnautica-updater.service
for s in $PC_SERVICES; do systemctl restart "$s" || true; done
echo
echo "Fatto. Apri il gestionale sul PC → Impostazioni → Aggiornamenti → Controlla aggiornamenti."
echo "Registro: $PROJECT_DIR/deploy/backups/updater.log"
