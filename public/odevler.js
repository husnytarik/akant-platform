// Öğrenci: ödevlerini görür, yaptım / yapamadım işaretler, fotoğraf ekler, soru sorar. Veli: çocuklarının ödevlerini salt okunur izler.
const kok = $('icerik');
let veri = null;
// Süzgeç: durum ve ders (ekran yenilenince korunur)
const suzgec = { durum: '', ders: '' };
const DURUM_SUZ = [['', 'Tüm ödevler'], ['yapilacak', 'Yapılacak'], ['onay', 'Onay bekliyor'], ['bitti', 'Tamamlandı'], ['gecmis', 'Süresi dolan']];

async function yukle() {
  const r = await api('/api/ders/odevlerim');
  if (!r.ok) { location.href = '/panel'; return; }
  veri = r.veri;
  liste();
}
yukle();

function liste() {
  ekranAc(kok);
  const { ogrenciler } = veri;
  if (!ogrenciler.length) return kok.append(el('p', 'Bağlı öğrenci bulunamadı.', 'bos-not'));
  const arac = el('div', undefined, 'ol-arac');
  const durumSec = el('select'); durumSec.setAttribute('aria-label', 'Duruma göre süz');
  for (const [k, ad] of DURUM_SUZ) durumSec.append(new Option(ad, k));
  const dersSec = el('select'); dersSec.setAttribute('aria-label', 'Derse göre süz');
  dersSec.append(new Option('Tüm dersler', ''));
  for (const d of [...new Set(ogrenciler.flatMap(o => o.odevler.map(x => x.ders)))].sort((a, b) => a.localeCompare(b, 'tr'))) dersSec.append(new Option(d, d));
  durumSec.value = suzgec.durum; dersSec.value = suzgec.ders;
  if (dersSec.value !== suzgec.ders) { dersSec.value = ''; suzgec.ders = ''; }
  arac.append(durumSec, dersSec);
  const icerik = el('div');
  const yenile = () => { suzgec.durum = durumSec.value; suzgec.ders = dersSec.value; icerik.replaceChildren(); ciz(icerik); };
  durumSec.addEventListener('change', yenile); dersSec.addEventListener('change', yenile);
  kok.append(arac, icerik);
  ciz(icerik);
}

function ciz(kok) {
  const { bugun, ogrenciler, durumlar } = veri;
  const suzuk = !!(suzgec.durum || suzgec.ders);
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
    const gorunen = o.odevler.filter(x => {
      if (suzgec.ders && x.ders !== suzgec.ders) return false;
      const bitti = x.durum === 'dogrulandi';
      return { '': true, yapilacak: ['verildi', 'duzeltme', 'yapilamadi'].includes(x.durum), onay: x.durum === 'yapildi', bitti, gecmis: x.sonTarih < bugun && !bitti }[suzgec.durum];
    });
    if (!gorunen.length) kok.append(el('p', suzuk && o.odevler.length ? 'Bu süzgece uyan ödev yok.' : 'Verilmiş ödev yok.', 'bos-not'));
    for (const x of gorunen) {
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
