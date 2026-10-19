"""Manuale d'uso del Gestionale GEBnautica: contenuti + generazione PDF. Aggiornare VERSIONE e le sezioni ad ogni nuova funzione."""
import io
import os
import subprocess
from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

VERSIONE = "2026.10"
DATA_VERSIONE = "18/10/2026"

# Ogni sezione: (titolo, [paragrafo | ("-", voce) | ("!", nota) | ("#", sottotitolo) | ("1", passo numerato)])
SEZIONI = [
    ("1. Primi passi", [
        "Il Gestionale GEBnautica funziona nel browser da computer, tablet e telefono. L'indirizzo è quello del cantiere (es. https://gestionale.tuodominio.it). Su telefono conviene aggiungerlo alla schermata Home: Chrome → menu ⋮ → Aggiungi a schermata Home; Safari → Condividi → Aggiungi a Home.",
        ("#", "Accesso"),
        ("1", "Apri l'indirizzo del gestionale: compare la pagina di accesso con il solo campo Password."),
        ("1", "Inserisci la password del cantiere (minimo 5 caratteri) e premi Entra. L'accesso resta valido 30 giorni sul dispositivo."),
        ("1", "Password dimenticata: dalla pagina di accesso premi Recupero con PIN, inserisci il PIN di recupero master e una nuova password; si entra subito."),
        ("#", "Struttura delle schermate"),
        ("-", "Home: riquadri dei moduli con i numeri chiave (clienti dell'anno, articoli, lavori da approvare, clienti esterni, preventivi, modelli). Premendo un riquadro si apre il modulo."),
        ("-", "Menu laterale (computer) / barra inferiore scorrevole (telefono): Home, Rimessaggio, Anagrafica, Magazzino, Lavori dal cantiere, Lavorazioni esterne, Assistente officina, Tubolari, Suzuki, Gommoni, DDT, Calendario, Report, Impostazioni."),
        ("-", "Anno di lavoro: selettore in alto a sinistra. Clienti, posti barca, conti e statistiche si riferiscono sempre all'anno scelto. Da Impostazioni rimessaggio si crea un nuovo anno copiando i clienti da quello precedente."),
        ("-", "Assistente vocale GEB: pulsante rotondo con microfono. Si trascina dove non dà fastidio. Si attiva dicendo \"GEB\" oppure premendolo; risponde a voce e chiede sempre conferma prima di modificare dati."),
        ("!", "Se dopo un aggiornamento qualcosa non compare, chiudi completamente il browser o l'app installata e riaprila."),
    ]),
    ("2. Rimessaggio: clienti e barche", [
        "Elenco dei clienti in rimessaggio per l'anno selezionato. Ogni scheda mostra nominativo, posto, tipo barca, lunghezza, totale del conto e stato pagamento. In alto: ricerca per nome, filtro tipo sosta, filtro pagamento.",
        ("#", "Inserire un nuovo cliente"),
        ("1", "Premi Nuovo cliente (oppure Da anagrafica per riprendere un contatto già salvato)."),
        ("1", "Scegli Privato o Azienda. Per l'azienda compila ragione sociale, P.IVA, codice SDI e PEC: compariranno nell'intestazione di preventivi, contratti e fatture."),
        ("1", "Compila nome e cognome (le iniziali diventano maiuscole da sole), telefono, email, indirizzo."),
        ("1", "Barca: tipo (gommone, barca, …), lunghezza e larghezza in metri, motore, targa/matricola. I costi si calcolano dalle Tariffe in base a queste misure."),
        ("1", "Tipo sosta: Coperto, Su piazzale, Piazzale temporaneo, Fuori sede. Per il fuori sede indica luogo e prezzo di Ritiro e di Consegna: entrano nel totale e nei PDF."),
        ("1", "Servizi: spunta copertura (a mq), alaggio, varo, antivegetativa, lavaggio inizio/fine stagione, manutenzione motore, maggiorazione scafo sporco. Ogni importo è modificabile a mano."),
        ("1", "Salva. Il programma chiede se aggiungere il contatto anche all'Anagrafica generale."),
        ("#", "Icone sulla scheda cliente (da sinistra)"),
        ("-", "Spunta verde / X rossa: segna Pagato o Non pagato."),
        ("-", "Occhio: dettaglio completo del cliente (dati, costi, storico lavori per anno con righe separate, lavorazioni extra, PDF, Invia a fatturazione)."),
        ("-", "Foglio: Preventivo PDF (anteprima, stampa, condivisione)."),
        ("-", "Foglio con firma (colorato): Preventivo + Contratto in un unico PDF, con il testo del contratto impostato in Contratti."),
        ("-", "Nota adesiva: memo sul cliente (es. \"portare batteria\"); visibile anche in Calendario e nell'app dipendenti. Diventa gialla quando c'è un memo."),
        ("-", "Matita: modifica. Frecce che si uniscono: unisci con un altro cliente doppio (anche con un cliente delle Lavorazioni esterne). Cestino: elimina."),
        ("#", "Lavorazioni extra e lavori dal cantiere"),
        "Nel dettaglio cliente si aggiungono voci extra (descrizione, quantità, unità, prezzo) scegliendo dal Listino o scrivendo liberamente. I lavori registrati dai dipendenti e approvati compaiono nello storico per anno con righe separate: dettaglio lavoro, manodopera (ore × tariffa), articoli con quantità e unità.",
        ("!", "Eliminare un cliente dal Rimessaggio NON elimina il contatto dall'Anagrafica generale. Unire due clienti sposta lavori e storico sul cliente che resta."),
    ]),
    ("3. Posti barca, Tariffe, Impostazioni rimessaggio", [
        ("#", "Posti barca"),
        "Elenco dei posti numerati per anno con il cliente assegnato. Da qui si assegna, libera o sposta un cliente. I posti liberi sono evidenziati.",
        ("#", "Tariffe"),
        ("-", "Scaglioni per lunghezza (fino a X metri → prezzo) per sosta, movimentazione, taccaggio, alaggio, varo. La larghezza proposta per scaglione serve al calcolo dei mq."),
        ("-", "Listino voci: ogni voce ha nome, prezzo e unità di misura: forfait, €/m, €/mq, €/lt, €/kg, €/ora, €/giorno, €/pezzo, €/km, movimento. Le voci al mq chiedono lunghezza × larghezza; quelle al metro chiedono la lunghezza; le altre la quantità."),
        ("-", "Il listino alimenta il selettore Listino in: lavorazioni extra, lavori dei dipendenti, preventivi esterni, app dipendenti."),
        ("-", "Listino prezzi PDF: stampa del listino da consegnare al cliente."),
        ("#", "Impostazioni rimessaggio"),
        "Tariffa oraria manodopera, testi predefiniti di preventivo, maggiorazioni, creazione nuovo anno (copia clienti dall'anno precedente), tipologie del calendario.",
    ]),
    ("4. Anagrafica generale", [
        "Archivio unico dei contatti (privati e aziende), indipendente da Rimessaggio ed Esterni: resta anche se il cliente viene cancellato dagli altri moduli.",
        ("-", "Si alimenta: (a) confermando la richiesta quando si crea un nuovo cliente in Rimessaggio o Esterni; (b) con il tasto Importa da Rimessaggio/Esterni per i contatti già esistenti; (c) a mano con Nuovo contatto."),
        ("-", "Dati: tipo (privato/azienda), nome, ragione sociale, P.IVA, codice fiscale, SDI, PEC, indirizzo, telefono, email, note."),
        ("-", "Da anagrafica: nelle pagine Rimessaggio ed Esterni precompila il nuovo cliente scegliendo un contatto dall'elenco con ricerca."),
    ]),
    ("5. Magazzino", [
        "Articoli con codice, codice a barre EAN, descrizione, fornitore, giacenza, prezzo di acquisto e di vendita, unità di misura. Ricerca per nome, codice o fornitore.",
        ("#", "Operazioni"),
        ("1", "Nuovo articolo: compila i campi o premi Scansiona per leggere il codice a barre con la fotocamera del telefono."),
        ("1", "Carico: aumenta la giacenza (arrivo merce) indicando quantità e fornitore."),
        ("1", "Scarico: diminuisce la giacenza; si può collegare a un cliente o a un lavoro, così l'articolo compare nel conto e nel PDF con quantità e unità."),
        ("1", "Scanner rapido: dalla pagina Magazzino premi l'icona fotocamera, inquadra il codice: se esiste apre l'articolo, altrimenti propone di crearlo."),
        ("-", "Listino PDF: stampa dell'elenco articoli con prezzi di vendita."),
        ("-", "Sotto scorta: gli articoli con giacenza bassa sono evidenziati."),
    ]),
    ("6. Lavori dal cantiere (approvazione)", [
        "I lavori registrati dai dipendenti dall'app arrivano qui in attesa di approvazione. Il numero di lavori da approvare compare in Home.",
        ("1", "Apri il lavoro: dipendente, data, cliente indicato, descrizione, ore, articoli usati, voci di listino, foto/note."),
        ("1", "Correggi se serve: cambia il cliente (Rimessaggio o Esterno, con ricerca), accorpa a un conto esistente, modifica le ore, aggiungi/rimuovi articoli dal magazzino o voci dal Listino completo."),
        ("1", "Approva: il lavoro entra nello storico del cliente e nel conto dell'anno; gli articoli vengono scaricati dal magazzino. Rifiuta per eliminarlo."),
        ("-", "Se il cliente indicato non esiste viene creato tra i clienti esterni (con conferma)."),
    ]),
    ("7. App dipendenti", [
        "Indirizzo: /app-dipendente (es. https://gestionale.tuodominio.it/app-dipendente). Ogni dipendente accede con la propria chiave personale, creata dal titolare nella pagina Dipendenti. L'app si installa sul telefono come le altre (Aggiungi a schermata Home).",
        ("#", "Creare un dipendente e la sua chiave"),
        ("1", "Gestionale → Dipendenti → Nuovo dipendente: nome e, se vuoi, tariffa oraria."),
        ("1", "Premi Genera chiave: compare una chiave da comunicare al dipendente (si può rigenerare in qualsiasi momento; la vecchia smette di funzionare)."),
        ("1", "Il dipendente apre /app-dipendente, inserisce la chiave e resta collegato."),
        ("#", "Cosa può fare il dipendente"),
        ("-", "Home con saluto e tasto Aggiungi lavoro."),
        ("-", "Nuovo lavoro: cliente (ricerca tra rimessaggio ed esterni o nome nuovo), descrizione, ore, articoli dal magazzino (anche con scanner), voci dal Listino con calcolo per unità (mq = lunghezza × larghezza), note."),
        ("-", "I miei lavori: elenco dei lavori inviati con stato (in attesa / approvato)."),
        ("-", "Listino magazzino con ricerca; memo dei clienti; Assistente officina (stesse schede e codici del gestionale)."),
        ("-", "Comunicazione Capitaneria: avviso preventivo di alaggio/varo con autogrù per Marina di Campo o Marciana Marina, precompilato con i dati del cantiere; Salva (il titolare la invia dal gestionale) oppure Salva e invia via email all'ufficio; PDF e stato inviata/da inviare."),
        ("-", "Uscita: l'app chiede conferma prima di chiudere o scollegarsi."),
    ]),
    ("8. Lavorazioni esterne", [
        "Clienti non in rimessaggio: basta il nominativo (privato o azienda). Qui finiscono anche i clienti creati approvando i lavori dei dipendenti.",
        ("-", "Nuovo cliente esterno: scegli Privato/Azienda, scrivi il nominativo, Aggiungi; oppure Da anagrafica."),
        ("-", "Riga cliente: totale lavori, Preventivo (nuovo preventivo), Conto PDF (per l'anno scelto in alto a destra o per tutti gli anni), Invia a fatturazione, matita (modifica dati fiscali), frecce (unisci), cestino, freccia > (apri lavori e preventivi)."),
        ("-", "Lavori: elenco per anno con righe separate; si aggiungono a mano o arrivano dai dipendenti."),
        ("-", "Preventivi esterni: numerazione automatica, oggetto, righe con descrizione, quantità, unità e prezzo (dal Listino o libere), note; PDF e Invia a fatturazione; eliminazione con conferma."),
    ]),
    ("9. Assistente officina", [
        "Assistente tecnico per la diagnosi. Risponde SOLO in base a: schede tecniche caricate, tabelle codici errore, casi risolti salvati, memo operatore; cita sempre la fonte usata ([Scheda: …], [Caso: …], [Web: …]). Disponibile da Home, dal menu e nell'app dipendenti.",
        ("#", "Schede tecniche"),
        ("1", "Scheda Schede → Carica: scegli uno o più file PDF, DOCX, TXT o immagini, oppure trascina un'intera cartella di manuali."),
        ("1", "Marca e modello vengono ricavati dal nome del file (es. \"Suzuki DF140 manuale.pdf\" → Suzuki / DF140; \"MFS 9.9\" riconosciuto). Si correggono al volo dall'elenco."),
        ("1", "Il testo viene estratto e indicizzato; le schede sono filtrabili per marca/modello."),
        ("#", "Codici errore"),
        "Scheda Codici: tabelle per marca (Suzuki, MFG, …) con codice, descrizione, causa e rimedio. Si importano da file o si inseriscono a mano; nelle risposte i codici trovati sono la fonte principale (es. \"Suzuki C-04\").",
        ("#", "Consultazione e memoria"),
        ("1", "Chat: indica marca/modello (facoltativo), scrivi il problema o il codice e invia."),
        ("1", "Dopo la riparazione premi Salva come caso risolto: descrizione, soluzione, marca/modello. Il caso diventa memoria per le volte successive."),
        ("1", "Memo: appunti rapidi dell'operatore (es. coppie di serraggio ricorrenti) sempre considerati nelle risposte."),
        ("#", "Foto della targhetta / matricola"),
        "Nella chat premi Foto targhetta (fotocamera) o l'icona galleria: fotografa l'etichetta del motore e l'AI legge marca, modello, matricola, anno e potenza. I dati compaiono nella conversazione, il filtro modello si imposta da solo e vengono proposti nel caso risolto (motore e matricola nelle note). Funziona anche dall'app dipendenti.",
        ("#", "Siti di riferimento"),
        "Scheda Impostazioni dell'assistente → Siti di riferimento: scrivi l'indirizzo (es. www.mistermarine.it) e premi Aggiungi e indicizza. Le pagine del sito vengono lette e salvate come schede: l'assistente le sfoglia anche senza ricerca web e le cita come [Sito: nome · pagina] con il link. Con la ricerca web attiva, i siti scelti vengono cercati per primi nell'ordine di priorità (frecce ↑↓). Il tasto con le frecce circolari rilegge il sito per aggiornarlo.",
        ("#", "Ricerca web (facoltativa)"),
        "Scheda Impostazioni dell'assistente → Ricerca web (Tavily): incolla la chiave Tavily e salva. Da quel momento l'interruttore \"Consulta anche il web\" nella chat è attivabile e si può scegliere se tenerlo acceso per impostazione predefinita. Senza chiave l'interruttore resta grigio.",
    ]),
    ("10. Vendita: Tubolari, Fuoribordo Suzuki, Gommoni GEB", [
        ("-", "Tubolari: preventivi di rifacimento tubolari con misure, materiale, accessori; PDF per il cliente; elenco con ricerca."),
        ("-", "Fuoribordo Suzuki: catalogo motori con potenze e prezzi (aggiornabile), preventivo con permuta/accessori e PDF."),
        ("-", "Gommoni GEB: modelli, dotazioni, accessori; preventivo gommone + motore e PDF."),
    ]),
    ("11. Documenti, Calendario, Report", [
        ("-", "DDT & Destinazione: documenti di trasporto con mittente, destinatario, colli, causale; numerazione e PDF."),
        ("-", "Contratti: testo del contratto di rimessaggio con segnaposto (nome cliente, barca, anno, importi) che viene stampato insieme al preventivo."),
        ("-", "Documenti di servizio, Capitaneria, Mezzi: moduli dedicati con stampa PDF (dichiarazioni, comunicazioni, elenco mezzi del cantiere)."),
        ("-", "Calendario: vista annuale e mensile. Appuntamenti con tipologia (alaggio, varo, consegna, …) modificabile da Impostazioni rimessaggio; memo dei clienti; dettaglio del giorno con modifica ed eliminazione."),
        ("-", "Report ed Export: incassi per anno, pagati/non pagati, esportazione dati."),
    ]),
    ("12. Fatturazione con Fatture in Cloud", [
        "Il gestionale non emette fatture: le prepara come BOZZE su Fatture in Cloud, dove si controllano e si emettono.",
        ("#", "Collegamento (una sola volta)"),
        ("1", "Su Fatture in Cloud: Impostazioni → Applicazioni e integrazioni → Autenticazione manuale → crea un token con permessi su Clienti e Fatture. Copialo."),
        ("1", "Nel gestionale: Impostazioni → Fatturazione · Fatture in Cloud → incolla il token → Verifica e salva. Il token resta solo sul server, non viene mai mostrato."),
        ("1", "Scegli l'azienda (se ne hai più di una). L'aliquota IVA 22% viene rilevata automaticamente."),
        ("#", "Inviare un documento"),
        ("1", "Premi Invia a fatturazione sul dettaglio del cliente in Rimessaggio, sulla riga del cliente esterno (per l'anno scelto) o su un preventivo esterno."),
        ("1", "Conferma: il cliente viene creato o aggiornato su Fatture in Cloud (P.IVA, CF, SDI, PEC) e la bozza viene creata con tutte le righe separate."),
        ("1", "Accanto al tasto compare Bozza emessa · data con il link \"apri\"; il tasto diventa Reinvia (crea una nuova bozza)."),
    ]),
    ("13. Impostazioni", [
        ("-", "Cantiere: logo, denominazione, dati fiscali, indirizzo, contatti: compaiono in tutti i PDF."),
        ("-", "Sicurezza: cambio password del gestionale (serve quella attuale)."),
        ("-", "PIN di recupero master: cambio del PIN usato per reimpostare la password."),
        ("-", "Backup & Ripristino: Scarica backup salva un file JSON con tutti i dati; Ripristina da file lo ricarica (sostituisce i dati attuali, con conferma). Fai un backup prima di ogni aggiornamento e almeno una volta al mese."),
        ("-", "Manuale d'uso: questo PDF."),
        ("-", "Fatturazione: collegamento Fatture in Cloud."),
        ("-", "Aggiornamenti (solo installazione sul proprio server): mostra versione installata e disponibile con elenco novità; Aggiorna esegue backup automatico, scarica e ricostruisce; Ripristina torna alla versione precedente."),
    ]),
    ("14. Installazione sul proprio server e aggiornamenti", [
        "Il programma gira su un server (es. Oracle Cloud) in contenitori Docker: frontend, backend, database MongoDB, Caddy (HTTPS automatico) e updater. Le istruzioni complete sono nel file deploy/INSTALLAZIONE.md del repository.",
        ("1", "Sul server: git clone del repository GitHub (salvato da Emergent con \"Save to GitHub\"), poi cd deploy, cp .env.example .env, nano .env per compilare dominio, password iniziale, PIN, chiavi (vedi sezione 15)."),
        ("1", "Avvio: APP_COMMIT=$(git rev-parse --short HEAD) docker compose up -d --build. Al primo avvio Caddy ottiene il certificato HTTPS per il dominio."),
        ("1", "Aggiornamenti: da Emergent premi Save to GitHub; sul gestionale vai in Impostazioni → Aggiornamenti → Aggiorna. Backup automatico, pull e ricostruzione; in caso di problemi Ripristina."),
        ("!", "I file .env e i backup non vengono mai pubblicati su GitHub: conservane una copia (anche su questo manuale, sezione 15)."),
    ]),
]

# Schede compilabili a penna: (nome, dove si imposta, dove si ottiene / note)
CHIAVI = [
    ("Indirizzo del gestionale (dominio)", "deploy/.env → DOMAIN; registrato presso il fornitore del dominio con record A verso l'IP del server", "Es. gestionale.tuodominio.it"),
    ("Password del gestionale", "Prima installazione: deploy/.env → ADMIN_PASSWORD. Poi: Impostazioni → Sicurezza → Cambia password", "Minimo 5 caratteri. Unica per il cantiere"),
    ("PIN di recupero master", "Prima installazione: deploy/.env → RECOVERY_PIN. Poi: Impostazioni → PIN di recupero", "Serve per reimpostare la password da /recupero-pin"),
    ("Email del titolare", "deploy/.env → ADMIN_EMAIL e OWNER_EMAIL", "Riceve le email di recupero password"),
    ("Chiavi dipendenti (app)", "Gestionale → Dipendenti → Genera chiave (una per dipendente)", "Rigenerabile; la vecchia smette di funzionare"),
    ("Token Fatture in Cloud", "Impostazioni → Fatturazione · Fatture in Cloud → Verifica e salva", "Fatture in Cloud → Impostazioni → Applicazioni e integrazioni → Autenticazione manuale (permessi Clienti + Fatture)"),
    ("Chiave Gemini (assistente GEB e officina)", "deploy/.env → GEMINI_API_KEY", "aistudio.google.com → Get API key"),
    ("Chiave Tavily (ricerca web officina)", "Assistente officina → Impostazioni → Ricerca web, oppure deploy/.env → TAVILY_API_KEY", "app.tavily.com → API Keys"),
    ("Email di invio (SMTP)", "deploy/.env → SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM", "Dal proprio provider di posta (es. Gmail: password per le app)"),
    ("Repository GitHub", "deploy/.env → UPDATE_REPO (e UPDATE_BRANCH=main)", "Creato da Emergent con Save to GitHub"),
    ("Token updater", "deploy/.env → UPDATER_TOKEN", "Stringa casuale: openssl rand -hex 24"),
    ("Segreto JWT", "deploy/.env → JWT_SECRET", "Stringa casuale lunga; cambiarla scollega tutti i dispositivi"),
    ("Accesso al server (Oracle)", "Console Oracle Cloud → istanza; accesso SSH con chiave privata", "IP pubblico, utente (es. ubuntu), percorso della chiave .pem"),
    ("Account Emergent", "app.emergent.sh", "Email e metodo di accesso"),
]


def versione_app() -> dict:
    sha = os.environ.get("APP_COMMIT", "")
    if not sha:
        try:
            sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=3, cwd=os.path.dirname(__file__)).stdout.strip()
        except Exception:  # noqa: BLE001
            sha = ""
    return {"versione": VERSIONE, "data": DATA_VERSIONE, "commit": sha[:7], "sezioni": len(SEZIONI) + 1}


def build_manuale_pdf(cantiere_doc: dict) -> bytes:
    buf = io.BytesIO()
    st = getSampleStyleSheet()
    TEAK, INK, MUTED, LINE = colors.HexColor("#A64B2A"), colors.HexColor("#1E2A3A"), colors.HexColor("#5B6478"), colors.HexColor("#D9D2C7")
    title = ParagraphStyle("t", parent=st["Title"], fontName="Helvetica-Bold", fontSize=26, textColor=INK, leading=30, alignment=0, spaceAfter=4)
    sub = ParagraphStyle("s", parent=st["Normal"], fontSize=11, textColor=MUTED, leading=15)
    h1 = ParagraphStyle("h1", parent=st["Heading1"], fontName="Helvetica-Bold", fontSize=15, textColor=TEAK, leading=18, spaceBefore=14, spaceAfter=6)
    h2 = ParagraphStyle("h2", parent=st["Heading2"], fontName="Helvetica-Bold", fontSize=11, textColor=INK, leading=14, spaceBefore=8, spaceAfter=3)
    body = ParagraphStyle("b", parent=st["Normal"], fontSize=10, leading=14, textColor=INK, spaceAfter=4)
    bullet = ParagraphStyle("bl", parent=body, leftIndent=12, bulletIndent=2, spaceAfter=3)
    nota = ParagraphStyle("n", parent=body, backColor=colors.HexColor("#FBF3EE"), borderColor=TEAK, borderWidth=0.5, borderPadding=5, leftIndent=4, spaceBefore=4, spaceAfter=8)
    toc = ParagraphStyle("toc", parent=body, fontSize=10.5, leading=16)
    small = ParagraphStyle("sm", parent=body, fontSize=8.5, leading=11, textColor=MUTED, spaceAfter=0)
    kname = ParagraphStyle("kn", parent=body, fontName="Helvetica-Bold", fontSize=10.5, spaceAfter=0)
    v = versione_app()
    nome = (cantiere_doc or {}).get("nome") or "Cantiere nautico"

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(18 * mm, 10 * mm, f"Gestionale GEBnautica · Manuale d'uso · versione {v['versione']}" + (f" ({v['commit']})" if v["commit"] else ""))
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Pagina {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm, title="Manuale d'uso Gestionale GEBnautica")
    el = [Spacer(1, 40 * mm), Paragraph("Gestionale GEBnautica", title), Paragraph("Manuale d'uso e istruzioni del programma", sub), Spacer(1, 6 * mm)]
    info = Table([["Cantiere", nome], ["Versione", f"{v['versione']}" + (f" · build {v['commit']}" if v["commit"] else "")], ["Aggiornato al", v["data"]], ["Stampato il", date.today().strftime("%d/%m/%Y")]], colWidths=[35 * mm, 110 * mm])
    info.setStyle(TableStyle([("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 9.5), ("TEXTCOLOR", (0, 0), (0, -1), MUTED), ("TEXTCOLOR", (1, 0), (1, -1), INK),
                              ("LINEBELOW", (0, 0), (-1, -1), 0.3, LINE), ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 5)]))
    el += [info, Spacer(1, 12 * mm), Paragraph("Indice", h1)]
    el += [Paragraph(t, toc) for t, _ in SEZIONI]
    el.append(Paragraph("15. Chiavi, password e accessi (da compilare a penna)", toc))
    el.append(PageBreak())
    for titolo, voci in SEZIONI:
        el.append(Paragraph(titolo, h1))
        n = 0
        for x in voci:
            if isinstance(x, str):
                n = 0
                el.append(Paragraph(x, body))
            elif x[0] == "-":
                el.append(Paragraph(x[1], bullet, bulletText="•"))
            elif x[0] == "#":
                n = 0
                el.append(Paragraph(x[1], h2))
            elif x[0] == "1":
                n += 1
                el.append(Paragraph(x[1], bullet, bulletText=f"{n}."))
            else:
                el.append(Paragraph(f"<b>Nota.</b> {x[1]}", nota))

    el.append(PageBreak())
    el.append(Paragraph("15. Chiavi, password e accessi (da compilare a penna)", h1))
    el.append(Paragraph("Per ogni chiave: dove si imposta nel programma, dove si ottiene, e un riquadro vuoto per scriverla a penna. Conserva questo foglio in un luogo sicuro: le chiavi non sono salvate su GitHub e non si possono recuperare dal programma.", body))
    el.append(Spacer(1, 3 * mm))
    W = A4[0] - 36 * mm
    for nome_k, dove, fonte in CHIAVI:
        box = Table([[""]], colWidths=[W], rowHeights=[14 * mm])
        box.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.8, INK), ("BACKGROUND", (0, 0), (-1, -1), colors.white)]))
        t = Table([[Paragraph(nome_k, kname)], [Paragraph(f"<b>Dove si imposta:</b> {dove}", small)], [Paragraph(f"<b>Dove si ottiene / note:</b> {fonte}", small)], [box]], colWidths=[W])
        t.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
                               ("BOTTOMPADDING", (0, 2), (0, 2), 3), ("LINEBELOW", (0, -1), (-1, -1), 0.3, LINE), ("BOTTOMPADDING", (0, -1), (-1, -1), 7)]))
        el += [KeepTogether(t), Spacer(1, 3 * mm)]
    doc.build(el, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
