function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const kisa = t => t.split('-').reverse().join('.');

(async () => {
  const r = await fetch('/api/ders/odevlerim');
  if (r.status === 401) { location.href = '/'; return; }
  if (!r.ok) { location.href = '/panel'; return; }
  const { bugun, ogrenciler } = await r.json();
  const liste = document.getElementById('liste');
  if (!ogrenciler.length) liste.appendChild(el('p', 'Bağlı öğrenci bulunamadı.', 'alt'));
  const gunFark = t => Math.round((new Date(t + 'T00:00:00Z') - new Date(bugun + 'T00:00:00Z')) / 86400000);
  for (const o of ogrenciler) {
    liste.appendChild(el('h2', o.ad, 'baslik2'));
    const bekleyen = o.odevler.filter(x => x.sonTarih >= bugun).length;
    const ozet = el('div', undefined, 'odev-ozet');
    for (const [say, ad, sinif] of [[bekleyen, 'Bekleyen', 'bekleyen'], [o.odevler.length - bekleyen, 'Süresi dolan', 'dolan']]) {
      const k = el('div', undefined, 'odev-sayac ' + sinif);
      k.append(el('strong', String(say)), el('span', ad));
      ozet.appendChild(k);
    }
    liste.appendChild(ozet);
    if (!o.odevler.length) liste.appendChild(el('p', 'Verilmiş ödev yok.', 'bos-not'));
    for (const x of o.odevler) {
      const gecmis = x.sonTarih < bugun;
      const fark = gunFark(x.sonTarih);
      const kart = el('div', undefined, 'odev-kart' + (gecmis ? ' gecmis' : fark <= 1 ? ' yakin' : ''));
      const [, a, g] = x.sonTarih.split('-');
      const rozet = el('div', undefined, 'tarih-rozet');
      rozet.append(el('strong', String(Number(g))), el('span', AY[Number(a) - 1]));
      const orta = el('div', undefined, 'etut-orta');
      orta.append(el('strong', x.baslik), el('span', `${x.ders}${x.ogretmen ? ' · ' + x.ogretmen : ''}`, 'alt'));
      if (x.aciklama) orta.appendChild(el('span', x.aciklama, 'odev-aciklama'));
      if (x.kazanim) orta.appendChild(el('span', 'Kazanım: ' + x.kazanim, 'odev-aciklama'));
      const sag = el('span', gecmis ? 'Süresi doldu' : fark === 0 ? 'Bugün' : fark === 1 ? 'Yarın' : `${fark} gün`, 'etiket odev-etiket');
      kart.append(rozet, orta, sag);
      liste.appendChild(kart);
    }
  }
})();
