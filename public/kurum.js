// Okul kurulumu: kurum profili, kampüsler, kampüsteki okullar ve okulların müdür / müdür yardımcıları.
(() => {
  const kurumKok = document.getElementById('kurum-bolum');
  const kampusKok = document.getElementById('kampus-bolum');
  let v = null;
  let duzenKurum = false;
  let kampusForm = null;   // { id } (id null = yeni kampüs)
  let okulForm = null;     // { id, kampusId } (id null = yeni okul)
  let acikOkul = null;     // ayrıntısı açık okul
  let yoneticiForm = null; // yönetici eklenen okulun id'si

  const el = (tag, metin, sinif) => {
    const e = document.createElement(tag);
    if (metin !== undefined) e.textContent = metin;
    if (sinif) e.className = sinif;
    return e;
  };
  const mesaj = (metin, tur = '') => { const m = document.getElementById('mesaj'); m.textContent = metin; m.className = 'mesaj ' + tur; };
  const telYaz = t => t && /^\d{10}$/.test(t) ? `0${t.slice(0, 3)} ${t.slice(3, 6)} ${t.slice(6, 8)} ${t.slice(8)}` : (t || '');

  async function api(yol, govde) {
    const r = await fetch(yol, govde === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(govde) });
    if (r.status === 401) { location.href = '/'; throw new Error('oturum'); }
    if (r.status === 403 && govde === undefined) { location.href = '/panel'; throw new Error('yetki'); }
    return { ok: r.ok, veri: await r.json().catch(() => ({})) };
  }

  // Yazma işlemi: hata ya da başarı mesajı gösterip veriyi yeniler
  async function yap(yol, govde, basari) {
    const r = await api(yol, govde);
    if (!r.ok) { mesaj(r.veri.hata || 'İşlem yapılamadı', 'hata'); return null; }
    mesaj(basari, 'tamam');
    await yukle();
    return r;
  }

  function alan(etiket, kontrol, id) {
    kontrol.id = id;
    const l = el('label', etiket); l.htmlFor = id;
    const kap = document.createElement('div');
    kap.append(l, kontrol);
    return kap;
  }
  const girdi = (deger, ek = {}) => Object.assign(el('input'), { value: deger || '', maxLength: 200 }, ek);
  const secenek = (sel, liste) => { for (const [d, e] of liste) sel.append(Object.assign(el('option', e), { value: d })); return sel; };

  // Logo seçici: dosyayı yuvarlak çerçevede kırptırır (PNG, 512 px); kaydedilene dek yalnızca bellekte tutulur
  function logoSecici(ad, mevcutUrl) {
    const kap = el('div', undefined, 'logo-sec');
    const onizleme = el('span');
    onizleme.append(avatarYap(ad, mevcutUrl, 'orta logo'));
    const dosya = el('input'); dosya.type = 'file'; dosya.accept = 'image/jpeg,image/png,image/webp'; dosya.hidden = true;
    const dugme = el('button', mevcutUrl ? 'Logoyu değiştir' : 'Logo seç', 'ikincil'); dugme.type = 'button';
    dugme.addEventListener('click', () => dosya.click());
    const sec = { blob: null, kap };
    dosya.addEventListener('change', async () => {
      const f = dosya.files[0];
      dosya.value = '';
      if (!f) return;
      try {
        const k = await fotoKirp(f, { tur: 'png', kenar: 512, baslik: 'Logoyu ayarlayın' });
        if (!k) return;
        sec.blob = k.blob;
        const av = el('span', undefined, 'ogr-avatar orta logo');
        av.append(k.tuval);
        onizleme.replaceChildren(av);
        dugme.textContent = 'Logoyu değiştir';
      } catch { mesaj('Logo okunamadı; başka bir görsel deneyin.', 'hata'); }
    });
    kap.append(onizleme, dugme, dosya);
    return sec;
  }
  async function logoYukle(yol, blob) {
    const y = await fetch(yol, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
    return y.ok ? null : ((await y.json().catch(() => ({}))).hata || 'Logo yüklenemedi');
  }

  const kaydetCubuk = (vazgec) => {
    const k = el('div', undefined, 'ku-cubuk');
    const v1 = el('button', 'Vazgeç', 'ikincil'); v1.type = 'button'; v1.addEventListener('click', vazgec);
    const k1 = el('button', 'Kaydet', 'birincil'); k1.type = 'submit';
    k.append(v1, k1);
    return k;
  };

  // ---- 1. Kurum profili ----
  function cizKurum() {
    kurumKok.replaceChildren();
    const k = v.kurum;
    const ust = el('div', undefined, 'ekle-ust');
    ust.append(el('h3', 'Kurum profili', 'baslik3'));
    if (v.kurumYonetimi) {
      const d = el('button', duzenKurum ? 'Vazgeç' : 'Düzenle', 'ekle-ac' + (duzenKurum ? ' acik' : '')); d.type = 'button';
      d.addEventListener('click', () => { duzenKurum = !duzenKurum; mesaj(''); cizKurum(); });
      ust.append(d);
    }
    kurumKok.append(ust);

    const logoUrl = v.logo ? `/api/kurum-logo?v=${v.logo}` : null;
    if (!duzenKurum) {
      const baslik = el('div', undefined, 'ku-profil');
      const yazi = el('div', undefined, 'ku-profil-yazi');
      yazi.append(el('strong', k.ad), el('small', k.kisaAd || 'Kısa ad girilmedi'));
      baslik.append(avatarYap(k.ad, logoUrl, 'orta logo'), yazi);
      kurumKok.append(baslik);
      const bilgi = el('div', undefined, 'ku-bilgi');
      for (const [ad, deger] of [['Telefon', telYaz(k.telefon)], ['E-posta', k.eposta], ['Web', k.web], ['Adres', k.adres]]) {
        if (!deger) continue;
        const r = el('div'); r.append(el('span', ad), el('b', deger)); bilgi.append(r);
      }
      if (!bilgi.children.length) bilgi.append(el('small', 'Telefon, e-posta ve adres henüz girilmedi.', 'alt'));
      kurumKok.append(bilgi);
      return;
    }

    const f = el('form', undefined, 'ekle-form');
    const ad = girdi(k.ad, { required: true, maxLength: 80 });
    const kisa = girdi(k.kisaAd, { maxLength: 30, placeholder: 'Kısa ad (isteğe bağlı)' });
    const tel = girdi(telYaz(k.telefon), { type: 'tel', maxLength: 30 });
    const ep = girdi(k.eposta, { type: 'email', maxLength: 80 });
    const web = girdi(k.web, { maxLength: 100, placeholder: 'Web sitesi adresi' });
    const adr = girdi(k.adres);
    const logo = logoSecici(k.ad, logoUrl);
    const sat1 = el('div', undefined, 'form-satir'); sat1.append(alan('Kısa ad', kisa, 'kp-kisa'), alan('Telefon', tel, 'kp-tel'));
    const sat2 = el('div', undefined, 'form-satir'); sat2.append(alan('E-posta', ep, 'kp-ep'), alan('Web sitesi', web, 'kp-web'));
    f.append(alan('Kurum adı', ad, 'kp-ad'), sat1, sat2, alan('Adres', adr, 'kp-adr'), alan('Logo', logo.kap, 'kp-logo'));
    if (v.logo) {
      const sil = el('button', 'Mevcut logoyu kaldır', 'kur-sil'); sil.type = 'button';
      sil.addEventListener('click', async () => {
        if (!confirm('Kurum logosu kaldırılsın mı?')) return;
        await yap('/api/yonetim/kurum-logo-sil', {}, 'Logo kaldırıldı.');
      });
      f.append(sil);
    }
    f.append(kaydetCubuk(() => { duzenKurum = false; cizKurum(); }));
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const r = await api('/api/yonetim/kurum-kaydet', { ad: ad.value, kisaAd: kisa.value, telefon: tel.value, eposta: ep.value, web: web.value, adres: adr.value });
      if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
      let ek = '';
      if (logo.blob) { const h = await logoYukle('/api/yonetim/kurum-logo', logo.blob); if (h) ek = ' ' + h; }
      duzenKurum = false;
      await yukle();
      mesaj('Kurum profili kaydedildi.' + ek, ek ? 'hata' : 'tamam');
    });
    kurumKok.append(f);
  }

  // ---- 2. Kampüsler ve okullar ----
  function kampusFormu(kampus) {
    const f = el('form', undefined, 'ekle-form');
    const ad = girdi(kampus?.ad, { required: true, maxLength: 80 });
    const adr = girdi(kampus?.adres);
    const tel = girdi(telYaz(kampus?.telefon), { type: 'tel', maxLength: 30 });
    const sat = el('div', undefined, 'form-satir'); sat.append(alan('Telefon', tel, 'kf-tel'));
    f.append(alan('Kampüs adı', ad, 'kf-ad'), alan('Adres', adr, 'kf-adr'), sat);
    f.append(kaydetCubuk(() => { kampusForm = null; cizKampus(); }));
    if (kampus) {
      const sil = el('button', 'Kampüsü sil', 'kur-sil'); sil.type = 'button';
      sil.addEventListener('click', async () => {
        if (!confirm(`${kampus.ad} kampüsü silinsin mi?`)) return;
        kampusForm = null;
        await yap('/api/yonetim/kampus-sil', { id: kampus.id }, 'Kampüs silindi.');
      });
      f.append(sil);
    }
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const r = await api('/api/yonetim/kampus-kaydet', { id: kampus?.id ?? null, ad: ad.value, adres: adr.value, telefon: tel.value });
      if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
      kampusForm = null;
      await yukle();
      mesaj('Kampüs kaydedildi.', 'tamam');
    });
    return f;
  }

  function okulFormu(okul, kampusId) {
    const f = el('form', undefined, 'ekle-form');
    const ad = girdi(okul?.ad, { required: true, maxLength: 80, placeholder: 'Okul adı' });
    const tur = secenek(el('select'), [['', 'Seçilmedi'], ...v.turler.map(t => [t, t])]); tur.value = okul?.tur || '';
    const kod = girdi(okul?.kurumKodu, { maxLength: 30 });
    const tel = girdi(telYaz(okul?.telefon), { type: 'tel', maxLength: 30 });
    const ep = girdi(okul?.eposta, { type: 'email', maxLength: 80 });
    const adr = girdi(okul?.adres);
    const logo = logoSecici(okul?.ad, okul?.logo ? `/api/okul-logo?id=${okul.id}&v=${okul.logo}` : null);
    const s1 = el('div', undefined, 'form-satir'); s1.append(alan('Okul türü', tur, 'of-tur'), alan('Kurum kodu', kod, 'of-kod'));
    const s2 = el('div', undefined, 'form-satir'); s2.append(alan('Telefon', tel, 'of-tel'), alan('E-posta', ep, 'of-ep'));
    f.append(alan('Okul adı', ad, 'of-ad'), s1, s2, alan('Adres', adr, 'of-adr'), alan('Logo', logo.kap, 'of-logo'));
    if (okul?.logo) {
      const sil = el('button', 'Mevcut logoyu kaldır', 'kur-sil'); sil.type = 'button';
      sil.addEventListener('click', async () => {
        if (!confirm('Okul logosu kaldırılsın mı?')) return;
        await yap('/api/okul-logo-sil?id=' + okul.id, {}, 'Logo kaldırıldı.');
      });
      f.append(sil);
    }
    f.append(kaydetCubuk(() => { okulForm = null; cizKampus(); }));
    if (okul) {
      const sil = el('button', 'Okulu sil', 'kur-sil'); sil.type = 'button';
      sil.addEventListener('click', async () => {
        if (!confirm(`${okul.ad} silinsin mi? Okulda sınıf ya da kayıtlı kişi varsa silinemez.`)) return;
        okulForm = null;
        await yap('/api/yonetim/okul-sil', { id: okul.id }, 'Okul silindi.');
      });
      f.append(sil);
    }
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const r = await api('/api/yonetim/okul-kaydet', { id: okul?.id ?? null, kampusId, ad: ad.value, tur: tur.value, kurumKodu: kod.value, telefon: tel.value, eposta: ep.value, adres: adr.value });
      if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
      let ek = '';
      if (logo.blob) { const h = await logoYukle('/api/okul-logo?id=' + r.veri.id, logo.blob); if (h) ek = ' ' + h; }
      okulForm = null;
      acikOkul = r.veri.id;
      await yukle();
      mesaj('Okul kaydedildi.' + ek, ek ? 'hata' : 'tamam');
    });
    return f;
  }

  function yoneticiFormu(okul) {
    const f = el('form', undefined, 'ekle-form');
    const mudurVar = okul.yoneticiler.some(y => y.gorev === 'mudur');
    const gorev = secenek(el('select'), Object.entries(v.gorevler));
    gorev.value = mudurVar ? 'mudur_yrd' : 'mudur';
    const mevcut = new Set(okul.yoneticiler.map(y => y.userId));
    const kisi = secenek(el('select'), [['yeni', 'Yeni kişi ekle…'], ...v.adaylar.filter(a => !mevcut.has(a.userId)).map(a => [String(a.userId), `${a.ad} · ${a.rol}${a.okul ? ' · ' + a.okul : ''}`])]);
    const yeni = el('div', undefined, 'ku-yeni');
    const ad = girdi('', { maxLength: 80, placeholder: 'Ad soyad' });
    const kimlik = girdi('', { maxLength: 20, placeholder: 'T.C. kimlik / pasaport no' });
    const tel = girdi('', { type: 'tel', maxLength: 30, placeholder: '5XX XXX XX XX' });
    const s = el('div', undefined, 'form-satir'); s.append(alan('Kimlik / pasaport no', kimlik, 'yf-kimlik'), alan('Telefon', tel, 'yf-tel'));
    yeni.append(alan('Ad soyad', ad, 'yf-ad'), s);
    kisi.addEventListener('change', () => yeni.classList.toggle('gizli', kisi.value !== 'yeni'));
    f.append(alan('Görev', gorev, 'yf-gorev'), alan('Kişi', kisi, 'yf-kisi'), yeni);
    f.append(kaydetCubuk(() => { yoneticiForm = null; cizKampus(); }));
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const govde = { okulId: okul.id, gorev: gorev.value };
      if (kisi.value === 'yeni') Object.assign(govde, { ad: ad.value, kimlik: kimlik.value, telefon: tel.value });
      else govde.userId = Number(kisi.value);
      const r = await api('/api/yonetim/yonetici-ekle', govde);
      if (!r.ok) return mesaj(r.veri.hata || 'Eklenemedi', 'hata');
      yoneticiForm = null;
      await yukle();
      mesaj('Yönetici eklendi.', 'tamam');
    });
    return f;
  }

  function yoneticiSatiri(y, okul) {
    const s = el('div', undefined, 'ku-yonetici');
    const yazi = el('div', undefined, 'ku-profil-yazi');
    yazi.append(el('strong', y.ad), el('small', [v.gorevler[y.gorev], telYaz(y.telefon)].filter(Boolean).join(' · ')));
    s.append(avatarYap(y.ad, y.foto, 'kucuk'), yazi);
    if (v.kurumYonetimi) {
      const k = el('button', 'Kaldır', 'kur-sil'); k.type = 'button';
      k.addEventListener('click', async () => {
        if (!confirm(`${y.ad}, ${okul.ad} ${v.gorevler[y.gorev].toLowerCase()} görevinden kaldırılsın mı?`)) return;
        await yap('/api/yonetim/yonetici-kaldir', { id: y.id }, 'Görevden kaldırıldı.');
      });
      s.append(k);
    }
    return s;
  }

  function okulAyrinti(okul) {
    const kutu = el('div', undefined, 'ku-ayrinti');
    const bilgi = el('div', undefined, 'ku-bilgi');
    for (const [ad, deger] of [['Okul türü', okul.tur], ['Kurum kodu', okul.kurumKodu], ['Telefon', telYaz(okul.telefon)], ['E-posta', okul.eposta], ['Adres', okul.adres]]) {
      if (!deger) continue;
      const r = el('div'); r.append(el('span', ad), el('b', deger)); bilgi.append(r);
    }
    if (bilgi.children.length) kutu.append(bilgi);

    kutu.append(el('h4', 'Okul yönetimi', 'baslik3 ku-alt-baslik'));
    const mudur = okul.yoneticiler.filter(y => y.gorev === 'mudur'), yrd = okul.yoneticiler.filter(y => y.gorev === 'mudur_yrd');
    if (!okul.yoneticiler.length) kutu.append(el('p', 'Henüz müdür ya da müdür yardımcısı atanmadı.', 'alt'));
    else if (!mudur.length) kutu.append(el('p', 'Müdür atanmadı.', 'alt'));
    for (const y of [...mudur, ...yrd]) kutu.append(yoneticiSatiri(y, okul));

    if (v.kurumYonetimi) {
      if (yoneticiForm === okul.id) kutu.append(yoneticiFormu(okul));
      else {
        const b = el('button', '+ Yönetici ekle', 'ku-baglanti'); b.type = 'button';
        b.addEventListener('click', () => { yoneticiForm = okul.id; cizKampus(); });
        const d = el('button', 'Okulu düzenle', 'ku-baglanti'); d.type = 'button';
        d.addEventListener('click', () => { okulForm = { id: okul.id, kampusId: okul.kampusId }; cizKampus(); });
        const sat = el('div', undefined, 'ku-eylem'); sat.append(b, d);
        kutu.append(sat);
      }
    }
    return kutu;
  }

  function okulSatiri(okul) {
    const kap = el('div', undefined, 'ku-okul' + (acikOkul === okul.id ? ' acik' : ''));
    const bas = el('button', undefined, 'ku-okul-bas'); bas.type = 'button';
    const yazi = el('div', undefined, 'ku-profil-yazi');
    const mudur = okul.yoneticiler.find(y => y.gorev === 'mudur');
    const ozet = [okul.tur, `${okul.sinif} sınıf`, `${okul.ogrenci} öğrenci`].filter(Boolean).join(' · ');
    yazi.append(el('strong', okul.ad), el('small', ozet), el('small', mudur ? `Müdür: ${mudur.ad}` : 'Müdür atanmadı', mudur ? 'ku-mudur' : 'ku-mudur yok'));
    bas.append(avatarYap(okul.ad, okul.logo ? `/api/okul-logo?id=${okul.id}&v=${okul.logo}` : null, 'orta logo'), yazi, el('span', acikOkul === okul.id ? '⌃' : '⌄', 'ku-ok'));
    bas.addEventListener('click', () => { acikOkul = acikOkul === okul.id ? null : okul.id; if (acikOkul !== okul.id) { yoneticiForm = null; okulForm = null; } cizKampus(); });
    kap.append(bas);
    if (acikOkul === okul.id) kap.append(okulForm?.id === okul.id ? okulFormu(okul, okul.kampusId) : okulAyrinti(okul));
    return kap;
  }

  function cizKampus() {
    kampusKok.replaceChildren();
    const ust = el('div', undefined, 'ekle-ust');
    ust.append(el('h3', 'Kampüsler ve okullar', 'baslik3'));
    if (v.kurumYonetimi) {
      const d = el('button', kampusForm && !kampusForm.id ? 'Vazgeç' : '+ Kampüs ekle', 'ekle-ac' + (kampusForm && !kampusForm.id ? ' acik' : '')); d.type = 'button';
      d.addEventListener('click', () => { kampusForm = kampusForm && !kampusForm.id ? null : { id: null }; cizKampus(); });
      ust.append(d);
    }
    kampusKok.append(ust);
    if (kampusForm && !kampusForm.id) kampusKok.append(kampusFormu(null));
    if (!v.kampusler.length && !kampusForm) kampusKok.append(el('p', 'Henüz kampüs eklenmedi. Kampüs sayısında sınır yoktur; her kampüste istediğiniz kadar okul olabilir.', 'alt'));

    for (const k of v.kampusler) {
      const blok = el('div', undefined, 'ku-kampus');
      const bas = el('div', undefined, 'ku-kampus-bas');
      const yazi = el('div', undefined, 'ku-profil-yazi');
      yazi.append(el('strong', k.ad), el('small', [k.adres, telYaz(k.telefon)].filter(Boolean).join(' · ') || `${k.okullar.length} okul`));
      bas.append(yazi);
      if (v.kurumYonetimi && kampusForm?.id !== k.id) {
        const d = el('button', 'Düzenle', 'ku-baglanti'); d.type = 'button';
        d.addEventListener('click', () => { kampusForm = { id: k.id }; cizKampus(); });
        bas.append(d);
      }
      blok.append(bas);
      if (kampusForm?.id === k.id) blok.append(kampusFormu(k));
      for (const o of k.okullar) blok.append(okulSatiri(o));
      if (!k.okullar.length) blok.append(el('p', 'Bu kampüse henüz okul eklenmedi.', 'alt'));
      if (v.kurumYonetimi) {
        if (okulForm && !okulForm.id && okulForm.kampusId === k.id) blok.append(okulFormu(null, k.id));
        else {
          const b = el('button', '+ Okul ekle', 'ku-baglanti'); b.type = 'button';
          b.addEventListener('click', () => { okulForm = { id: null, kampusId: k.id }; cizKampus(); });
          blok.append(b);
        }
      }
      kampusKok.append(blok);
    }
  }

  async function yukle() {
    const r = await api('/api/yonetim/kurum');
    v = r.veri;
    cizKurum();
    cizKampus();
  }
  yukle();
})();
