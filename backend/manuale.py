"""Manuale d'uso del Gestionale GEBnautica: contenuti + generazione PDF. Aggiornare VERSIONE e le sezioni ad ogni nuova funzione."""
import io
import os
import subprocess
from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

VERSIONE = "2026.10"
DATA_VERSIONE = "16/10/2026"

# Ogni sezione: (titolo, [paragrafi | ("-", voce elenco) | ("!", nota)])
SEZIONI = [
    ("1. Primi passi", [
        "Il Gestionale GEBnautica si usa da computer, tablet e telefono (consigliato aggiungerlo alla schermata Home). L'accesso avviene con la sola password del cantiere; in caso di smarrimento si usa il PIN di recupero master da Impostazioni → PIN di recupero.",
        ("-", "Home: riepilogo dei moduli con i numeri chiave (clienti dell'anno, articoli, lavori da approvare) e accesso diretto a Rimessaggio, Magazzino, Lavori dal cantiere, Lavorazioni esterne, Assistente officina, Tubolari, Suzuki, Gommoni."),
        ("-", "Anno di lavoro: in alto a sinistra si sceglie l'anno; clienti, posti barca e conti si riferiscono sempre all'anno selezionato."),
        ("-", "Assistente vocale GEB: il pulsante rotondo con il microfono (spostabile trascinandolo) risponde a domande e comandi vocali; chiede conferma prima di modificare dati."),
        ("!", "Su telefono le pagine hanno una barra inferiore scorrevole con le sezioni principali."),
    ]),
    ("2. Rimessaggio (clienti e barche)", [
        "Elenco dei clienti in rimessaggio per l'anno. Ogni scheda mostra posto, tipo barca, lunghezza, totale conto e stato pagamento. Filtri per tipo sosta e pagamento, ricerca per nome.",
        ("-", "Nuovo cliente: tasto Nuovo cliente, oppure Da anagrafica per riprendere i dati di un contatto già presente nell'Anagrafica generale. Nomi e cognomi vengono messi in maiuscolo automaticamente."),
        ("-", "Privato o Azienda: per le aziende si inseriscono ragione sociale, P.IVA, codice SDI e PEC; l'intestazione compare nei PDF."),
        ("-", "Tipo sosta: coperto, su piazzale, piazzale temporaneo, fuori sede. Per il fuori sede si indicano luogo e prezzo di ritiro e consegna, inclusi nel conto."),
        ("-", "Costi calcolati automaticamente dalle Tariffe in base a lunghezza e larghezza (sosta, movimentazione, copertura a mq, alaggio, varo, antivegetativa, lavaggi, manutenzione motore). Si possono forzare a mano."),
        ("-", "Icone della scheda: spunta = segna pagato/non pagato; occhio = dettaglio completo; foglio = Preventivo PDF; foglio con firma = Preventivo + Contratto in un unico PDF; nota adesiva = memo; matita = modifica; frecce = unisci con un altro cliente; cestino = elimina."),
        ("-", "Memo: promemoria sul cliente, visibile anche in Calendario e nell'app dipendenti."),
        ("-", "Unisci clienti: unisce due schede doppie in una sola, anche tra Rimessaggio e Lavorazioni esterne, spostando lavori e storico."),
        ("-", "Dettaglio cliente: storico lavori per anno con righe separate (descrizione, manodopera, articoli), lavorazioni extra, PDF e tasto Invia a fatturazione."),
        ("!", "Eliminare un cliente dal Rimessaggio non elimina la sua voce nell'Anagrafica generale."),
    ]),
    ("3. Posti barca, Tariffe e Impostazioni rimessaggio", [
        ("-", "Posti barca: mappa dei posti con assegnazione cliente per anno."),
        ("-", "Tariffe: listino per scaglioni di lunghezza e voci a prezzo con unità di misura (forfait, €/m, €/mq, €/lt, €/kg, €/ora, €/giorno, €/pezzo, €/km). Le voci alimentano il selettore Listino nei lavori e nei preventivi."),
        ("-", "Impostazioni rimessaggio: testi predefiniti di preventivo, contratto, maggiorazioni."),
    ]),
    ("4. Anagrafica generale", [
        "Archivio unico di tutti i contatti (privati e aziende) indipendente da Rimessaggio ed Esterni. Si alimenta chiedendo conferma quando si crea un nuovo cliente, oppure con il tasto Importa da Rimessaggio/Esterni per i contatti già presenti.",
        ("-", "Dati: nome, ragione sociale, P.IVA, CF, SDI, PEC, indirizzo, telefono, email, note."),
        ("-", "Da anagrafica: nelle pagine Rimessaggio ed Esterni precompila il nuovo cliente scegliendo un contatto."),
    ]),
    ("5. Magazzino", [
        "Articoli con codice, EAN, fornitore, giacenza, prezzo e unità di misura. Carichi e scarichi tracciati.",
        ("-", "Scanner: con la fotocamera del telefono si legge il codice a barre per trovare o creare l'articolo."),
        ("-", "Scarico collegato: lo scarico può essere attribuito a un cliente o a un lavoro, così l'articolo compare nel conto."),
        ("-", "Listino PDF: stampa dell'elenco articoli con prezzi."),
    ]),
    ("6. Lavori dal cantiere (dipendenti)", [
        "I dipendenti registrano i lavori dall'app dipendenti; qui si approvano, modificano ore, articoli e si attribuiscono al cliente/conto giusto.",
        ("-", "Approvazione: si può cambiare cliente, accorpare a un conto esistente, aggiungere articoli dal magazzino e voci dal listino completo, correggere le ore."),
        ("-", "Ogni lavoro genera righe separate nel conto e nei PDF: dettaglio lavoro, manodopera (ore × tariffa), articoli con quantità e unità."),
    ]),
    ("7. App dipendenti", [
        "Indirizzo: /app-dipendente. Si accede con la chiave personale creata in Dipendenti. Si installa come app sul telefono.",
        ("-", "Home con saluto e tasto Aggiungi lavoro; nuovo lavoro con cliente, descrizione, ore, articoli (anche da scanner) e voci di listino con calcolo per unità (mq = lunghezza × larghezza)."),
        ("-", "Listino magazzino consultabile con ricerca; memo dei clienti; Assistente officina; chiede conferma prima di uscire."),
        ("!", "Dopo un aggiornamento, se qualcosa non compare, chiudere e riaprire l'app installata."),
    ]),
    ("8. Lavorazioni esterne", [
        "Clienti fuori rimessaggio: basta il nominativo (privato o azienda). Qui finiscono anche i clienti creati approvando i lavori dei dipendenti.",
        ("-", "Per ogni cliente: lavori per anno, Preventivo, Conto PDF per anno o per tutti gli anni, Invia a fatturazione, modifica, unisci, elimina."),
        ("-", "Preventivi esterni: righe con quantità, unità e prezzo, numerazione automatica, PDF e invio a fatturazione."),
    ]),
    ("9. Assistente officina", [
        "Assistente tecnico che risponde SOLO in base alle schede caricate, ai codici errore e ai casi risolti salvati, citando le fonti.",
        ("-", "Schede: caricamento PDF, DOCX, TXT e immagini, anche un'intera cartella trascinata; marca e modello vengono ricavati dal nome del file e sono modificabili dall'elenco."),
        ("-", "Codici errore: tabelle per marca (es. Suzuki C-04, MFG) importabili e modificabili."),
        ("-", "Casi risolti: dopo una diagnosi si salva il caso con la soluzione, che diventa memoria per le volte successive. Memo operatore per appunti rapidi."),
        ("-", "Ricerca web (opzionale): in Impostazioni dell'assistente si inserisce la chiave Tavily; senza chiave l'interruttore Consulta anche il web resta disattivato."),
    ]),
    ("10. Vendita: Tubolari, Suzuki, Gommoni GEB", [
        ("-", "Tubolari: preventivi di rifacimento tubolari con misure e PDF."),
        ("-", "Fuoribordo Suzuki: catalogo motori con prezzi e preventivi."),
        ("-", "Gommoni GEB: modelli, accessori e preventivi."),
    ]),
    ("11. Documenti e servizi", [
        ("-", "DDT & Destinazione: documenti di trasporto."),
        ("-", "Contratti: template del contratto di rimessaggio con segnaposto, stampato insieme al preventivo."),
        ("-", "Documenti di servizio, Capitaneria, Mezzi: moduli e stampe dedicate; Report ed Export dati."),
        ("-", "Calendario: vista annuale e mensile con appuntamenti, alaggi, vari e memo; tipologie modificabili; dettaglio del giorno con modifica ed eliminazione."),
    ]),
    ("12. Fatturazione (Fatture in Cloud)", [
        "Collegamento al gestionale esterno Fatture in Cloud. In Impostazioni → Fatturazione si incolla il token di accesso (resta solo sul server) e si sceglie l'azienda; l'IVA 22% viene rilevata automaticamente.",
        ("-", "Invia a fatturazione: su conto rimessaggio, conto esterno e preventivo esterno. Il cliente viene creato o aggiornato (P.IVA, CF, SDI, PEC) e il documento diventa una bozza di fattura con tutte le righe separate."),
        ("-", "Stato: accanto al tasto compare Bozza emessa con data e link per aprirla; il tasto diventa Reinvia."),
    ]),
    ("13. Impostazioni", [
        ("-", "Cantiere: logo, dati fiscali e intestazione usati in tutti i PDF."),
        ("-", "Sicurezza: cambio password; PIN di recupero master."),
        ("-", "Backup & Ripristino: scarica un file JSON con tutti i dati e ripristinalo quando serve."),
        ("-", "Manuale d'uso: questo PDF, aggiornato ad ogni versione."),
        ("-", "Fatturazione: configurazione Fatture in Cloud."),
        ("-", "Aggiornamenti (solo installazione sul proprio server): confronto versione, changelog, backup automatico, aggiornamento e ripristino."),
    ]),
    ("14. Installazione sul proprio server (Oracle)", [
        "Vedi il file deploy/INSTALLAZIONE.md nel repository. Il programma gira in Docker con Caddy (HTTPS automatico). Le chiavi (password iniziale, PIN, GEMINI_API_KEY, TAVILY_API_KEY, SMTP) si impostano nel file deploy/.env. Gli aggiornamenti si scaricano dal repository GitHub salvato da Emergent tramite Impostazioni → Aggiornamenti.",
    ]),
]


def versione_app() -> dict:
    sha = os.environ.get("APP_COMMIT", "")
    if not sha:
        try:
            sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=3, cwd=os.path.dirname(__file__)).stdout.strip()
        except Exception:  # noqa: BLE001
            sha = ""
    return {"versione": VERSIONE, "data": DATA_VERSIONE, "commit": sha[:7], "sezioni": len(SEZIONI)}


def build_manuale_pdf(cantiere_doc: dict) -> bytes:
    buf = io.BytesIO()
    st = getSampleStyleSheet()
    TEAK, INK, MUTED = colors.HexColor("#A64B2A"), colors.HexColor("#1E2A3A"), colors.HexColor("#5B6478")
    title = ParagraphStyle("t", parent=st["Title"], fontName="Helvetica-Bold", fontSize=26, textColor=INK, leading=30, alignment=0, spaceAfter=4)
    sub = ParagraphStyle("s", parent=st["Normal"], fontSize=11, textColor=MUTED, leading=15)
    h1 = ParagraphStyle("h1", parent=st["Heading1"], fontName="Helvetica-Bold", fontSize=15, textColor=TEAK, leading=18, spaceBefore=14, spaceAfter=6)
    body = ParagraphStyle("b", parent=st["Normal"], fontSize=10, leading=14, textColor=INK, spaceAfter=4)
    bullet = ParagraphStyle("bl", parent=body, leftIndent=12, bulletIndent=2, spaceAfter=3)
    nota = ParagraphStyle("n", parent=body, backColor=colors.HexColor("#FBF3EE"), borderColor=TEAK, borderWidth=0.5, borderPadding=5, leftIndent=4, spaceBefore=4, spaceAfter=8)
    toc = ParagraphStyle("toc", parent=body, fontSize=10.5, leading=16)
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
                              ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#E5E0D8")), ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 5)]))
    el += [info, Spacer(1, 12 * mm), Paragraph("Indice", h1)]
    el += [Paragraph(t, toc) for t, _ in SEZIONI]
    el.append(PageBreak())
    for titolo, voci in SEZIONI:
        el.append(Paragraph(titolo, h1))
        for x in voci:
            if isinstance(x, str):
                el.append(Paragraph(x, body))
            elif x[0] == "-":
                el.append(Paragraph(x[1], bullet, bulletText="•"))
            else:
                el.append(Paragraph(f"<b>Nota.</b> {x[1]}", nota))
    doc.build(el, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
