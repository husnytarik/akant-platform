// Öğretmen: verdiği ödevleri izler; kim yaptım dedi, kimin sorusu var görür; doğrular, düzeltme ister, soruları yanıtlar.
const kok = $('icerik');
let liste = null;
const params = new URLSearchParams(location.search);

async function yukle() {
  const r = await api('/api/odev/ogretmen');
  if (!r.ok) return mesaj(r.veri.hata || 'Ödevler alınamadı', 'hata');
  liste = r.veri;
  ana();
}

// Süzgeç düğmeleri (Onay bekleyenler / Tümü); seçim sayfa açık kaldıkça korunur
const suzgec = { liste: null, ogrenci: null };
function hapSatiri(secenekler, secili, degis) {
  const k = el('div', undefined, 'sekmeler ot-hap');
  for (const [kod, ad] of secenekler) {
    const b = el('button', ad); b.type = 'button';
    b.setAttribute('aria-pressed', String(kod === secili));
    b.addEventListener('click', () => degis(kod));
    k.append(b);
  }
  return k;
}

function ilerleme(dogrulandi, toplam) {
  const k = el('div', undefined, 'ot-ilerleme');
  const cubuk = el('span', undefined, 'ot-cubuk');
  const dolgu = el('i');
  dolgu.style.width = (toplam ? Math.round(100 * dogrulandi / toplam) : 0) + '%';
  cubuk.append(dolgu);
  k.append(cubuk, el('small', `${dogrulandi}/${toplam} doğrulandı`));
  return k;
}

function ana() {
  ekranAc(kok);
  const { odevler, bugun } = liste;
  if (!odevler.length) return kok.append(el('p', 'Henüz ödev vermediniz. Ödevler Derslerim ekranında dersi bitirirken eklenir.', 'bos-not'));
  const bekleyenler = odevler.filter(x => x.bekleyen);
  if (suzgec.liste === null) suzgec.liste = bekleyenler.length ? 'bekleyen' : 'tum';
  kok.append(hapSatiri([['bekleyen', `İşlem bekleyen (${bekleyenler.length})`], ['tum', `Tüm ödevler (${odevler.length})`]], suzgec.liste, kod => { suzgec.liste = kod; ana(); }));
  const gorunen = suzgec.liste === 'bekleyen' ? bekleyenler : odevler;
  if (!gorunen.length) kok.append(el('p', 'Bekleyen onay ya da soru yok.', 'bos-not'));
  for (const x of gorunen) {
    const kart = el('button', undefined, 'ot-kart' + (x.sonTarih < bugun ? ' gecmis' : ''));
    kart.type = 'button';
    const ust = el('div', undefined, 'ot-ust');
    ust.append(el('span', `${x.sinif} · ${x.ders}`, 'ot-sinif'), el('span', x.sonTarih < bugun ? 'Süresi doldu · ' + tarihYaz(x.sonTarih) : 'Son ' + tarihYaz(x.sonTarih), 'ot-tarih'));
    kart.append(ust, el('strong', x.baslik, 'ot-baslik'), ilerleme(x.dogrulandi, x.toplam));
    const alt = el('div', undefined, 'ot-alt');
    if (x.yapildi) alt.append(el('span', `${x.yapildi} onay bekliyor`, 'ot-bekle'));
    if (x.soru) alt.append(el('span', `${x.soru} soru`, 'ot-bekle'));
    const sessiz = [x.duzeltme && `${x.duzeltme} düzeltmede`, x.yapilamadi && `${x.yapilamadi} yapamadı`].filter(Boolean).join(' · ');
    if (sessiz) alt.append(el('span', sessiz, 'ot-sessiz'));
    if (alt.children.length) kart.append(alt);
    kart.addEventListener('click', () => takip(x.id));
    kok.append(kart);
  }
}

async function takip(odevId, metin) {
  const r = await api('/api/odev/takip?odevId=' + odevId);
  if (!r.ok) return mesaj(r.veri.hata || 'Ödev alınamadı', 'hata');
  const v = r.veri;
  const { odev, durumlar, sayilar, ogrenciler } = v;
  ekranAc(kok);
  kok.append(geriDugme('Ödevler', yukle));
  const ust = el('div', undefined, 'kl-ust');
  const b = el('div');
  b.append(el('h2', odev.baslik, 'kl-buyuk'), el('p', `${odev.sinif} · ${odev.ders} · Son tarih ${tarihYaz(odev.sonTarih)}`, 'kl-not'));
  ust.append(b);
  kok.append(ust);
  if (odev.aciklama) kok.append(el('p', odev.aciklama, 'odev-aciklama'));

  // Özet: bekleyen sayısı, ilerleme ve toplu doğrulama tek kartta
  const ozet = el('section', undefined, 'ot-ozet');
  const bilgi = el('div', undefined, 'ot-ozet-bilgi');
  if (sayilar.yapildi) bilgi.append(el('strong', String(sayilar.yapildi)), el('span', 'öğrenci onayınızı bekliyor'));
  else bilgi.append(el('span', sayilar.toplam && sayilar.dogrulandi === sayilar.toplam ? 'Tüm öğrenciler doğrulandı' : 'Onay bekleyen öğrenci yok', 'ot-ozet-yok'));
  ozet.append(bilgi, ilerleme(sayilar.dogrulandi, sayilar.toplam));
  if (sayilar.yapildi) {
    const t = el('button', `Hepsini doğrula (${sayilar.yapildi})`, 'birincil od-toplu');
    t.type = 'button';
    t.addEventListener('click', async () => {
      t.disabled = true;
      const s = await api('/api/odev/toplu-dogrula', { odevId });
      if (!s.ok) { t.disabled = false; return mesaj(s.veri.hata || 'Doğrulanamadı', 'hata'); }
      await takip(odevId, `${s.veri.adet} öğrenci doğrulandı`);
    });
    ozet.append(t);
  }
  kok.append(ozet);

  // Öğrenciler: onay bekleyenler ve soru soranlar üstte
  const bekler = o => o.durum === 'yapildi' || o.soru;
  if (suzgec.ogrenci === null || suzgec.odev !== odevId) { suzgec.odev = odevId; suzgec.ogrenci = ogrenciler.some(bekler) ? 'bekleyen' : 'tum'; }
  const goster = suzgec.ogrenci === 'bekleyen' ? ogrenciler.filter(bekler) : ogrenciler;
  const sirali = [...goster].sort((a, b) => bekler(b) - bekler(a));
  kok.append(hapSatiri([['bekleyen', `İşlem bekleyen (${ogrenciler.filter(bekler).length})`], ['tum', `Tüm öğrenciler (${ogrenciler.length})`]], suzgec.ogrenci, kod => { suzgec.ogrenci = kod; takip(odevId); }));
  const kart = el('article', undefined, 'kl-kart ot-ogrenciler');
  if (!sirali.length) kart.append(el('p', 'Bu süzgeçte öğrenci yok.', 'bos-not'));
  for (const o of sirali) {
    const satir = el('button', undefined, 'gz-ogrenci');
    satir.type = 'button';
    const ad = el('span', undefined, 'gz-ad');
    const yazi = el('span', undefined, 'gz-yazi');
    yazi.append(el('b', o.ad));
    const alt = [o.soru && 'Soru sordu', o.dosya && `${o.dosya} fotoğraf`].filter(Boolean).join(' · ');
    if (alt) yazi.append(el('small', alt));
    ad.append(avatarYap(o.ad, o.foto, 'kucuk'), yazi);
    const sag = el('span', undefined, 'kl-chipler');
    sag.append(durumChip(durumlar, o.durum));
    satir.append(ad, sag, el('span', '›', 'kl-git'));
    satir.addEventListener('click', () => ogrenciAc(odevId, o));
    kart.append(satir);
  }
  kok.append(kart);
  if (metin) mesaj(metin, 'tamam');
}

async function ogrenciAc(odevId, o) {
  ekranAc(kok);
  await odevEkrani(kok, { odevId, ogrenciId: o.id, geriMetin: 'Öğrenciler', geri: () => takip(odevId) });
}

const ilk = Number(params.get('odevId'));
if (ilk) takip(ilk).then(() => { /* doğrudan bağlantı: geri düğmesi listeye döner */ });
else yukle();
