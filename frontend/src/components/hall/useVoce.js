import { useCallback, useEffect, useRef, useState } from "react";

const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

// Riconoscimento vocale del browser (it-IT) + sintesi vocale.
export function useVoce({ onFinal, onErrore }) {
  const [ascolto, setAscolto] = useState(false);
  const [parziale, setParziale] = useState("");
  const recRef = useRef(null);
  const supportato = !!SR;

  const stop = useCallback(() => { recRef.current?.stop(); setAscolto(false); }, []);

  const avvia = useCallback(() => {
    if (!SR) return;
    window.speechSynthesis?.cancel();
    const rec = new SR();
    rec.lang = "it-IT"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    let finale = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finale += t; else interim += t;
      }
      setParziale(finale + interim);
    };
    rec.onend = () => { setAscolto(false); setParziale(""); if (finale.trim()) onFinal(finale.trim()); };
    rec.onerror = (e) => {
      setAscolto(false); setParziale("");
      const m = { "not-allowed": "Microfono non consentito. Se usi l'anteprima dentro Emergent, aprila in una scheda del browser a parte e consenti il microfono; oppure scrivi il comando.",
        "service-not-allowed": "Il riconoscimento vocale non è disponibile su questo browser: usa Chrome o Safari, oppure scrivi.",
        "no-speech": "Non ho sentito nulla: premi il microfono e parla subito dopo.",
        "audio-capture": "Nessun microfono trovato sul dispositivo.",
        "network": "Il riconoscimento vocale richiede la connessione internet." };
      onErrore?.(m[e.error] || `Errore microfono (${e.error}). Puoi scrivere il comando.`);
    };
    recRef.current = rec;
    try { rec.start(); setAscolto(true); } catch { onErrore?.("Impossibile avviare il microfono: riprova."); }
  }, [onFinal, onErrore]);

  useEffect(() => () => recRef.current?.abort(), []);

  const uttRef = useRef(null);
  const sbloccato = useRef(false);

  // Da chiamare dentro un click/tap: su telefono l'audio parte solo se "sbloccato" da un gesto dell'utente
  const sbloccaAudio = useCallback(() => {
    if (!window.speechSynthesis || sbloccato.current) return;
    try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; window.speechSynthesis.speak(u); sbloccato.current = true; } catch { /* ignora */ }
  }, []);

  const parla = useCallback((testo) => {
    if (!window.speechSynthesis || !testo) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(testo);
    u.lang = "it-IT"; u.rate = 1.05; u.volume = 1;
    const voce = synth.getVoices().find((v) => v.lang?.toLowerCase().replace("_", "-").startsWith("it"));
    if (voce) u.voice = voce;
    uttRef.current = u;
    setTimeout(() => { try { synth.resume(); synth.speak(u); } catch { /* ignora */ } }, 80);
  }, []);

  // Ascolto continuo della parola di attivazione "GEB" (pronunce: geb, gheb, jeb, g e b)
  const wakeRef = useRef(null);
  const [wakeAttivo, setWakeAttivo] = useState(false);
  const WAKE = /\b(geb|gheb|jeb|gep|ghep|gebbe|ghebbe|g\.?\s?e\.?\s?b\.?)\b[\s,.:!]*/i;

  const stopWake = useCallback(() => { const w = wakeRef.current; wakeRef.current = null; w?.abort(); setWakeAttivo(false); }, []);

  const avviaWake = useCallback((onWake) => {
    if (!SR) return false;
    stopWake();
    let vivo = true;
    const crea = () => {
      const rec = new SR();
      rec.lang = "it-IT"; rec.continuous = true; rec.interimResults = true;
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          const m = t.match(WAKE);
          if (m) {
            const resto = t.slice(m.index + m[0].length).trim();
            if (e.results[i].isFinal || resto.split(" ").length >= 3) {
              vivo = false; rec.abort(); wakeRef.current = null; setWakeAttivo(false);
              onWake(resto);
              return;
            }
          }
        }
      };
      rec.onerror = (e) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") { vivo = false; setWakeAttivo(false); onErrore?.("Microfono non consentito: apri l'app in una scheda del browser (non nell'anteprima) e consenti il microfono."); } };
      rec.onend = () => { if (vivo && wakeRef.current === rec) setTimeout(() => { if (vivo && wakeRef.current === rec) { try { rec.start(); } catch { crea(); } } }, 300); };
      wakeRef.current = rec;
      try { rec.start(); setWakeAttivo(true); } catch { setWakeAttivo(false); }
    };
    crea();
    return true;
  }, [stopWake, onErrore]);

  useEffect(() => () => { wakeRef.current?.abort(); }, []);

  return { supportato, ascolto, parziale, avvia, stop, parla, sbloccaAudio, wakeAttivo, avviaWake, stopWake };
}
