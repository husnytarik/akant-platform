const $ = id => document.getElementById(id);
const el = gEl;
const kimlikId = Number(new URLSearchParams(location.search).get('id')) || null;
const duzenleme = !!kimlikId;
let d = null;            // sunucudan gelen seçenekler (düzenlemede mevcut kayıt da)
let fotoBlob = null;
const girdiler = {};     // ad -> input / select / çip grubu
const veliSatirlari = [], ozelSatirlari = [];
const bugun = new Date().toLocaleDateString('sv-SE');

const mesaj = (m, hata = true) => {
  const k = $('mesaj');
  k.textContent = m;
  k.className = 'mesaj' + (m ? (hata ? ' hata' : ' basari') : '');
  if (m) k.scrollIntoView({ block: 'center', behavior: 'smooth' });
};

async function istek(yol, govde) {
  const r = await fetch(yol, govde === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(govde) });
  if (r.status === 401) { location.href = '/'; throw new Error('oturum'); }
  const v = await r.json().catch(() => ({}));
  return { ok: r.ok, v };
}

function alan(etiket, girdi, genis) {
  const k = el('div', undefined, genis ? 'ok-genis' : '');
  const l = el('label', etiket);
  if (girdi.id) l.htmlFor = girdi.id;
  k.append(l, girdi);
  return k;
}
function giris(ad, tip, deger, ozellik = {}) {
  const i = document.createElement('input');
  i.type = tip; i.id = 'f-' + ad; i.value = deger ?? '';
  Object.assign(i, ozellik);
  girdiler[ad] = i;
  return i;
}
function secim(ad, secenekler, deger, bos) {
  const s = document.createElement('select');
  if (ad) { s.id = 'f-' + ad; girdiler[ad] = s; }
  if (bos !== undefined) s.append(new Option(bos, ''));
  for (const [v, e] of secenekler) s.append(new Option(e, v));
  s.value = deger ?? '';
  return s;
}
const satirKur = (...alanlar) => { const s = el('div', undefined, 'form-satir'); s.append(...alanlar); return s; };

function cipSecimi(ad, secenekler, deger) {
  const k = el('div', undefined, 'ok-cipler');
  k.dataset.deger = deger || '';
  for (const [v, e] of secenekler) {
    const b = el('button', e, 'tatil-cip'); b.type = 'button';
    b.classList.toggle('secili', v === deger);
    b.setAttribute('aria-pressed', String(v === deger));
    b.addEventListener('click', () => {
      k.dataset.deger = v;
      for (const x of k.children) { x.classList.toggle('secili', x === b); x.setAttribute('aria-pressed', String(x === b)); }
    });
    k.append(b);
  }
  girdiler[ad] = k;
  return k;
}

function fotoBolumu() {
  const k = el('div', undefined, 'ok-foto');
  const onizleme = el('span');
  const goster = url => onizleme.replaceChildren(avatarYap(d.ogrenci?.ad || '', url, 'buyuk'));
  goster(d.ogrenci?.foto || null);
  const dosya = document.createElement('input');
  dosya.type = 'file'; dosya.accept = 'image/*'; dosya.hidden = true;
  const sec = el('button', d.ogrenci?.foto ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle', 'ikincil'); sec.type = 'button';
  sec.addEventListener('click', () => dosya.click());
  dosya.addEventListener('change', async () => {
    const f = dosya.files[0];
    if (!f) return;
    try {
      fotoBlob = await fotoKucult(f);
      goster(URL.createObjectURL(fotoBlob));
      sec.textContent = 'Fotoğrafı değiştir';
    } catch { mesaj('Fotoğraf okunamadı, başka bir görsel deneyin.'); }
  });
  const yazi = el('div');
  yazi.append(sec, el('small', 'Vesikalık ya da yüzün net göründüğü bir fotoğraf; kare olarak kırpılır.', 'alt'));
  k.append(onizleme, yazi, dosya);
  return k;
}

function veliSatiri(v) {
  const kayitli = !!v?.uyelikId;
  const k = el('div', undefined, 'ok-oge');
  const yak = secim('', d.secenekler.yakinlik.map(x => [x, x]), v?.yakinlik || '', 'Yakınlık seçin');
  const ad = Object.assign(document.createElement('input'), { value: v?.ad || '', maxLength: 80, readOnly: kayitli });
  const kim = Object.assign(document.createElement('input'), { maxLength: 20, inputMode: 'numeric' });
  const tel = Object.assign(document.createElement('input'), { type: 'tel', maxLength: 20, placeholder: '5XX XXX XX XX', value: v?.telefon || '', readOnly: kayitli });
  const eposta = Object.assign(document.createElement('input'), { type: 'email', maxLength: 120, value: v?.email || '', readOnly: kayitli });
  const meslek = Object.assign(document.createElement('input'), { maxLength: 60, value: v?.meslek || '' });
  const sil = el('button', kayitli ? 'Bağı kaldır' : 'Kaldır', 'ok-kaldir'); sil.type = 'button';
  const satir = { k, yak, ad, kim, tel, eposta, meslek, uyelikId: v?.uyelikId || null };
  sil.addEventListener('click', async () => {
    if (kayitli) {
      if (!confirm(`${v.ad} bu öğrencinin velilerinden çıkarılsın mı? (Hesabı silinmez, yalnızca bağ kalkar.)`)) return;
      const r = await istek('/api/ogrenci/veli-cikar', { ogrenciId: kimlikId, veliUyelikId: v.uyelikId });
      if (!r.ok) return mesaj(r.v.hata || 'Kaldırılamadı');
    }
    k.remove(); veliSatirlari.splice(veliSatirlari.indexOf(satir), 1);
  });
  const ust = el('div', undefined, 'ok-oge-ust');
  ust.append(el('strong', kayitli ? v.ad : 'Yeni kişi'), sil);
  const f = satirKur(alan('Yakınlık', yak));
  if (!kayitli) f.append(alan('Ad soyad', ad), alan('T.C. / pasaport no', kim));
  f.append(alan('Telefon', tel), alan('E-posta', eposta), alan('Meslek', meslek));
  k.append(ust, f);
  veliSatirlari.push(satir);
  return k;
}

function ozelSatiri(x) {
  const k = el('div', undefined, 'ok-oge');
  const tur = secim('', Object.entries(d.secenekler.ozelTur), x?.tur || 'saglik');
  const baslik = Object.assign(document.createElement('input'), { maxLength: 80, value: x?.baslik || '', placeholder: 'Örn. Fıstık alerjisi' });
  const aciklama = Object.assign(document.createElement('textarea'), { maxLength: 500, rows: 2, value: x?.aciklama || '', placeholder: 'Okulun bilmesi / dikkat etmesi gerekenler' });
  const sil = el('button', 'Kaldır', 'ok-kaldir'); sil.type = 'button';
  const satir = { k, tur, baslik, aciklama, id: x?.id || null };
  sil.addEventListener('click', async () => {
    if (satir.id) {
      if (!confirm('Bu özel durum kaydı silinsin mi?')) return;
      const r = await istek('/api/ogrenci/ozel-durum-sil', { ogrenciId: kimlikId, id: satir.id });
      if (!r.ok) return mesaj(r.v.hata || 'Silinemedi');
    }
    k.remove(); ozelSatirlari.splice(ozelSatirlari.indexOf(satir), 1);
    $('ozel-bos').classList.toggle('gizli', ozelSatirlari.length > 0);
  });
  const ust = el('div', undefined, 'ok-oge-ust');
  ust.append(el('strong', 'Özel durum'), sil);
  k.append(ust, satirKur(alan('Tür', tur), alan('Başlık', baslik)), alan('Açıklama', aciklama, true));
  ozelSatirlari.push(satir);
  return k;
}

function formuKur() {
  const f = $('form'), o = d.ogrenci || {}, k = d.kayit || {}, i = d.iletisim || {};
  f.replaceChildren();

  // --- Öğrenci ---
  f.append(el('h3', 'Öğrenci', 'baslik3'), fotoBolumu());
  const subeSec = secim('subeId', d.subeler.map(s => [s.id, s.ad]), o.subeId ?? d.subeler[0]?.id);
  const sinifSec = secim('sinifId', [], '');
  const sinifDoldur = secili => {
    sinifSec.replaceChildren(new Option('Sınıfsız (sonra atanır)', ''));
    for (const s of d.siniflar.filter(x => x.subeId === Number(subeSec.value))) sinifSec.append(new Option(`${s.kademe} · ${s.ad}`, String(s.id)));
    sinifSec.value = secili && [...sinifSec.options].some(x => x.value === String(secili)) ? String(secili) : '';
  };
  subeSec.addEventListener('change', () => sinifDoldur(null));
  sinifDoldur(o.sinifId);
  subeSec.disabled = duzenleme;
  const kimlikAlani = duzenleme
    ? alan(o.kimlikTuru, Object.assign(document.createElement('input'), { value: o.kimlik, readOnly: true }))
    : alan('T.C. / pasaport no *', giris('kimlik', 'text', '', { maxLength: 20 }));
  f.append(
    satirKur(
      alan('Ad soyad *', giris('ad', 'text', o.ad, { maxLength: 80 })), kimlikAlani,
      alan('Öğrenci / yakın telefonu *', giris('telefon', 'tel', o.telefon, { maxLength: 20, placeholder: '5XX XXX XX XX' })),
      alan('Okul no (boşsa otomatik)', giris('okulNo', 'text', o.okulNo, { maxLength: 10, inputMode: 'numeric' })),
      alan('Okul *', subeSec), alan('Sınıf', sinifSec)),
    satirKur(
      alan('Doğum tarihi', giris('dogumTarihi', 'date', k.dogumTarihi, { max: bugun })),
      alan('Doğum yeri', giris('dogumYeri', 'text', k.dogumYeri, { maxLength: 60 })),
      alan('Cinsiyet', secim('cinsiyet', [['kiz', 'Kız'], ['erkek', 'Erkek']], k.cinsiyet, 'Seçin')),
      alan('Kan grubu', secim('kanGrubu', d.secenekler.kanGrubu.map(x => [x, x]), k.kanGrubu, 'Bilinmiyor')),
      alan('Kayıt türü', secim('kayitTuru', Object.entries(d.secenekler.kayitTuru), k.kayitTuru || 'yeni')),
      alan('Kayıt tarihi', giris('kayitTarihi', 'date', k.kayitTarihi || (duzenleme ? '' : bugun))),
      alan('Önceki okul', giris('oncekiOkul', 'text', k.oncekiOkul, { maxLength: 100 }))));

  // --- Yemek ---
  f.append(el('h3', 'Yemek', 'baslik3'), cipSecimi('yemek', [['alacak', 'Yemek alacak'], ['almayacak', 'Yemek almayacak']], k.yemek || ''));

  // --- Özel durum (isteğe bağlı) ---
  const ozelUst = el('div', undefined, 'ekle-ust');
  const ozelEkle = el('button', '+ Özel durum ekle', 'ekle-ac'); ozelEkle.type = 'button';
  ozelUst.append(el('h3', 'Özel durum', 'baslik3'), ozelEkle);
  const ozelKap = el('div', undefined, 'ok-liste');
  const ozelBos = el('p', 'Sağlık, alerji ya da özel eğitim gibi bilinmesi gereken bir durum varsa ekleyin; yoksa boş bırakın.', 'alt');
  ozelBos.id = 'ozel-bos';
  for (const x of d.ozelDurumlar || []) ozelKap.append(ozelSatiri(x));
  ozelBos.classList.toggle('gizli', ozelSatirlari.length > 0);
  ozelEkle.addEventListener('click', () => {
    if (ozelSatirlari.length >= 10) return mesaj('En çok 10 özel durum eklenebilir.');
    ozelBos.classList.add('gizli');
    ozelKap.append(ozelSatiri(null));
    ozelSatirlari.at(-1).baslik.focus();
  });
  f.append(ozelUst, ozelBos, ozelKap);

  // --- Adres ve acil durum ---
  f.append(el('h3', 'Adres ve acil durum', 'baslik3'), satirKur(
    alan('E-posta', giris('email', 'email', i.email, { maxLength: 120 })),
    alan('İl', giris('il', 'text', i.il || 'Antalya', { maxLength: 40 })),
    alan('İlçe', giris('ilce', 'text', i.ilce, { maxLength: 40 })),
    alan('Adres', giris('adres', 'text', i.adres, { maxLength: 250 }), true),
    alan('Acil durumda aranacak kişi', giris('yakinAd', 'text', i.yakinAd, { maxLength: 80 })),
    alan('Yakınlığı', secim('yakinYakinlik', d.secenekler.yakinlik.map(x => [x, x]), i.yakinYakinlik, 'Seçin')),
    alan('Acil durum telefonu', giris('yakinTelefon', 'tel', i.yakinTelefon, { maxLength: 20, placeholder: '5XX XXX XX XX' }))));

  // --- Aile ---
  const aileUst = el('div', undefined, 'ekle-ust');
  const veliEkle = el('button', '+ Veli / yakın ekle', 'ekle-ac'); veliEkle.type = 'button';
  aileUst.append(el('h3', 'Aile (veli hesapları)', 'baslik3'), veliEkle);
  const aileKap = el('div', undefined, 'ok-liste');
  for (const v of d.aile || []) aileKap.append(veliSatiri(v));
  if (!duzenleme) aileKap.append(veliSatiri({ yakinlik: 'Anne' }));
  veliEkle.addEventListener('click', () => {
    if (veliSatirlari.length >= (duzenleme ? 6 : 4)) return mesaj('Daha fazla kişi eklenemez.');
    aileKap.append(veliSatiri(null));
  });
  f.append(aileUst, el('p', 'Veliler kimlik numarası ve telefonlarıyla giriş yapar; aynı veli birden fazla çocuğa bağlanabilir.', 'alt'), aileKap);

  const dugme = el('button', duzenleme ? 'Değişiklikleri kaydet' : 'Öğrenciyi kaydet', 'birincil'); dugme.type = 'submit';
  const vazgec = el('a', 'Vazgeç', 'ikincil'); vazgec.href = duzenleme ? '/ogrenci-dosyasi?id=' + kimlikId : '/ogrenciler';
  const alt = el('div', undefined, 'ok-alt');
  alt.append(dugme, vazgec);
  f.append(alt);
  f.addEventListener('submit', kaydet);
}

const deger = ad => (girdiler[ad].tagName === 'DIV' ? girdiler[ad].dataset.deger : girdiler[ad].value.trim());
const veliVerisi = s => ({ yakinlik: s.yak.value, ad: s.ad.value, kimlik: s.kim.value, telefon: s.tel.value, email: s.eposta.value, meslek: s.meslek.value });
// Yeni (henüz kayıtlı olmayan) satır hiçbir şey yazılmadıysa boş sayılır
const bosVeli = s => !s.uyelikId && !s.ad.value.trim() && !s.tel.value.trim() && !s.kim.value.trim() && !s.eposta.value.trim();

async function kaydet(e) {
  e.preventDefault();
  mesaj('');
  const dugme = e.submitter || $('form').querySelector('.birincil');
  if (!deger('ad') || (!duzenleme && !deger('kimlik')) || !deger('telefon')) return mesaj('Ad soyad, kimlik numarası ve telefon gerekli.');
  if (!deger('yemek')) return mesaj('Yemek tercihini seçin: yemek alacak ya da almayacak.');
  dugme.disabled = true;
  try {
    const govde = { id: kimlikId, subeId: Number(deger('subeId')), sinifId: deger('sinifId') ? Number(deger('sinifId')) : null };
    for (const ad of ['ad', 'telefon', 'okulNo', 'dogumTarihi', 'dogumYeri', 'cinsiyet', 'kanGrubu', 'kayitTuru', 'kayitTarihi', 'oncekiOkul', 'yemek',
      'email', 'il', 'ilce', 'adres', 'yakinAd', 'yakinYakinlik', 'yakinTelefon']) govde[ad] = deger(ad);
    if (!duzenleme) {
      govde.kimlik = deger('kimlik');
      govde.aile = veliSatirlari.filter(s => !bosVeli(s)).map(veliVerisi);
      govde.ozelDurumlar = ozelSatirlari.filter(s => s.baslik.value.trim()).map(s => ({ tur: s.tur.value, baslik: s.baslik.value, aciklama: s.aciklama.value }));
    }
    const r = await istek('/api/ogrenci/kaydet', govde);
    if (!r.ok) return mesaj(r.v.hata || 'Kaydedilemedi');
    const ogrenciId = r.v.id ?? kimlikId;
    const userId = r.v.userId ?? d.ogrenci.userId;

    if (duzenleme) {
      for (const s of veliSatirlari.filter(x => !bosVeli(x))) {
        const sonuc = s.uyelikId
          ? await istek('/api/ogrenci/veli-guncelle', { ogrenciId, veliUyelikId: s.uyelikId, yakinlik: s.yak.value, meslek: s.meslek.value })
          : await istek('/api/ogrenci/veli-ekle', { ogrenciId, ...veliVerisi(s) });
        if (!sonuc.ok) return mesaj('Kayıt güncellendi ancak aile bilgisinde sorun var: ' + (sonuc.v.hata || 'hata'));
      }
      for (const s of ozelSatirlari.filter(x => x.baslik.value.trim())) {
        const sonuc = await istek('/api/ogrenci/ozel-durum-kaydet', { ogrenciId, id: s.id, tur: s.tur.value, baslik: s.baslik.value, aciklama: s.aciklama.value });
        if (!sonuc.ok) return mesaj('Kayıt güncellendi ancak özel durumda sorun var: ' + (sonuc.v.hata || 'hata'));
      }
    }
    if (fotoBlob) {
      const fr = await fetch('/api/foto?id=' + userId, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: fotoBlob });
      if (!fr.ok) return mesaj('Öğrenci kaydedildi ancak fotoğraf yüklenemedi. Düzenleme ekranından yeniden deneyebilirsiniz.');
    }
    location.href = '/ogrenci-dosyasi?id=' + ogrenciId;
  } catch (x) {
    if (x.message !== 'oturum') mesaj('Bağlantı hatası, tekrar deneyin.');
  } finally { dugme.disabled = false; }
}

(async () => {
  const r = await istek('/api/ogrenci/kayit' + (duzenleme ? '?id=' + kimlikId : ''));
  if (!r.ok) { mesaj(r.v.hata || 'Yüklenemedi'); return; }
  d = r.v;
  if (duzenleme && !d.duzenleyebilir) { location.href = '/ogrenci-dosyasi?id=' + kimlikId; return; }
  if (duzenleme) {
    $('baslik').textContent = 'Kayıt bilgilerini düzenle';
    $('geri').href = '/ogrenci-dosyasi?id=' + kimlikId;
  }
  formuKur();
})();
