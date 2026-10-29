const $ = id => document.getElementById(id);
function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}
const bas = ad => ad.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toLocaleUpperCase('tr-TR');
// 5321234567 -> 532 123 45 67
const telYaz = t => (/^\d{10}$/.test(t || '') ? `${t.slice(0, 3)} ${t.slice(3, 6)} ${t.slice(6, 8)} ${t.slice(8)}` : t || '');

async function api(yol, govde) {
  const r = await fetch(yol, govde ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(govde) } : undefined);
  if (r.status === 401) { location.href = '/'; throw new Error('oturum'); }
  return { ok: r.ok, veri: await r.json() };
}
const mesaj = (m, tur) => { const e = $('mesaj'); e.textContent = m || ''; e.className = 'mesaj' + (tur ? ' ' + tur : ''); };

// Salt okunur bilgi satırları
function bolum(baslik, satirlar, not) {
  const s = el('section', undefined, 'pf-bolum');
  s.append(el('h2', baslik));
  const dl = el('dl', undefined, 'pf-liste');
  for (const x of satirlar) dl.append(el('dt', x.ad), el('dd', x.deger));
  s.append(dl);
  if (not) s.append(el('p', not, 'pf-not'));
  return s;
}

(async () => {
  const [ben, bilgi] = await Promise.all([api('/api/ben'), api('/api/profil/bilgi')]);
  if (!bilgi.ok) return mesaj(bilgi.veri.hata || 'Bilgiler alınamadı', 'hata');
  const k = ben.veri, b = bilgi.veri;

  const kimlik = $('kimlik');
  const avatar = el('div', undefined, 'pf-avatar');
  if (k.foto) { const im = el('img', undefined, 'avatar-foto'); im.src = k.foto; im.alt = ''; avatar.append(im); }
  else avatar.append(el('span', bas(k.ad)));
  const yazi = el('div');
  yazi.append(el('h2', k.ad), el('p', k.unvan));
  kimlik.append(avatar, yazi);
  kimlik.classList.remove('gizli');

  const icerik = $('icerik');
  const hesap = bolum('Hesap bilgileri', b.hesap, b.adDegistir ? 'Kimlik ve giriş telefonu değiştirilemez.' : 'Ad, kimlik ve giriş telefonu okul yönetimi tarafından güncellenir.');
  if (b.adDegistir) {
    const f = el('form', undefined, 'pf-ad');
    const g = el('input'); g.value = k.ad; g.maxLength = 80; g.required = true; g.setAttribute('aria-label', 'Ad soyad');
    const d = el('button', 'Adı kaydet', 'ikincil'); d.type = 'submit';
    f.append(g, d);
    f.addEventListener('submit', async e => {
      e.preventDefault();
      d.disabled = true;
      const r = await api('/api/profil/ad', { ad: g.value });
      d.disabled = false;
      if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
      yazi.querySelector('h2').textContent = g.value = r.veri.ad;
      avatar.querySelector('span')?.replaceChildren(bas(r.veri.ad));
      mesaj('Adınız güncellendi', 'tamam');
    });
    hesap.querySelector('dl').before(f);
  }
  icerik.append(hesap);
  if (b.okul.satirlar.length) icerik.append(bolum(b.okul.baslik, b.okul.satirlar));

  // Düzenlenebilir alanlar
  const alanlar = {};
  const alan = (ad, etiket, ayar = {}) => {
    const kap = el('div', undefined, 'pf-alan' + (ayar.genis ? ' genis' : ''));
    const l = el('label', etiket); l.htmlFor = 'pf-' + ad;
    const g = el(ayar.tur === 'coksatir' ? 'textarea' : ayar.tur === 'sec' ? 'select' : 'input');
    g.id = 'pf-' + ad;
    if (ayar.tur === 'sec') {
      g.append(Object.assign(el('option', 'Seçiniz'), { value: '' }));
      for (const y of b.yakinlar) g.append(Object.assign(el('option', y), { value: y }));
    } else if (ayar.tur === 'coksatir') { g.rows = 3; g.maxLength = 250; }
    else { g.type = ayar.tur || 'text'; if (ayar.tur === 'tel') g.inputMode = 'tel'; g.maxLength = ayar.en || 120; }
    if (ayar.ipucu) g.placeholder = ayar.ipucu;
    if (ayar.otomatik) g.autocomplete = ayar.otomatik;
    const v = b.duzenle[ad] || '';
    g.value = ayar.tur === 'tel' ? telYaz(v) : v;
    g.addEventListener('input', degisti);
    alanlar[ad] = g;
    kap.append(l, g);
    return kap;
  };
  const form = el('form', undefined, 'pf-form');
  form.noValidate = true;
  const grup = (baslik, alt, ...cocuklar) => {
    const s = el('section', undefined, 'pf-bolum');
    s.append(el('h2', baslik));
    if (alt) s.append(el('p', alt, 'pf-not ust'));
    const g = el('div', undefined, 'pf-alanlar');
    g.append(...cocuklar);
    s.append(g);
    return s;
  };
  form.append(
    grup('İletişim', '', alan('email', 'E-posta', { tur: 'email', ipucu: 'ad@ornek.com', otomatik: 'email', genis: true }),
      alan('telefon2', 'İkinci telefon', { tur: 'tel', ipucu: '532 123 45 67', otomatik: 'tel', en: 20, genis: true })),
    grup('Adres', '', alan('il', 'İl', { en: 40, otomatik: 'address-level1' }), alan('ilce', 'İlçe', { en: 40, otomatik: 'address-level2' }),
      alan('adres', 'Açık adres', { tur: 'coksatir', ipucu: 'Mahalle, cadde/sokak, bina ve daire no', genis: true })),
    grup('Acil durumda aranacak yakın', 'Okul size ulaşamazsa bu kişiyi arar.', alan('yakinAd', 'Ad soyad', { en: 80, genis: true }),
      alan('yakinYakinlik', 'Yakınlık', { tur: 'sec' }), alan('yakinTelefon', 'Telefon', { tur: 'tel', ipucu: '532 123 45 67', en: 20 })),
  );
  const kaydet = el('button', 'Kaydet', 'birincil');
  kaydet.type = 'submit';
  kaydet.disabled = true;
  const cubuk = el('div', undefined, 'pf-kaydet');
  cubuk.append(kaydet);
  form.append(cubuk);
  icerik.append(form);

  let ilk = JSON.stringify(Object.fromEntries(Object.entries(alanlar).map(([a, g]) => [a, g.value])));
  const guncel = () => Object.fromEntries(Object.entries(alanlar).map(([a, g]) => [a, g.value]));
  function degisti() { kaydet.disabled = JSON.stringify(guncel()) === ilk; if (!kaydet.disabled) mesaj(''); }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    kaydet.disabled = true;
    const r = await api('/api/profil/kaydet', guncel());
    if (!r.ok) { kaydet.disabled = false; return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata'); }
    // Sunucudaki biçimle eşle (telefonlar boşluklu yazılır)
    for (const a of ['telefon2', 'yakinTelefon']) alanlar[a].value = telYaz(alanlar[a].value.replace(/\D/g, '').replace(/^(90|0)(?=\d{10}$)/, ''));
    ilk = JSON.stringify(guncel());
    mesaj('Bilgileriniz kaydedildi', 'tamam');
  });
})();
