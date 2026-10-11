import { useCallback, useEffect, useRef, useState } from "react";

const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

// Riconoscimento vocale del browser (it-IT) + sintesi vocale.
export function useVoce({ onFinal }) {
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
    rec.onerror = () => { setAscolto(false); setParziale(""); };
    recRef.current = rec; rec.start(); setAscolto(true);
  }, [onFinal]);

  useEffect(() => () => recRef.current?.abort(), []);

  const parla = useCallback((testo) => {
    if (!window.speechSynthesis || !testo) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(testo);
    u.lang = "it-IT"; u.rate = 1.05;
    const voce = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("it"));
    if (voce) u.voice = voce;
    window.speechSynthesis.speak(u);
  }, []);

  return { supportato, ascolto, parziale, avvia, stop, parla };
}
