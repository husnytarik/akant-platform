function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

const kisa = t => t.split('-').reverse().join('.');

(async () => {
  const r = await fetch('/api/ders/odevlerim');
  if (r.status === 401) { location.href = '/'; return; }
  if (!r.ok) { location.href = '/panel'; return; }
  const { bugun, ogrenciler } = await r.json();
  const liste = document.getElementById('liste');
  if (!ogrenciler.length) liste.appendChild(el('p', 'Bağlı öğrenci bulunamadı.', 'alt'));
  for (const o of ogrenciler) {
    liste.appendChild(el('h2', o.ad, 'baslik2'));
    if (!o.odevler.length) liste.appendChild(el('p', 'Verilmiş ödev yok.', 'bos-not'));
    for (const x of o.odevler) {
      const gecmis = x.sonTarih < bugun;
      const kart = el('div', undefined, 'not-kart' + (gecmis ? ' soluk' : ''));
      const ust = el('div', undefined, 'not-ust');
      ust.append(el('strong', x.baslik), el('span', (gecmis ? 'Süresi doldu · ' : 'Son: ') + kisa(x.sonTarih), 'alt'));
      kart.appendChild(ust);
      kart.appendChild(el('p', `${x.ders}${x.ogretmen ? ' · ' + x.ogretmen : ''}`, 'alt'));
      if (x.aciklama) kart.appendChild(el('p', x.aciklama));
      liste.appendChild(kart);
    }
  }
})();
