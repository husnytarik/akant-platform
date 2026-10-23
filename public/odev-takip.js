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

function ana() {
  ekranAc(kok);
  const { odevler, bugun } = liste;
  if (!odevler.length) return kok.append(el('p', 'Henüz ödev vermediniz. Ödevler Derslerim ekranında dersi bitirirken eklenir.', 'bos-not'));
  const bekleyenler = odevler.filter(x => x.bekleyen);
  kok.append(el('p', bekleyenler.length ? `${bekleyenler.reduce((t, x) => t + x.yapildi, 0)} ödev onayınızı, ${bekleyenler.reduce((t, x) => t + x.soru, 0)} soru yanıtınızı bekliyor.` : 'Bekleyen onay ya da soru yok.', 'kl-not'));
  for (const x of odevler) {
    const kart = el('button', undefined, 'odev-kart od-tikla' + (x.sonTarih < bugun ? ' gecmis' : ''));
    kart.type = 'button';
    const [, a, g] = x.sonTarih.split('-');
    const rozet = el('div', undefined, 'tarih-rozet');
    rozet.append(el('strong', String(Number(g))), el('span', AYLAR[Number(a) - 1]));
    const orta = el('div', undefined, 'etut-orta');
    orta.append(el('strong', x.baslik), el('span', `${x.sinif} · ${x.ders}`, 'alt'));
    const etiketler = el('div', undefined, 'kl-chipler');
    etiketler.append(chip(`${x.dogrulandi}/${x.toplam} doğrulandı`, x.toplam && x.dogrulandi === x.toplam ? 'tamam' : ''));
    if (x.yapildi) etiketler.append(chip(`${x.yapildi} onay bekliyor`, 'vurgu'));
    if (x.duzeltme) etiketler.append(chip(`${x.duzeltme} düzeltmede`));
    if (x.yapilamadi) etiketler.append(chip(`${x.yapilamadi} yapamadı`, 'dolu'));
    if (x.soru) etiketler.append(chip(`${x.soru} soru`, 'vurgu'));
    orta.append(etiketler);
    kart.append(rozet, orta, el('span', '›', 'kl-git'));
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

  const ozet = el('div', undefined, 'kl-chipler');
  ozet.append(chip(`${sayilar.dogrulandi}/${sayilar.toplam} ${durumlar.dogrulandi.ad.toLowerCase()}`, sayilar.toplam && sayilar.dogrulandi === sayilar.toplam ? 'tamam' : ''));
  if (sayilar.yapildi) ozet.append(chip(`${sayilar.yapildi} onay bekliyor`, 'vurgu'));
  kok.append(ozet);

  if (sayilar.yapildi) {
    const t = el('button', `“${durumlar.yapildi.ad}” diyen ${sayilar.yapildi} öğrenciyi doğrula`, 'birincil kucuk od-toplu');
    t.type = 'button';
    t.addEventListener('click', async () => {
      t.disabled = true;
      const s = await api('/api/odev/toplu-dogrula', { odevId });
      if (!s.ok) { t.disabled = false; return mesaj(s.veri.hata || 'Doğrulanamadı', 'hata'); }
      await takip(odevId, `${s.veri.adet} öğrenci doğrulandı`);
    });
    kok.append(t);
  }

  const kart = el('article', undefined, 'kl-kart');
  for (const o of ogrenciler) {
    const satir = el('button', undefined, 'gz-ogrenci');
    satir.type = 'button';
    const ad = el('span', o.ad);
    const sag = el('span', undefined, 'kl-chipler');
    if (o.soru) sag.append(chip('Soru', 'vurgu'));
    if (o.dosya) sag.append(chip(`${o.dosya} 📷`));
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
