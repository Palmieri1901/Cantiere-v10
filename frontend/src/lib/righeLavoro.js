// Scompone un lavoro in voci separate: descrizione, manodopera (ore × tariffa), articoli
export function righeLavoro(l) {
  const arts = [
    ...(l.articoli_magazzino || []).map((it) => ({ nome: it.nome, quantita: Number(it.quantita) || 0, prezzo: Number(it.prezzo_unitario) || 0, totale: Number(it.totale) || 0, unita: it.unita || "" })),
    ...(l.articoli_liberi || []).map((it) => ({ nome: it.descrizione, quantita: Number(it.quantita) || 0, prezzo: Number(it.prezzo_unitario) || 0, totale: Number(it.totale) || 0, unita: it.unita || "" })),
  ];
  const ore = Number(l.ore) || 0;
  const manodopera = +((Number(l.costo) || 0) - arts.reduce((s, a) => s + a.totale, 0)).toFixed(2);
  const righe = [];
  if (ore > 0) righe.push({ nome: "Manodopera", qta: `${ore} h`, prezzo: manodopera ? manodopera / ore : 0, totale: manodopera });
  else if (manodopera) righe.push({ nome: "Lavorazione", qta: "", prezzo: null, totale: manodopera });
  arts.forEach((a) => righe.push({ nome: a.nome, qta: `${a.quantita}${a.unita ? ` ${a.unita}` : ""}`, prezzo: a.prezzo, totale: a.totale }));
  return righe;
}
