function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

const tarihYaz = t => t.split('-').reverse().join('.');

(async () => {
  const r = await fetch('/api/sinav/notlarim');
  if (r.status === 401) { location.href = '/'; return; }
  if (!r.ok) { location.href = '/panel'; return; }
  const { ogrenciler } = await r.json();
  const liste = document.getElementById('liste');
  if (!ogrenciler.length) liste.appendChild(el('p', 'Bağlı öğrenci bulunamadı.', 'alt'));
  for (const o of ogrenciler) {
    liste.appendChild(el('h2', o.ad, 'baslik2'));
    if (!o.sinavlar.length) liste.appendChild(el('p', 'Yayınlanmış sınav sonucu yok.', 'alt'));
    for (const s of o.sinavlar) {
      const kart = el('div', undefined, 'not-kart');
      const ust = el('div', undefined, 'not-ust');
      ust.append(el('strong', s.ad), el('span', tarihYaz(s.tarih), 'alt'));
      kart.appendChild(ust);
      kart.appendChild(el('p', `Ortalama puan: ${s.ortalama} · Sınav sırası: ${s.sira} / ${s.giren}`));
      const tablo = el('table', undefined, 'sinav-tablo');
      const bas = el('tr');
      for (const t of ['Ders', 'Doğru', 'Yanlış', 'Boş', 'Net', 'Puan']) bas.append(el('th', t));
      tablo.append(bas);
      for (const d of s.dersler) {
        const tr = el('tr');
        for (const v of [d.ders, d.dogru, d.yanlis, d.bos, d.net, d.puan]) tr.append(el('td', String(v)));
        tablo.append(tr);
      }
      kart.appendChild(tablo);
      for (const d of s.dersler) {
        if (!d.kazanimlar || !d.kazanimlar.length) continue;
        const eksik = d.kazanimlar.filter(k => k.durum !== 'Edinildi');
        kart.appendChild(el('h4', `${d.ders}: ${d.kazanimlar.length - eksik.length} kazanım edinildi, ${eksik.length} kazanımda eksik var`, 'baslik3'));
        if (!eksik.length) continue;
        const kt = el('table', undefined, 'sinav-tablo');
        const kb = el('tr'); for (const t of ['Eksik kazanım', 'Sorular', 'Durum']) kb.append(el('th', t));
        kt.append(kb);
        for (const k of eksik) {
          const tr = el('tr');
          tr.append(el('td', k.kazanim), el('td', k.sorular.join(', ')), el('td', k.durum, 'durum ' + (k.durum === 'Kısmen' ? 'durum-kismen' : 'durum-eksik')));
          kt.append(tr);
        }
        kart.appendChild(kt);
      }
      kart.appendChild(el('p', s.yanlisKat ? `${s.yanlisKat} yanlış 1 doğruyu götürür.` : 'Yanlışlar doğruyu götürmez.', 'alt'));
      liste.appendChild(kart);
    }
  }
})();
