const $ = id => document.getElementById(id);
let secenekler = { siniflar: [], dersler: [] };
let acik = null;          // açık sınavın detayı
let ben = { yon: false }; // yönetim hesabı mı
let mod = 'incele';       // incele | duzen
let sekme = 'sonuc';
let yeniTur = 'test';
let yaziKaz = null;       // yazılı sınav formundaki kazanım seçici

function mesaj(metin, tur = '') {
  $('mesaj').textContent = metin;
  $('mesaj').className = 'mesaj ' + tur;
}

async function api(yol, govde) {
  const r = await fetch(yol, govde === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(govde),
  });
  if (r.status === 401) { location.href = '/'; throw new Error('oturum'); }
  if (r.status === 403) { location.href = '/panel'; throw new Error('yetki'); }
  const veri = await r.json().catch(() => ({}));
  return { ok: r.ok, veri };
}

function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

// Ekranda yalnız biri görünür: liste, yeni sınav ya da sınav (sonuçlar / düzenleme)
function gorunum(ad) {
  $('liste-bolum').classList.toggle('gizli', ad !== 'liste');
  $('yeni-bolum').classList.toggle('gizli', ad !== 'yeni');
  $('detay-bolum').classList.toggle('gizli', ad !== 'detay');
  document.body.classList.remove('karne-acik');
  mesaj('');
  window.scrollTo({ top: 0 });
}

const tarihYaz = t => t.split('-').reverse().join('.');
const KAT_YAZI = k => (k ? `${k} yanlış 1 doğruyu götürür` : 'yanlış götürmez');
const yazili = () => acik.sinav.tur === 'yazili';

// ---------- Liste ----------
async function listeYukle() {
  const r = await api('/api/sinav/liste');
  const kutu = $('liste');
  kutu.replaceChildren();
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  ben.yon = !!r.veri.yonetim;
  $('yeni-ac').classList.toggle('gizli', ben.yon);
  if (!r.veri.sinavlar.length) kutu.append(el('p', ben.yon ? 'Henüz sınav yok.' : 'Henüz sınav yok. Sağ üstteki "Yeni sınav" ile başlayın.', 'bos-not'));
  for (const s of r.veri.sinavlar) {
    const kart = el('button', '', 'sinav-kart');
    kart.type = 'button';
    const rozetler = el('span', undefined, 'sl-rozetler');
    const rozet = (yazi, tur = '') => rozetler.append(el('span', yazi, 'sl-rozet ' + tur));
    rozet(s.tur === 'yazili' ? 'Yazılı' : 'Test', 'tur');
    if (s.sahip) {
      rozet(s.yayin ? 'Yayında' : 'Yayınlanmadı', s.yayin ? 'acik' : '');
      rozet(s.tur === 'yazili' ? `${s.okunan} puan girildi` : `${s.okunan} öğrenci cevabı`);
    } else rozet(`Paylaşılan · ${s.sahipAd}`);
    if (s.tur === 'yazili') { if (s.kazanimli) rozet(`${s.kazanimli} kazanım`); } else rozet(`Kazanım ${s.kazanimli}/${s.soru}`, s.kazanimli === s.soru ? 'tam' : 'eksik');
    kart.append(
      el('strong', s.ad),
      el('span', `${tarihYaz(s.tarih)} · ${s.siniflar.join(', ')} · ${s.dersler.join(', ')}${ben.yon ? ' · ' + s.sahipAd : ''}`, 'alt'),
      rozetler,
    );
    kart.addEventListener('click', () => detayAc(s.id));
    kutu.append(kart);
  }
}

// ---------- Kazanım seçici (yazılı sınavın bütünü için; soru eşlemesi yok) ----------
let kazProgramDersleri = null;
function kazanimSecici(ilk, dersAl, sinifAl) {
  const kok = el('div', undefined, 'kzs');
  const liste = [...ilk];
  const cipler = el('div', undefined, 'kzs-liste');
  const satir = el('div', undefined, 'kzs-giris');
  const giris = el('input'); giris.placeholder = 'Kazanım ara ya da yaz…'; giris.maxLength = 300; giris.autocomplete = 'off'; giris.spellcheck = false;
  giris.setAttribute('aria-label', 'Kazanım ara');
  const ekleDugme = el('button', 'Ekle', 'ikincil'); ekleDugme.type = 'button';
  satir.append(giris, ekleDugme);
  const sonuc = el('div', undefined, 'kazanim-liste gizli');
  const ciz = () => {
    cipler.replaceChildren(...liste.map((k, i) => {
      const c = el('div', undefined, 'kzs-oge');
      const sil = el('button', '×', 'kzs-sil'); sil.type = 'button'; sil.setAttribute('aria-label', 'Kaldır');
      sil.addEventListener('click', () => { liste.splice(i, 1); ciz(); });
      c.append(el('span', k), sil);
      return c;
    }));
    cipler.classList.toggle('gizli', !liste.length);
  };
  const ekle = m => {
    const t = String(m).replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!t || liste.includes(t) || liste.length >= 30) return;
    liste.push(t); giris.value = ''; sonuc.classList.add('gizli'); ciz();
  };
  let zaman = null, sayac = 0;
  const ara = async () => {
    const q = giris.value.trim();
    const ders = dersAl();
    if (!ders && q.length < 2) return sonuc.classList.add('gizli');
    const benim = ++sayac;
    const p = new URLSearchParams({ q, sinif: sinifAl() });
    if (ders) p.set('ders', ders);
    const k = await api('/api/kazanim?' + p);
    if (benim !== sayac) return;
    sonuc.replaceChildren();
    if (!k.ok) return sonuc.classList.add('gizli');
    for (const x of k.veri.kazanimlar) {
      const b = el('button', '', 'kazanim-oge'); b.type = 'button';
      b.append(el('strong', x.kod || 'Kod yok'), document.createTextNode(' ' + x.metin));
      b.addEventListener('click', () => ekle((x.kod ? x.kod + ' – ' : '') + x.metin));
      sonuc.append(b);
    }
    if (!k.veri.kazanimlar.length) sonuc.append(el('p', 'Sonuç yok. Kazanımı elle yazıp "Ekle"ye basabilirsiniz.', 'alt'));
    sonuc.classList.remove('gizli');
  };
  giris.addEventListener('input', () => { clearTimeout(zaman); zaman = setTimeout(ara, 250); });
  giris.addEventListener('focus', ara);
  giris.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ekle(giris.value); } });
  ekleDugme.addEventListener('click', () => ekle(giris.value));
  kok.append(cipler, satir, sonuc);
  kok.degerler = () => [...liste];
  kok.yenile = ara;
  ciz();
  return kok;
}
async function programDersleri() {
  if (!kazProgramDersleri) {
    const p = await api('/api/kazanim?dersler=1');
    kazProgramDersleri = p.ok ? p.veri.dersler : [];
  }
  return kazProgramDersleri;
}
const sinifDuzeyi = adlar => {
  const seviye = new Set(adlar.map(n => parseInt(n, 10)).filter(Boolean));
  return seviye.size === 1 ? String([...seviye][0]) : '';
};

// ---------- Yeni sınav ----------
function dersSatiri(ders = '', n = '', anahtar = '') {
  const s = el('div', '', 'sinav-ders');
  const sel = el('select');
  sel.setAttribute('aria-label', 'Ders');
  for (const d of secenekler.dersler) { const o = el('option', d); o.value = d; sel.append(o); }
  if (ders) sel.value = ders;
  const sayi = el('input'); sayi.type = 'number'; sayi.min = 1; sayi.max = 200; sayi.value = n; sayi.placeholder = 'Soru sayısı';
  sayi.setAttribute('aria-label', 'Soru sayısı');
  const ank = el('input', undefined, 'cevap-giris'); ank.placeholder = 'Cevap anahtarı: ABCDABCD...'; ank.value = anahtar; ank.autocomplete = 'off';
  ank.setAttribute('aria-label', 'Cevap anahtarı');
  const sayac = el('span', '', 'alt');
  const guncelle = () => { sayac.textContent = `${ank.value.replace(/\s/g, '').length} harf`; };
  ank.addEventListener('input', guncelle); guncelle();
  const sil = el('button', 'Kaldır', 'ikincil'); sil.type = 'button';
  sil.addEventListener('click', () => s.remove());
  s.append(sel, sayi, ank, sayac, sil);
  return s;
}

function turSec(tur) {
  yeniTur = tur;
  for (const b of $('s-tur').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.tur === tur));
  $('blok-test').classList.toggle('gizli', tur !== 'test');
  $('blok-yazili').classList.toggle('gizli', tur !== 'yazili');
  $('s-kat-kutu').classList.toggle('gizli', tur !== 'test');
}

async function yeniAc() {
  const r = await api('/api/sinav/secenekler');
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  secenekler = r.veri;
  if (!secenekler.siniflar.length) return mesaj('Size atanmış sınıf/ders yok.', 'hata');
  gorunum('yeni');
  $('s-ad').value = '';
  $('s-tarih').value = new Date().toLocaleDateString('sv-SE');
  $('s-kat').value = '0';
  const kutu = $('s-siniflar');
  kutu.replaceChildren();
  for (const c of secenekler.siniflar) {
    const l = el('label', '', 'onay');
    const cb = el('input'); cb.type = 'checkbox'; cb.value = c.id;
    l.append(cb, document.createTextNode(c.name));
    kutu.append(l);
  }
  $('s-dersler').replaceChildren(dersSatiri());
  const yd = $('y-ders');
  yd.replaceChildren();
  for (const d of secenekler.dersler) { const o = el('option', d); o.value = d; yd.append(o); }
  const prog = await programDersleri();
  const seciliSinifAdlari = () => [...kutu.querySelectorAll('input:checked')].map(i => secenekler.siniflar.find(c => c.id === Number(i.value))?.name || '');
  yaziKaz = kazanimSecici([], () => (prog.includes(yd.value) ? yd.value : ''), () => sinifDuzeyi(seciliSinifAdlari()));
  $('y-kaz').replaceChildren(yaziKaz);
  yd.onchange = () => yaziKaz.yenile();
  turSec('test');
}

function dersleriTopla(kutu) {
  return [...kutu.querySelectorAll('.sinav-ders')].map(s => {
    const [sel, sayi, ank] = s.querySelectorAll('select, input');
    return { ders: sel.value, soruSayisi: Number(sayi.value), anahtar: ank.value };
  });
}

async function olustur() {
  const govde = {
    ad: $('s-ad').value, tarih: $('s-tarih').value, tur: yeniTur,
    sinifIds: [...$('s-siniflar').querySelectorAll('input:checked')].map(i => Number(i.value)),
  };
  if (yeniTur === 'yazili') Object.assign(govde, { yanlisKat: 0, ders: $('y-ders').value, kazanimlar: yaziKaz.degerler() });
  else Object.assign(govde, { yanlisKat: Number($('s-kat').value), dersler: dersleriTopla($('s-dersler')) });
  const r = await api('/api/sinav/olustur', govde);
  if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
  listeYukle();
  if (yeniTur === 'yazili') {
    await detayAc(r.veri.id, 'puan');
    mesaj('Yazılı sınav oluşturuldu. Şimdi öğrencilerin puanlarını girebilirsiniz.', 'tamam');
  } else {
    await detayAc(r.veri.id);
    mesaj('Sınav oluşturuldu. Öğrenci cevaplarını okul yönetimi girecek; girildikçe sonuçlar burada görünür.', 'tamam');
  }
}

// ---------- Sınav: sekmeler ----------
// [ad, kip, etiket]. İnceleme kipinde yalnız okunur; düzenleme ayrı kiptedir.
function sekmeListesi() {
  const d = acik, yaz = yazili(), l = [];
  l.push(['sonuc', 'incele', 'Özet'], ['ogr', 'incele', 'Öğrenciler']);
  if (!yaz && (d.sahip || d.dersler.length)) l.push(['analiz', 'incele', 'Madde analizi']);
  if (d.sahip && !yaz) l.push(['cevap', 'duzen', 'Cevaplar']);
  if (d.sahip && yaz && !d.yonetim) l.push(['puan', 'duzen', 'Puanlar']);
  if (!d.yonetim && !(yaz && !d.sahip) && (d.sahip || d.dersler.length)) l.push(['kazanim', 'duzen', 'Kazanımlar']);
  if (d.sahip && !(yaz && d.yonetim)) l.push(['anahtar', 'duzen', d.yonetim ? 'Anahtar ve iptal' : yaz ? 'Yayın' : 'Anahtar ve yayın']);
  return l;
}

function sekmeCiz() {
  const l = sekmeListesi();
  const varDuzen = l.some(x => x[1] === 'duzen');
  $('d-mod').classList.toggle('gizli', !varDuzen);
  for (const b of $('d-mod').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.mod === mod));
  const kap = $('d-sekmeler');
  kap.replaceChildren();
  for (const [ad, kip, etiket] of l) {
    if (kip !== mod) continue;
    const b = el('button', etiket); b.type = 'button'; b.dataset.sekme = ad;
    b.setAttribute('aria-pressed', String(ad === sekme));
    kap.append(b);
  }
  kap.classList.toggle('gizli', kap.children.length < 2);
}

async function detayAc(id, ilkSekme = 'sonuc') {
  const r = await api('/api/sinav/detay?id=' + id);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  acik = r.veri;
  ben.yon = !!acik.yonetim;
  gorunum('detay');
  $('d-baslik').textContent = acik.sinav.ad;
  $('d-alt').textContent = `${tarihYaz(acik.sinav.tarih)} · ${acik.siniflar.map(c => c.name).join(', ')} · ${acik.dersler.map(x => x.ders).join(', ')} · ${yazili() ? 'Yazılı' : 'Test'}`;
  sekmeSec(sekmeListesi().some(x => x[0] === ilkSekme) ? ilkSekme : 'sonuc');
}

function sekmeSec(ad) {
  sekme = ad;
  mod = (sekmeListesi().find(x => x[0] === ad) || ['', 'incele'])[1];
  document.body.classList.remove('karne-acik');
  sekmeCiz();
  mesaj('');
  ({ sonuc: sonucCiz, ogr: ogrCiz, analiz: analizCiz, cevap: cevapCiz, puan: puanCiz, kazanim: kazanimYonlendir, anahtar: anahtarCiz })[ad]();
}

function modSec(m) {
  const ilk = sekmeListesi().find(x => x[1] === m);
  if (ilk) sekmeSec(ilk[0]);
}

const kazanimYonlendir = () => (yazili() ? yaziKazanimCiz() : kazanimCiz());

// ---------- Optik okuyucu dosyası ----------
// CSV: okul_no;ders1 cevapları;ders2 cevapları... (tek cevap sütunu da olur) · Sabit genişlik: ilk N karakter okul no, sonrası cevaplar
const noSade = s => String(s).trim().replace(/^0+(?=\d)/, '');
function dersBol(metin, dersler) {
  let konum = 0;
  return dersler.map(x => { const p = metin.slice(konum, konum + x.soruSayisi); konum += x.soruSayisi; return p; });
}
function optikCoz(metin, bicim, noUzunluk, dersler) {
  const toplam = dersler.reduce((t, d) => t + d.soruSayisi, 0);
  const satirlar = metin.replace(/^﻿/, '').split(/\r?\n/).filter(s => s.trim());
  const kayitlar = [];
  satirlar.forEach((satir, i) => {
    let no, cevap;
    if (bicim === 'csv') {
      const ayrac = [';', '\t', ','].find(a => satir.includes(a)) || ';';
      const h = satir.split(ayrac).map(x => x.trim().replace(/^"|"$/g, ''));
      if (i === 0 && !/^\d+$/.test(h[0])) return; // başlık satırı
      no = h[0];
      const c = h.slice(1);
      cevap = c.length === dersler.length ? c : dersBol(c.join(''), dersler);
    } else {
      no = satir.slice(0, noUzunluk);
      cevap = dersBol(satir.slice(noUzunluk).replace(/\s+$/, ''), dersler);
    }
    const uzunluk = cevap.reduce((t, c) => t + c.length, 0);
    kayitlar.push({ satir: i + 1, no: noSade(no), cevap, uyari: uzunluk !== toplam ? `${uzunluk} cevap var, ${toplam} bekleniyordu` : '' });
  });
  return kayitlar;
}
function dosyaIndir(ad, icerik, tur = 'text/plain') {
  const a = el('a'); a.href = URL.createObjectURL(new Blob([icerik], { type: tur + ';charset=utf-8' })); a.download = ad;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function optikSablon(bicim, noUzunluk, d) {
  const ogr = d.ogrenciler.slice(0, 3);
  const ornek = x => 'ABCDE'.repeat(Math.ceil(x.soruSayisi / 5)).slice(0, x.soruSayisi);
  if (bicim === 'csv') {
    const bas = ['okul_no', ...d.dersler.map(x => x.ders)].join(';');
    return [bas, ...ogr.map(g => [g.okulNo, ...d.dersler.map(ornek)].join(';'))].join('\r\n') + '\r\n';
  }
  return ogr.map(g => String(g.okulNo).padEnd(noUzunluk, ' ') + d.dersler.map(ornek).join('')).join('\r\n') + '\r\n';
}
function optikKutusu(d, girisler) {
  const kutu = el('details', '', 'toplu');
  kutu.append(el('summary', 'Dosyadan yükle (optik okuyucu çıktısı)'));
  kutu.append(el('p', 'Okuyucu yazılımını aşağıdaki biçimlerden birini verecek şekilde ayarlayın. Her satır bir öğrencidir; öğrenci okul numarasıyla eşleştirilir. Boş soru "-", "*" veya boşluk olabilir. Dosya yüklenince cevaplar tabloya yazılır; kontrol edip "Cevapları kaydet"e basın.', 'alt'));
  const bicim = el('select'); bicim.setAttribute('aria-label', 'Dosya biçimi');
  for (const [v, ad] of [['csv', 'CSV: okul_no;ders1;ders2… (noktalı virgül, virgül veya sekme)'], ['sabit', 'Sabit genişlikli metin: ilk N karakter okul no, sonra cevaplar']]) { const o = el('option', ad); o.value = v; bicim.append(o); }
  const uzunluk = el('input'); uzunluk.type = 'number'; uzunluk.min = 1; uzunluk.max = 20; uzunluk.value = 10; uzunluk.setAttribute('aria-label', 'Okul no karakter sayısı');
  const uzEtiket = el('label', 'Okul no karakter sayısı (sabit genişlik)');
  const guncelle = () => { uzEtiket.classList.toggle('gizli', bicim.value !== 'sabit'); uzunluk.classList.toggle('gizli', bicim.value !== 'sabit'); };
  bicim.addEventListener('change', guncelle); guncelle();
  const dosya = el('input'); dosya.type = 'file'; dosya.accept = '.csv,.txt,.dat,.tsv'; dosya.setAttribute('aria-label', 'Optik dosyası');
  const sablon = el('button', 'Örnek şablon indir', 'ikincil'); sablon.type = 'button';
  sablon.addEventListener('click', () => dosyaIndir(bicim.value === 'csv' ? 'optik-sablon.csv' : 'optik-sablon.txt', optikSablon(bicim.value, Number(uzunluk.value) || 10, d)));
  const rapor = el('div');
  dosya.addEventListener('change', async () => {
    rapor.replaceChildren();
    const f = dosya.files[0];
    if (!f) return;
    if (f.size > 5_000_000) return mesaj('Dosya çok büyük (en çok 5 MB).', 'hata');
    const kayitlar = optikCoz(await f.text(), bicim.value, Number(uzunluk.value) || 10, d.dersler);
    const harita = new Map(girisler.map(satir => [noSade(satir[0][0].okulNo || ''), satir]));
    let uygulanan = 0;
    const sorunlar = [];
    for (const k of kayitlar) {
      const satir = harita.get(k.no);
      if (!satir) { sorunlar.push(`Satır ${k.satir}: "${k.no}" numaralı öğrenci bu sınavın sınıflarında yok`); continue; }
      satir.forEach(([, , gi], j) => { gi.value = k.cevap[j] || ''; gi.dispatchEvent(new Event('input')); });
      uygulanan++;
      if (k.uyari) sorunlar.push(`Satır ${k.satir} (${satir[0][0].ad}): ${k.uyari}`);
    }
    const okunan = new Set(kayitlar.map(k => k.no));
    const girmeyen = [...harita].filter(([no]) => !okunan.has(no)).length;
    rapor.append(el('p', `${uygulanan} öğrencinin cevabı yazıldı; dosyada olmayan öğrenci: ${girmeyen}. Kaydetmeyi unutmayın.`, uygulanan ? 'mesaj tamam' : 'mesaj hata'));
    if (sorunlar.length) {
      const ul = el('ul');
      for (const s of sorunlar.slice(0, 30)) ul.append(el('li', s));
      if (sorunlar.length > 30) ul.append(el('li', `… ve ${sorunlar.length - 30} uyarı daha`));
      rapor.append(el('p', `${sorunlar.length} uyarı:`, 'alt'), ul);
    }
  });
  kutu.append(el('label', 'Dosya biçimi'), bicim, uzEtiket, uzunluk, el('label', 'Dosya'), dosya, sablon, rapor);
  return kutu;
}

// ---------- Cevaplar (test): öğretmen yalnız görür, yönetim ayrıca düzenler ----------
// Her soru bir hücre: numara, öğrencinin işareti (doğru yeşil, yanlış kırmızı + doğru şık, boş gri)
function cevapSay(x, c) {
  let dogru = 0, yanlis = 0, bos = 0;
  for (let i = 0; i < x.soruSayisi; i++) {
    if (x.iptal.includes(i + 1) || (c && c[i] === x.anahtar[i])) dogru++;
    else if (!c || c[i] === '-' || !c[i]) bos++;
    else yanlis++;
  }
  return { dogru, yanlis, bos };
}
function cevapIzgara(x, c) {
  const kap = el('div', undefined, 'cv-izgara');
  for (let i = 0; i < x.soruSayisi; i++) {
    const h = c && c[i] ? c[i] : '-';
    const iptal = x.iptal.includes(i + 1);
    const cls = iptal ? 'i' : h === '-' ? 'b' : h === x.anahtar[i] ? 'd' : 'y';
    const hucre = el('span', undefined, 'cv-h ' + cls);
    hucre.title = `Soru ${i + 1}: ${h === '-' ? 'boş' : h}${cls === 'y' ? ` (doğru ${x.anahtar[i]})` : cls === 'i' ? ' (iptal, doğru sayıldı)' : ''}`;
    hucre.append(el('small', String(i + 1)), el('b', h === '-' ? '·' : h));
    if (cls === 'y') hucre.append(el('em', x.anahtar[i]));
    kap.append(hucre);
  }
  return kap;
}

function cevapCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const d = acik;
  if (ben.yon && d.duzenleniyor) return cevapDuzenle();
  const ust = el('div', undefined, 'cv-ust');
  ust.append(el('p', ben.yon
    ? 'Öğrencilerin işaretlediği cevaplar. Hata varsa "Cevapları düzenle" ile düzeltin; değişiklikler kaydetmeden önce onay ister.'
    : 'Öğrencilerin işaretlediği cevapları kontrol edebilirsiniz. Yeşil doğru, kırmızı yanlış (altında doğru şık), gri boş. Cevapları yalnızca okul yönetimi girer ve değiştirir; hata görürseniz yönetime bildirin.', 'alt'));
  if (ben.yon) {
    const duz = el('button', 'Cevapları düzenle', 'ikincil kucuk'); duz.type = 'button';
    duz.addEventListener('click', () => { d.duzenleniyor = true; cevapCiz(); });
    ust.append(duz);
  }
  kutu.append(ust);
  const liste = el('div', undefined, 'sc-liste');
  for (const g of d.ogrenciler) {
    const kart = el('details', undefined, 'sc-kart');
    const ozet = el('summary');
    const ad = el('div', undefined, 'sc-ad');
    ad.append(el('strong', g.ad), el('small', `${g.okulNo ? 'No ' + g.okulNo + ' · ' : ''}${g.sinif}`));
    const dolu = d.dersler.filter(x => g.cevaplar[x.id]).length;
    ozet.append(ad, el('span', dolu ? `${dolu}/${d.dersler.length} ders` : 'Girilmedi', 'sc-durum' + (dolu === d.dersler.length ? ' tam' : dolu ? ' kismen' : '')));
    kart.append(ozet);
    for (const x of d.dersler) {
      const c = g.cevaplar[x.id];
      const satir = el('div', undefined, 'cv-ders');
      const bas = el('div', undefined, 'cv-ders-ust');
      bas.append(el('strong', x.ders));
      if (c) { const s = cevapSay(x, c); bas.append(el('span', `${s.dogru} doğru · ${s.yanlis} yanlış · ${s.bos} boş`, 'mad-ince')); }
      satir.append(bas, c ? cevapIzgara(x, c) : el('p', 'Cevap girilmemiş', 'mad-ince'));
      kart.append(satir);
    }
    liste.append(kart);
  }
  if (!d.ogrenciler.length) kutu.append(el('p', 'Seçilen sınıflarda aktif öğrenci yok.', 'alt'));
  kutu.append(liste);
}

// Yönetim: değişiklik yalnız değişen kayıtlar için ve onayla gönderilir
function cevapDuzenle() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const d = acik;
  kutu.append(el('p', `Her öğrenci için A-E harflerini yazın, boş soru için "-" kullanın. ${KAT_YAZI(d.sinav.yanlisKat)}. Yalnızca değiştirdiğiniz kayıtlar kaydedilir.`, 'alt'));

  const topluKutu = el('details', '', 'toplu');
  topluKutu.append(el('summary', 'Toplu yapıştır (optik okuyucu çıktısı)'));
  topluKutu.append(el('p', `Her satır bir öğrenci, aşağıdaki sıradadır. Satırdaki cevaplar ${d.dersler.map(x => `${x.ders} (${x.soruSayisi})`).join(' + ')} sırasıyla arka arkaya yazılır; boş soru "-" olur.`, 'alt'));
  const ta = el('textarea'); ta.rows = 6; ta.setAttribute('aria-label', 'Toplu cevaplar');
  const uygula = el('button', 'Satırları uygula', 'ikincil'); uygula.type = 'button';
  topluKutu.append(ta, uygula);

  const liste = el('div', undefined, 'sc-liste');
  const girisler = [];
  const hicGirilmedi = d.ogrenciler.every(g => !Object.values(g.cevaplar).some(Boolean));
  for (const g of d.ogrenciler) {
    const kart = el('details', undefined, 'sc-kart');
    kart.open = hicGirilmedi;
    const ozet = el('summary');
    const ad = el('div', undefined, 'sc-ad');
    ad.append(el('strong', g.ad), el('small', `${g.okulNo ? 'No ' + g.okulNo + ' · ' : ''}${g.sinif}`));
    const durum = el('span', undefined, 'sc-durum');
    ozet.append(ad, durum);
    kart.append(ozet);
    const satir = [];
    const durumYaz = () => {
      const dolu = satir.filter(([, , gi]) => gi.value.trim()).length;
      durum.textContent = `${dolu}/${d.dersler.length}`;
      durum.className = 'sc-durum' + (dolu === d.dersler.length ? ' tam' : dolu ? ' kismen' : '');
    };
    for (const x of d.dersler) {
      const et = el('label', undefined, 'sc-giris');
      const say = el('em');
      const gi = el('input', undefined, 'cevap-giris'); gi.value = g.cevaplar[x.id] || '';
      gi.maxLength = x.soruSayisi; gi.autocomplete = 'off'; gi.spellcheck = false;
      gi.setAttribute('aria-label', `${g.ad} ${x.ders}`);
      satir.push([g, x, gi]);
      const sayYaz = () => {
        const n = gi.value.length;
        say.textContent = `${n}/${x.soruSayisi}`;
        say.className = n === 0 ? '' : n === x.soruSayisi ? 'tam' : 'eksik';
        durumYaz();
      };
      gi.addEventListener('input', sayYaz);
      sayYaz();
      et.append(el('span', x.ders), say, gi);
      kart.append(et);
    }
    girisler.push(satir);
    liste.append(kart);
  }
  kutu.append(optikKutusu(d, girisler), topluKutu, liste);
  if (!d.ogrenciler.length) kutu.append(el('p', 'Seçilen sınıflarda aktif öğrenci yok.', 'alt'));

  uygula.addEventListener('click', () => {
    const satirlar = ta.value.split('\n').map(s => s.replace(/\s/g, '')).filter(Boolean);
    if (satirlar.length > girisler.length) return mesaj(`Satır sayısı (${satirlar.length}) öğrenci sayısından (${girisler.length}) fazla.`, 'hata');
    satirlar.forEach((s, i) => {
      let konum = 0;
      for (const [, x, gi] of girisler[i]) { gi.value = s.slice(konum, konum + x.soruSayisi); gi.dispatchEvent(new Event('input')); konum += x.soruSayisi; }
    });
    mesaj(`${satirlar.length} satır uygulandı. Kaydetmeyi unutmayın.`, 'tamam');
  });

  const cubuk = el('div', undefined, 'kaydet-cubuk');
  const kaydet = el('button', 'Cevapları kaydet', 'birincil'); kaydet.type = 'button';
  const vazgec = el('button', 'Vazgeç', 'ikincil'); vazgec.type = 'button';
  vazgec.addEventListener('click', () => { d.duzenleniyor = false; cevapCiz(); });
  kaydet.addEventListener('click', async () => {
    const kayitlar = girisler.flat()
      .filter(([g, x, gi]) => gi.value.trim() !== (g.cevaplar[x.id] || '').trim())
      .map(([g, x, gi]) => ({ ogrenciId: g.ogrenciId, dersId: x.id, cevaplar: gi.value }));
    if (!kayitlar.length) return mesaj('Değişiklik yok.', 'hata');
    const ogr = new Set(kayitlar.map(k => k.ogrenciId)).size;
    if (!confirm(`${ogr} öğrencinin cevabı değiştirilecek ve tüm sonuçlar yeniden hesaplanacak. Onaylıyor musunuz?`)) return;
    const r = await api('/api/sinav/cevaplar', { id: d.sinav.id, kayitlar });
    if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
    await detayAc(d.sinav.id, 'cevap');
    mesaj(`${ogr} öğrencinin cevapları kaydedildi.`, 'tamam');
  });
  cubuk.append(kaydet, vazgec);
  kutu.append(cubuk);
}

// ---------- Puanlar (yazılı): öğrenci başına tek puan ----------
function puanCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const d = acik;
  kutu.append(el('p', 'Her öğrencinin aldığı puanı (0-100) yazın. Sınava girmeyen öğrencinin kutusunu boş bırakın.', 'alt'));
  const liste = el('div', undefined, 'pz-liste');
  const girisler = [];
  const sayac = el('span', undefined, 'mad-ince');
  const say = () => { sayac.textContent = `${girisler.filter(([, gi]) => gi.value.trim()).length}/${girisler.length} öğrenci için puan girildi`; };
  for (const g of d.ogrenciler) {
    const satir = el('label', undefined, 'pz-satir');
    const kim = el('span', undefined, 'sc-ad');
    kim.append(el('strong', g.ad), el('small', `${g.okulNo ? 'No ' + g.okulNo + ' · ' : ''}${g.sinif}`));
    const gi = el('input'); gi.type = 'text'; gi.inputMode = 'decimal'; gi.maxLength = 5; gi.autocomplete = 'off'; gi.placeholder = '–';
    gi.value = g.puan === null ? '' : String(g.puan).replace('.', ',');
    gi.setAttribute('aria-label', `${g.ad} puanı`);
    gi.addEventListener('input', () => {
      gi.value = gi.value.replace(/[^0-9.,]/g, '');
      const p = Number(gi.value.replace(',', '.'));
      gi.classList.toggle('hatali', gi.value !== '' && (!Number.isFinite(p) || p < 0 || p > 100));
      say();
    });
    girisler.push([g, gi]);
    satir.append(kim, gi);
    liste.append(satir);
  }
  say();
  kutu.append(sayac, liste);
  if (!d.ogrenciler.length) kutu.append(el('p', 'Seçilen sınıflarda aktif öğrenci yok.', 'alt'));
  const cubuk = el('div', undefined, 'kaydet-cubuk');
  const kaydet = el('button', 'Puanları kaydet', 'birincil'); kaydet.type = 'button';
  kaydet.addEventListener('click', async () => {
    if (girisler.some(([, gi]) => gi.classList.contains('hatali'))) return mesaj('Puanlar 0 ile 100 arasında olmalı.', 'hata');
    const kayitlar = girisler.map(([g, gi]) => ({ ogrenciId: g.ogrenciId, puan: gi.value }));
    const r = await api('/api/sinav/puanlar', { id: d.sinav.id, kayitlar });
    if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
    await detayAc(d.sinav.id, 'puan');
    mesaj('Puanlar kaydedildi.', 'tamam');
  });
  cubuk.append(kaydet);
  kutu.append(cubuk);
}

// ---------- Sonuçlar ----------
const bandRenk = p => (p < 40 ? '#d64545' : p < 70 ? '#e0a100' : '#2e9e5b');
const ortalamaAl = a => (a.length ? a.reduce((t, x) => t + x, 0) / a.length : null);
const ARALIKLAR = ['0-20', '20-40', '40-60', '60-80', '80-100'];
const ARALIK_RENK = ['#d64545', '#e0803a', '#e0a100', '#7bb661', '#2e9e5b'];

const sonucAl = kazanim => api('/api/sinav/sonuc?id=' + acik.sinav.id + (kazanim ? '&kazanim=1' : ''));

function yayinDurumu() {
  const yd = el('div', undefined, 'ak-yayin' + (acik.sinav.yayin ? ' acik' : ''));
  yd.append(el('span', undefined, 'ak-nokta'), el('span', acik.sinav.yayin ? 'Sonuçlar öğrenci ve velilere yayında.' : 'Sonuçlar henüz yayınlanmadı; öğrenci ve veli görmez.'));
  return yd;
}

// Özet: sınıf ortalaması, puan dağılımı, ders ortalamaları
async function sonucCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const r = await sonucAl();
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  const v = r.veri;
  const girenler = v.ogrenciler.filter(g => g.ortalama !== null);
  const puanlar = girenler.map(g => g.ortalama);
  const genelOrt = v.genel ? v.genel.ortalama : ortalamaAl(puanlar);
  const katilim = v.genel ? v.genel : { giren: v.giren, beklenen: v.beklenen };

  if (acik.sahip) kutu.append(yayinDurumu());
  if (v.kisitli) {
    kutu.append(el('p', girenler.length || v.dersler.length
      ? `Genel bilgi tüm dersleri kapsar; öğrenci ve soru ayrıntısı yalnızca ${v.dersler.map(d => d.ders).join(', ')} dersi için gösterilir.`
      : 'Bu sınavda dersiniz yok; yalnızca genel bilgi görünür.', 'kl-not'));
  }

  const ozet = el('section', undefined, 'sr-ozet');
  const ust = el('div', undefined, 'sr-ust');
  const sol = el('div');
  sol.append(el('small', v.kisitli ? 'Sınıf genel ortalaması' : 'Sınıf ortalaması'), el('strong', genelOrt === null ? '–' : genelOrt.toFixed(1), 'sr-buyuk'));
  ust.append(sol, el('span', `${katilim.giren}/${katilim.beklenen} öğrenci girdi`, 'sr-katilim'));
  ozet.append(ust);

  if (puanlar.length) {
    const istat = el('div', undefined, 'sr-istat');
    const hucre = (ad, say) => { const h = el('div'); h.append(el('b', say), el('small', ad)); istat.append(h); };
    if (v.kisitli) hucre('Dersinizin ortalaması', ortalamaAl(puanlar).toFixed(1));
    hucre('En yüksek', Math.max(...puanlar).toFixed(1));
    hucre('En düşük', Math.min(...puanlar).toFixed(1));
    ozet.append(istat);

    const sayilar = ARALIKLAR.map(() => 0);
    for (const p of puanlar) sayilar[Math.min(4, Math.floor(p / 20))]++;
    const bar = el('div', undefined, 'sr-seg');
    sayilar.forEach((n, i) => { if (!n) return; const s = el('span', String(n)); s.style.setProperty('--r', ARALIK_RENK[i]); s.style.flexGrow = n; s.title = `${ARALIKLAR[i]} puan: ${n} öğrenci`; bar.append(s); });
    const lejant = el('div', undefined, 'sr-lejant');
    sayilar.forEach((n, i) => { const l = el('span'); const nokta = el('i'); nokta.style.setProperty('--r', ARALIK_RENK[i]); l.append(nokta, document.createTextNode(`${ARALIKLAR[i]} · ${n}`)); lejant.append(l); });
    ozet.append(el('h3', 'Puan dağılımı', 'sr-alt'), bar, lejant);

    const dersOrt = v.dersler.map(d => ({ ders: d.ders, ort: ortalamaAl(v.ogrenciler.map(g => g.dersler[d.id]).filter(Boolean).map(x => Number(x.puan))) }))
      .filter(d => d.ort !== null);
    if (dersOrt.length > 1 || (dersOrt.length && !yazili())) {
      ozet.append(el('h3', 'Ders ortalamaları', 'sr-alt'));
      const kap = el('div', undefined, 'yatay');
      for (const d of dersOrt) {
        const s = el('div', undefined, 'yatay-satir'); const cubuk = el('span', undefined, 'yatay-cubuk'); const i = el('i');
        i.style.setProperty('--w', Math.min(100, d.ort) + '%'); i.style.setProperty('--r', bandRenk(d.ort)); cubuk.append(i);
        s.append(el('span', d.ders, 'yatay-ad'), cubuk, el('b', d.ort.toFixed(0))); kap.append(s);
      }
      ozet.append(kap);
    }
  } else ozet.append(el('p', yazili() ? 'Henüz puan girilmedi. "Düzenle" bölümünden öğrenci puanlarını girin.' : 'Henüz öğrenci cevabı girilmedi; cevapları okul yönetimi girer.', 'alt'));
  kutu.append(ozet);

  if (v.sinav.kapsam && v.sinav.kapsam.length) {
    const k = el('section', undefined, 'sr-ozet');
    k.append(el('h3', 'Sınavın kazanımları', 'sr-alt'));
    const ul = el('ul', undefined, 'kapsam-liste');
    for (const x of v.sinav.kapsam) ul.append(el('li', x));
    k.append(ul);
    kutu.append(k);
  }
  if (girenler.length) {
    const git = el('button', 'Öğrenci sonuçlarına ve raporlarına git →', 'ikincil'); git.type = 'button';
    git.addEventListener('click', () => sekmeSec('ogr'));
    kutu.append(git);
  }
}

// Öğrenciler: sıralı liste; her öğrencinin ayrıntılı raporu açılır, indirilebilir
async function ogrCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const r = await sonucAl();
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  const v = r.veri;
  if (!v.ogrenciler.length || !v.dersler.length) return kutu.append(el('p', 'Bu sınavda gösterilecek öğrenci yok.', 'alt'));
  const girenler = v.ogrenciler.filter(g => g.ortalama !== null);

  const arac = el('div', undefined, 'sr-arac');
  const tum = el('button', 'Tüm raporlar (PDF)', 'kucuk'); tum.type = 'button'; tum.disabled = !girenler.length;
  tum.addEventListener('click', () => raporEkrani(girenler.map(g => g.ogrenciId)));
  const csv = el('button', 'Sonuç tablosu (Excel)', 'ikincil kucuk'); csv.type = 'button'; csv.disabled = !girenler.length;
  csv.addEventListener('click', () => csvIndir(v));
  arac.append(tum, csv);
  kutu.append(arac);

  const baslik = el('div', undefined, 'sr-liste-ust');
  baslik.append(el('h3', 'Öğrenci sırası'), el('small', yazili() ? 'Her öğrencinin puanı' : `Çubuklar: ${v.dersler.map(d => d.ders).join(' · ')}`));
  kutu.append(baslik, el('p', (yazili() ? '' : `${KAT_YAZI(v.sinav.yanlisKat)}; puan = net / soru sayısı × 100. `) + 'Öğrenciye dokunun: ayrıntılı raporu açılır, PDF olarak indirilebilir.', 'mad-ince'));
  const liste = el('div', undefined, 'sr-liste');
  const sirali = [...v.ogrenciler].sort((a, b) => (a.sira || 1e9) - (b.sira || 1e9) || a.ad.localeCompare(b.ad, 'tr'));
  for (const g of sirali) {
    const girdi = g.ortalama !== null;
    const satir = el(girdi ? 'button' : 'div', undefined, 'sr-satir' + (girdi ? '' : ' yok'));
    if (girdi) {
      satir.type = 'button';
      satir.setAttribute('aria-label', `${g.ad} raporu`);
      satir.addEventListener('click', () => raporEkrani([g.ogrenciId]));
    }
    const kim = el('span', undefined, 'sr-kim');
    kim.append(el('strong', g.ad), el('small', `${g.okulNo ? 'No ' + g.okulNo + ' · ' : ''}${g.sinif}`));
    satir.append(el('span', g.sira ? String(g.sira) : '–', 'sr-sira'), kim);
    if (girdi) {
      if (v.dersler.length > 1) {
        const mini = el('span', undefined, 'sr-mini');
        for (const d of v.dersler) {
          const x = g.dersler[d.id];
          const c = el('i', undefined, x ? '' : 'yok');
          if (x) { c.style.setProperty('--h', Math.max(8, Math.min(100, Number(x.puan))) + '%'); c.style.setProperty('--r', bandRenk(Number(x.puan))); }
          c.title = `${d.ders}: ${x ? x.puan : '–'}`;
          mini.append(c);
        }
        satir.append(mini);
      }
      const puan = el('span', String(g.ortalama), 'sr-puan');
      puan.style.setProperty('--r', bandRenk(g.ortalama));
      satir.append(puan);
    } else satir.append(el('span', 'Girmedi', 'sr-girmedi'));
    liste.append(satir);
  }
  kutu.append(liste);
}

// Sonuç tablosu: Türkçe Excel'in açacağı biçimde (noktalı virgül, BOM)
function csvIndir(v) {
  const hucre = x => { const s = String(x ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const satirlar = [['Sıra', 'Okul no', 'Ad Soyad', 'Sınıf', ...v.dersler.map(d => d.ders + ' puan'), 'Ortalama']];
  const sirali = v.ogrenciler.filter(g => g.ortalama !== null).sort((a, b) => a.sira - b.sira || a.ad.localeCompare(b.ad, 'tr'));
  for (const g of sirali) satirlar.push([g.sira, g.okulNo || '', g.ad, g.sinif, ...v.dersler.map(d => (g.dersler[d.id] ? String(g.dersler[d.id].puan).replace('.', ',') : '')), String(g.ortalama).replace('.', ',')]);
  const ad = v.sinav.ad.toLocaleLowerCase('tr').replace(/[^a-z0-9ğüşıöç]+/g, '-').replace(/^-|-$/g, '') || 'sinav';
  dosyaIndir(`${ad}-sonuclar.csv`, '﻿' + satirlar.map(s => s.map(hucre).join(';')).join('\r\n') + '\r\n', 'text/csv');
}

// ---------- Madde analizi ----------
const ayirtYazi = a => (a === null ? '' : a >= 0.4 ? 'çok iyi' : a >= 0.3 ? 'iyi' : a >= 0.2 ? 'orta' : a >= 0 ? 'zayıf' : 'sorunlu');
function analizBilgi() {
  const b = el('details', undefined, 'ay-bilgi');
  b.append(el('summary', 'Bu sayfadaki terimler ne anlama geliyor?'));
  const madde = (baslik, yazi) => { const p = el('p'); p.append(el('b', baslik + ' '), document.createTextNode(yazi)); b.append(p); };
  madde('Başarı:', 'Soruyu doğru yapan öğrencilerin yüzdesi. Zorluk etiketi buna göre verilir: %80 ve üstü çok kolay, %60-80 kolay, %40-60 orta, %20-40 zor, %20 altı çok zor.');
  madde('Ayırt edicilik:', 'Sorunun, iyi öğrenciyi zayıf öğrenciden ne kadar iyi ayırdığıdır. Sınavda en yüksek puan alan %27\'lik grup ile en düşük puan alan %27\'lik grubun bu soruyu doğru yapma oranları arasındaki fark alınır (−1 ile +1 arası; en az 4 öğrenci gerekir).');
  const l = el('ul');
  for (const s of ['0,40 ve üstü: çok iyi; soru başarılı öğrenciyi çok iyi ayırıyor.', '0,30-0,39: iyi.', '0,20-0,29: orta; geliştirilebilir.', '0 ile 0,20 arası: zayıf; soru neredeyse herkese aynı sonucu veriyor (çok kolay ya da çok zor olabilir).', 'Negatif: zayıf öğrenciler soruyu başarılılardan daha çok doğru yapmış. Soru kökü veya cevap anahtarı hatalı olabilir; kontrol edin.']) l.append(el('li', s));
  b.append(l);
  madde('Şık dağılımı:', 'Her şıkkı kaç öğrencinin işaretlediği. Yeşil çerçeveli şık doğru cevaptır; yanlış bir şık çok işaretlendiyse öğrenciler o konuda yanılgıya düşmüş olabilir.');
  return b;
}

async function analizCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const r = await sonucAl();
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  kutu.append(analizBilgi());
  for (const a of r.veri.analiz) {
    kutu.append(el('h3', `${a.ders} · ${a.giren} öğrenci`, 'baslik3'));
    if (!a.giren) { kutu.append(el('p', 'Henüz cevap girilmedi.', 'alt')); continue; }
    const renkB = b => (b < 40 ? '#d64545' : b < 70 ? '#e0a100' : '#2e9e5b');
    const grafikKart = el('div', undefined, 'kutu');
    grafikKart.append(el('h3', 'Soru başarısı (%)', 'mini-baslik'), sutunGrafik(a.sorular.map(q => ({ etiket: String(q.no), deger: q.basari, renk: q.iptal ? '#c9c2b2' : renkB(q.basari) })), 90));
    kutu.append(grafikKart);
    for (const q of a.sorular) {
      const kart = el('div', undefined, 'mad-kart' + (q.iptal ? ' iptal' : ''));
      const no = el('span', String(q.no), 'mad-no'); no.style.setProperty('--c', q.iptal ? '#c9c2b2' : renkB(q.basari));
      const orta = el('div', undefined, 'mad-orta');
      const ust = el('div', undefined, 'mad-ust');
      ust.append(el('strong', q.iptal ? 'İptal edildi' : `Doğru şık ${q.dogruSik}`));
      if (q.zorluk) ust.append(el('span', q.zorluk, 'mad-etiket'));
      if (q.ayirt !== null) ust.append(el('span', `ayırt edicilik ${String(q.ayirt).replace('.', ',')} · ${ayirtYazi(q.ayirt)}`, 'mad-ince' + (q.ayirt < 0 ? ' uyari' : '')));
      const cubuk = yiginCubuk([{ deger: q.dogru, renk: '#2e9e5b', etiket: 'doğru' }, { deger: q.yanlis, renk: '#d64545', etiket: 'yanlış' }, { deger: q.bos, renk: '#cfc8b8', etiket: 'boş' }]);
      const say = el('div', `${q.dogru} doğru · ${q.yanlis} yanlış · ${q.bos} boş`, 'mad-ince');
      const sik = el('div', undefined, 'mad-sik');
      for (const h of 'ABCDE') {
        const x = el('span', undefined, 'mad-sik-oge' + (h === q.dogruSik ? ' dogru' : ''));
        x.append(el('b', h), document.createTextNode(String(q.dagilim[h])));
        sik.append(x);
      }
      orta.append(ust, cubuk, say, sik);
      const yuz = el('span', `%${q.basari}`, 'mad-yuzde'); yuz.style.setProperty('--c', q.iptal ? '#8a867d' : renkB(q.basari));
      kart.append(no, orta, yuz);
      kutu.append(kart);
    }
    if (a.kazanimlar.length) {
      kutu.append(el('h4', 'Kazanım başarısı (sınıf geneli)', 'baslik3'));
      for (const k of a.kazanimlar) {
        const kart = el('div', undefined, 'mad-kaz');
        const ust = el('div', undefined, 'mad-kaz-ust');
        const yuz = el('b', `%${k.oran}`); yuz.style.setProperty('--c', renkB(k.oran));
        ust.append(el('span', k.kazanim), yuz);
        const cubuk = el('span', '', 'basari-cubuk'); cubuk.style.setProperty('--oran', k.oran + '%');
        const alt = el('div', undefined, 'mad-kaz-alt');
        alt.append(el('span', `Soru ${k.sorular.join(', ')}`, 'mad-ince'));
        let durum = k.islenmedi === k.giren ? 'Sınıfta işlenmedi' : k.islenmedi ? `${k.islenmedi} öğrenci için işlenmedi` : 'İşlendi';
        if (k.devamsiz) durum += ` · ${k.devamsiz} öğrenci derse katılmadı`;
        alt.append(el('span', durum, 'mad-durum' + (k.islenmedi ? ' eksik' : '')));
        kart.append(ust, cubuk, alt);
        kutu.append(kart);
      }
    } else kutu.append(el('p', 'Bu derste soru-kazanım eşlemesi yapılmamış; "Düzenle" bölümündeki "Kazanımlar" sekmesinden girin.', 'alt'));
  }
}

// ---------- Öğrenci raporu ----------
const islemeYazi = i => (i ? ({ islenmedi: 'Ders işlenmedi', devamsiz: 'Derse katılmadı', katildi: 'İşlendi, katıldı', bilinmiyor: 'İşlendi' })[i.durum] : '');
const DURUM_RENK = { Edinildi: '#1a7f37', Kısmen: '#b45309', Eksik: '#c62828' };

// Bir öğrencinin raporu. secim: { sinif, cevap, eksik, edin } · cevaplar: ders id -> cevap dizisi (yalnız sınav sahibi/yönetim görür)
function raporGovdesi(rapor, v, g, secim, cevaplar) {
  rapor.replaceChildren();
  const kurum = el('div', undefined, 'rp-kurum');
  kurum.append(el('b', 'Akant Koleji'), el('span', 'Sınav sonuç raporu'));
  const kim = el('div', undefined, 'rp-kim');
  kim.append(el('h2', g.ad), el('p', `${g.sinif}${g.okulNo ? ' · No ' + g.okulNo : ''}`), el('small', `${v.sinav.ad} · ${tarihYaz(v.sinav.tarih)}${v.sinav.tur === 'yazili' ? ' · Yazılı' : ''}`));
  rapor.append(kurum, kim);

  const ozet = el('div', undefined, 'rp-ozet');
  const hucre = (say, ad) => { const h = el('div'); h.append(el('strong', say), el('span', ad)); ozet.append(h); };
  hucre(String(g.ortalama), v.dersler.length > 1 ? 'Ortalama puan' : 'Puan');
  hucre(`${g.sira}.`, `${v.giren} öğrenci içinde`);
  rapor.append(ozet);

  for (const d of v.dersler) {
    const x = g.dersler[d.id];
    if (!x) continue;
    const blok = el('section', undefined, 'rp-ders');
    const ust = el('div', undefined, 'rp-ders-ust');
    const puan = el('b', String(x.puan)); puan.style.setProperty('--r', bandRenk(Number(x.puan)));
    ust.append(el('strong', d.ders), puan);
    const cubuk = el('span', undefined, 'yatay-cubuk'); const i = el('i');
    i.style.setProperty('--w', Math.min(100, Number(x.puan)) + '%'); i.style.setProperty('--r', bandRenk(Number(x.puan))); cubuk.append(i);
    blok.append(ust, cubuk);
    const parcalar = [];
    if (x.dogru !== null) parcalar.push(`${x.dogru} doğru · ${x.yanlis} yanlış · ${x.bos} boş · net ${x.net}`);
    if (secim.sinif) {
      const p = ortalamaAl(v.ogrenciler.map(o => o.dersler[d.id]).filter(Boolean).map(o => Number(o.puan)));
      if (p !== null) parcalar.push(`sınıf ort. ${p.toFixed(1)}`);
    }
    if (parcalar.length) blok.append(el('p', parcalar.join(' · '), 'mad-ince'));
    const c = cevaplar && cevaplar[d.id];
    if (secim.cevap && c && x.dogru !== null) {
      const tam = { ...d, anahtar: cevaplar.anahtar[d.id], iptal: cevaplar.iptal[d.id] };
      blok.append(cevapIzgara(tam, c));
    }
    rapor.append(blok);
  }

  if (v.sinav.kapsam && v.sinav.kapsam.length) {
    rapor.append(el('h3', 'Sınavın kapsadığı kazanımlar', 'rp-baslik'));
    const ul = el('ul', undefined, 'kapsam-liste');
    for (const k of v.sinav.kapsam) ul.append(el('li', k));
    rapor.append(ul);
  }

  if (secim.eksik || secim.edin) {
    rapor.append(el('h3', 'Kazanım ayrıntısı', 'rp-baslik'));
    let var1 = false;
    for (const d of v.dersler) {
      const liste = ((g.kazanim && g.kazanim[d.id]) || []).filter(k => (k.durum === 'Edinildi' ? secim.edin : secim.eksik));
      if (!liste.length) continue;
      var1 = true;
      const blok = el('section', undefined, 'rp-kaz-blok');
      blok.append(el('h4', d.ders));
      for (const k of liste) {
        const kart = el('div', undefined, 'rp-kaz');
        const dur = el('b', k.durum); dur.style.setProperty('--c', DURUM_RENK[k.durum] || '#8a867d');
        kart.append(el('span', k.kazanim), dur);
        let not = `Soru ${k.sorular.join(', ')} · ${k.dogru}/${k.toplam} doğru`;
        const iy = islemeYazi(k.isleme);
        if (k.durum !== 'Edinildi' && iy) not += ` · ${iy}`;
        kart.append(el('small', not));
        blok.append(kart);
      }
      rapor.append(blok);
    }
    if (!var1 && v.sinav.tur !== 'yazili') rapor.append(el('p', 'Seçilen türde kazanım yok ya da bu sınav için kazanım eşlemesi girilmemiş.', 'kl-not'));
    if (!var1 && v.sinav.tur === 'yazili') rapor.lastChild.remove();
  }
}

// Tek öğrenci ya da tüm sınıf: seçenekler, ekranda önizleme, yazdır / PDF olarak kaydet
async function raporEkrani(idler) {
  const kutu = $('d-icerik');
  const r = await sonucAl(true);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  const v = r.veri;
  const ogrenciler = idler.map(id => v.ogrenciler.find(x => x.ogrenciId === id)).filter(Boolean);
  if (!ogrenciler.length) return mesaj('Öğrenci bulunamadı', 'hata');
  // Soru soru cevap dökümü: sınav sahibi ve yönetim görür
  const cevapHarita = new Map();
  if (acik.sahip && !yazili()) {
    const anahtar = {}, iptal = {};
    for (const x of acik.dersler) { anahtar[x.id] = x.anahtar; iptal[x.id] = x.iptal; }
    for (const g of acik.ogrenciler) cevapHarita.set(g.ogrenciId, { ...g.cevaplar, anahtar, iptal });
  }
  kutu.replaceChildren();
  document.body.classList.add('karne-acik');

  const secimKutu = el('section', undefined, 'gz-secim gz-ekran');
  const baslikSatir = el('div', undefined, 'rp-arac-ust');
  const geri = el('button', '← Öğrenciler', 'ikincil kucuk'); geri.type = 'button';
  geri.addEventListener('click', () => sekmeSec('ogr'));
  baslikSatir.append(geri, el('h3', ogrenciler.length > 1 ? `Tüm raporlar (${ogrenciler.length} öğrenci)` : 'Rapora eklenecekler'));
  secimKutu.append(baslikSatir);
  if (!v.sinav.yayin) secimKutu.append(el('p', 'Bu sınavın sonuçları henüz yayınlanmadı; öğrenci ve veli görmez.', 'kl-not'));
  const secenek = (ad, alt, acik0) => {
    const l = el('label', undefined, 'gz-secim-satir');
    const cb = Object.assign(el('input'), { type: 'checkbox', checked: acik0 });
    const yazi = el('span', undefined, 'gz-secim-yazi');
    yazi.append(el('b', ad), el('small', alt));
    l.append(cb, yazi);
    cb.addEventListener('change', () => ciz());
    secimKutu.append(l);
    return cb;
  };
  const sinifCb = secenek('Sınıf ortalaması', 'Her dersin yanında sınıfın ortalaması', true);
  const cevapCb = cevapHarita.size ? secenek('Soru soru cevaplar', 'Her sorudaki işaret; yanlışlarda doğru şık', true) : { checked: false };
  const eksikCb = yazili() ? { checked: false } : secenek('Eksik kazanımlar', 'Edinilemeyen ve kısmen edinilen konular', true);
  const edinCb = yazili() ? { checked: false } : secenek('Edinilen kazanımlar', 'Başarıyla edinilen konular', true);
  const arac = el('div', undefined, 'gz-secim-arac');
  const yaz = el('button', 'PDF indir / Yazdır', 'birincil kucuk'); yaz.type = 'button';
  yaz.addEventListener('click', () => window.print());
  arac.append(yaz);
  secimKutu.append(arac, el('p', 'Açılan yazdırma penceresinde "PDF olarak kaydet" seçeneğini seçerek dosyayı indirebilirsiniz.', 'mad-ince'));

  const sayfalar = el('div', undefined, 'rp-sayfalar');
  const bloklar = ogrenciler.map(() => el('article', undefined, 'rp-rapor'));
  bloklar.forEach(b => sayfalar.append(b));
  const ciz = () => {
    const secim = { sinif: sinifCb.checked, cevap: cevapCb.checked, eksik: eksikCb.checked, edin: edinCb.checked };
    ogrenciler.forEach((g, i) => raporGovdesi(bloklar[i], v, g, secim, cevapHarita.get(g.ogrenciId)));
  };
  kutu.append(secimKutu, sayfalar);
  ciz();
  window.scrollTo({ top: 0 });
}

// ---------- Kazanımlar (test): her sorunun ölçtüğü kazanım ----------
async function kazanimCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const r = await api('/api/sinav/kazanimlar?id=' + acik.sinav.id);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  const programDers = await programDersleri();
  const sinifNo = sinifDuzeyi(r.veri.siniflar);
  kutu.append(el('p', 'Her soru için ölçtüğü kazanımı seçin veya yazın. Öğrenci soruyu doğru yaparsa bu kazanımı edinmiş sayılır; öğrenci raporunda ve sınıf analizinde görünür. Aynı dersi veren öğretmenler bu bölümü birlikte doldurabilir.', 'alt'));
  for (const d of r.veri.dersler) {
    kutu.append(el('h3', d.ders + (d.duzenle ? '' : ' (salt okunur)'), 'baslik3'));
    const sel = el('select'); sel.setAttribute('aria-label', 'Kazanım programı dersi');
    const hepsi = el('option', 'Tüm dersler'); hepsi.value = ''; sel.append(hepsi);
    for (const ad of programDers) { const o = el('option', ad); o.value = ad; sel.append(o); }
    if (programDers.includes(d.ders)) sel.value = d.ders;
    // MEB programında bazı dersler belli sınıflardan başlar (örn. Bilişim 5. sınıftan); sınıf süzgeci kapatılabilir
    const sinifSel = el('select'); sinifSel.setAttribute('aria-label', 'Kazanım sınıf düzeyi');
    if (sinifNo) { const o = el('option', `${sinifNo}. sınıf kazanımları`); o.value = sinifNo; sinifSel.append(o); }
    const tum = el('option', 'Tüm sınıflar'); tum.value = ''; sinifSel.append(tum);
    const liste = el('div', '', 'kazanim-liste gizli');
    let aktif = null, zaman = null, sayac = 0;
    const ara = async () => {
      if (!aktif) return;
      const benim = ++sayac, girdi = aktif;
      const q = girdi.value.trim();
      girdi.closest('.kz-soru').after(liste);
      if (!sel.value && q.length < 2) {
        liste.replaceChildren(el('p', 'Tüm programlarda aramak için en az 2 harf yazın veya yukarıdan ders seçin.', 'alt'));
        return liste.classList.remove('gizli');
      }
      const p = new URLSearchParams({ q, sinif: sinifSel.value });
      if (sel.value) p.set('ders', sel.value);
      const k = await api('/api/kazanim?' + p);
      if (benim !== sayac || aktif !== girdi) return;
      liste.replaceChildren();
      if (!k.ok) return liste.classList.add('gizli');
      for (const x of k.veri.kazanimlar) {
        const b = el('button', '', 'kazanim-oge'); b.type = 'button';
        b.append(el('strong', x.kod || 'Kod yok'), document.createTextNode(' ' + x.metin));
        b.addEventListener('click', () => { girdi.value = ((x.kod ? x.kod + ' – ' : '') + x.metin).slice(0, 300); liste.classList.add('gizli'); aktif = null; });
        liste.append(b);
      }
      if (!k.veri.kazanimlar.length) liste.append(el('p', 'Sonuç yok. "Tüm sınıflar" veya "Tüm dersler" seçip arayın ya da kazanımı elle yazın.', 'alt'));
      liste.classList.remove('gizli');
    };
    sel.addEventListener('change', ara); sinifSel.addEventListener('change', ara);
    if (d.duzenle) kutu.append(el('label', 'Kazanım programı'), sel, sinifSel);
    const sorular = el('div', undefined, 'kz-liste');
    const girdiler = [];
    for (const q of d.sorular) {
      const kart = el('div', undefined, 'mad-kart kz-soru' + (q.iptal ? ' iptal' : ''));
      const no = el('span', String(q.no), 'mad-no'); no.style.setProperty('--c', q.iptal ? '#c9c2b2' : '#5878a8');
      const ust = el('div', undefined, 'kz-ust');
      ust.append(no, el('strong', `Doğru şık ${q.dogruSik}` + (q.iptal ? ' · iptal' : '')));
      if (q.kim) ust.append(el('span', q.kim, 'mad-ince'));
      const gi = el('textarea'); gi.rows = 2; gi.value = q.kazanim; gi.maxLength = 300; gi.autocomplete = 'off'; gi.spellcheck = false;
      gi.setAttribute('aria-label', `${d.ders} soru ${q.no} kazanımı`);
      if (!d.duzenle) gi.readOnly = true;
      else {
        gi.addEventListener('input', () => { aktif = gi; clearTimeout(zaman); zaman = setTimeout(ara, 250); });
        gi.addEventListener('focus', () => { aktif = gi; ara(); });
        gi.addEventListener('keydown', e => {
          if (e.key === 'Escape') { liste.classList.add('gizli'); aktif = null; }
          if (e.key === 'Enter') e.preventDefault();
        });
      }
      const kazSatir = el('div', undefined, 'kaz-satir'); kazSatir.append(gi);
      if (d.duzenle && q.no > 1) {
        const ayni = el('button', '↑', 'kaz-ayni'); ayni.type = 'button'; ayni.title = 'Üsttekiyle aynı'; ayni.setAttribute('aria-label', 'Üsttekiyle aynı');
        ayni.addEventListener('click', () => { gi.value = girdiler[q.no - 2].value; liste.classList.add('gizli'); });
        kazSatir.append(ayni);
      }
      kart.append(ust, kazSatir);
      girdiler.push(gi);
      sorular.append(kart);
    }
    kutu.append(sorular);
    if (d.duzenle) {
      const kaydet = el('button', `${d.ders} kazanımlarını kaydet`); kaydet.type = 'button';
      kaydet.addEventListener('click', async () => {
        liste.classList.add('gizli');
        const s = await api('/api/sinav/kazanimlar', { id: acik.sinav.id, dersId: d.id, sorular: girdiler.map((gi, i) => ({ no: i + 1, kazanim: gi.value })) });
        if (!s.ok) return mesaj(s.veri.hata || 'Kaydedilemedi', 'hata');
        await kazanimCiz();
        mesaj(`${d.ders} kazanımları kaydedildi.`, 'tamam');
      });
      kutu.append(kaydet);
    }
  }
}

// Kazanımlar (yazılı): sınavın bütünü için kazanım listesi; soru eşlemesi yok
async function yaziKazanimCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  kutu.append(el('p', 'Bu sınavın ölçtüğü kazanımları ekleyin. Soru soru eşleme gerekmez; liste öğrenci raporunda ve sonuç özetinde "sınavın kazanımları" olarak görünür.', 'alt'));
  const prog = await programDersleri();
  const ders = acik.dersler[0].ders;
  const secici = kazanimSecici(acik.sinav.kapsam || [], () => (prog.includes(ders) ? ders : ''), () => sinifDuzeyi(acik.siniflar.map(c => c.name)));
  kutu.append(secici);
  const cubuk = el('div', undefined, 'kaydet-cubuk');
  const kaydet = el('button', 'Kazanımları kaydet', 'birincil'); kaydet.type = 'button';
  kaydet.addEventListener('click', async () => {
    const r = await api('/api/sinav/yazili-kazanim', { id: acik.sinav.id, kazanimlar: secici.degerler() });
    if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
    await detayAc(acik.sinav.id, 'kazanim');
    mesaj('Kazanımlar kaydedildi.', 'tamam');
  });
  cubuk.append(kaydet);
  kutu.append(cubuk);
}

// ---------- Anahtar ve yayın ----------
// Öğretmen anahtarı yalnız görür ve sonuçları yayınlar/siler; anahtarı ve iptalleri yönetim değiştirir
function anahtarCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const d = acik;
  const yaz = yazili();

  if (!ben.yon) kutu.append(yayinDurumu());

  if (!yaz) {
    if (ben.yon) kutu.append(el('p', 'Anahtarı düzeltirseniz tüm sonuçlar yeniden hesaplanır. İptal edilen soru tüm öğrencilere doğru sayılır.', 'alt'));
    else kutu.append(el('p', 'Cevap anahtarı ve soru iptalleri yalnızca okul yönetimi tarafından değiştirilebilir. Hata görürseniz yönetime bildirin.', 'alt'));
    const sel = el('select'); sel.setAttribute('aria-label', 'Yanlış katsayısı');
    for (const k of [0, 4, 3, 2]) { const o = el('option', KAT_YAZI(k)); o.value = k; sel.append(o); }
    sel.value = String(d.sinav.yanlisKat);
    sel.disabled = !ben.yon;
    const puanKart = el('div', undefined, 'ak-kart');
    puanKart.append(el('label', 'Yanlış doğruyu götürür mü?'), sel);
    kutu.append(puanKart);
    const alanlar = [];
    for (const x of d.dersler) {
      const kart = el('div', undefined, 'ak-kart');
      const ust = el('div', undefined, 'ak-ust');
      ust.append(el('strong', x.ders), el('span', `${x.soruSayisi} soru`, 'mad-ince'));
      const ank = el('input', undefined, 'cevap-giris'); ank.value = x.anahtar; ank.maxLength = x.soruSayisi; ank.setAttribute('aria-label', 'Cevap anahtarı ' + x.ders);
      const ip = el('input'); ip.value = x.iptal.join(', '); ip.placeholder = ben.yon ? 'İptal edilen soru numaraları, örn. 7, 12' : 'İptal edilen soru yok'; ip.setAttribute('aria-label', 'İptal edilen sorular ' + x.ders);
      ank.readOnly = ip.readOnly = !ben.yon;
      kart.append(ust, el('label', 'Cevap anahtarı'), ank, el('label', 'İptal edilen sorular'), ip);
      kutu.append(kart);
      alanlar.push([x, ank, ip]);
    }
    if (ben.yon) {
      const kaydet = el('button', 'Kaydet ve yeniden hesapla'); kaydet.type = 'button';
      kaydet.addEventListener('click', async () => {
        if (!confirm('Cevap anahtarı değişirse tüm öğrencilerin sonuçları yeniden hesaplanır. Onaylıyor musunuz?')) return;
        const r = await api('/api/sinav/anahtar', {
          id: d.sinav.id, yanlisKat: Number(sel.value),
          dersler: alanlar.map(([x, ank, ip]) => ({ id: x.id, anahtar: ank.value, iptal: ip.value.split(/[\s,;]+/).filter(Boolean).map(Number) })),
        });
        if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
        await detayAc(d.sinav.id, 'anahtar');
        mesaj('Anahtar güncellendi, sonuçlar yeniden hesaplandı.', 'tamam');
      });
      kutu.append(el('div', '', 'dugme-satir'));
      kutu.lastChild.append(kaydet);
    }
  }
  if (ben.yon) return;

  const yayin = el('button', d.sinav.yayin ? 'Yayından kaldır' : 'Sonuçları yayınla', 'ikincil'); yayin.type = 'button';
  yayin.addEventListener('click', async () => {
    const yeni = !d.sinav.yayin;
    if (yeni && !confirm('Sonuçlar öğrenci ve velilere görünecek. Yayınlansın mı?')) return;
    const r = await api('/api/sinav/yayin', { id: d.sinav.id, yayin: yeni });
    if (!r.ok) return mesaj(r.veri.hata || 'Güncellenemedi', 'hata');
    await detayAc(d.sinav.id, 'anahtar');
    mesaj(yeni ? 'Sonuçlar yayınlandı.' : 'Sonuçlar yayından kaldırıldı.', 'tamam');
  });
  const sil = el('button', 'Sınavı sil', 'ikincil tehlike'); sil.type = 'button';
  sil.addEventListener('click', async () => {
    if (!confirm('Bu sınav ve girilen tüm cevaplar/puanlar silinecek. Emin misiniz?')) return;
    const r = await api('/api/sinav/sil', { id: d.sinav.id });
    if (!r.ok) return mesaj(r.veri.hata || 'Silinemedi', 'hata');
    gorunum('liste'); await listeYukle();
    mesaj('Sınav silindi.', 'tamam');
  });
  const satir = el('div', '', 'dugme-satir');
  satir.append(yayin, sil);
  kutu.append(satir);
}

$('yeni-ac').addEventListener('click', yeniAc);
$('yeni-geri').addEventListener('click', () => gorunum('liste'));
$('s-vazgec').addEventListener('click', () => gorunum('liste'));
$('detay-geri').addEventListener('click', () => { gorunum('liste'); listeYukle(); });
$('ders-ekle').addEventListener('click', () => $('s-dersler').append(dersSatiri()));
$('s-kaydet').addEventListener('click', olustur);
$('s-tur').addEventListener('click', e => { const b = e.target.closest('button'); if (b) turSec(b.dataset.tur); });
$('d-mod').addEventListener('click', e => { const b = e.target.closest('button'); if (b) modSec(b.dataset.mod); });
$('d-sekmeler').addEventListener('click', e => { const b = e.target.closest('button'); if (b) sekmeSec(b.dataset.sekme); });
gorunum('liste');
listeYukle();
