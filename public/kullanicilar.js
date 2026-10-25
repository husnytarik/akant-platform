const ROL_ADI = { yonetim: 'Yönetim', ogretmen: 'Öğretmen', ogrenci: 'Öğrenci', veli: 'Veli' };
const ROL_BASLIK = { yonetim: 'Yönetim', ogretmen: 'Öğretmenler' };
const $ = id => document.getElementById(id);
let subeler = [], kampusler = [], kullanicilar = [];
let rol = 'yonetim';
let duzenle = false;
const acik = new Set(); // Düzenle modunda açık tutulan kişiler

function mesaj(metin, tur = '') {
  $('mesaj').textContent = metin;
  $('mesaj').className = 'mesaj ' + tur;
}

function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

async function api(yol, govde) {
  const r = await fetch(yol, govde === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(govde),
  });
  if (r.status === 401) { location.href = '/'; throw new Error('oturum'); }
  const v = await r.json().catch(() => ({}));
  return { ok: r.ok, veri: v };
}

function secenekler(sel, liste, deger, etiket, bos) {
  sel.replaceChildren();
  if (bos !== undefined) sel.appendChild(new Option(bos, ''));
  for (const x of liste) sel.appendChild(new Option(etiket(x), deger(x)));
}

const okulKampus = okulId => subeler.find(s => s.id === okulId)?.kampusId;
const kampusAd = id => kampusler.find(k => k.id === id)?.ad || '';
const okulEtiket = s => kampusler.length > 1 ? `${s.ad} · ${kampusAd(s.kampusId)}` : s.ad;

// Seçili kampüs / okul süzgecine uyan üyelik mi?
function suzgecUyar(m) {
  const k = $('f-kampus').value, o = $('f-okul').value;
  if (o) return String(m.subeId) === o;
  if (k) return String(okulKampus(m.subeId)) === k;
  return true;
}

function dugme(metin, tikla, sinif = 'ikincil kucuk') {
  const b = el('button', metin, sinif);
  b.type = 'button';
  b.addEventListener('click', tikla);
  return b;
}

// Fotoğraf yükleme / kaldırma düğmeleri
function fotoAraclari(u) {
  const kap = el('div', undefined, 'kul-foto-dugme');
  const girdi = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
  const sec = dugme(u.foto ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle', () => girdi.click());
  girdi.addEventListener('change', async () => {
    const d = girdi.files[0];
    girdi.value = '';
    if (!d) return;
    sec.disabled = true;
    let govde;
    try { govde = await fotoKucult(d); } catch { sec.disabled = false; return mesaj('Bu fotoğraf okunamadı, başka bir fotoğraf deneyin', 'hata'); }
    const r = await fetch('/api/foto?id=' + u.id, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: govde });
    if (r.status === 401) { location.href = '/'; return; }
    if (!r.ok) { sec.disabled = false; return mesaj((await r.json().catch(() => ({}))).hata || 'Fotoğraf yüklenemedi', 'hata'); }
    mesaj('Fotoğraf güncellendi.', 'tamam');
    yukle();
  });
  kap.append(sec, girdi);
  if (u.foto) {
    kap.append(dugme('Kaldır', async () => {
      const r = await api('/api/foto-sil?id=' + u.id, {});
      if (!r.ok) mesaj(r.veri.hata || 'Hata', 'hata'); else { mesaj('Fotoğraf kaldırıldı.', 'tamam'); yukle(); }
    }));
  }
  return kap;
}

// Düzenleme gövdesi: fotoğraf, üyelikler (aktif/pasif) ve üyelik ekleme
function duzenGovdesi(u) {
  const g = el('div', undefined, 'kul-duzen');
  g.append(fotoAraclari(u));
  for (const m of u.uyelikler) {
    const s = el('div', undefined, 'kul-uyelik' + (m.durum === 'pasif' ? ' pasif' : ''));
    s.append(el('span', `${ROL_ADI[m.rol]} · ${m.sube || '-'}${m.durum === 'pasif' ? ' (pasif)' : ''}`));
    s.append(dugme(m.durum === 'aktif' ? 'Pasifleştir' : 'Aktifleştir', async () => {
      const r = await api('/api/yonetim/uyelik-durum', { uyelikId: m.id, durum: m.durum === 'aktif' ? 'pasif' : 'aktif' });
      if (!r.ok) mesaj(r.veri.hata || 'Hata', 'hata'); else { mesaj(''); yukle(); }
    }));
    g.append(s);
  }
  const form = el('form', undefined, 'mini-form');
  const sSube = document.createElement('select');
  const sRol = document.createElement('select');
  secenekler(sSube, subeler, s => s.id, okulEtiket);
  secenekler(sRol, Object.keys(ROL_BASLIK), r => r, r => ROL_ADI[r]);
  sRol.value = rol;
  sSube.setAttribute('aria-label', 'Okul');
  sRol.setAttribute('aria-label', 'Rol');
  const bt = el('button', 'Üyelik ekle', 'ikincil kucuk'); bt.type = 'submit';
  form.append(sSube, sRol, bt);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const r = await api('/api/yonetim/uyelik-ekle', { userId: u.id, subeId: sSube.value, rol: sRol.value });
    if (!r.ok) mesaj(r.veri.hata || 'Hata', 'hata'); else { mesaj('Üyelik eklendi.', 'tamam'); yukle(); }
  });
  g.append(form);
  return g;
}

function cizListe() {
  const kutu = $('kul-liste');
  kutu.replaceChildren();
  // Sekmedeki role sahip ve süzgece uyan üyeliği olanlar
  const liste = kullanicilar
    .map(u => ({ u, uyelikler: u.uyelikler.filter(m => m.rol === rol && suzgecUyar(m)) }))
    .filter(x => x.uyelikler.length);

  for (const { u, uyelikler } of liste) {
    const okullar = [...new Set(uyelikler.map(m => m.sube).filter(Boolean))].join(', ');
    const pasif = uyelikler.every(m => m.durum === 'pasif');
    const alt = [okullar, pasif ? 'Pasif' : '', u.telefon].filter(Boolean).join(' · ');
    const sol = el('div', undefined, 'kur-sol');
    sol.append(el('strong', u.ad), el('small', alt));
    if (!duzenle) {
      const s = el('div', undefined, 'kur-satir');
      s.append(avatarYap(u.ad, u.foto, 'orta'), sol);
      kutu.append(s);
      continue;
    }
    const d = el('details', undefined, 'kur-kart');
    d.open = acik.has(u.id);
    d.addEventListener('toggle', () => { if (d.open) acik.add(u.id); else acik.delete(u.id); });
    const ozet = el('summary');
    ozet.append(avatarYap(u.ad, u.foto, 'kucuk'), sol, el('span', 'Düzenle', 'kur-duzen-yazi'));
    d.append(ozet, duzenGovdesi(u));
    kutu.append(d);
  }
  if (!liste.length) kutu.append(el('p', 'Bu seçimde kayıtlı kişi yok.', 'bos-not'));
  $('kul-sayi').textContent = `${liste.length} kişi`;
  const k = $('f-kampus'), o = $('f-okul');
  const kapsam = [k.value && k.options[k.selectedIndex].text, o.value && o.options[o.selectedIndex].text].filter(Boolean).join(' · ');
  $('kul-baslik').textContent = ROL_BASLIK[rol];
  $('yazdir-baslik').textContent = `${ROL_BASLIK[rol]}${kapsam ? ' — ' + kapsam : ''} · ${new Date().toLocaleDateString('tr-TR')}`;
  $('yeni-alan').classList.toggle('gizli', rol !== 'yonetim');
  $('ogretmen-not').classList.toggle('gizli', rol !== 'ogretmen');
}

async function yukle() {
  const { ok, veri } = await api('/api/yonetim/kullanicilar');
  if (!ok) { location.href = '/panel'; return; }
  kullanicilar = veri.kullanicilar;
  cizListe();
}

function okulSecenekleri() {
  const k = $('f-kampus').value;
  secenekler($('f-okul'), subeler.filter(s => !k || String(s.kampusId) === k), s => s.id, s => s.ad, 'Tüm okullar');
}

$('f-kampus').addEventListener('change', () => { okulSecenekleri(); cizListe(); });
$('f-okul').addEventListener('change', cizListe);
$('yazdir').addEventListener('click', () => window.print());

$('duzen').addEventListener('click', () => {
  duzenle = !duzenle;
  $('duzen').textContent = duzenle ? 'Bitti' : 'Düzenle';
  $('duzen').classList.toggle('birincil', duzenle);
  $('duzen').classList.toggle('ikincil', !duzenle);
  $('duzen').classList.add('kucuk');
  $('kul-bolum').classList.toggle('duzende', duzenle);
  mesaj('');
  cizListe();
});

document.querySelectorAll('.sekmeler button').forEach(b => {
  b.addEventListener('click', () => {
    rol = b.dataset.rol;
    document.querySelectorAll('.sekmeler button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    mesaj('');
    cizListe();
  });
});

$('ekle').addEventListener('submit', async e => {
  e.preventDefault();
  const r = await api('/api/yonetim/kullanici-ekle', {
    ad: $('ad').value, kimlik: $('kimlik').value, telefon: $('telefon').value, subeId: $('sube').value, rol: 'yonetim',
  });
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  mesaj('Yönetici eklendi.', 'tamam');
  $('ekle').reset();
  yukle();
});

(async () => {
  const s = await api('/api/yonetim/subeler');
  if (!s.ok) { location.href = '/panel'; return; }
  subeler = s.veri.subeler;
  kampusler = s.veri.kampusler;
  secenekler($('f-kampus'), kampusler, k => k.id, k => k.ad, 'Tüm kampüsler');
  okulSecenekleri();
  secenekler($('sube'), subeler, x => x.id, okulEtiket);
  yukle();
})();
