const $ = id => document.getElementById(id);
let v = null;          // sunucudan gelen tüm kurulum verisi
let seciliSinifId = null;
const duzen = { dersler: false, ogretmenler: false, siniflar: false, ogrenciler: false };
let dersDuzen = null;  // Adı değiştirilen ders

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

// İşlemi yapar, mesajı gösterir, başarılıysa verileri yeniler.
async function yap(yol, govde, basari) {
  const r = await api(yol, govde);
  if (!r.ok) { mesaj(r.veri.hata || 'Bir hata oluştu', 'hata'); await yukle(); return false; }
  mesaj(basari || 'Kaydedildi.', 'tamam');
  await yukle();
  return true;
}

function doldur(sel, liste, deger, etiket, bos) {
  sel.replaceChildren();
  if (bos !== undefined) sel.appendChild(new Option(bos, ''));
  for (const x of liste) sel.appendChild(new Option(etiket(x), deger(x)));
}

function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

function dugme(metin, tikla, sinif = 'ikincil kucuk') {
  const b = el('button', metin, sinif);
  b.type = 'button';
  b.addEventListener('click', tikla);
  return b;
}

function bosNot(kap, metin) { kap.appendChild(el('p', metin, 'bos-not')); }

// Liste satırı: solda ad ve alt bilgi, sağda işlem (seçici ya da düğme)
function listeSatiri(kap, ad, alt, sag, sinif = '', onde) {
  const s = el('div', undefined, 'kur-satir ' + sinif);
  const sol = el('div', undefined, 'kur-sol');
  sol.append(el('strong', ad));
  if (alt) sol.append(el('small', alt));
  if (onde) s.appendChild(onde);
  s.appendChild(sol);
  if (sag) s.appendChild(sag);
  kap.appendChild(s);
  return s;
}

const ogretmenAd = id => v.ogretmenler.find(o => o.uyelikId === id)?.ad;
const aktifOgretmenler = subeId => v.ogretmenler.filter(o => o.durum === 'aktif' && o.subeId === subeId);
const okulAd = id => v.subeler.find(s => s.id === id)?.ad || '';
const okulEtiket = s => v.kampusler.length > 1 ? `${s.ad} · ${v.kampusler.find(k => k.id === s.kampusId)?.ad || ''}` : s.ad;
const telYaz = t => t && /^\d{10}$/.test(t) ? `0${t.slice(0, 3)} ${t.slice(3, 6)} ${t.slice(6, 8)} ${t.slice(8)}` : (t || '');
const siniflarOkul = subeId => v.siniflar.filter(s => s.subeId === subeId);

async function yukle() {
  const r = await api('/api/yonetim/kurulum');
  v = r.veri;

  cizDersler();
  cizOgretmenler();
  cizOgrenciler();
  cizSiniflar();
}

// ---- Düzenle / Bitti ----
for (const b of document.querySelectorAll('.duzen-dugme')) {
  b.addEventListener('click', () => {
    const bolum = b.dataset.bolum;
    duzen[bolum] = !duzen[bolum];
    b.textContent = duzen[bolum] ? 'Bitti' : 'Düzenle';
    b.classList.toggle('birincil', duzen[bolum]);
    b.classList.toggle('ikincil', !duzen[bolum]);
    $('s-' + bolum).classList.toggle('duzende', duzen[bolum]);
    if (!duzen[bolum]) { if (bolum === 'dersler') dersDuzen = null; }
    mesaj('');
    cizDersler(); cizOgretmenler(); cizOgrenciler(); cizSiniflar();
  });
}

// ---- 2. Dersler ----
function cizDersler() {
  const kutu = $('ders-liste');
  kutu.replaceChildren();
  for (const d of v.dersler) {
    const sinif = v.atamalar.filter(a => a.dersId === d.id).length;
    const ogr = v.ogretmenler.filter(o => o.dersIds.includes(d.id)).length;
    const sistem = d.ad === 'Kulüp';
    if (duzen.dersler && dersDuzen === d.id) {
      const f = el('form', undefined, 'kur-satir kur-ders-duzen');
      const g = el('input'); g.value = d.ad; g.required = true; g.maxLength = 60; g.setAttribute('aria-label', 'Ders adı');
      const sag = el('div', undefined, 'kur-sag');
      const kaydet = el('button', 'Kaydet', 'birincil kucuk'); kaydet.type = 'submit';
      sag.append(kaydet, dugme('Vazgeç', () => { dersDuzen = null; cizDersler(); }));
      f.append(g, sag);
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const r = await api('/api/yonetim/ders-duzenle', { id: d.id, ad: g.value });
        if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
        dersDuzen = null;
        mesaj('Ders adı güncellendi.', 'tamam');
        await yukle();
      });
      kutu.append(f);
      const sil = dugme('Dersi sil', async () => {
        if (!confirm(`${d.ad} dersi silinsin mi?`)) return;
        const r = await api('/api/yonetim/ders-sil', { id: d.id });
        if (!r.ok) return mesaj(r.veri.hata || 'Silinemedi', 'hata');
        dersDuzen = null;
        mesaj('Ders silindi.', 'tamam');
        await yukle();
      }, 'kur-sil');
      kutu.append(sil);
      continue;
    }
    const sag = duzen.dersler && !sistem ? dugme('Düzenle', () => { dersDuzen = d.id; cizDersler(); }) : null;
    listeSatiri(kutu, d.ad, sistem ? 'Sistem dersi' : `${sinif} sınıf · ${ogr} öğretmen`, sag);
  }
  if (!v.dersler.length) bosNot(kutu, 'Henüz ders açılmadı.');
}

$('ders-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (await yap('/api/yonetim/ders-ekle', { ad: $('ders-ad').value }, 'Ders eklendi.')) $('ders-ad').value = '';
});

// ---- 3. Öğretmenler ----
function dersOnayKutulari(kapsayici, secili, adPrefix) {
  kapsayici.replaceChildren();
  for (const d of v.dersler) {
    const lbl = el('label', undefined, 'onay');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = d.id;
    cb.checked = secili.includes(d.id);
    cb.dataset.grup = adPrefix;
    lbl.append(cb, ' ' + d.ad);
    kapsayici.appendChild(lbl);
  }
}
const isaretliDersler = kapsayici =>
  [...kapsayici.querySelectorAll('input:checked')].map(c => Number(c.value));

function cizOgretmenler() {
  doldur($('o-sube'), v.subeler, s => s.id, okulEtiket);
  // Kayıt formunda işaretli seçimleri koru
  const onceki = isaretliDersler($('o-dersler'));
  dersOnayKutulari($('o-dersler'), onceki, 'yeni');

  const tb = $('ogretmen-liste');
  tb.replaceChildren();
  let grup = null;
  for (const o of v.ogretmenler) {
    if (v.subeler.length > 1 && o.sube !== grup) { grup = o.sube; tb.appendChild(el('h3', grup || 'Okulsuz', 'kur-grup')); }
    const ders = o.dersIds.length ? v.dersler.filter(d => o.dersIds.includes(d.id)).map(d => d.ad).join(', ') : 'Ders tanımlı değil';
    const alt = `${o.durum === 'aktif' ? '' : 'Pasif · '}${ders}`;
    if (!duzen.ogretmenler) { listeSatiri(tb, o.ad, alt, null, '', avatarYap(o.ad, o.foto, 'kucuk')); continue; }
    const detay = el('details', undefined, 'kur-kart');
    const ozet = el('summary');
    const sol = el('div', undefined, 'kur-sol');
    sol.append(el('strong', o.ad), el('small', alt));
    ozet.append(avatarYap(o.ad, o.foto, 'kucuk'), sol, el('span', 'Düzenle', 'kur-duzen-yazi'));
    const kutu = el('div', undefined, 'onay-liste');
    dersOnayKutulari(kutu, o.dersIds, 'o' + o.uyelikId);
    const kaydet = dugme('Kaydet', () =>
      yap('/api/yonetim/ogretmen-dersleri', { uyelikId: o.uyelikId, dersIds: isaretliDersler(kutu) }, 'Dersler güncellendi.'),
    'birincil kucuk');
    detay.append(ozet, kutu, kaydet);
    tb.appendChild(detay);
  }
  if (!v.ogretmenler.length) bosNot(tb, 'Henüz öğretmen kaydı yok.');
}

$('ogretmen-form').addEventListener('submit', async e => {
  e.preventDefault();
  const ok = await yap('/api/yonetim/ogretmen-kayit', {
    ad: $('o-ad').value, kimlik: $('o-kimlik').value, telefon: $('o-tel').value,
    subeId: $('o-sube').value, dersIds: isaretliDersler($('o-dersler')),
  }, 'Öğretmen kaydedildi.');
  if (ok) $('ogretmen-form').reset();
});

// ---- 4. Sınıflar ----
function sinifOgretmenSecenekleri() {
  const subeId = Number($('s-sube').value);
  doldur($('s-ogretmen'), aktifOgretmenler(subeId), o => o.uyelikId, o => o.ad, 'Sonra belirlenecek');
}

function cizSiniflar() {
  doldur($('s-sube'), v.subeler, s => s.id, okulEtiket);
  doldur($('s-kademe'), v.kademeler, k => k, k => k);
  sinifOgretmenSecenekleri();

  const tb = $('sinif-liste');
  tb.replaceChildren();
  let grup = null;
  for (const s of v.siniflar) {
    const baslik = v.subeler.length > 1 ? `${s.sube} · ${s.kademe}` : s.kademe;
    if (baslik !== grup) { grup = baslik; tb.appendChild(el('h3', baslik, 'kur-grup')); }
    const satir = listeSatiri(tb, s.ad, `${ogretmenAd(s.sinifOgretmenUyelikId) || 'Sınıf öğretmeni yok'} · ${s.ogrenciSayisi} öğrenci`,
      el('span', '›', 'kur-ok'), 'kur-sinif' + (s.id === seciliSinifId ? ' secili' : ''));
    satir.tabIndex = 0;
    satir.setAttribute('role', 'button');
    const ac = () => { seciliSinifId = s.id; cizSiniflar(); $('sinif-detay').scrollIntoView({ behavior: 'smooth' }); };
    satir.addEventListener('click', ac);
    satir.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ac(); } });
  }
  if (!v.siniflar.length) bosNot(tb, 'Henüz sınıf açılmadı.');
  cizDetay();
}

$('s-sube').addEventListener('change', sinifOgretmenSecenekleri);

$('sinif-form').addEventListener('submit', async e => {
  e.preventDefault();
  const r = await api('/api/yonetim/sinif-ekle', { subeId: $('s-sube').value, kademe: $('s-kademe').value, ad: $('s-ad').value });
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  if ($('s-ogretmen').value) {
    await api('/api/yonetim/sinif-ogretmeni', { sinifId: r.veri.id, uyelikId: $('s-ogretmen').value });
  }
  seciliSinifId = r.veri.id;
  $('s-ad').value = '';
  mesaj('Sınıf açıldı. Aşağıdan dersleri ve öğrencileri ekleyin.', 'tamam');
  await yukle();
});

// Sınıfın salt okunur görünümü
function sinifOku(sinif) {
  const k = $('d-oku');
  k.replaceChildren();
  const bilgi = el('div', undefined, 'kur-bilgi');
  const r = el('div');
  r.append(el('span', 'Sınıf öğretmeni'), el('b', ogretmenAd(sinif.sinifOgretmenUyelikId) || 'Belirlenmedi'));
  bilgi.append(r);
  k.append(bilgi, el('a', 'Ders programını gör →', 'kur-baglanti'));
  k.lastChild.href = '/ders-programi';
  const atamalar = v.atamalar.filter(a => a.sinifId === sinif.id);
  k.append(el('h3', `Dersler (${atamalar.length})`, 'baslik3'));
  const dl = el('div', undefined, 'kur-liste');
  for (const a of atamalar) listeSatiri(dl, a.ders, `${ogretmenAd(a.ogretmenUyelikId) || 'Öğretmen atanmadı'} · haftada ${a.haftalikSaat} saat`);
  if (!atamalar.length) bosNot(dl, 'Bu sınıfa henüz ders eklenmedi.');
  k.append(dl);
  const ogrenciler = v.ogrenciler.filter(o => o.sinifId === sinif.id);
  k.append(el('h3', `Öğrenciler (${ogrenciler.length})`, 'baslik3'));
  const ol = el('div', undefined, 'kur-liste');
  for (const o of ogrenciler) listeSatiri(ol, o.ad, o.okulNo ? 'No ' + o.okulNo : '', null, '', avatarYap(o.ad, o.foto, 'kucuk'));
  if (!ogrenciler.length) bosNot(ol, 'Bu sınıfta henüz öğrenci yok.');
  k.append(ol);
}

function cizDetay() {
  const sinif = v.siniflar.find(s => s.id === seciliSinifId);
  $('detay-icerik').classList.toggle('gizli', !sinif);
  $('detay-bos').classList.toggle('gizli', !!sinif);
  if (!sinif) { $('detay-baslik').textContent = 'Sınıf detayı'; return; }
  $('detay-baslik').textContent = `${sinif.sube} · ${sinif.kademe} · ${sinif.ad}`;
  sinifOku(sinif);

  // Sınıf öğretmeni
  const ogr = aktifOgretmenler(sinif.subeId);
  const so = $('d-sinif-ogretmen');
  doldur(so, ogr, o => o.uyelikId, o => o.ad, 'Belirlenmedi');
  so.value = sinif.sinifOgretmenUyelikId ? String(sinif.sinifOgretmenUyelikId) : '';
  so.onchange = () => yap('/api/yonetim/sinif-ogretmeni',
    { sinifId: sinif.id, uyelikId: so.value === '' ? null : Number(so.value) }, 'Sınıf öğretmeni güncellendi.');

  // Sınıfın dersleri ve ders öğretmenleri
  const tb = $('d-ders-liste');
  tb.replaceChildren();
  const atamalar = v.atamalar.filter(a => a.sinifId === sinif.id);
  for (const a of atamalar) {
    const uygun = ogr.filter(o => o.dersIds.includes(a.dersId));
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', a.ders + ' öğretmeni');
    doldur(sel, uygun, o => o.uyelikId, o => o.ad, uygun.length ? 'Öğretmen seçin' : 'Bu dersi verebilen öğretmen yok');
    sel.value = a.ogretmenUyelikId ? String(a.ogretmenUyelikId) : '';
    sel.addEventListener('change', async () => {
      if (sel.value === '' && a.kullanilan > 0 &&
          !confirm(`Öğretmen kaldırılırsa dersin programdaki ${a.kullanilan} saati boşalır. Devam edilsin mi?`)) {
        sel.value = String(a.ogretmenUyelikId); return;
      }
      yap('/api/yonetim/atama-ogretmen', { atamaId: a.id, ogretmenUyelikId: sel.value === '' ? null : Number(sel.value) },
        'Dersin öğretmeni güncellendi.');
    });
    const kaldir = dugme('Kaldır', () => {
      if (a.kullanilan > 0 && !confirm(`Bu dersin programdaki ${a.kullanilan} saati de silinecek. Devam edilsin mi?`)) return;
      yap('/api/yonetim/atama-sil', { atamaId: a.id }, 'Ders sınıftan kaldırıldı.');
    });
    const sag = el('div', undefined, 'kur-sag');
    sag.append(sel, kaldir);
    listeSatiri(tb, a.ders, `Haftada ${a.haftalikSaat} saat · programda ${a.kullanilan}/${a.haftalikSaat}`, sag, 'kur-ders');
  }
  if (!atamalar.length) bosNot(tb, 'Bu sınıfa henüz ders eklenmedi.');

  const eklenmemis = v.dersler.filter(d => !atamalar.some(a => a.dersId === d.id));
  doldur($('d-ders'), eklenmemis, d => d.id, d => d.ad);

  // Sınıfın öğrencileri
  const ob = $('d-ogrenci-liste');
  ob.replaceChildren();
  const ogrenciler = v.ogrenciler.filter(o => o.sinifId === sinif.id);
  for (const o of ogrenciler) {
    const cikar = dugme('×', () =>
      yap('/api/yonetim/ogrenci-sinif', { ogrenciUyelikId: o.uyelikId, sinifId: null }, 'Öğrenci sınıftan çıkarıldı.'), 'kur-cikar');
    cikar.title = 'Sınıftan çıkar';
    cikar.setAttribute('aria-label', o.ad + ' sınıftan çıkar');
    listeSatiri(ob, o.ad, o.okulNo ? 'No ' + o.okulNo : '', cikar, 'kur-ogr');
  }
  if (!ogrenciler.length) bosNot(ob, 'Bu sınıfta henüz öğrenci yok.');
  const adaylar = v.ogrenciler.filter(o => o.durum === 'aktif' && !o.sinifId && o.subeId === sinif.subeId);
  doldur($('d-ogrenci'), adaylar, o => o.uyelikId, o => o.ad, adaylar.length ? 'Öğrenci seçin' : 'Sınıfsız öğrenci yok');
}

$('d-sil').addEventListener('click', async () => {
  const sinif = v.siniflar.find(s => s.id === seciliSinifId);
  if (!sinif || !confirm(`${sinif.ad} sınıfı silinsin mi? Derslerin programdaki yerleşimi de silinir.`)) return;
  if (await yap('/api/yonetim/sinif-sil', { sinifId: sinif.id }, 'Sınıf silindi.')) seciliSinifId = null;
  cizSiniflar();
});

$('d-ders-form').addEventListener('submit', async e => {
  e.preventDefault();
  await yap('/api/yonetim/atama-ekle', { sinifId: seciliSinifId, dersId: $('d-ders').value, haftalikSaat: $('d-saat').value },
    'Ders sınıfa eklendi. Şimdi dersin öğretmenini seçin.');
});

$('d-ogrenci-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!$('d-ogrenci').value) return;
  await yap('/api/yonetim/ogrenci-sinif', { ogrenciUyelikId: Number($('d-ogrenci').value), sinifId: seciliSinifId },
    'Öğrenci sınıfa eklendi.');
});

// ---- 5. Öğrenciler: liste (yazdırılabilir) ----
function veliHucresi(liste) {
  const td = el('td');
  if (!liste.length) { td.append(el('span', '—', 'mad-ince')); return td; }
  for (const x of liste) {
    const k = el('div', undefined, 'kur-veli');
    k.append(el('span', x.ad), el('small', telYaz(x.telefon)));
    td.append(k);
  }
  return td;
}

function cizOgrenciler() {

  // Sınıf süzgeci
  const filtre = $('ogrenci-filtre');
  const onceki = filtre.value;
  filtre.replaceChildren(new Option('Tüm sınıflar', ''), new Option('Sınıfsız', 'yok'));
  for (const s of v.siniflar) filtre.appendChild(new Option(v.subeler.length > 1 ? `${s.sube} · ${s.ad}` : s.ad, String(s.id)));
  filtre.value = [...filtre.options].some(o => o.value === onceki) ? onceki : '';

  const ara = $('ogrenci-ara').value.trim().toLocaleLowerCase('tr');
  const bol = ad => { const p = ad.trim().split(/\s+/); return p.length > 1 ? [p.slice(0, -1).join(' '), p.at(-1)] : [ad, '']; };
  const gorunen = v.ogrenciler
    .filter(o => !ara || o.ad.toLocaleLowerCase('tr').includes(ara) || String(o.okulNo || '').includes(ara))
    .filter(o => !filtre.value || (filtre.value === 'yok' ? !o.sinifId : String(o.sinifId) === filtre.value))
    .map(o => ({ o, ad: bol(o.ad)[0], soyad: bol(o.ad)[1] }))
    .sort((a, b) => a.soyad.localeCompare(b.soyad, 'tr') || a.ad.localeCompare(b.ad, 'tr'));

  const tb = $('ogrenci-liste');
  tb.replaceChildren();
  for (const { o, ad, soyad } of gorunen) {
    const tr = el('tr');
    let sinifHucre;
    if (duzen.ogrenciler) {
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', o.ad + ' sınıfı');
      doldur(sel, siniflarOkul(o.subeId), s => s.id, s => `${s.kademe} · ${s.ad}`, 'Sınıfsız');
      sel.value = o.sinifId ? String(o.sinifId) : '';
      sel.disabled = o.durum !== 'aktif';
      sel.addEventListener('change', () =>
        yap('/api/yonetim/ogrenci-sinif', { ogrenciUyelikId: o.uyelikId, sinifId: sel.value === '' ? null : Number(sel.value) },
          'Öğrencinin sınıfı güncellendi.'));
      sinifHucre = el('td'); sinifHucre.append(sel);
    } else {
      sinifHucre = el('td', v.siniflar.find(s => s.id === o.sinifId)?.ad || '—');
    }
    const adHucre = el('td'); const adLink = el('a', ad); adLink.href = '/ogrenci-dosyasi?id=' + o.uyelikId; adHucre.append(adLink);
    if (o.durum !== 'aktif') adHucre.append(el('small', ' · pasif', 'mad-ince'));
    tr.append(adHucre, el('td', soyad), el('td', o.okulNo || '—'), sinifHucre, veliHucresi(o.veliler.slice(0, 1)), veliHucresi(o.veliler.slice(1)));
    tb.append(tr);
  }
  if (!gorunen.length) { const tr = el('tr'), td = el('td', 'Gösterilecek öğrenci yok.', 'bos-hucre'); td.colSpan = 6; tr.append(td); tb.append(tr); }
  $('ogrenci-sayi').textContent = `${gorunen.length} öğrenci`;
  $('yazdir-baslik').textContent = `Öğrenci listesi${filtre.value ? ' — ' + filtre.options[filtre.selectedIndex].text : ''} · ${new Date().toLocaleDateString('tr-TR')}`;
}

$('ogrenci-ara').addEventListener('input', cizOgrenciler);
$('ogrenci-filtre').addEventListener('change', cizOgrenciler);
$('yazdir').addEventListener('click', () => window.print());

// ---- Sekmeler ----
document.querySelectorAll('.sekmeler button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.sekmeler button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    for (const id of ['dersler', 'ogretmenler', 'siniflar', 'ogrenciler']) {
      $('s-' + id).classList.toggle('gizli', id !== b.dataset.sekme);
    }
    mesaj('');
    yukle();
  });
});

yukle();
