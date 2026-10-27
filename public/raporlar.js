const $ = id => document.getElementById(id);

function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

function sayac(sayi, ad, kirmizi) {
  const k = el('div', undefined, 'og-sayac' + (kirmizi ? ' kirmizi' : ''));
  k.append(el('strong', String(sayi)), el('span', ad));
  return k;
}

// Yatay çubuklar: [{ad, deger, yazi}], en büyük değere göre ölçeklenir (en az bir piksel görünsün diye alt sınır)
function cubuklar(baslik, satirlar, bos, tavan) {
  const bolum = el('div');
  bolum.append(el('h3', baslik, 'og-baslik'));
  if (!satirlar.length) return bolum.append(el('p', bos, 'alt')), bolum;
  const en = tavan || Math.max(1, ...satirlar.map(s => s.deger));
  const kap = el('div', undefined, 'yatay rapor-cubuk');
  for (const s of satirlar) {
    const satir = el('div', undefined, 'yatay-satir');
    const cubuk = el('span', undefined, 'yatay-cubuk');
    cubuk.style.setProperty('--w', Math.max(s.deger / en * 100, s.deger ? 3 : 0) + '%');
    cubuk.append(el('i'));
    satir.append(el('span', s.ad, 'yatay-ad'), cubuk, el('b', s.yazi ?? String(s.deger)));
    kap.append(satir);
  }
  bolum.append(kap);
  return bolum;
}

function ciz(v) {
  const icerik = $('icerik');
  icerik.replaceChildren();

  const sec = el('select'); sec.id = 'okul'; sec.setAttribute('aria-label', 'Okul');
  sec.append(Object.assign(el('option', 'Tüm okullar'), { value: '' }));
  for (const o of v.okullar) sec.append(Object.assign(el('option', o.ad), { value: o.id }));
  sec.value = v.okul ?? '';
  sec.addEventListener('change', () => yukle(sec.value));
  icerik.append(sec);

  const bir = el('div', undefined, 'og-sayilar'); bir.style.marginTop = '12px';
  bir.append(sayac(v.ozet.ogrenci, 'Öğrenci'), sayac(v.ozet.ogretmen, 'Öğretmen'), sayac(v.ozet.sinif, 'Sınıf'));
  const iki = el('div', undefined, 'og-sayilar'); iki.style.marginTop = '8px';
  iki.append(sayac('%' + v.devam.yuzde, 'Devam', v.devam.yuzde < 90), sayac('%' + v.odev.yuzde, 'Ödev tamamlama', v.odev.yuzde < 60), sayac(v.eksikDersler.toplam, 'Eksik ders', v.eksikDersler.oran > 20));
  icerik.append(bir, iki);

  icerik.append(
    cubuklar('Devamsızlığı en yüksek sınıflar', v.devam.siniflar.map(s => ({ ad: s.ad, deger: s.oran, yazi: `%${s.oran}` })), 'Henüz yoklama yok.'),
    cubuklar('En çok devamsızlık yapan öğrenciler', v.devamsizlar.map(s => ({ ad: `${s.ad} · ${s.sinif}`, deger: s.gelmedi, yazi: `${s.gelmedi} ders` })), 'Devamsızlık kaydı yok.'),
    cubuklar('Dersi tamamlamayan öğretmenler (son 14 gün)', v.eksikDersler.ogretmenler.map(s => ({ ad: s.ad, deger: s.sayi, yazi: `${s.sayi} ders` })), 'Eksik ders yok.'),
    cubuklar('Ödev tamamlaması en düşük sınıflar', v.odev.siniflar.map(s => ({ ad: s.ad, deger: s.oran, yazi: `%${s.oran}` })), 'Ödev yok.', 100),
    cubuklar('Kulüp doluluğu', v.kulupler.map(k => ({ ad: v.okul ? k.ad : `${k.ad} · ${k.okul}`, deger: k.uye, yazi: `${k.uye}/${k.kontenjan}` })), 'Kulüp yok.', Math.max(...v.kulupler.map(k => k.kontenjan), 1)),
  );
}

async function yukle(okul = '') {
  const r = await fetch('/api/rapor/ozet' + (okul ? '?okul=' + encodeURIComponent(okul) : ''));
  if (r.status === 401) { location.href = '/'; return; }
  if (!r.ok) { location.href = '/panel'; return; }
  ciz(await r.json());
}
yukle();
