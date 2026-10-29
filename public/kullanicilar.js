const ROL_ADI = { yonetim: 'Yönetim', ogretmen: 'Öğretmen', ogrenci: 'Öğrenci', veli: 'Veli' };
const GOREV_AD = { mudur: 'Müdür', mudur_yrd: 'Müdür yardımcısı' };
const BASLIK = { kadro: 'Yönetim', ogretmen: 'Öğretmenler', rol: 'Roller' };
const $ = id => document.getElementById(id);
let subeler = [], kampusler = [], kullanicilar = [], roller = [], katalog = [];
let sekme = 'kadro';
let duzenle = false;
let yeniAcik = false;
const acik = new Set(); // Düzenle modunda açık tutulan kişi ve roller

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

const kampusAd = id => kampusler.find(k => k.id === id)?.ad || '';
const okulEtiket = s => kampusler.length > 1 ? `${s.ad} · ${kampusAd(s.kampusId)}` : s.ad;
const atanabilir = r => !r.okulAtar && !r.kilitli;

function kadLink(metin, tikla, sinif = '') {
  const b = el('button', metin, 'kad-link ' + sinif);
  b.type = 'button';
  b.addEventListener('click', tikla);
  return b;
}

// İşlem sonrası: hata ya da başarı bildir, listeyi yenile
async function sonuc(yanit, basari) {
  if (!yanit.ok) return mesaj(yanit.veri.hata || 'Hata', 'hata');
  mesaj(basari || '', basari ? 'tamam' : '');
  await yukle();
}

// ---- Kişi başlığı ----
function yonetimOkullari(u) {
  return [...new Set(u.uyelikler.filter(m => m.rol === 'yonetim' && m.durum === 'aktif').map(m => m.sube).filter(Boolean))].join(', ');
}

// Kişinin yönetimdeki görevleri: kurum yönetimi, okul müdürlüğü ve atanmış roller
function gorevler(u) {
  const liste = [];
  if (u.uyelikler.some(m => m.rol === 'yonetim' && m.gorev === 'kurum' && m.durum === 'aktif')) liste.push('Kurum yönetimi');
  for (const g of u.okulGorevleri) liste.push(`${GOREV_AD[g.gorev]} · ${g.okul}`);
  const ek = u.roller.map(id => roller.find(r => r.id === id)?.ad).filter(Boolean);
  if (ek.length) liste.push(ek.join(', ') + (u.okulGorevleri.length ? '' : ` · ${yonetimOkullari(u)}`));
  return liste;
}

function altYazi(u) {
  const alt = el('small');
  const okullar = [...new Set(u.uyelikler.filter(m => m.rol === sekmeRolu() && m.durum === 'aktif').map(m => m.sube).filter(Boolean))].join(', ');
  const pasif = u.uyelikler.filter(m => m.rol === sekmeRolu()).every(m => m.durum === 'pasif');
  const parcalar = [];
  if (sekme === 'kadro') {
    const g = gorevler(u);
    if (g.length) parcalar.push(g.join(' · '));
    else if (okullar) parcalar.push(okullar);
  } else {
    parcalar.push(okullar);
    const ek = u.roller.map(id => roller.find(r => r.id === id)?.ad).filter(Boolean);
    if (ek.length) parcalar.push(ek.join(', '));
  }
  if (pasif) parcalar.push('Pasif');
  parcalar.push(u.telefon);
  alt.append(parcalar.filter(Boolean).join(' · '));
  if (sekme === 'kadro' && !pasif && !gorevler(u).length) alt.prepend(el('span', 'Rol atanmamış · ', 'kad-uyari'));
  return alt;
}

const sekmeRolu = () => sekme === 'ogretmen' ? 'ogretmen' : 'yonetim';

// ---- Düzenleme gövdesi ----
function fotoBolumu(u) {
  const kap = el('div', undefined, 'kad-foto');
  const girdi = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
  const sec = kadLink(u.foto ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle', () => girdi.click());
  girdi.addEventListener('change', async () => {
    const d = girdi.files[0];
    girdi.value = '';
    if (!d) return;
    sec.disabled = true;
    let govde;
    try { govde = (await fotoKirp(d, { baslik: u.ad }))?.blob; } catch { sec.disabled = false; return mesaj('Bu fotoğraf okunamadı, başka bir fotoğraf deneyin', 'hata'); }
    if (!govde) { sec.disabled = false; return; }
    const r = await fetch('/api/foto?id=' + u.id, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: govde });
    if (r.status === 401) { location.href = '/'; return; }
    if (!r.ok) { sec.disabled = false; return mesaj((await r.json().catch(() => ({}))).hata || 'Fotoğraf yüklenemedi', 'hata'); }
    mesaj('Fotoğraf güncellendi.', 'tamam');
    yukle();
  });
  const linkler = el('div', undefined, 'kad-linkler');
  linkler.append(sec, girdi);
  if (u.foto) linkler.append(kadLink('Kaldır', async () => sonuc(await api('/api/foto-sil?id=' + u.id, {}), 'Fotoğraf kaldırıldı.')));
  kap.append(avatarYap(u.ad, u.foto, 'buyuk'), linkler);
  return kap;
}

function adBolumu(u) {
  const f = el('form', undefined, 'kad-ad');
  const g = Object.assign(document.createElement('input'), { value: u.ad, maxLength: 80, required: true, ariaLabel: 'Ad soyad' });
  const kaydet = el('button', 'Adı kaydet', 'kad-link'); kaydet.type = 'submit';
  f.append(g, kaydet);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (g.value.trim() === u.ad) return;
    sonuc(await api('/api/yonetim/kullanici-ad', { userId: u.id, ad: g.value }), 'Ad güncellendi.');
  });
  return f;
}

function rolBolumu(u) {
  const b = el('div', undefined, 'kad-bolum');
  b.append(el('h4', 'Yönetim rolleri', 'kad-etiket'));
  const cipler = el('div', undefined, 'kad-ciplar');
  if (u.uyelikler.some(m => m.rol === 'yonetim' && m.gorev === 'kurum' && m.durum === 'aktif')) cipler.append(Object.assign(el('span', 'Kurum yönetimi', 'kad-cip sabit'), { title: 'Okul kurulumunda verilir' }));
  for (const g of u.okulGorevleri) cipler.append(el('span', `${GOREV_AD[g.gorev]} · ${g.okul}`, 'kad-cip sabit'));
  for (const r of roller.filter(atanabilir)) {
    const var_ = u.roller.includes(r.id);
    const c = el('button', r.ad, 'kad-cip');
    c.type = 'button';
    c.setAttribute('aria-pressed', String(var_));
    c.addEventListener('click', async () => {
      // Öğretmene rol verilince yönetim üyeliği, öğretmenin okulunda otomatik açılır
      const kaynak = u.uyelikler.find(m => m.rol === 'yonetim' && m.durum === 'aktif') || u.uyelikler.find(m => m.durum === 'aktif');
      c.disabled = true;
      sonuc(await api('/api/yonetim/kullanici-rol', { userId: u.id, rolId: r.id, ver: !var_, subeId: kaynak?.subeId }));
    });
    cipler.append(c);
  }
  b.append(cipler, el('p', 'Müdür ve müdür yardımcısı görevleri Okul kurulumunda verilir.', 'alt'));
  return b;
}

function uyelikBolumu(u) {
  const b = el('div', undefined, 'kad-bolum');
  b.append(el('h4', 'Üyelikler', 'kad-etiket'));
  for (const m of u.uyelikler) {
    const pasif = m.durum === 'pasif';
    const s = el('div', undefined, 'kad-uyelik' + (pasif ? ' pasif' : ''));
    s.append(el('span', `${ROL_ADI[m.rol]} · ${m.sube || '-'}${pasif ? ' · pasif' : ''}`));
    s.append(kadLink(pasif ? 'Aktifleştir' : 'Pasifleştir', async () => {
      if (!pasif && !confirm(`${u.ad}: bu üyelik pasifleştirilsin mi? Bu profille giriş yapamaz.`)) return;
      sonuc(await api('/api/yonetim/uyelik-durum', { uyelikId: m.id, durum: pasif ? 'aktif' : 'pasif' }));
    }));
    b.append(s);
  }
  const form = el('form', undefined, 'kad-ekle gizli');
  const sSube = document.createElement('select');
  const sRol = document.createElement('select');
  secenekler(sSube, subeler, s => s.id, okulEtiket);
  secenekler(sRol, ['yonetim', 'ogretmen'], r => r, r => ROL_ADI[r]);
  sRol.value = sekmeRolu();
  sSube.setAttribute('aria-label', 'Okul');
  sRol.setAttribute('aria-label', 'Rol');
  const ekle = el('button', 'Üyelik ekle', 'ekle-ac');
  ekle.type = 'submit';
  form.append(sSube, sRol, ekle);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    sonuc(await api('/api/yonetim/uyelik-ekle', { userId: u.id, subeId: sSube.value, rol: sRol.value }), 'Üyelik eklendi.');
  });
  const ac = kadLink('+ Üyelik ekle', () => { form.classList.toggle('gizli'); ac.classList.add('gizli'); });
  b.append(ac, form);
  return b;
}

function kisiSatiri(u) {
  const orta = el('div', undefined, 'ol-orta');
  orta.append(el('strong', u.ad), altYazi(u));
  const ust = [avatarYap(u.ad, u.foto, 'kucuk'), orta];
  if (!duzenle) {
    const s = el('div', undefined, 'ol-satir');
    s.append(...ust);
    return s;
  }
  const d = el('details', undefined, 'kad-kisi');
  d.open = acik.has('k' + u.id);
  d.addEventListener('toggle', () => { if (d.open) acik.add('k' + u.id); else acik.delete('k' + u.id); });
  const ozet = el('summary', undefined, 'ol-satir');
  ozet.append(...ust, el('span', undefined, 'kad-ok'));
  const g = el('div', undefined, 'kad-duzen');
  g.append(fotoBolumu(u), adBolumu(u), rolBolumu(u), uyelikBolumu(u));
  d.append(ozet, g);
  return d;
}

// ---- Roller ----
// Yetki anahtarları: grup başlıkları altında, açıklamalı
function yetkiSecici(secili) {
  const k = el('div', undefined, 'kad-yetkiler');
  for (const g of katalog) {
    k.append(el('h4', g.grup, 'kad-etiket'));
    for (const y of g.yetkiler) {
      const l = el('label', undefined, 'kad-yetki');
      const sol = el('span');
      sol.append(el('b', y.ad), el('small', y.aciklama));
      const c = Object.assign(document.createElement('input'), { type: 'checkbox', checked: secili.has(y.kod) });
      c.addEventListener('change', () => { if (c.checked) secili.add(y.kod); else secili.delete(y.kod); });
      l.append(sol, c);
      k.append(l);
    }
  }
  return k;
}

function yetkiOzeti(r) {
  const ad = new Map(katalog.flatMap(g => g.yetkiler).map(y => [y.kod, y.ad]));
  const ul = el('ul', undefined, 'kad-yetki-liste');
  for (const k of r.yetkiler) ul.append(el('li', ad.get(k) || k));
  return ul;
}

function rolSatiri(r) {
  const d = el('details', undefined, 'kad-kisi');
  d.open = acik.has('r' + r.id);
  d.addEventListener('toggle', () => { if (d.open) acik.add('r' + r.id); else acik.delete('r' + r.id); });
  const orta = el('div', undefined, 'ol-orta');
  const kisi = r.okulAtar ? `${r.kisi} kişi · Okul kurulumunda atanır` : `${r.kisi} kişi`;
  orta.append(el('strong', r.ad), el('small', `${r.kilitli ? 'Tüm yetkiler' : r.yetkiler.length + ' yetki'} · ${kisi}`));
  const ozet = el('summary', undefined, 'ol-satir');
  ozet.append(orta, el('span', undefined, 'kad-ok'));
  const g = el('div', undefined, 'kad-duzen');
  if (r.aciklama && !(duzenle && !r.kilitli)) g.append(el('p', r.aciklama, 'alt'));
  if (!duzenle || r.kilitli) {
    g.append(r.kilitli ? el('p', 'Bu rol her şeyi yapabilir ve değiştirilemez.', 'alt') : yetkiOzeti(r));
    d.append(ozet, g);
    return d;
  }
  const secili = new Set(r.yetkiler);
  const aciklama = Object.assign(document.createElement('input'), { value: r.aciklama, maxLength: 140, placeholder: 'Kısa açıklama (isteğe bağlı)' });
  aciklama.setAttribute('aria-label', 'Açıklama');
  g.append(aciklama, yetkiSecici(secili));
  const alt = el('div', undefined, 'kad-alt-dugmeler');
  const kaydet = el('button', 'Kaydet', 'ekle-ac kad-dolu');
  kaydet.type = 'button';
  kaydet.addEventListener('click', async () => sonuc(await api('/api/yonetim/rol-kaydet', { id: r.id, ad: r.ad, aciklama: aciklama.value, yetkiler: [...secili] }), `${r.ad} güncellendi.`));
  alt.append(kaydet);
  if (!r.sistem) {
    alt.append(kadLink('Rolü sil', async () => {
      if (!confirm(`"${r.ad}" rolü silinsin mi? ${r.kisi ? `${r.kisi} kişiden bu rol alınır.` : ''}`)) return;
      sonuc(await api('/api/yonetim/rol-sil', { id: r.id }), 'Rol silindi.');
    }, 'tehlike'));
  }
  g.append(alt);
  d.append(ozet, g);
  return d;
}

// ---- Yeni kişi / yeni rol formları ----
function girdiAlan(etiket, girdi) {
  const k = document.createElement('div');
  const l = el('label', etiket);
  l.append(girdi);
  k.append(l);
  return k;
}

function yeniKisiFormu() {
  const k = $('yeni-alan');
  k.replaceChildren(el('h4', 'Yeni yönetici', 'kad-etiket'));
  const ad = Object.assign(document.createElement('input'), { required: true, maxLength: 80 });
  const kimlik = Object.assign(document.createElement('input'), { required: true, maxLength: 20 });
  const tel = Object.assign(document.createElement('input'), { type: 'tel', required: true, maxLength: 20, placeholder: '5XX XXX XX XX' });
  const okul = document.createElement('select');
  secenekler(okul, subeler, x => x.id, okulEtiket);
  const rol = document.createElement('select');
  rol.required = true;
  secenekler(rol, roller.filter(atanabilir), r => r.id, r => r.ad, 'Rol seçin');
  const form = el('form', undefined, 'form-satir');
  form.append(girdiAlan('Ad soyad', ad), girdiAlan('T.C. / pasaport no', kimlik), girdiAlan('Telefon', tel), girdiAlan('Okul', okul), girdiAlan('Rol', rol));
  const dugme = el('div');
  const gonder = el('button', 'Kişiyi ekle', 'birincil');
  gonder.type = 'submit';
  dugme.append(gonder);
  form.append(dugme);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const r = await api('/api/yonetim/kullanici-ekle', { ad: ad.value, kimlik: kimlik.value, telefon: tel.value, subeId: okul.value, rol: 'yonetim', rolId: rol.value });
    if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
    yeniAcik = false;
    await sonuc(r, 'Yönetici eklendi.');
  });
  k.append(form);
}

function yeniRolFormu() {
  const k = $('yeni-alan');
  k.replaceChildren(el('h4', 'Yeni rol', 'kad-etiket'));
  const ad = Object.assign(document.createElement('input'), { required: true, maxLength: 40, placeholder: 'Örn. Kütüphane sorumlusu' });
  const aciklama = Object.assign(document.createElement('input'), { maxLength: 140, placeholder: 'Kısa açıklama (isteğe bağlı)' });
  const secili = new Set();
  const form = el('form');
  form.append(girdiAlan('Rol adı', ad), girdiAlan('Açıklama', aciklama), el('p', 'Bu rol hangi işleri yapabilsin?', 'alt'), yetkiSecici(secili));
  const gonder = el('button', 'Rolü oluştur', 'birincil');
  gonder.type = 'submit';
  form.append(gonder);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const r = await api('/api/yonetim/rol-kaydet', { ad: ad.value, aciklama: aciklama.value, yetkiler: [...secili] });
    if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
    yeniAcik = false;
    await sonuc(r, 'Rol oluşturuldu. Kişilere Yönetim sekmesinde verebilirsiniz.');
  });
  k.append(form);
}

// ---- Çizim ----
function suzulmus() {
  const okul = Number($('f-okul').value) || 0;
  const q = $('ara').value.trim().toLocaleLowerCase('tr');
  const rol = sekmeRolu();
  return kullanicilar.filter(u => {
    const m = u.uyelikler.filter(x => x.rol === rol && (!okul || x.subeId === okul));
    return m.length && (!q || u.ad.toLocaleLowerCase('tr').includes(q));
  });
}

function ciz() {
  const kutu = $('liste');
  kutu.replaceChildren();
  const roldeyiz = sekme === 'rol';
  $('baslik').textContent = BASLIK[sekme];
  $('arac').classList.toggle('gizli', roldeyiz);
  $('ogretmen-not').classList.toggle('gizli', sekme !== 'ogretmen');
  $('yeni').classList.toggle('gizli', !duzenle || sekme === 'ogretmen');
  $('yeni').textContent = yeniAcik ? 'Vazgeç' : roldeyiz ? '+ Yeni rol' : '+ Yeni kişi';
  $('yeni').classList.toggle('acik', yeniAcik);
  $('yeni-alan').classList.toggle('gizli', !(duzenle && yeniAcik && sekme !== 'ogretmen'));
  $('yazdir').classList.toggle('gizli', roldeyiz);
  $('duzen').textContent = duzenle ? 'Bitti' : 'Düzenle';
  $('duzen').classList.toggle('kad-dolu', duzenle);

  let sayi;
  if (roldeyiz) {
    for (const r of roller) kutu.append(rolSatiri(r));
    sayi = `${roller.length} rol`;
  } else {
    const liste = suzulmus();
    for (const u of liste) kutu.append(kisiSatiri(u));
    if (!liste.length) kutu.append(el('p', 'Bu seçimde kayıtlı kişi yok.', 'bos-not'));
    sayi = `${liste.length} kişi`;
  }
  $('sayi').textContent = sayi;
  const o = $('f-okul');
  const kapsam = !roldeyiz && o.value ? o.options[o.selectedIndex].text : '';
  $('yazdir-baslik').textContent = `${BASLIK[sekme]}${kapsam ? ' — ' + kapsam : ''} · ${new Date().toLocaleDateString('tr-TR')}`;
}

function formuHazirla() {
  if (!(duzenle && yeniAcik)) return;
  if (sekme === 'rol') yeniRolFormu(); else if (sekme === 'kadro') yeniKisiFormu();
}

async function yukle() {
  const [k, r] = await Promise.all([api('/api/yonetim/kullanicilar'), api('/api/yonetim/roller')]);
  if (!k.ok || !r.ok) { location.href = '/panel'; return; }
  kullanicilar = k.veri.kullanicilar;
  roller = r.veri.roller;
  katalog = r.veri.katalog;
  formuHazirla();
  ciz();
}

$('f-okul').addEventListener('change', ciz);
$('ara').addEventListener('input', ciz);
// Personel listesi raporu: ekrandaki düzenleme araçları değil, süzülmüş kişiler temiz bir tablo olarak basılır
function raporuHazirla() {
  const okul = Number($('f-okul').value) || 0;
  const o = $('f-okul');
  const rol = sekmeRolu();
  const satirlar = suzulmus().map(u => {
    const okullar = [...new Set(u.uyelikler.filter(m => m.rol === rol && m.durum === 'aktif' && (!okul || m.subeId === okul)).map(m => m.sube).filter(Boolean))];
    const gorev = [];
    if (rol === 'yonetim') {
      if (u.uyelikler.some(m => m.rol === 'yonetim' && m.gorev === 'kurum' && m.durum === 'aktif')) gorev.push('Kurum yönetimi');
      for (const g of u.okulGorevleri) gorev.push(GOREV_AD[g.gorev]);
    }
    gorev.push(...u.roller.map(id => roller.find(r => r.id === id)?.ad).filter(Boolean));
    return { ad: u.ad, gorev: [...new Set(gorev)].join(', ') || (rol === 'ogretmen' ? 'Öğretmen' : ''), okullar: okullar.join(', ') };
  }).filter(r => r.okullar).sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  const kok = $('rapor');
  kok.replaceChildren();
  const kapsam = okul ? o.options[o.selectedIndex].text : 'Tüm okullar';
  kok.append(el('h2', sekme === 'ogretmen' ? 'Öğretmen listesi' : 'Yönetim personeli listesi'), el('p', `${kapsam} · ${new Date().toLocaleDateString('tr-TR')}`, 'pr-alt'));
  const tablo = el('table'), ust = el('tr');
  for (const b of ['No', 'Ad soyad', 'Görev', 'Okul']) ust.append(el('th', b));
  tablo.append(el('thead')); tablo.firstChild.append(ust);
  const gv = el('tbody');
  satirlar.forEach((r, i) => { const t = el('tr'); for (const d of [String(i + 1), r.ad, r.gorev, r.okullar]) t.append(el('td', d)); gv.append(t); });
  tablo.append(gv);
  kok.append(tablo, el('p', `Toplam ${satirlar.length} kişi`, 'pr-alt'));
}
$('yazdir').addEventListener('click', () => {
  raporuHazirla();
  document.body.classList.add('rapor-yazdir');
  window.print();
});
window.addEventListener('afterprint', () => document.body.classList.remove('rapor-yazdir'));

$('duzen').addEventListener('click', () => {
  duzenle = !duzenle;
  yeniAcik = false;
  mesaj('');
  ciz();
});

$('yeni').addEventListener('click', () => {
  yeniAcik = !yeniAcik;
  formuHazirla();
  ciz();
});

$('sekmeler').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  sekme = b.dataset.sekme;
  yeniAcik = false;
  for (const x of $('sekmeler').children) x.setAttribute('aria-pressed', String(x === b));
  mesaj('');
  ciz();
});

(async () => {
  const s = await api('/api/yonetim/subeler');
  if (!s.ok) { location.href = '/panel'; return; }
  subeler = s.veri.subeler;
  kampusler = s.veri.kampusler;
  secenekler($('f-okul'), subeler, x => x.id, okulEtiket, 'Tüm okullar');
  yukle();
})();
