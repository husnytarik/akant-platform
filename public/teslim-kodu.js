const $ = id => document.getElementById(id);

// Veli oturumuyla (/teslim-kodu) ya da yetkilinin özel bağlantısıyla (/t/<kod>) aynı sayfa çalışır
const bag = location.pathname.match(/^\/t\/([0-9a-f]{48})$/);
const TABAN = bag ? `/api/teslim/k/${bag[1]}/` : '/api/teslim/';

const YENILE_MS = 20000;
const SORGU_MS = 2000;
const SONUC_MS = 8000;

let kodZamani = 0;
let goruldu = new Set();   // sonucu gösterilmiş talepler
let sonuc = null;          // { metin, tur, bitis }
let durdu = false;

function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

function mesaj(metin, tur = '') {
  $('mesaj').textContent = metin;
  $('mesaj').className = 'mesaj ' + tur;
}

async function istek(yol, govde) {
  const r = await fetch(TABAN + yol, govde === undefined ? { cache: 'no-store' } : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(govde),
  });
  if (r.status === 401) { location.href = '/'; throw new Error('oturum'); }
  return { ok: r.ok, durum: r.status, veri: await r.json().catch(() => ({})) };
}

function qrCiz(metin) {
  const q = qrcode(0, 'M');
  q.addData(metin);
  q.make();
  const n = q.getModuleCount();
  const c = $('qr');
  const boyut = 264, kenar = 4;
  const hucre = Math.floor(boyut / (n + kenar * 2));
  const gercek = hucre * (n + kenar * 2);
  const oran = window.devicePixelRatio || 1;
  c.width = gercek * oran; c.height = gercek * oran;
  c.style.width = c.style.height = gercek + 'px';
  const g = c.getContext('2d');
  g.scale(oran, oran);
  g.fillStyle = '#fff'; g.fillRect(0, 0, gercek, gercek);
  g.fillStyle = '#0b2545';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (q.isDark(y, x)) g.fillRect((x + kenar) * hucre, (y + kenar) * hucre, hucre, hucre);
  }
}

function goster(bolum) {
  for (const id of ['b-qr', 'b-karar', 'b-sonuc', 'b-hata']) $(id).classList.toggle('gizli', id !== bolum);
}

function kisiyiYaz(k, ogr) {
  $('kim').textContent = k.ad;
  $('yakinlik').textContent = k.yakinlik === 'Veli' ? '' : k.yakinlik;
  const liste = $('ogrenciler');
  liste.replaceChildren();
  for (const o of ogr) {
    const li = el('li');
    li.append(el('strong', o.ad), el('span', [o.sinif, o.okul].filter(Boolean).join(' · '), 'alt'));
    liste.append(li);
  }
}

async function kodYenile() {
  const r = await istek('kod');
  if (!r.ok) {
    durdu = true;
    $('hata-metin').textContent = r.durum === 404 && bag ? 'Bu bağlantı geçersiz ya da iptal edildi. Lütfen çocuğunuzun velisinden yeni bağlantı isteyin.' : (r.veri.hata || 'Kod alınamadı');
    return goster('b-hata');
  }
  kodZamani = Date.now();
  qrCiz(r.veri.kod);
  $('kod').textContent = r.veri.kod.slice(0, 5) + ' ' + r.veri.kod.slice(5);
  kisiyiYaz(r.veri.kisi, r.veri.ogrenciler);
  document.title = 'neademy - Teslim kodu';
}

function sayacCiz() {
  const gecen = Date.now() - kodZamani;
  $('sayac-dolgu').style.width = Math.max(0, 100 - gecen / YENILE_MS * 100) + '%';
}

function sonucGoster(metin, tur) {
  sonuc = { bitis: Date.now() + SONUC_MS };
  $('sonuc-metin').textContent = metin;
  $('b-sonuc').dataset.tur = tur;
  goster('b-sonuc');
}

async function sorgula() {
  if (durdu || document.hidden) return;
  const r = await istek('durum').catch(() => null);
  if (!r || !r.ok) return;
  const t = r.veri.talep;
  if (sonuc && Date.now() > sonuc.bitis) { sonuc = null; goster('b-qr'); kodYenile(); }
  if (!t || goruldu.has(t.id)) {
    // Onay paneli açıkken istek düştüyse (süre doldu, güvenlik iptal etti) QR'a dön
    if (!sonuc && $('b-qr').classList.contains('gizli') && $('b-hata').classList.contains('gizli')) { goster('b-qr'); kodYenile(); }
    return;
  }

  const adlar = t.ogrenciler.map(o => o.ad).join(', ');
  if (t.durum === 'bekliyor') {
    $('karar-ogrenci').replaceChildren(...t.ogrenciler.map(o => el('li', `${o.ad}${o.sinif ? ' · ' + o.sinif : ''}`)));
    $('onay').dataset.talep = t.id;
    goster('b-karar');
  } else {
    goruldu.add(t.id);
    if (t.durum === 'onaylandi') sonucGoster(`${adlar} teslim edildi.`, 'tamam');
    else if (t.durum === 'reddedildi') sonucGoster('Teslim reddedildi.', 'red');
    else if (t.durum === 'doldu') sonucGoster('İstek zaman aşımına uğradı.', 'red');
  }
}

async function karar(onay) {
  const id = Number($('onay').dataset.talep);
  $('onay').disabled = $('red').disabled = true;
  const r = await istek('karar', { talepId: id, onay });
  $('onay').disabled = $('red').disabled = false;
  if (!r.ok) { mesaj(r.veri.hata || 'Hata', 'hata'); return sorgula(); }
  goruldu.add(id);
  sonucGoster(onay ? 'Teslim onaylandı. Öğrenci size teslim edilecek.' : 'Teslimi reddettiniz.', onay ? 'tamam' : 'red');
}

$('onay').addEventListener('click', () => karar(true));
$('red').addEventListener('click', () => karar(false));

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !durdu && Date.now() - kodZamani > YENILE_MS) kodYenile();
});

(async () => {
  await kodYenile();
  if (durdu) return;
  goster('b-qr');
  sorgula();
  try { navigator.wakeLock?.request('screen').catch(() => {}); } catch { /* ekran kilidi desteklenmiyor */ }
  setInterval(() => {
    if (durdu || document.hidden) return;
    sayacCiz();
    // Onay beklerken ya da sonuç gösterilirken kodu yenilemeye gerek yok
    const qrAcik = !$('b-qr').classList.contains('gizli');
    if (qrAcik && Date.now() - kodZamani >= YENILE_MS) kodYenile();
  }, 500);
  setInterval(sorgula, SORGU_MS);
})();
