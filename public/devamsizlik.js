const $ = id => document.getElementById(id);
const DURUM = { gelmedi: 'Gelmedi', gec: 'Geç', izinli: 'İzinli' };
const GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

function tarihYaz(t) {
  const [y, a, g] = t.split('-');
  return `${g}.${a}.${y} ${GUN[new Date(t + 'T00:00:00Z').getUTCDay()]}`;
}

(async () => {
  const r = await fetch('/api/yoklama/devam');
  if (r.status === 401) { location.href = '/'; return; }
  if (!r.ok) { location.href = '/panel'; return; }
  const { cocuklar } = await r.json();
  const liste = $('liste');
  if (!cocuklar.length) liste.appendChild(el('p', 'Bağlı öğrenci bulunamadı.', 'alt'));
  for (const c of cocuklar) {
    const kutu = el('div', undefined, 'kutu');
    kutu.appendChild(el('h2', c.ad, 'baslik2'));
    kutu.appendChild(el('p', `Gelmedi ${c.say.gelmedi} · Geç ${c.say.gec} · İzinli ${c.say.izinli} · Toplam yoklama ${c.toplam}`));
    if (!c.kayitlar.length) {
      kutu.appendChild(el('p', 'Kayıtlı devamsızlık yok.', 'alt'));
    } else {
      const t = el('table');
      const bas = document.createElement('tr');
      bas.append(el('th', 'Tarih'), el('th', 'Ders'), el('th', 'Durum'));
      t.appendChild(bas);
      for (const k of c.kayitlar) {
        const tr = document.createElement('tr');
        tr.append(el('td', tarihYaz(k.tarih)), el('td', `${k.dersSaati}. ders · ${k.ders}`), el('td', DURUM[k.durum]));
        t.appendChild(tr);
      }
      const sar = el('div', undefined, 'tablo-sar');
      sar.appendChild(t);
      kutu.appendChild(sar);
    }
    liste.appendChild(kutu);
  }
})();
