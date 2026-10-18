const $ = id => document.getElementById(id);
let v = null;          // sunucudan gelen tüm kurulum verisi
let seciliSinifId = null;

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

// Boş kalan tablo ve listelerde yer tutucu yazı göster
const BOS_METIN = {
  'ogretmen-liste': 'Henüz öğretmen kaydı yok.', 'ogrenci-liste': 'Henüz öğrenci kaydı yok.', 'sinif-liste': 'Henüz sınıf açılmadı.',
  'd-ders-liste': 'Bu sınıfa henüz ders eklenmedi.', 'd-ogrenci-liste': 'Bu sınıfta henüz öğrenci yok.',
};
function bosYazilar() {
  for (const [id, metin] of Object.entries(BOS_METIN)) {
    const tb = $(id);
    if (!tb || tb.children.length) continue;
    const tr = document.createElement('tr');
    const td = el('td', metin, 'bos-hucre');
    td.colSpan = 8;
    tr.appendChild(td); tb.appendChild(tr);
  }
  const dl = $('ders-liste');
  if (!dl.children.length) dl.appendChild(el('p', 'Henüz ders açılmadı.', 'bos-not'));
}

function satir(tbody, ...hucreler) {
  const tr = document.createElement('tr');
  for (const h of hucreler) {
    const td = document.createElement('td');
    if (h instanceof Node) td.appendChild(h); else td.textContent = h ?? '';
    tr.appendChild(td);
  }
  tbody.appendChild(tr);
}

function dugme(metin, tikla, sinif = 'ikincil kucuk') {
  const b = el('button', metin, sinif);
  b.type = 'button';
  b.addEventListener('click', tikla);
  return b;
}

const ogretmenAd = id => v.ogretmenler.find(o => o.uyelikId === id)?.ad;
const aktifOgretmenler = subeId => v.ogretmenler.filter(o => o.durum === 'aktif' && o.subeId === subeId);

async function yukle() {
  const r = await api('/api/yonetim/kurulum');
  v = r.veri;
  cizDersler();
  cizOgretmenler();
  cizOgrenciler();
  cizSiniflar();
}

// ---- 1. Dersler ----
function cizDersler() {
  const kutu = $('ders-liste');
  kutu.replaceChildren();
  for (const d of v.dersler) kutu.appendChild(el('span', d.ad, 'cip'));
}

$('ders-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (await yap('/api/yonetim/ders-ekle', { ad: $('ders-ad').value }, 'Ders açıldı.')) $('ders-ad').value = '';
});

// ---- 2. Öğretmenler ----
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
  doldur($('o-sube'), v.subeler, s => s.id, s => s.ad);
  // Kayıt formunda işaretli seçimleri koru
  const onceki = isaretliDersler($('o-dersler'));
  dersOnayKutulari($('o-dersler'), onceki, 'yeni');

  const tb = $('ogretmen-liste');
  tb.replaceChildren();
  for (const o of v.ogretmenler) {
    const detay = document.createElement('details');
    const ozet = el('summary', o.dersIds.length
      ? v.dersler.filter(d => o.dersIds.includes(d.id)).map(d => d.ad).join(', ')
      : 'Ders tanımlı değil');
    const kutu = el('div', undefined, 'onay-liste');
    dersOnayKutulari(kutu, o.dersIds, 'o' + o.uyelikId);
    const kaydet = dugme('Kaydet', () =>
      yap('/api/yonetim/ogretmen-dersleri', { uyelikId: o.uyelikId, dersIds: isaretliDersler(kutu) }, 'Dersler güncellendi.'),
    'birincil kucuk');
    detay.append(ozet, kutu, kaydet);
    satir(tb, o.ad, o.sube, o.durum === 'aktif' ? 'Aktif' : 'Pasif', detay);
  }
}

$('ogretmen-form').addEventListener('submit', async e => {
  e.preventDefault();
  const ok = await yap('/api/yonetim/ogretmen-kayit', {
    ad: $('o-ad').value, kimlik: $('o-kimlik').value, telefon: $('o-tel').value,
    subeId: $('o-sube').value, dersIds: isaretliDersler($('o-dersler')),
  }, 'Öğretmen kaydedildi.');
  if (ok) $('ogretmen-form').reset();
});

// ---- 3. Öğrenciler ----
function ogrenciSinifSecenekleri() {
  const subeId = Number($('g-sube').value);
  doldur($('g-sinif'), v.siniflar.filter(s => s.subeId === subeId), s => s.id, s => `${s.kademe} · ${s.ad}`, 'Sınıfsız');
}

function cizOgrenciler() {
  doldur($('g-sube'), v.subeler, s => s.id, s => s.ad);
  ogrenciSinifSecenekleri();

  const tb = $('ogrenci-liste');
  tb.replaceChildren();
  for (const o of v.ogrenciler) {
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', o.ad + ' sınıfı');
    doldur(sel, v.siniflar.filter(s => s.subeId === o.subeId), s => s.id, s => `${s.kademe} · ${s.ad}`, 'Sınıfsız');
    sel.value = o.sinifId ? String(o.sinifId) : '';
    sel.disabled = o.durum !== 'aktif';
    sel.addEventListener('change', () =>
      yap('/api/yonetim/ogrenci-sinif', { ogrenciUyelikId: o.uyelikId, sinifId: sel.value === '' ? null : Number(sel.value) },
        'Öğrencinin sınıfı güncellendi.'));
    satir(tb, o.okulNo || '', o.ad, o.sube, o.durum === 'aktif' ? 'Aktif' : 'Pasif', sel);
  }
}

$('g-sube').addEventListener('change', ogrenciSinifSecenekleri);

$('ogrenci-form').addEventListener('submit', async e => {
  e.preventDefault();
  const ok = await yap('/api/yonetim/ogrenci-kayit', {
    ad: $('g-ad').value, kimlik: $('g-kimlik').value, telefon: $('g-tel').value, okulNo: $('g-no').value,
    subeId: $('g-sube').value, sinifId: $('g-sinif').value === '' ? null : $('g-sinif').value,
  }, 'Öğrenci kaydedildi.');
  if (ok) $('ogrenci-form').reset();
});

// ---- 4. Sınıflar ----
function sinifOgretmenSecenekleri() {
  const subeId = Number($('s-sube').value);
  doldur($('s-ogretmen'), aktifOgretmenler(subeId), o => o.uyelikId, o => o.ad, 'Sonra belirlenecek');
}

function cizSiniflar() {
  doldur($('s-sube'), v.subeler, s => s.id, s => s.ad);
  doldur($('s-kademe'), v.kademeler, k => k, k => k);
  sinifOgretmenSecenekleri();

  const tb = $('sinif-liste');
  tb.replaceChildren();
  for (const s of v.siniflar) {
    satir(tb, s.sube, s.kademe, s.ad, ogretmenAd(s.sinifOgretmenUyelikId) || '—', String(s.ogrenciSayisi),
      dugme('Yönet', () => { seciliSinifId = s.id; cizDetay(); $('sinif-detay').scrollIntoView({ behavior: 'smooth' }); }));
  }
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

function cizDetay() {
  const sinif = v.siniflar.find(s => s.id === seciliSinifId);
  $('detay-icerik').classList.toggle('gizli', !sinif);
  $('detay-bos').classList.toggle('gizli', !!sinif);
  if (!sinif) { $('detay-baslik').textContent = 'Sınıf detayı'; bosYazilar(); return; }
  $('detay-baslik').textContent = `${sinif.sube} · ${sinif.kademe} · ${sinif.ad}`;

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
    satir(tb, a.ders, String(a.haftalikSaat), sel, `${a.kullanilan} / ${a.haftalikSaat}`, kaldir);
  }
  if (!atamalar.length) satir(tb, 'Bu sınıfa henüz ders eklenmedi.', '', '', '', '');

  const eklenmemis = v.dersler.filter(d => !atamalar.some(a => a.dersId === d.id));
  doldur($('d-ders'), eklenmemis, d => d.id, d => d.ad);

  // Sınıfın öğrencileri
  const ob = $('d-ogrenci-liste');
  ob.replaceChildren();
  const ogrenciler = v.ogrenciler.filter(o => o.sinifId === sinif.id);
  for (const o of ogrenciler) {
    satir(ob, o.ad, dugme('Sınıftan çıkar', () =>
      yap('/api/yonetim/ogrenci-sinif', { ogrenciUyelikId: o.uyelikId, sinifId: null }, 'Öğrenci sınıftan çıkarıldı.')));
  }
  const adaylar = v.ogrenciler.filter(o => o.durum === 'aktif' && !o.sinifId && o.subeId === sinif.subeId);
  doldur($('d-ogrenci'), adaylar, o => o.uyelikId, o => o.ad, adaylar.length ? 'Öğrenci seçin' : 'Sınıfsız öğrenci yok');
  bosYazilar();
}

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

// ---- Sekmeler ----
document.querySelectorAll('.sekmeler button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.sekmeler button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    for (const id of ['dersler', 'ogretmenler', 'ogrenciler', 'siniflar']) {
      $('s-' + id).classList.toggle('gizli', id !== b.dataset.sekme);
    }
    mesaj('');
    yukle();
  });
});

yukle();
