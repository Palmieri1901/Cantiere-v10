# Sincronizzazione PC locale ↔ versione online

Entrambe le installazioni usano lo stesso codice. La versione **online** espone gli endpoint `/api/sync/*`
(protetti dal token condiviso `SYNC_TOKEN`). L'installazione **sul PC** (quella con `SYNC_PEER_URL`)
ogni 30 s: riceve le modifiche dell'online e invia le proprie. Se manca internet continua a lavorare
e riprova al giro successivo. In caso di conflitto sullo stesso dato vince l'ultima modifica (campo `_sync_ts`).

## Configurazione
1. **Online** (Emergent): aggiungere il segreto `SYNC_TOKEN` (stringa lunga a piacere) e ripubblicare.
2. **PC locale** – file `backend/.env`:
   ```
   SYNC_TOKEN=<lo stesso valore dell'online>
   SYNC_PEER_URL=https://<indirizzo-del-gestionale-online>
   SYNC_INTERVAL=30
   ```
   Riavviare il backend. Al primo avvio scarica tutto il database online (allineamento completo),
   poi lavora in modo incrementale.
3. Stato visibile in **Impostazioni → Sincronizzazione PC ↔ online** (ultima sync, modifiche in coda, "Sincronizza ora").

## Note tecniche
- `backend/sync_log.py`: avvolge i metodi di scrittura Motor, imposta `_sync_ts` e registra in `_sync_log` (coll, doc_id, op, ts, origin).
- `backend/routers/sync.py`: `peer_router` (/api/sync/changes|snapshot|collections|apply, solo token) e `router` (/api/sync/stato|ora, login gestionale). Serializzazione bson.json_util (datetime ok).
- File (cataloghi PDF, video Real, omologazioni, PDF condivisi): tutti i bucket GridFS passano da `backend/gridfs_sync.py` (`SyncBucket`), che registra upload/cancellazioni in `_sync_log` (coll `<bucket>.files`, doc_id = ObjectId). I contenuti viaggiano con `GET/PUT /api/sync/file?coll=&doc_id=` (stesso ObjectId sui due lati); le cancellazioni via `/apply`. Le foto delle valutazioni sono base64 nei documenti e si sincronizzano come dati.
- Esclusi: `_sync_log`, `_sync_state`, `*.chunks` (seguono il file).
- Documenti senza campo `id` non vengono sincronizzati.
