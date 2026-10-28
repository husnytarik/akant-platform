// Onaylanan teslimlerin gün gün dökümü: veli (Teslim yetkileri) ve öğrenci dosyası aynı çizimi kullanır.
// liste: [{ zaman, kisi, yakinlik, guvenlik }] en yeniden eskiye
function teslimGecmisiCiz(k, liste) {
  const el = (tag, metin, sinif) => { const e = document.createElement(tag); if (metin !== undefined) e.textContent = metin; if (sinif) e.className = sinif; return e; };
  if (!liste.length) return k.append(el('p', 'Henüz teslim kaydı yok.', 'alt'));
  let gun = '';
  for (const t of liste) {
    const d = new Date(t.zaman);
    const g = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
    if (g !== gun) { gun = g; k.append(el('h3', g, 'baslik3')); }
    const s = el('div', undefined, 'ogd-satir');
    const sol = el('div');
    sol.append(el('strong', t.kisi), el('small', [t.yakinlik, t.guvenlik ? 'Güvenlik: ' + t.guvenlik : ''].filter(Boolean).join(' · ')));
    s.append(sol, el('span', d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }), 'ogd-sayi'));
    k.append(s);
  }
}
