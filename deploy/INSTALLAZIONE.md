# Installazione autonoma — GEB Nautica / Portomare

Il programma è completamente indipendente: React + FastAPI + MongoDB, senza alcun servizio esterno obbligatorio.
Funziona su qualsiasi server Linux con Docker (VPS Aruba, Hetzner, OVH, un mini-PC in cantiere…).

## 1. Requisiti
- Un server Linux (Ubuntu 22.04/24.04 consigliato), 2 GB RAM, 20 GB disco
- Docker + Docker Compose: `curl -fsSL https://get.docker.com | sh`
- Il dominio **genbnautica.it** puntato all'IP del server (pannello DNS Aruba):
  - record `A` → `@` → IP del server
  - record `A` → `lavori` → IP del server (**app dipendenti**, host separato)
  - record `A` → `www` → IP del server (opzionale)
- Porte 80 e 443 aperte sul firewall del server

## 2. Installazione
```bash
git clone <repository>  portomare      # oppure copia la cartella del progetto
cd portomare/deploy
cp .env.example .env
nano .env                              # compila DOMAIN, password, SMTP, GEMINI_API_KEY, TAVILY_API_KEY (ricerca web Assistente officina)
APP_COMMIT=$(git rev-parse --short HEAD) docker compose up -d --build   # APP_COMMIT = versione mostrata nel manuale PDF
```
Al primo avvio Caddy richiede automaticamente il certificato HTTPS (Let's Encrypt) per il dominio.
Dopo 1-2 minuti il programma è su **https://genbnautica.it** e l'app dipendenti su **https://lavori.genbnautica.it**.

Separazione: su `lavori.genbnautica.it` esiste **solo** l'app dipendenti (login con chiave personale) e sono raggiungibili
solo le API `/api/mobile/*`; qualsiasi altra pagina o API del gestionale risponde 403. Sul dominio principale l'indirizzo
`/app-dipendente` viene reindirizzato all'host dell'app.

Login iniziale: password = `ADMIN_PASSWORD` del file `.env`; PIN di recupero = `RECOVERY_PIN`.

## 3. Comandi utili
```bash
docker compose logs -f backend        # log del server
docker compose pull && docker compose up -d --build   # aggiornamento dopo modifiche al codice
docker compose down                   # arresto (i dati restano nel volume mongo_data)
```

## 3b. Aggiornamento con un tasto (Impostazioni → Aggiornamenti)
Il servizio `updater` controlla GitHub e, su richiesta, esegue `git pull` + rebuild dei container. Serve che il progetto sia stato
installato con `git clone` dal repository GitHub (ramo `main`).

Configurazione una tantum nel file `deploy/.env`:
```
PROJECT_DIR=/home/ubuntu/portomare      # percorso assoluto della cartella clonata (pwd dentro la cartella)
UPDATER_TOKEN=$(openssl rand -hex 24)   # token segreto qualsiasi
UPDATE_BRANCH=main
UPDATE_REPO=https://github.com/TUO-UTENTE/cantiere-v10.git   # repository GitHub salvato da Emergent
```
Il servizio allinea automaticamente il remote `origin` a `UPDATE_REPO`, quindi puoi cambiare repository (es. passare a "cantiere v10") solo modificando il `.env` e riavviando l'updater (`docker compose up -d updater`).
Poi, **solo la prima volta**, aggiorna a mano per installare il servizio:
```bash
cd /home/ubuntu/portomare && git pull && cd deploy && docker compose up -d --build
```

### "Aggiornamento bloccato: ci sono modifiche locali da proteggere"

Compare quando nella cartella del programma ci sono file non previsti (copie `.bak`, `deploy/backups/` ecc.).
Basta dire a git di ignorarli (una sola volta, dalla cartella del progetto):

```bash
printf 'deploy/backups/\n*.bak\n*.bak2\n*.bak_*\n*.backup-*\n*.prima-*\n' >> .git/info/exclude
git status --porcelain   # deve restare vuoto
```

Poi premi di nuovo **Aggiorna ora**. Dalle versioni successive questi file sono già ignorati dal `.gitignore` del progetto.
```
Da quel momento in Impostazioni → Aggiornamenti trovi: versione installata, **Controlla aggiornamenti** (elenco delle novità su GitHub),
**Aggiorna ora** (backup automatico del DB in `deploy/backups/pre-update-*.gz`, pull, rebuild, ricarica automatica) e
**Ripristina versione precedente** (riporta programma **e database** alla copia fatta prima dell'aggiornamento). Log in `deploy/backups/updater.log`.

## 4. Backup
- Il servizio `backup` esegue ogni giorno un `mongodump` in `deploy/backups/` (conservati 14 giorni). Copia questa cartella altrove (NAS, cloud).
- Dal programma (Home → Backup) puoi sempre salvare/ripristinare un JSON completo.
- Ripristino manuale da dump: `docker compose exec -T mongo mongorestore --gzip --archive < backups/portomare-AAAA-MM-GG.gz`

## 5. Servizi opzionali
| Funzione | Variabile | Se assente |
|---|---|---|
| Recupero password via email | `SMTP_*` | Il recupero funziona comunque con il PIN |
| Scan AI (foto articoli, DDT, schede gommoni, listini Suzuki) | `GEMINI_API_KEY` | I pulsanti AI mostrano "chiave non configurata"; tutto il resto funziona |

## 6. Senza dominio / rete locale
Per usare il programma solo nella rete del cantiere, imposta in `.env`:
```
DOMAIN=:80
FRONTEND_URL=http://192.168.1.50      # IP fisso del PC/server
CORS_ORIGINS=http://192.168.1.50
```
Nota: senza HTTPS la fotocamera del telefono nella PWA non è disponibile (limite dei browser); l'inserimento manuale della chiave e dei lavori funziona.

## 7. App Android nativa
Il sorgente Flutter è in `mobile_android/` (vedi `mobile_android/README.md`); le API usate sono documentate in `docs/API_MOBILE.md`.
