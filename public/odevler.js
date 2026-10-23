// Öğrenci: ödevlerini görür, yaptım / yapamadım işaretler, fotoğraf ekler, soru sorar. Veli: çocuklarının ödevlerini salt okunur izler.
const kok = $('icerik');
let veri = null;

async function yukle() {
  const r = await api('/api/ders/odevlerim');
  if (!r.ok) { location.href = '/panel'; return; }
  veri = r.veri;
  liste();
}
yukle();

function liste() {
  ekranAc(kok);
  const { bugun, ogrenciler, durumlar } = veri;
  if (!ogrenciler.length) return kok.append(el('p', 'Bağlı öğrenci bulunamadı.', 'bos-not'));
  const gunFark = t => Math.round((new Date(t + 'T00:00:00Z') - new Date(bugun + 'T00:00:00Z')) / 86400000);
  for (const o of ogrenciler) {
    kok.append(el('h2', o.ad, 'baslik2'));
    const sayi = d => o.odevler.filter(x => d.includes(x.durum)).length;
    const ozet = el('div', undefined, 'odev-ozet od-uclu');
    for (const [say, ad, sinif] of [
      [sayi(['verildi', 'duzeltme', 'yapilamadi']), 'Yapılacak', 'bekleyen'],
      [sayi(['yapildi']), 'Onay bekliyor', 'bekleyen'],
      [sayi(['dogrulandi']), durumlar.dogrulandi.ad, 'dolan'],
    ]) {
      const k = el('div', undefined, 'odev-sayac ' + sinif);
      k.append(el('strong', String(say)), el('span', ad));
      ozet.append(k);
    }
    kok.append(ozet);
    if (!o.odevler.length) kok.append(el('p', 'Verilmiş ödev yok.', 'bos-not'));
    for (const x of o.odevler) {
      const bitti = x.durum === 'dogrulandi';
      const gecmis = x.sonTarih < bugun && !bitti;
      const fark = gunFark(x.sonTarih);
      const kart = el('button', undefined, 'odev-kart od-tikla' + (gecmis ? ' gecmis' : !bitti && fark <= 1 && x.durum === 'verildi' ? ' yakin' : bitti ? ' bitti' : ''));
      kart.type = 'button';
      const [, a, g] = x.sonTarih.split('-');
      const rozet = el('div', undefined, 'tarih-rozet');
      rozet.append(el('strong', String(Number(g))), el('span', AYLAR[Number(a) - 1]));
      const orta = el('div', undefined, 'etut-orta');
      orta.append(el('strong', x.baslik), el('span', `${x.ders}${x.ogretmen ? ' · ' + x.ogretmen : ''}`, 'alt'));
      if (x.aciklama) orta.append(el('span', x.aciklama, 'odev-aciklama'));
      const etiketler = el('div', undefined, 'kl-chipler');
      etiketler.append(durumChip(durumlar, x.durum));
      if (!bitti) etiketler.append(chip(gecmis ? 'Süresi doldu' : fark === 0 ? 'Bugün' : fark === 1 ? 'Yarın' : `${fark} gün`));
      if (x.dosya) etiketler.append(chip(`${x.dosya} fotoğraf`));
      if (x.yeniMesaj) etiketler.append(chip('Yeni yanıt', 'vurgu'));
      orta.append(etiketler);
      kart.append(rozet, orta, el('span', '›', 'kl-git'));
      kart.addEventListener('click', () => detay(o, x));
      kok.append(kart);
    }
  }
}

async function detay(o, x) {
  ekranAc(kok);
  await odevEkrani(kok, {
    odevId: x.id, ogrenciId: o.id, geriMetin: 'Ödevler',
    geri: async () => { await yukle(); },
    degisti: () => { /* liste geri dönüşte yeniden yüklenir */ },
  });
}
