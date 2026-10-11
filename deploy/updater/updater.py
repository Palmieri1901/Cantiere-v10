"""Servizio updater: riceve i comandi dal backend ed esegue git pull + rebuild dei container."""
import json
import os
import subprocess
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

PROJECT_DIR = os.environ["PROJECT_DIR"]
DEPLOY_DIR = os.path.join(PROJECT_DIR, "deploy")
TOKEN = os.environ["UPDATER_TOKEN"]
BRANCH = os.environ.get("UPDATE_BRANCH", "main")
DB_NAME = os.environ.get("DB_NAME", "portomare")
STATE_FILE = os.path.join(DEPLOY_DIR, "backups", "updater-state.json")
LOG_FILE = os.path.join(DEPLOY_DIR, "backups", "updater.log")
SERVICES = ["backend", "frontend"]

_lock = threading.Lock()
_state = {"stato": "idle", "fase": "", "errore": "", "iniziato": None, "terminato": None}


def _run(cmd, cwd=PROJECT_DIR, check=True):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    _log(f"$ {' '.join(cmd)}\n{r.stdout}{r.stderr}")
    if check and r.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)} → {r.stderr.strip() or r.stdout.strip()}")
    return r.stdout.strip()


def _log(msg):
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] {msg}\n")


def _load_prev():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {}


def _save_prev(d):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(d, f)


def _commit_info(ref):
    out = _run(["git", "log", "-1", "--format=%h|%cI|%s", ref], check=False)
    if not out or "|" not in out:
        return None
    h, d, s = out.split("|", 2)
    s = s.strip()
    return {"hash": h, "data": d, "messaggio": s[:160] + ("…" if len(s) > 160 else "")}


def status():
    fetch_err = ""
    try:
        _run(["git", "fetch", "origin", BRANCH])
    except Exception as e:
        fetch_err = str(e).splitlines()[-1][:200]
    corrente = _commit_info("HEAD")
    remoto = _commit_info(f"origin/{BRANCH}")
    behind = int(_run(["git", "rev-list", "--count", f"HEAD..origin/{BRANCH}"], check=False) or 0)
    novita = []
    if behind:
        out = _run(["git", "log", "--format=%h|%cI|%s", f"HEAD..origin/{BRANCH}"], check=False)
        for line in out.splitlines():
            h, d, s = line.split("|", 2)
            novita.append({"hash": h, "data": d, "messaggio": s.strip()[:160]})
    prev = _load_prev()
    with _lock:
        st = dict(_state)
    return {
        "disponibile": True, "branch": BRANCH, "corrente": corrente, "remoto": remoto,
        "aggiornamenti": behind, "novita": novita, "errore_fetch": fetch_err,
        "precedente": prev.get("precedente"), "backup_pre_update": prev.get("backup"),
        **st,
    }


def _set(**kw):
    with _lock:
        _state.update(kw)


def _rebuild():
    _set(fase="Ricostruzione container (può richiedere alcuni minuti)…")
    _run(["docker", "compose", "up", "-d", "--build", "--remove-orphans", *SERVICES], cwd=DEPLOY_DIR)


def _backup_db(tag):
    _set(fase="Backup del database…")
    name = f"pre-update-{tag}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.gz"
    _run(["docker", "compose", "exec", "-T", "mongo", "mongodump", "--uri=mongodb://localhost:27017",
          f"--db={DB_NAME}", f"--archive=/tmp/{name}", "--gzip"], cwd=DEPLOY_DIR)
    _run(["sh", "-c", f"docker compose cp mongo:/tmp/{name} ./backups/{name}"], cwd=DEPLOY_DIR)
    return name


def do_update():
    try:
        _set(stato="running", errore="", iniziato=datetime.now(timezone.utc).isoformat(), terminato=None)
        prev_hash = _run(["git", "rev-parse", "HEAD"])
        backup = _backup_db(prev_hash[:7])
        _save_prev({"precedente": _commit_info(prev_hash), "backup": backup})
        _set(fase="Scaricamento aggiornamenti da GitHub…")
        _run(["git", "fetch", "origin", BRANCH])
        _run(["git", "reset", "--hard", f"origin/{BRANCH}"])
        _rebuild()
        _set(stato="done", fase="Aggiornamento completato", terminato=datetime.now(timezone.utc).isoformat())
    except Exception as e:
        _log(f"ERRORE: {e}")
        _set(stato="error", errore=str(e), fase="", terminato=datetime.now(timezone.utc).isoformat())


def do_rollback():
    try:
        prev = _load_prev().get("precedente")
        if not prev:
            raise RuntimeError("Nessuna versione precedente registrata")
        _set(stato="running", errore="", iniziato=datetime.now(timezone.utc).isoformat(), terminato=None)
        _set(fase=f"Ripristino versione {prev['hash']}…")
        _run(["git", "reset", "--hard", prev["hash"]])
        _rebuild()
        _set(stato="done", fase="Versione precedente ripristinata", terminato=datetime.now(timezone.utc).isoformat())
    except Exception as e:
        _log(f"ERRORE rollback: {e}")
        _set(stato="error", errore=str(e), fase="", terminato=datetime.now(timezone.utc).isoformat())


def _start(fn):
    with _lock:
        if _state["stato"] == "running":
            return False
    threading.Thread(target=fn, daemon=True).start()
    return True


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _auth(self):
        if self.headers.get("X-Updater-Token") != TOKEN:
            self._send(401, {"detail": "token non valido"})
            return False
        return True

    def do_GET(self):
        if not self._auth():
            return
        if self.path == "/status":
            return self._send(200, status())
        if self.path == "/state":
            with _lock:
                return self._send(200, dict(_state))
        if self.path == "/log":
            try:
                with open(LOG_FILE) as f:
                    lines = f.readlines()[-200:]
            except FileNotFoundError:
                lines = []
            return self._send(200, {"log": "".join(lines)})
        self._send(404, {"detail": "not found"})

    def do_POST(self):
        if not self._auth():
            return
        if self.path == "/update":
            ok = _start(do_update)
        elif self.path == "/rollback":
            ok = _start(do_rollback)
        else:
            return self._send(404, {"detail": "not found"})
        self._send(200 if ok else 409, {"avviato": ok})

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    subprocess.run(["git", "config", "--global", "--add", "safe.directory", "*"], check=False)
    _log("updater avviato")
    HTTPServer(("0.0.0.0", 9000), Handler).serve_forever()
