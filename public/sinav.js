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
    const rozetler = el('span', undefined, 'sl-rozetler');
    const rozet = (yazi, tur = '') => rozetler.append(el('span', yazi, 'sl-rozet ' + tur));
    if (s.sahip) {
      rozet(s.yayin ? 'Yayında' : 'Yayınlanmadı', s.yayin ? 'acik' : '');
      rozet(`${s.okunan} cevap`);
    } else rozet(`Paylaşılan · ${s.sahipAd}`);
    rozet(`Kazanım ${s.kazanimli}/${s.soru}`, s.kazanimli === s.soru ? 'tam' : 'eksik');
    kart.append(
      el('strong', s.ad),
      el('span', `${tarihYaz(s.tarih)} · ${s.siniflar.join(', ')} · ${s.dersler.join(', ')}`, 'alt'),
      rozetler,
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
  // Sınav sahibi olmayan öğretmen cevap ve anahtarı görmez; sonuçta yalnızca kendi dersinin ayrıntısı gelir
  const gorunur = ad => acik.sahip || ad === 'sonuc' || (acik.dersler.length > 0 && (ad === 'analiz' || ad === 'kazanim'));
  for (const b of $('d-sekmeler').querySelectorAll('button')) { b.disabled = false; b.classList.toggle('gizli', !gorunur(b.dataset.sekme)); }
  for (const k of document.querySelectorAll('.sinav-kart')) k.classList.remove('secili');
  sekmeSec(acik.sahip ? (sekme === 'kazanim' ? 'kazanim' : 'cevap') : (gorunur(sekme) ? sekme : 'sonuc'));
  $('detay-bolum').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function sekmeSec(ad) {
  sekme = ad;
  document.body.classList.remove('karne-acik');
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

// Cevaplar: öğrenci başına kart; kartta her dersin cevap dizisi
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

  const liste = el('div', undefined, 'sc-liste');
  const girisler = [];
  // Hiç cevap girilmemiş sınavda kartlar açık gelir; doldurulmuş sınavda kapalı
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

// ---------- Sonuçlar ----------
const bandRenk = p => (p < 40 ? '#d64545' : p < 70 ? '#e0a100' : '#2e9e5b');
const ortalamaAl = a => (a.length ? a.reduce((t, x) => t + x, 0) / a.length : null);
const ARALIKLAR = ['0-20', '20-40', '40-60', '60-80', '80-100'];
const ARALIK_RENK = ['#d64545', '#e0803a', '#e0a100', '#7bb661', '#2e9e5b'];

// Sonuçlar: üstte sınıf özeti, altta öğrenci sırası (her satırda ders çubukları); ayrıntı için öğrencinin raporuna geçilir.
// Öğretmen yalnızca kendi dersinin ayrıntısını görür; sunucu diğer branşları göndermez.
async function sonucCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const r = await api('/api/sinav/sonuc?id=' + acik.sinav.id);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  const v = r.veri;
  const girenler = v.ogrenciler.filter(g => g.ortalama !== null);
  const puanlar = girenler.map(g => g.ortalama);
  const genelOrt = v.genel ? v.genel.ortalama : ortalamaAl(puanlar);
  const katilim = v.genel ? v.genel : { giren: v.giren, beklenen: v.beklenen };

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
    if (dersOrt.length) {
      ozet.append(el('h3', 'Ders ortalamaları', 'sr-alt'));
      const kap = el('div', undefined, 'yatay');
      for (const d of dersOrt) {
        const s = el('div', undefined, 'yatay-satir'); const cubuk = el('span', undefined, 'yatay-cubuk'); const i = el('i');
        i.style.setProperty('--w', Math.min(100, d.ort) + '%'); i.style.setProperty('--r', bandRenk(d.ort)); cubuk.append(i);
        s.append(el('span', d.ders, 'yatay-ad'), cubuk, el('b', d.ort.toFixed(0))); kap.append(s);
      }
      ozet.append(kap);
    }
  }
  kutu.append(ozet);
  if (!v.ogrenciler.length || !v.dersler.length) return;

  const baslik = el('div', undefined, 'sr-liste-ust');
  baslik.append(el('h3', 'Öğrenci sırası'), el('small', `Çubuklar: ${v.dersler.map(d => d.ders).join(' · ')}`));
  kutu.append(baslik, el('p', `${KAT_YAZI(v.sinav.yanlisKat)}; puan = net / soru sayısı × 100. Öğrenciye dokunun: raporu açılır, yazdırılır.`, 'mad-ince'));
  const liste = el('div', undefined, 'sr-liste');
  const sirali = [...v.ogrenciler].sort((a, b) => (a.sira || 1e9) - (b.sira || 1e9) || a.ad.localeCompare(b.ad, 'tr'));
  for (const g of sirali) {
    const girdi = g.ortalama !== null;
    const satir = el(girdi ? 'button' : 'div', undefined, 'sr-satir' + (girdi ? '' : ' yok'));
    if (girdi) {
      satir.type = 'button';
      satir.setAttribute('aria-label', `${g.ad} raporu`);
      satir.addEventListener('click', () => karneAc(g.ogrenciId));
    }
    const kim = el('span', undefined, 'sr-kim');
    kim.append(el('strong', g.ad), el('small', `${g.okulNo ? 'No ' + g.okulNo + ' · ' : ''}${g.sinif}`));
    satir.append(el('span', g.sira ? String(g.sira) : '–', 'sr-sira'), kim);
    if (girdi) {
      const mini = el('span', undefined, 'sr-mini');
      for (const d of v.dersler) {
        const x = g.dersler[d.id];
        const c = el('i', undefined, x ? '' : 'yok');
        if (x) { c.style.setProperty('--h', Math.max(8, Math.min(100, Number(x.puan))) + '%'); c.style.setProperty('--r', bandRenk(Number(x.puan))); }
        c.title = `${d.ders}: ${x ? x.puan : '–'}`;
        mini.append(c);
      }
      const puan = el('span', String(g.ortalama), 'sr-puan');
      puan.style.setProperty('--r', bandRenk(g.ortalama));
      satir.append(mini, puan);
    } else satir.append(el('span', 'Girmedi', 'sr-girmedi'));
    liste.append(satir);
  }
  kutu.append(liste);
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
    for (const q of a.sorular) {
      const kart = el('div', undefined, 'mad-kart' + (q.iptal ? ' iptal' : ''));
      const no = el('span', String(q.no), 'mad-no'); no.style.setProperty('--c', q.iptal ? '#c9c2b2' : renkB(q.basari));
      const orta = el('div', undefined, 'mad-orta');
      const ust = el('div', undefined, 'mad-ust');
      ust.append(el('strong', q.iptal ? 'İptal edildi' : `Doğru şık ${q.dogruSik}`));
      if (q.zorluk) ust.append(el('span', q.zorluk, 'mad-etiket'));
      if (q.ayirt !== null) ust.append(el('span', `ayırt edicilik ${q.ayirt}`, 'mad-ince'));
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
    } else kutu.append(el('p', 'Bu derste soru-kazanım eşlemesi yapılmamış; "Kazanımlar" sekmesinden girin.', 'alt'));
  }
}

const islemeYazi = i => (i ? ({ islenmedi: 'Ders işlenmedi', devamsiz: 'Derse katılmadı', katildi: 'İşlendi, katıldı', bilinmiyor: 'İşlendi' })[i.durum] : '');
const DURUM_RENK = { Edinildi: '#1a7f37', Kısmen: '#b45309', Eksik: '#c62828' };

// Öğrenci raporu: yalnızca bu öğrenci ve bu sınav. Varsayılan çıktı öğrenci bilgisi, özet ve ders sonuçlarıdır;
// sınıf ortalaması ve kazanım ayrıntıları seçilirse eklenir. Seçim paneli ve sayfadaki diğer her şey yazdırmada gizlenir.
async function karneAc(ogrenciId) {
  const kutu = $('d-icerik');
  const r = await api('/api/sinav/sonuc?kazanim=1&id=' + acik.sinav.id);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  const v = r.veri, g = v.ogrenciler.find(x => x.ogrenciId === ogrenciId);
  if (!g) return mesaj('Öğrenci bulunamadı', 'hata');
  kutu.replaceChildren();
  document.body.classList.add('karne-acik');

  const secim = el('section', undefined, 'gz-secim gz-ekran');
  const baslikSatir = el('div', undefined, 'rp-arac-ust');
  const geri = el('button', '← Sonuçlar', 'ikincil kucuk'); geri.type = 'button';
  geri.addEventListener('click', () => sekmeSec('sonuc'));
  baslikSatir.append(geri, el('h3', 'Rapora eklenecekler'));
  secim.append(baslikSatir);
  if (!v.sinav.yayin) secim.append(el('p', 'Bu sınavın sonuçları henüz yayınlanmadı; öğrenci ve veli görmez.', 'kl-not'));
  const rapor = el('article', undefined, 'rp-rapor');
  const secenek = (ad, alt, acik0) => {
    const l = el('label', undefined, 'gz-secim-satir');
    const cb = Object.assign(el('input'), { type: 'checkbox', checked: acik0 });
    const yazi = el('span', undefined, 'gz-secim-yazi');
    yazi.append(el('b', ad), el('small', alt));
    l.append(cb, yazi);
    cb.addEventListener('change', () => ciz());
    secim.append(l);
    return cb;
  };
  const sinifCb = secenek('Sınıf ortalaması', 'Her dersin yanında sınıfın ortalaması', false);
  const eksikCb = secenek('Eksik kazanımlar', 'Edinilemeyen ve kısmen edinilen konular', false);
  const edinCb = secenek('Edinilen kazanımlar', 'Başarıyla edinilen konular', false);
  const arac = el('div', undefined, 'gz-secim-arac');
  const yaz = el('button', 'Yazdır', 'birincil kucuk'); yaz.type = 'button';
  yaz.addEventListener('click', () => window.print());
  arac.append(yaz);
  secim.append(arac);

  const ciz = () => {
    rapor.replaceChildren();
    const kurum = el('div', undefined, 'rp-kurum');
    kurum.append(el('b', 'Akant Koleji'), el('span', 'Sınav sonuç raporu'));
    const kim = el('div', undefined, 'rp-kim');
    kim.append(el('h2', g.ad), el('p', `${g.sinif}${g.okulNo ? ' · No ' + g.okulNo : ''}`), el('small', `${v.sinav.ad} · ${tarihYaz(v.sinav.tarih)}`));
    rapor.append(kurum, kim);

    const ozet = el('div', undefined, 'rp-ozet');
    const hucre = (say, ad) => { const h = el('div'); h.append(el('strong', say), el('span', ad)); ozet.append(h); };
    hucre(String(g.ortalama), 'Ortalama puan');
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
      let alt = `${x.dogru} doğru · ${x.yanlis} yanlış · ${x.bos} boş · net ${x.net}`;
      if (sinifCb.checked) {
        const p = ortalamaAl(v.ogrenciler.map(o => o.dersler[d.id]).filter(Boolean).map(o => Number(o.puan)));
        if (p !== null) alt += ` · sınıf ort. ${p.toFixed(1)}`;
      }
      blok.append(el('p', alt, 'mad-ince'));
      rapor.append(blok);
    }

    if (eksikCb.checked || edinCb.checked) {
      rapor.append(el('h3', 'Kazanım ayrıntısı', 'rp-baslik'));
      let var1 = false;
      for (const d of v.dersler) {
        const liste = (g.kazanim[d.id] || []).filter(k => (k.durum === 'Edinildi' ? edinCb.checked : eksikCb.checked));
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
      if (!var1) rapor.append(el('p', 'Seçilen türde kazanım yok ya da bu sınav için kazanım eşlemesi girilmemiş.', 'kl-not'));
    }
  };
  kutu.append(secim, rapor);
  ciz();
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

// Anahtar düzeltme ve soru iptali: kayıtlı cevaplar korunur, sonuçlar yeniden hesaplanır
function anahtarCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const d = acik;
  const yd = el('div', undefined, 'ak-yayin' + (d.sinav.yayin ? ' acik' : ''));
  yd.append(el('span', undefined, 'ak-nokta'), el('span', d.sinav.yayin ? 'Sonuçlar öğrenci ve velilere yayında.' : 'Sonuçlar henüz yayınlanmadı; öğrenci ve veli görmez.'));
  kutu.append(yd, el('p', 'Anahtarı düzeltirseniz tüm sonuçlar yeniden hesaplanır. İptal edilen soru tüm öğrencilere doğru sayılır.', 'alt'));
  const sel = el('select'); sel.setAttribute('aria-label', 'Yanlış katsayısı');
  for (const k of [0, 4, 3, 2]) { const o = el('option', KAT_YAZI(k)); o.value = k; sel.append(o); }
  sel.value = String(d.sinav.yanlisKat);
  const puanKart = el('div', undefined, 'ak-kart');
  puanKart.append(el('label', 'Yanlış doğruyu götürür mü?'), sel);
  kutu.append(puanKart);
  const alanlar = [];
  for (const x of d.dersler) {
    const kart = el('div', undefined, 'ak-kart');
    const ust = el('div', undefined, 'ak-ust');
    ust.append(el('strong', x.ders), el('span', `${x.soruSayisi} soru`, 'mad-ince'));
    const ank = el('input', undefined, 'cevap-giris'); ank.value = x.anahtar; ank.maxLength = x.soruSayisi; ank.setAttribute('aria-label', 'Cevap anahtarı ' + x.ders);
    const ip = el('input'); ip.value = x.iptal.join(', '); ip.placeholder = 'İptal edilen soru numaraları, örn. 7, 12'; ip.setAttribute('aria-label', 'İptal edilen sorular ' + x.ders);
    kart.append(ust, el('label', 'Cevap anahtarı'), ank, el('label', 'İptal edilen sorular'), ip);
    kutu.append(kart);
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
