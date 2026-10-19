const $ = id => document.getElementById(id);
let secenekler = { siniflar: [], dersler: [] };
let acik = null;      // açık sınavın detayı
let sekme = 'cevap';

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

// Liste ve detay kutuları hep görünür; yalnızca "Yeni sınav" formu açılıp kapanır
function bolum(ad) {
  $('yeni-bolum').classList.toggle('gizli', ad !== 'yeni-bolum');
  mesaj('');
}

// Hiçbir sınav seçili değilken detay kutusu boş hâliyle durur
function detayBos() {
  acik = null;
  $('d-baslik').textContent = 'Sınav detayı';
  for (const b of $('d-sekmeler').querySelectorAll('button')) { b.disabled = true; b.classList.remove('gizli'); b.setAttribute('aria-pressed', 'false'); }
  $('d-icerik').replaceChildren(el('p', 'Listeden bir sınav seçin. Cevaplar, sonuçlar, madde analizi ve kazanımlar burada görünür.', 'bos-not'));
  for (const k of document.querySelectorAll('.sinav-kart.secili')) k.classList.remove('secili');
}

const tarihYaz = t => t.split('-').reverse().join('.');
const KAT_YAZI = k => (k ? `${k} yanlış 1 doğruyu götürür` : 'yanlış götürmez');

// ---------- Liste ----------
async function listeYukle() {
  const r = await api('/api/sinav/liste');
  const kutu = $('liste');
  kutu.replaceChildren();
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  if (!r.veri.sinavlar.length) kutu.append(el('p', 'Henüz sınav yok. Sağ üstteki "Yeni sınav" ile başlayın.', 'bos-not'));
  for (const s of r.veri.sinavlar) {
    const kart = el('button', '', 'sinav-kart');
    kart.type = 'button';
    kart.append(
      el('strong', s.ad),
      el('span', `${tarihYaz(s.tarih)} · ${s.siniflar.join(', ')} · ${s.dersler.join(', ')}`, 'alt'),
      el('span', s.sahip
        ? `${s.okunan} öğrenci cevabı girildi · ${KAT_YAZI(s.yanlisKat)} · ${s.yayin ? 'Yayında' : 'Yayınlanmadı'} · ${s.kazanimli}/${s.soru} soruya kazanım girildi`
        : `Paylaşılan sınav · Sahibi: ${s.sahipAd} · ${s.kazanimli}/${s.soru} soruya kazanım girildi`, 'alt'),
    );
    if (acik && acik.sinav.id === s.id) kart.classList.add('secili');
    kart.addEventListener('click', () => detayAc(s.id));
    kutu.append(kart);
  }
}

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

async function yeniAc() {
  const r = await api('/api/sinav/secenekler');
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  secenekler = r.veri;
  if (!secenekler.siniflar.length) return mesaj('Size atanmış sınıf/ders yok.', 'hata');
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
  bolum('yeni-bolum');
  $('yeni-bolum').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function dersleriTopla(kutu) {
  return [...kutu.querySelectorAll('.sinav-ders')].map(s => {
    const [sel, sayi, ank] = s.querySelectorAll('select, input');
    return { ders: sel.value, soruSayisi: Number(sayi.value), anahtar: ank.value };
  });
}

async function olustur() {
  const r = await api('/api/sinav/olustur', {
    ad: $('s-ad').value, tarih: $('s-tarih').value, yanlisKat: Number($('s-kat').value),
    sinifIds: [...$('s-siniflar').querySelectorAll('input:checked')].map(i => Number(i.value)),
    dersler: dersleriTopla($('s-dersler')),
  });
  if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
  bolum('');
  await detayBos();
listeYukle();
  await detayAc(r.veri.id);
  mesaj('Sınav oluşturuldu. Şimdi öğrenci cevaplarını girebilirsiniz.', 'tamam');
}

// ---------- Detay ----------
async function detayAc(id) {
  const r = await api('/api/sinav/detay?id=' + id);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  acik = r.veri;
  $('d-baslik').textContent = `${acik.sinav.ad} · ${tarihYaz(acik.sinav.tarih)} · ${acik.siniflar.map(c => c.name).join(', ')}`;
  // Sınav sahibi olmayan öğretmen yalnızca kazanım sekmesini kullanır
  for (const b of $('d-sekmeler').querySelectorAll('button')) { b.disabled = false; b.classList.toggle('gizli', !acik.sahip && b.dataset.sekme !== 'kazanim'); }
  for (const k of document.querySelectorAll('.sinav-kart')) k.classList.remove('secili');
  sekmeSec(!acik.sahip || sekme === 'kazanim' ? 'kazanim' : 'cevap');
  $('detay-bolum').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function sekmeSec(ad) {
  sekme = ad;
  for (const b of $('d-sekmeler').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.sekme === ad));
  mesaj('');
  ({ cevap: cevapCiz, sonuc: sonucCiz, analiz: analizCiz, kazanim: kazanimCiz, anahtar: anahtarCiz })[ad]();
}


// ---------- Optik okuyucu dosyası ----------
// CSV: okul_no;ders1 cevapları;ders2 cevapları... (tek cevap sütunu da olur) · Sabit genişlik: ilk N karakter okul no, sonrası cevaplar
const noSade = s => String(s).trim().replace(/^0+(?=\d)/, '');
function dersBol(metin, dersler) {
  let konum = 0;
  return dersler.map(x => { const p = metin.slice(konum, konum + x.soruSayisi); konum += x.soruSayisi; return p; });
}
function optikCoz(metin, bicim, noUzunluk, dersler) {
  const toplam = dersler.reduce((t, d) => t + d.soruSayisi, 0);
  const satirlar = metin.replace(/^\uFEFF/, '').split(/\r?\n/).filter(s => s.trim());
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
function dosyaIndir(ad, icerik) {
  const a = el('a'); a.href = URL.createObjectURL(new Blob([icerik], { type: 'text/plain;charset=utf-8' })); a.download = ad;
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
      satir.forEach(([, , gi], j) => { gi.value = k.cevap[j] || ''; });
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

// Cevaplar: öğrenci başına, derslerin sırasıyla cevap dizisi
function cevapCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const d = acik;
  kutu.append(el('p', `Her öğrenci için A-E harflerini yazın, boş bırakılan soru için "-" kullanın. ${KAT_YAZI(d.sinav.yanlisKat)}.`, 'alt'));

  const topluKutu = el('details', '', 'toplu');
  topluKutu.append(el('summary', 'Toplu yapıştır (optik okuyucu çıktısı)'));
  topluKutu.append(el('p', `Her satır bir öğrenci, aşağıdaki sıradadır. Satırdaki cevaplar ${d.dersler.map(x => `${x.ders} (${x.soruSayisi})`).join(' + ')} sırasıyla arka arkaya yazılır; boş soru "-" olur.`, 'alt'));
  const ta = el('textarea'); ta.rows = 6; ta.setAttribute('aria-label', 'Toplu cevaplar');
  const uygula = el('button', 'Satırları uygula', 'ikincil'); uygula.type = 'button';
  topluKutu.append(ta, uygula);

  const tablo = el('table', '', 'sinav-tablo');
  const bas = el('tr'); bas.append(el('th', 'No'), el('th', 'Öğrenci'), el('th', 'Sınıf'));
  for (const x of d.dersler) bas.append(el('th', `${x.ders} (${x.soruSayisi})`));
  tablo.append(bas);
  const girisler = [];
  for (const g of d.ogrenciler) {
    const tr = el('tr'); tr.append(el('td', g.okulNo || ''), el('td', g.ad), el('td', g.sinif));
    const satir = [];
    for (const x of d.dersler) {
      const td = el('td'); const gi = el('input', undefined, 'cevap-giris'); gi.value = (g.cevaplar[x.id] || '').replace(/-/g, '-');
      gi.maxLength = x.soruSayisi; gi.autocomplete = 'off'; gi.spellcheck = false;
      gi.setAttribute('aria-label', `${g.ad} ${x.ders}`);
      td.append(gi); tr.append(td); satir.push([g, x, gi]);
    }
    girisler.push(satir);
    tablo.append(tr);
  }
  kutu.append(optikKutusu(d, girisler), topluKutu, tablo);
  if (!d.ogrenciler.length) kutu.append(el('p', 'Seçilen sınıflarda aktif öğrenci yok.', 'alt'));

  uygula.addEventListener('click', () => {
    const satirlar = ta.value.split('\n').map(s => s.replace(/\s/g, '')).filter(Boolean);
    if (satirlar.length > girisler.length) return mesaj(`Satır sayısı (${satirlar.length}) öğrenci sayısından (${girisler.length}) fazla.`, 'hata');
    satirlar.forEach((s, i) => {
      let konum = 0;
      for (const [, x, gi] of girisler[i]) { gi.value = s.slice(konum, konum + x.soruSayisi); konum += x.soruSayisi; }
    });
    mesaj(`${satirlar.length} satır uygulandı. Kaydetmeyi unutmayın.`, 'tamam');
  });

  const kaydet = el('button', 'Cevapları kaydet'); kaydet.type = 'button';
  kaydet.addEventListener('click', async () => {
    const kayitlar = girisler.flat().map(([g, x, gi]) => ({ ogrenciId: g.ogrenciId, dersId: x.id, cevaplar: gi.value }));
    const r = await api('/api/sinav/cevaplar', { id: d.sinav.id, kayitlar });
    if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
    await detayAc(d.sinav.id);
    mesaj('Cevaplar kaydedildi.', 'tamam');
  });
  kutu.append(kaydet);
}

// Sonuçlar: öğrenci başına ders ders doğru/yanlış/boş/net/puan ve genel sıra
async function sonucCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const r = await api('/api/sinav/sonuc?id=' + acik.sinav.id);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  const v = r.veri;
  kutu.append(el('p', `${v.giren} / ${v.beklenen} öğrenci sınava girdi. ${KAT_YAZI(v.sinav.yanlisKat)}; puan = net / soru sayısı × 100. Karne için öğrencinin adına tıklayın.`, 'alt'));
  // Özet grafikler: ortalama, dağılım (puan aralığı), ders ortalamaları
  const ortalamalar = v.ogrenciler.filter(g => g.ortalama !== null).map(g => g.ortalama);
  if (ortalamalar.length) {
    const ort = ortalamalar.reduce((t, x) => t + x, 0) / ortalamalar.length;
    const ozet = el('div', undefined, 'sinav-ozet');
    for (const [say, ad] of [[ort.toFixed(1), 'Sınıf ortalaması'], [Math.max(...ortalamalar).toFixed(1), 'En yüksek'], [Math.min(...ortalamalar).toFixed(1), 'En düşük']]) {
      const k = el('div', undefined, 'odev-sayac'); k.append(el('strong', say), el('span', ad)); ozet.append(k);
    }
    kutu.append(ozet);
    const araliklar = ['0-20', '20-40', '40-60', '60-80', '80-100'];
    const sayilar = araliklar.map(() => 0);
    for (const o of ortalamalar) sayilar[Math.min(4, Math.floor(o / 20))]++;
    const renkler = ['#d64545', '#e0803a', '#e0a100', '#7bb661', '#2e9e5b'];
    const kart = el('div', undefined, 'kutu');
    kart.append(el('h3', 'Puan dağılımı (öğrenci sayısı)', 'mini-baslik'), sutunGrafik(araliklar.map((a, i) => ({ etiket: a, deger: sayilar[i], renk: renkler[i] })), 100));
    const dersOrt = v.dersler.map(d => {
      const p = v.ogrenciler.map(g => g.dersler[d.id]).filter(Boolean).map(x => Number(x.puan));
      return { ders: d.ders, ort: p.length ? p.reduce((t, x) => t + x, 0) / p.length : 0 };
    });
    if (dersOrt.length > 1) {
      kart.append(el('h3', 'Ders ortalamaları', 'mini-baslik'));
      const kap = el('div', undefined, 'yatay');
      for (const d of dersOrt) {
        const s = el('div', undefined, 'yatay-satir'); const cubuk = el('span', undefined, 'yatay-cubuk'); const i = el('i');
        i.style.setProperty('--w', Math.min(100, d.ort) + '%'); cubuk.append(i);
        s.append(el('span', d.ders, 'yatay-ad'), cubuk, el('b', d.ort.toFixed(0))); kap.append(s);
      }
      kart.append(kap);
    }
    kutu.append(kart);
  }
  const tablo = el('table', '', 'sinav-tablo');
  const bas = el('tr'); bas.append(el('th', 'Sıra'), el('th', 'No'), el('th', 'Öğrenci'), el('th', 'Sınıf'));
  for (const d of v.dersler) bas.append(el('th', `${d.ders} D/Y/B`), el('th', 'Net'), el('th', 'Puan'));
  bas.append(el('th', 'Ortalama'));
  tablo.append(bas);
  const sirali = [...v.ogrenciler].sort((a, b) => (a.sira || 1e9) - (b.sira || 1e9) || a.ad.localeCompare(b.ad, 'tr'));
  for (const g of sirali) {
    const tr = el('tr'); tr.append(el('td', g.sira ? String(g.sira) : '–'));
    const adHucre = el('td');
    if (g.ortalama === null) adHucre.textContent = g.ad;
    else {
      const b = el('button', g.ad, 'baglanti'); b.type = 'button'; b.title = 'Öğrenci karnesi';
      b.addEventListener('click', () => karneAc(g.ogrenciId));
      adHucre.append(b);
    }
    tr.append(el('td', g.okulNo || ''), adHucre, el('td', g.sinif));
    for (const d of v.dersler) {
      const x = g.dersler[d.id];
      tr.append(el('td', x ? `${x.dogru}/${x.yanlis}/${x.bos}` : '–'), el('td', x ? String(x.net) : '–'), el('td', x ? String(x.puan) : '–'));
    }
    tr.append(el('td', g.ortalama === null ? '–' : String(g.ortalama), 'kalin'));
    tablo.append(tr);
  }
  kutu.append(tablo);
}

// Madde analizi: soru başına doğru/yanlış/boş, başarı, zorluk, ayırt edicilik, şık dağılımı
async function analizCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const r = await api('/api/sinav/sonuc?id=' + acik.sinav.id);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  for (const a of r.veri.analiz) {
    kutu.append(el('h3', `${a.ders} · ${a.giren} öğrenci`, 'baslik3'));
    if (!a.giren) { kutu.append(el('p', 'Henüz cevap girilmedi.', 'alt')); continue; }
    const renkB = b => (b < 40 ? '#d64545' : b < 70 ? '#e0a100' : '#2e9e5b');
    const grafikKart = el('div', undefined, 'kutu');
    grafikKart.append(el('h3', 'Soru başarısı (%)', 'mini-baslik'), sutunGrafik(a.sorular.map(q => ({ etiket: String(q.no), deger: q.basari, renk: q.iptal ? '#c9c2b2' : renkB(q.basari) })), 90));
    kutu.append(grafikKart);
    const tablo = el('table', '', 'sinav-tablo');
    const bas = el('tr');
    for (const t of ['Soru', 'Doğru şık', 'Doğru', 'Yanlış', 'Boş', 'Başarı', 'Zorluk', 'Ayırt edicilik', 'A', 'B', 'C', 'D', 'E']) bas.append(el('th', t));
    tablo.append(bas);
    for (const q of a.sorular) {
      const tr = el('tr', undefined, q.iptal ? 'iptal-soru' : '');
      tr.append(el('td', q.no + (q.iptal ? ' (iptal)' : '')), el('td', q.dogruSik), el('td', String(q.dogru)), el('td', String(q.yanlis)), el('td', String(q.bos)));
      const bt = el('td'); const cubuk = el('span', '', 'basari-cubuk'); cubuk.style.setProperty('--oran', q.basari + '%');
      bt.append(cubuk, document.createTextNode(' %' + q.basari)); tr.append(bt);
      tr.append(el('td', q.zorluk || ''), el('td', q.ayirt === null ? '–' : String(q.ayirt)));
      for (const s of 'ABCDE') tr.append(el('td', String(q.dagilim[s]), s === q.dogruSik ? 'dogru-sik' : ''));
      tablo.append(tr);
    }
    kutu.append(tablo);
    if (a.kazanimlar.length) {
      kutu.append(el('h4', 'Kazanım başarısı (sınıf geneli)', 'baslik3'));
      const kt = el('table', '', 'sinav-tablo');
      const kb = el('tr'); for (const t of ['Kazanım', 'Sorular', 'Başarı', 'Ders işlendi mi?']) kb.append(el('th', t));
      kt.append(kb);
      for (const k of a.kazanimlar) {
        const tr = el('tr'); const bt = el('td'); const cubuk = el('span', '', 'basari-cubuk'); cubuk.style.setProperty('--oran', k.oran + '%');
        bt.append(cubuk, document.createTextNode(' %' + k.oran));
        const im = el('td', k.islenmedi === k.giren ? 'Sınıfta işlenmedi' : k.islenmedi ? `${k.islenmedi} öğrenci için işlenmedi` : 'İşlendi');
        if (k.devamsiz) im.append(document.createTextNode(` · ${k.devamsiz} öğrenci derse katılmadı`));
        if (k.islenmedi) im.classList.add('durum-eksik');
        tr.append(el('td', k.kazanim), el('td', k.sorular.join(', ')), bt, im); kt.append(tr);
      }
      kutu.append(kt);
    } else kutu.append(el('p', 'Bu derste soru-kazanım eşlemesi yapılmamış; "Kazanımlar" sekmesinden girin.', 'alt'));
  }
}

const islemeYazi = i => (i ? ({ islenmedi: 'Ders işlenmedi', devamsiz: 'Derse katılmadı', katildi: 'İşlendi, katıldı', bilinmiyor: 'İşlendi' })[i.durum] : '');
const durumSinif = d => ({ Edinildi: 'durum-edinildi', Kısmen: 'durum-kismen', Eksik: 'durum-eksik' })[d];

// Öğrenci karnesi: ders sonuçları + kazanım bazında edinilen/eksik konular
async function karneAc(ogrenciId) {
  const kutu = $('d-icerik');
  const r = await api('/api/sinav/sonuc?kazanim=1&id=' + acik.sinav.id);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  const v = r.veri, g = v.ogrenciler.find(x => x.ogrenciId === ogrenciId);
  kutu.replaceChildren();
  const ust = el('div', '', 'form-satir');
  const geri = el('button', '← Sonuçlar', 'ikincil'); geri.type = 'button';
  geri.addEventListener('click', () => sekmeSec('sonuc'));
  const yaz = el('button', 'Yazdır', 'ikincil'); yaz.type = 'button';
  yaz.addEventListener('click', () => window.print());
  ust.append(geri, yaz);
  kutu.append(ust, el('h3', `${g.ad} · ${g.sinif}`, 'baslik3'),
    el('p', `${v.sinav.ad} · ${tarihYaz(v.sinav.tarih)} · Ortalama puan ${g.ortalama} · Sıra ${g.sira} / ${v.giren}`));
  for (const d of v.dersler) {
    const x = g.dersler[d.id];
    if (!x) continue;
    kutu.append(el('h4', `${d.ders}: ${x.dogru} doğru, ${x.yanlis} yanlış, ${x.bos} boş · net ${x.net} · puan ${x.puan}`, 'baslik3'));
    const liste = g.kazanim[d.id] || [];
    if (!liste.length) { kutu.append(el('p', 'Bu ders için kazanım eşlemesi girilmemiş.', 'alt')); continue; }
    const t = el('table', '', 'sinav-tablo');
    const b = el('tr'); for (const h of ['Kazanım', 'Sorular', 'Doğru', 'Durum', 'Ders']) b.append(el('th', h));
    t.append(b);
    for (const k of liste) {
      const tr = el('tr');
      tr.append(el('td', k.kazanim), el('td', k.sorular.join(', ')), el('td', `${k.dogru}/${k.toplam}`), el('td', k.durum, 'durum ' + durumSinif(k.durum)), el('td', islemeYazi(k.isleme), k.isleme && k.isleme.durum !== 'katildi' && k.isleme.durum !== 'bilinmiyor' ? 'durum-eksik' : ''));
      t.append(tr);
    }
    kutu.append(t);
  }
}

// Kazanımlar: her sorunun ölçtüğü kazanım; aynı dersi veren öğretmenler ortak doldurur
let kazProgramDersleri = null;
async function kazanimCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const r = await api('/api/sinav/kazanimlar?id=' + acik.sinav.id);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  if (!kazProgramDersleri) {
    const p = await api('/api/kazanim?dersler=1');
    kazProgramDersleri = p.ok ? p.veri.dersler : [];
  }
  const seviye = new Set(r.veri.siniflar.map(n => parseInt(n, 10)).filter(Boolean));
  const sinifNo = seviye.size === 1 ? [...seviye][0] : '';
  kutu.append(el('p', 'Her soru için ölçtüğü kazanımı seçin veya yazın. Öğrenci soruyu doğru yaparsa bu kazanımı edinmiş sayılır; karnede ve sınıf analizinde görünür. Aynı dersi veren öğretmenler bu bölümü birlikte doldurabilir.', 'alt'));
  for (const d of r.veri.dersler) {
    kutu.append(el('h3', d.ders + (d.duzenle ? '' : ' (salt okunur)'), 'baslik3'));
    const sel = el('select'); sel.setAttribute('aria-label', 'Kazanım programı dersi');
    const hepsi = el('option', 'Tüm dersler'); hepsi.value = ''; sel.append(hepsi);
    for (const ad of kazProgramDersleri) { const o = el('option', ad); o.value = ad; sel.append(o); }
    if (kazProgramDersleri.includes(d.ders)) sel.value = d.ders;
    // MEB programında bazı dersler belli sınıflardan başlar (örn. Bilişim 5. sınıftan); sınıf süzgeci kapatılabilir
    const sinifSel = el('select'); sinifSel.setAttribute('aria-label', 'Kazanım sınıf düzeyi');
    if (sinifNo) { const o = el('option', `${sinifNo}. sınıf kazanımları`); o.value = sinifNo; sinifSel.append(o); }
    const tum = el('option', 'Tüm sınıflar'); tum.value = ''; sinifSel.append(tum);
    const liste = el('div', '', 'kazanim-liste gizli');
    const listeSatiri = el('tr', '', 'kazanim-satir'); const listeHucre = el('td'); listeHucre.colSpan = 3; listeSatiri.append(listeHucre); listeHucre.append(liste);
    let aktif = null, zaman = null, sayac = 0;
    const ara = async () => {
      if (!aktif) return;
      const benim = ++sayac, girdi = aktif;
      const q = girdi.value.trim();
      girdi.closest('tr').after(listeSatiri);
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
    const tablo = el('table', '', 'sinav-tablo');
    const bas = el('tr'); for (const h of ['Soru', 'Doğru şık', 'Kazanım']) bas.append(el('th', h));
    tablo.append(bas);
    const girdiler = [];
    for (const q of d.sorular) {
      const tr = el('tr', undefined, q.iptal ? 'iptal-soru' : '');
      const hucre = el('td'); const gi = el('input'); gi.value = q.kazanim; gi.maxLength = 300; gi.autocomplete = 'off';
      gi.setAttribute('aria-label', `${d.ders} soru ${q.no} kazanımı`);
      if (!d.duzenle) gi.readOnly = true;
      else {
        gi.addEventListener('input', () => { aktif = gi; clearTimeout(zaman); zaman = setTimeout(ara, 250); });
        gi.addEventListener('focus', () => { aktif = gi; ara(); });
        gi.addEventListener('keydown', e => { if (e.key === 'Escape') { liste.classList.add('gizli'); aktif = null; } });
      }
      hucre.append(gi);
      if (q.kim) hucre.append(el('span', ' Son giren: ' + q.kim, 'alt kucuk-yazi'));
      if (d.duzenle && q.no > 1) {
        const ayni = el('button', '↑ Üsttekiyle aynı', 'ikincil kucuk'); ayni.type = 'button';
        ayni.addEventListener('click', () => { gi.value = girdiler[q.no - 2].value; liste.classList.add('gizli'); });
        hucre.append(ayni);
      }
      tr.append(el('td', q.no + (q.iptal ? ' (iptal)' : '')), el('td', q.dogruSik), hucre);
      girdiler.push(gi);
      tablo.append(tr);
    }
    kutu.append(tablo);
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

// Anahtar düzeltme ve soru iptali: kayıtlı cevaplar korunur, sonuçlar yeniden hesaplanır
function anahtarCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const d = acik;
  kutu.append(el('p', d.sinav.yayin ? 'Bu sınavın sonuçları öğrenci ve velilere yayında.' : 'Sonuçlar henüz yayınlanmadı; öğrenci ve veli görmez.', 'alt'));
  kutu.append(el('p', 'Anahtarı düzeltirseniz tüm sonuçlar yeniden hesaplanır. İptal edilen soru tüm öğrencilere doğru sayılır.', 'alt'));
  const sel = el('select'); sel.setAttribute('aria-label', 'Yanlış katsayısı');
  for (const k of [0, 4, 3, 2]) { const o = el('option', KAT_YAZI(k)); o.value = k; sel.append(o); }
  sel.value = String(d.sinav.yanlisKat);
  kutu.append(el('label', 'Yanlış doğruyu götürür mü?'), sel);
  const alanlar = [];
  for (const x of d.dersler) {
    kutu.append(el('h3', `${x.ders} (${x.soruSayisi} soru)`, 'baslik3'));
    const ank = el('input', undefined, 'cevap-giris'); ank.value = x.anahtar; ank.maxLength = x.soruSayisi; ank.setAttribute('aria-label', 'Cevap anahtarı ' + x.ders);
    const ip = el('input'); ip.value = x.iptal.join(', '); ip.placeholder = 'İptal edilen soru numaraları, örn. 7, 12'; ip.setAttribute('aria-label', 'İptal edilen sorular ' + x.ders);
    kutu.append(el('label', 'Cevap anahtarı'), ank, el('label', 'İptal edilen sorular'), ip);
    alanlar.push([x, ank, ip]);
  }
  const kaydet = el('button', 'Kaydet ve yeniden hesapla'); kaydet.type = 'button';
  kaydet.addEventListener('click', async () => {
    const r = await api('/api/sinav/anahtar', {
      id: d.sinav.id, yanlisKat: Number(sel.value),
      dersler: alanlar.map(([x, ank, ip]) => ({ id: x.id, anahtar: ank.value, iptal: ip.value.split(/[\s,;]+/).filter(Boolean).map(Number) })),
    });
    if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
    await detayAc(d.sinav.id);
    sekmeSec('anahtar');
    mesaj('Anahtar güncellendi, sonuçlar yeniden hesaplandı.', 'tamam');
  });
  const yayin = el('button', d.sinav.yayin ? 'Yayından kaldır' : 'Sonuçları yayınla', 'ikincil'); yayin.type = 'button';
  yayin.addEventListener('click', async () => {
    const yeni = !d.sinav.yayin;
    if (yeni && !confirm('Sonuçlar öğrenci ve velilere görünecek. Yayınlansın mı?')) return;
    const r = await api('/api/sinav/yayin', { id: d.sinav.id, yayin: yeni });
    if (!r.ok) return mesaj(r.veri.hata || 'Güncellenemedi', 'hata');
    await detayAc(d.sinav.id);
    sekmeSec('anahtar');
    mesaj(yeni ? 'Sonuçlar yayınlandı.' : 'Sonuçlar yayından kaldırıldı.', 'tamam');
  });
  const sil = el('button', 'Sınavı sil', 'ikincil tehlike'); sil.type = 'button';
  sil.addEventListener('click', async () => {
    if (!confirm('Bu sınav ve girilen tüm cevaplar silinecek. Emin misiniz?')) return;
    const r = await api('/api/sinav/sil', { id: d.sinav.id });
    if (!r.ok) return mesaj(r.veri.hata || 'Silinemedi', 'hata');
    detayBos(); await listeYukle();
    mesaj('Sınav silindi.', 'tamam');
  });
  const satir = el('div', '', 'dugme-satir');
  satir.append(kaydet, yayin, sil);
  kutu.append(satir);
}

$('yeni-ac').addEventListener('click', yeniAc);
$('s-vazgec').addEventListener('click', () => bolum(''));
$('ders-ekle').addEventListener('click', () => $('s-dersler').append(dersSatiri()));
$('s-kaydet').addEventListener('click', olustur);
$('d-sekmeler').addEventListener('click', e => { const b = e.target.closest('button'); if (b && !b.disabled) sekmeSec(b.dataset.sekme); });
detayBos();
listeYukle();
