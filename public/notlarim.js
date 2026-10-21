function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

const tarihYaz = t => t.split('-').reverse().join('.');
const DURUM_RENK = { Edinildi: '#1a7f37', Kısmen: '#b45309', Eksik: '#c62828' };
const ISLEME = { islenmedi: 'Henüz işlenmedi', devamsiz: 'Derse katılmadı', katildi: 'İşlendi', bilinmiyor: 'İşlendi' };
const puanRenk = p => (p < 40 ? '#d64545' : p < 70 ? '#e0a100' : '#2e9e5b');

// Eksik kazanımlar: ders başına katlanır bölüm, içinde kazanım kartları
function kazanimBolumu(d) {
  const eksik = d.kazanimlar.filter(k => k.durum !== 'Edinildi');
  const kutu = el('details', undefined, 'nt-kaz');
  kutu.append(el('summary', `${d.ders} · ${d.kazanimlar.length - eksik.length} edinildi, ${eksik.length} eksik`));
  if (!eksik.length) kutu.append(el('p', 'Bu dersteki tüm kazanımlar edinildi.', 'mad-ince'));
  for (const k of eksik) {
    const kart = el('div', undefined, 'mad-kaz');
    const ust = el('div', undefined, 'mad-kaz-ust');
    const dur = el('b', k.durum); dur.style.setProperty('--c', DURUM_RENK[k.durum] || '#8a867d');
    ust.append(el('span', k.kazanim), dur);
    const cubuk = el('span', '', 'basari-cubuk'); cubuk.style.setProperty('--oran', (k.toplam ? (k.dogru / k.toplam) * 100 : 0) + '%');
    const alt = el('div', undefined, 'mad-kaz-alt');
    alt.append(el('span', `Soru ${k.sorular.join(', ')} · ${k.dogru}/${k.toplam} doğru`, 'mad-ince'));
    const durum = k.isleme?.durum;
    if (ISLEME[durum]) alt.append(el('span', ISLEME[durum], 'mad-durum' + (durum === 'islenmedi' || durum === 'devamsiz' ? ' eksik' : '')));
    kart.append(ust, cubuk, alt);
    kutu.append(kart);
  }
  return kutu;
}

function sinavKarti(s, acik) {
  const kart = el('details', undefined, 'nt-sinav');
  kart.open = acik;
  const ozet = el('summary');
  const ad = el('div', undefined, 'nt-ad');
  ad.append(el('strong', s.ad), el('small', `${tarihYaz(s.tarih)} · ${s.giren} öğrenci içinde ${s.sira}. sıra`));
  ozet.append(ad, el('span', String(s.ortalama), 'nt-puan'));
  kart.append(ozet);

  const yatay = el('div', undefined, 'yatay');
  for (const d of s.dersler) {
    const satir = el('div', undefined, 'yatay-satir'); const cubuk = el('span', undefined, 'yatay-cubuk'); const i = el('i');
    i.style.setProperty('--w', Math.max(0, Math.min(100, Number(d.puan))) + '%'); cubuk.append(i);
    satir.append(el('span', d.ders, 'yatay-ad'), cubuk, el('b', String(Math.round(Number(d.puan)))));
    yatay.append(satir);
  }
  kart.append(yatay);

  const izgara = el('div', undefined, 'sn-dersler');
  for (const d of s.dersler) {
    const h = el('span', undefined, 'sn-ders');
    h.append(el('small', d.ders), el('b', String(d.puan)), el('small', `net ${d.net} · ${d.dogru}/${d.yanlis}/${d.bos}`));
    izgara.append(h);
  }
  kart.append(izgara, el('p', `Hücrelerde puan, altında net ve doğru/yanlış/boş yazar. ${s.yanlisKat ? `${s.yanlisKat} yanlış 1 doğruyu götürür.` : 'Yanlışlar doğruyu götürmez.'}`, 'mad-ince'));

  for (const d of s.dersler) if (d.kazanimlar && d.kazanimlar.length) kart.append(kazanimBolumu(d));
  return kart;
}

(async () => {
  const r = await fetch('/api/sinav/notlarim');
  if (r.status === 401) { location.href = '/'; return; }
  if (!r.ok) { location.href = '/panel'; return; }
  const { ogrenciler } = await r.json();
  const liste = document.getElementById('liste');
  if (!ogrenciler.length) liste.appendChild(el('p', 'Bağlı öğrenci bulunamadı.', 'alt'));
  for (const o of ogrenciler) {
    liste.appendChild(el('h2', o.ad, 'baslik2'));
    if (!o.sinavlar.length) liste.appendChild(el('p', 'Henüz yayınlanmış sınav sonucu yok. Öğretmen yayınladığında burada görünür.', 'bos-not'));
    if (o.sinavlar.length > 1) {
      const kutu = el('div', undefined, 'nt-gelisim');
      kutu.append(el('h3', 'Ortalama puan', 'mini-baslik'),
        sutunGrafik([...o.sinavlar].reverse().map(s => ({ etiket: s.ad.replace(/ Sınavı$/, ''), deger: Math.round(s.ortalama), renk: puanRenk(s.ortalama) })), 90));
      liste.appendChild(kutu);
    }
    o.sinavlar.forEach((s, i) => liste.appendChild(sinavKarti(s, i === 0)));
  }
})();
