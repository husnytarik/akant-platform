const $ = id => document.getElementById(id);

const SORGU_MS = 1500;
const SONUC_MS = 5000;

let talep = null;        // { id, ogrenciler }
let sorgu = null;
let mesgul = false;      // bir kod işlenirken yeni okumaları yok say
let akis = null;
let sonHata = { kod: '', zaman: 0 };   // aynı hatalı QR'ı kamera art arda göndermesin

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

async function api(yol, govde) {
  const r = await fetch('/api/teslim/kapi/' + yol, govde === undefined ? { cache: 'no-store' } : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(govde),
  });
  if (r.status === 401) { location.href = '/'; throw new Error('oturum'); }
  return { ok: r.ok, durum: r.status, veri: await r.json().catch(() => ({})) };
}

function goster(bolum) {
  for (const id of ['a-tara', 'a-secim', 'a-bekle', 'a-sonuc']) $(id).classList.toggle('gizli', id !== bolum);
}

function saat(ms) {
  return new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

async function bugunYukle() {
  const r = await api('bugun');
  const ul = $('bugun');
  ul.replaceChildren();
  if (!r.ok) return;
  if (!r.veri.kayitlar.length) return ul.append(el('li', 'Henüz teslim yapılmadı.', 'alt'));
  for (const k of r.veri.kayitlar) {
    const li = el('li');
    const ad = el('strong', k.ogrenci);
    li.append(ad, el('span', `${k.sinif || ''} · ${k.kisi}${k.yakinlik === 'Veli' ? '' : ' (' + k.yakinlik + ')'}`, 'alt'), el('time', saat(k.zaman), 'alt'));
    ul.append(li);
  }
}

// ---- Tarama ----
async function kameraAc() {
  if (!navigator.mediaDevices?.getUserMedia) { $('kamera-not').textContent = 'Bu tarayıcıda kamera kullanılamıyor; kodu elle girin.'; return; }
  try {
    akis = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch {
    $('kamera-not').textContent = 'Kamera izni verilmedi; kodu elle girebilirsiniz.';
    return;
  }
  const v = $('video');
  v.srcObject = akis;
  await v.play().catch(() => {});
  $('kamera-not').classList.add('gizli');
  tara();
}

const tuval = document.createElement('canvas');
const bg = tuval.getContext('2d', { willReadFrequently: true });
function tara() {
  const v = $('video');
  if (!akis) return;
  if (!mesgul && !$('a-tara').classList.contains('gizli') && v.videoWidth) {
    const olcek = Math.min(1, 480 / v.videoWidth);
    tuval.width = Math.round(v.videoWidth * olcek); tuval.height = Math.round(v.videoHeight * olcek);
    bg.drawImage(v, 0, 0, tuval.width, tuval.height);
    const s = jsQR(bg.getImageData(0, 0, tuval.width, tuval.height).data, tuval.width, tuval.height, { inversionAttempts: 'dontInvert' });
    if (s?.data && !(s.data === sonHata.kod && Date.now() - sonHata.zaman < 8000)) oku(s.data);
  }
  setTimeout(tara, 150);
}

async function oku(kod) {
  if (mesgul) return;
  mesgul = true;
  mesaj('');
  try {
    const r = await api('oku', { kod });
    if (!r.ok) { sonHata = { kod, zaman: Date.now() }; mesaj(r.veri.hata || 'Kod okunamadı', 'hata'); return; }
    talep = { id: r.veri.talepId, ogrenciler: r.veri.ogrenciler };
    secimCiz(r.veri);
  } finally {
    // Aynı hatalı kodu art arda göndermemek için kısa bir bekleme
    setTimeout(() => { mesgul = !!talep; }, 1200);
  }
}

function secimCiz(v) {
  $('kisi').textContent = v.kisi.ad;
  $('yakinlik').textContent = v.kisi.yakinlik === 'Veli' ? 'Veli' : v.kisi.yakinlik;
  const ul = $('secim');
  ul.replaceChildren();
  for (const o of v.ogrenciler) {
    const li = el('li');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = true; cb.value = o.id; cb.id = 'o' + o.id;
    const lab = el('label'); lab.htmlFor = cb.id;
    const ortada = el('span', undefined, 'tk-ogr');
    ortada.append(el('strong', o.ad), el('span', [o.sinif, o.okul].filter(Boolean).join(' · '), 'alt'));
    lab.append(avatarYap(o.ad, o.foto, 'tk-avatar'), ortada);
    li.append(cb, lab);
    ul.append(li);
  }
  goster('a-secim');
}

function basaDon() {
  clearInterval(sorgu); sorgu = null;
  talep = null; mesgul = false;
  $('kod-gir').value = '';
  goster('a-tara');
  bugunYukle();
}

async function gonder() {
  const ids = [...document.querySelectorAll('#secim input:checked')].map(c => Number(c.value));
  if (!ids.length) return mesaj('En az bir öğrenci seçin.', 'hata');
  const r = await api('gonder', { talepId: talep.id, ogrenciIds: ids });
  if (!r.ok) { mesaj(r.veri.hata || 'Hata', 'hata'); return basaDon(); }
  mesaj('');
  const secilen = talep.ogrenciler.filter(o => ids.includes(o.id));
  talep.secilen = secilen;
  $('bekle-liste').replaceChildren(...secilen.map(o => el('li', `${o.ad}${o.sinif ? ' · ' + o.sinif : ''}`)));
  goster('a-bekle');
  sorgu = setInterval(async () => {
    const d = await api('durum?id=' + talep.id).catch(() => null);
    if (!d || !d.ok) return;
    if (d.veri.durum === 'bekliyor') return;
    sonucGoster(d.veri.durum);
  }, SORGU_MS);
}

function sonucGoster(durum) {
  clearInterval(sorgu); sorgu = null;
  const adlar = (talep?.secilen || []).map(o => o.ad);
  const ok = durum === 'onaylandi';
  $('sonuc-metin').textContent = ok ? 'Teslim edildi' : durum === 'doldu' ? 'Veli zamanında onaylamadı' : durum === 'iptal' ? 'İptal edildi' : 'Veli onaylamadı';
  $('sonuc-metin').dataset.tur = ok ? 'tamam' : 'red';
  $('sonuc-liste').replaceChildren(...adlar.map(a => el('li', a)));
  goster('a-sonuc');
  setTimeout(basaDon, SONUC_MS);
}

$('kod-form').addEventListener('submit', e => {
  e.preventDefault();
  const k = $('kod-gir').value.trim();
  if (k) oku(k);
});
$('gonder').addEventListener('click', gonder);
$('vazgec').addEventListener('click', async () => { await api('iptal', { talepId: talep.id }); basaDon(); });
$('bekle-iptal').addEventListener('click', async () => {
  await api('iptal', { talepId: talep.id });
  sonucGoster('iptal');
});

window.addEventListener('pagehide', () => akis?.getTracks().forEach(t => t.stop()));

bugunYukle();
kameraAc();
