const $ = id => document.getElementById(id);
let rol = null;
let veri = { duyurular: [], mesajlar: [] };
let secenek = null;
let sekme = 'duyuru';

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
  return { ok: r.ok, veri: await r.json().catch(() => ({})) };
}

function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

const tarihYaz = ms => new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

// Liste satırı: başlık + tarih, kısa metin (dokununca açılır), alt satırda hedef bilgisi, isteğe bağlı Sil
function ileti(x, sil) {
  const kart = el('div', undefined, 'not-kart ileti');
  const ust = el('div', undefined, 'not-ust');
  const baslik = el('strong', x.baslik);
  if (x.yeni) baslik.append(el('span', 'Yeni', 'yeni-rozet'));
  ust.append(baslik, el('span', tarihYaz(x.tarih), 'alt'));
  kart.append(ust, el('p', x.metin));
  const alt = [x.hedef, x.yazan && rol !== 'yonetim' ? x.yazan : '', x.alici !== undefined ? `${x.okunan}/${x.alici} okudu` : '', x.okunan !== undefined && x.alici === undefined ? (x.okunan ? `${x.okunan} veli okudu` : 'Henüz okunmadı') : '']
    .filter(Boolean).join(' · ');
  if (alt) kart.append(el('small', alt, 'ileti-alt'));
  kart.addEventListener('click', e => { if (!e.target.closest('button')) kart.classList.toggle('acik'); });
  if (sil) {
    const s = el('button', 'Sil', 'ikincil tehlike kucuk'); s.type = 'button';
    s.addEventListener('click', async () => {
      if (!confirm(`"${x.baslik}" silinsin mi?`)) return;
      const r = await api('/api/duyuru/sil', { id: x.id });
      if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
      mesaj('Silindi.', 'tamam');
      yukle();
    });
    kart.append(s);
  }
  return kart;
}

function alan(etiket, kontrol, id) {
  kontrol.id = id;
  const l = el('label', etiket); l.htmlFor = id;
  const kap = document.createElement('div');
  kap.append(l, kontrol);
  return kap;
}

function secim(secenekler, bos) {
  const s = el('select');
  if (bos) s.append(Object.assign(el('option', bos), { value: '' }));
  for (const [d, e] of secenekler) s.append(Object.assign(el('option', e), { value: d }));
  return s;
}

// "+ Ekle" düğmesiyle açılan form (Derslerim'deki ile aynı şablon)
function ekleBolumu(baslik, dugme, form) {
  form.classList.add('ekle-form', 'gizli');
  const ust = el('div', undefined, 'ekle-ust');
  const d = el('button', '+ ' + dugme, 'ekle-ac'); d.type = 'button';
  d.addEventListener('click', () => {
    const kapali = form.classList.toggle('gizli');
    d.textContent = kapali ? '+ ' + dugme : 'Vazgeç';
    d.classList.toggle('acik', !kapali);
  });
  ust.append(el('h3', baslik, 'baslik3'), d);
  return [ust, form];
}

function duyuruFormu() {
  const f = el('form');
  const baslik = el('input'); baslik.maxLength = 100; baslik.required = true;
  const metin = el('textarea'); metin.maxLength = 2000; metin.rows = 4; metin.required = true;
  const sube = secim(secenek.okullar.map(o => [o.id, o.ad]), 'Tüm okullar');
  const kitle = secim(Object.entries(secenek.roller));
  const satir = el('div', undefined, 'form-satir');
  satir.append(alan('Kime (okul)', sube, 'd-sube'), alan('Kitle', kitle, 'd-kitle'));
  const b = el('button', 'Yayınla', 'birincil'); b.type = 'submit';
  f.append(alan('Başlık', baslik, 'd-baslik'), alan('Duyuru', metin, 'd-metin'), satir, b);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const r = await api('/api/duyuru/ekle', { baslik: baslik.value, metin: metin.value, sube: sube.value, rol: kitle.value });
    if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
    mesaj('Duyuru yayınlandı.', 'tamam');
    yukle();
  });
  return f;
}

function mesajFormu() {
  const f = el('form');
  const sinif = secim(secenek.siniflar.map(s => [s.id, s.ad]));
  const ogrenci = secim([]);
  const doldur = () => {
    ogrenci.replaceChildren(Object.assign(el('option', 'Sınıfın tüm velileri'), { value: '' }));
    for (const o of secenek.ogrenciler.filter(o => String(o.sinifId) === sinif.value)) ogrenci.append(Object.assign(el('option', o.ad + ' velisi'), { value: o.id }));
  };
  sinif.addEventListener('change', doldur); doldur();
  const baslik = el('input'); baslik.maxLength = 100; baslik.required = true;
  const metin = el('textarea'); metin.maxLength = 2000; metin.rows = 4; metin.required = true;
  const satir = el('div', undefined, 'form-satir');
  satir.append(alan('Sınıf', sinif, 'm-sinif'), alan('Kime', ogrenci, 'm-ogrenci'));
  const b = el('button', 'Gönder', 'birincil'); b.type = 'submit';
  f.append(satir, alan('Başlık', baslik, 'm-baslik'), alan('Mesaj', metin, 'm-metin'), b);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const r = await api('/api/duyuru/mesaj', { sinifId: sinif.value, ogrenciId: ogrenci.value, baslik: baslik.value, metin: metin.value });
    if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
    mesaj(`Mesaj ${r.veri.veli} veliye gönderildi.`, 'tamam');
    yukle();
  });
  return f;
}

function liste(kayitlar, bosMetin, sil) {
  const k = el('div');
  if (!kayitlar.length) k.append(el('p', bosMetin, 'alt'));
  for (const x of kayitlar) k.append(ileti(x, sil));
  return k;
}

function ciz() {
  const icerik = $('icerik');
  icerik.replaceChildren();
  const sek = $('sekmeler');
  if (rol === 'ogretmen' || rol === 'veli') {
    sek.classList.remove('gizli');
    sek.replaceChildren();
    const yeniMesaj = veri.mesajlar.filter(x => x.yeni).length;
    const ad = { duyuru: 'Duyurular', mesaj: rol === 'veli' ? 'Öğretmen mesajları' + (yeniMesaj ? ` (${yeniMesaj})` : '') : 'Veli mesajları' };
    for (const [d, e] of Object.entries(ad)) {
      const b = el('button', e); b.type = 'button'; b.setAttribute('aria-pressed', String(sekme === d));
      b.addEventListener('click', () => { sekme = d; mesaj(''); ciz(); });
      sek.append(b);
    }
  }
  if (rol === 'yonetim') {
    icerik.append(...ekleBolumu('Yayınlanan duyurular', 'Duyuru yaz', duyuruFormu()), liste(veri.duyurular, 'Henüz duyuru yayınlanmadı.', true));
  } else if (sekme === 'mesaj' && rol === 'ogretmen') {
    icerik.append(...ekleBolumu('Gönderilen mesajlar', 'Mesaj yaz', mesajFormu()), liste(veri.mesajlar, 'Henüz mesaj göndermediniz.', true));
  } else if (sekme === 'mesaj') {
    icerik.append(liste(veri.mesajlar, 'Öğretmenlerden gelen mesaj yok.'));
  } else {
    icerik.append(liste(veri.duyurular, 'Duyuru yok.'));
  }
}

async function yukle() {
  const r = await api('/api/duyuru/liste');
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  veri = r.veri;
  ciz();
}

(async () => {
  const b = await api('/api/ben');
  if (!b.ok) { location.href = '/'; return; }
  rol = b.veri.rol;
  if (new URLSearchParams(location.search).get('sekme') === 'mesaj') sekme = 'mesaj';
  if (rol === 'yonetim' || rol === 'ogretmen') {
    const s = await api('/api/duyuru/secenek');
    if (s.ok) secenek = s.veri;
  }
  await yukle();
})();
