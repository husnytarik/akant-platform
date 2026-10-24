// Öğretmen: dönem açıkken öğrencilerim için yönetimin belirlediği başlıklarda gözlem girer; önceki dönemlerdeki kendi girişlerini
// ve veli toplantısı / görüşme notlarını salt okunur görür. Girişi tamamlanmış öğrenci "Düzenle"ye basılana kadar kilitli açılır.
const kok = $('icerik');
let veri = null;
const acikSiniflar = new Set(); // ekran yenilense de açık sınıflar açık kalır

async function yukle(donemId) {
  const r = await api('/api/gelisim/ogretmen' + (donemId ? '?donemId=' + donemId : ''));
  if (!r.ok) return mesaj(r.veri.hata || 'Veriler alınamadı', 'hata');
  veri = r.veri;
  ana();
}
yukle();

const kisaAd = ad => ad.split(' (')[0];
const secilenDonem = () => veri.donemler.find(d => d.id === veri.donemId);

function ana() {
  ekranAc(kok);
  if (!veri.donemler.length) return kok.append(el('p', 'Yönetim henüz bir gözlem dönemi tanımlamadı.', 'bos-not'));
  if (!veri.siniflar.length) return kok.append(el('p', 'Size bağlı sınıf bulunamadı.', 'bos-not'));
  const d = secilenDonem();

  // Dönem seçici: kısa adlı hap düğmeler (durum noktasıyla), altında seçili dönemin özeti
  const bar = el('div', undefined, 'gz-donem-bar');
  for (const x of veri.donemler) {
    const dg = el('button', undefined, 'gz-donem-dugme ' + x.durum);
    dg.type = 'button';
    dg.setAttribute('aria-pressed', String(x.id === d.id));
    dg.append(el('span', undefined, 'gz-nokta'), el('span', kisaAd(x.ad)));
    dg.addEventListener('click', () => x.id !== d.id && yukle(x.id));
    bar.append(dg);
  }
  kok.append(bar);

  const toplamOgrenci = veri.siniflar.reduce((t, x) => t + x.ogrenciler.length, 0);
  const toplamTamam = veri.siniflar.reduce((t, x) => t + x.ogrenciler.filter(y => veri.basliklar.length && y.girilen >= veri.basliklar.length).length, 0);
  const ozet = el('section', undefined, 'gz-ozet ' + d.durum);
  const ozetUst = el('div', undefined, 'gz-ozet-ust');
  ozetUst.append(el('h2', kisaAd(d.ad)), durumRozeti(d));
  const not = d.durum === 'acik' ? `Giriş ${tarihYaz(d.bitis)} tarihine kadar açık`
    : d.durum === 'yaklasan' ? `${tarihYaz(d.baslangic)} tarihinde açılacak`
    : 'Girişler yalnızca görüntülenir';
  ozet.append(ozetUst, el('p', `${aralikYaz(d)}${d.toplantiTarihi ? ' · Veli toplantısı ' + tarihYaz(d.toplantiTarihi) : ''}`, 'gz-ozet-tarih'), el('p', not, 'gz-ozet-not'));
  if (d.durum !== 'yaklasan') {
    const cubuk = el('div', undefined, 'gz-ilerleme');
    const dolgu = el('i');
    dolgu.style.width = (toplamOgrenci ? Math.round(100 * toplamTamam / toplamOgrenci) : 0) + '%';
    cubuk.append(dolgu);
    ozet.append(cubuk, el('p', `${toplamTamam} / ${toplamOgrenci} öğrenci tamamlandı`, 'gz-ozet-say'));
  }
  kok.append(ozet);

  const toplam = veri.basliklar.length;
  for (const s of veri.siniflar) {
    const kart = el('article', undefined, 'kl-kart');
    const b = el('div', undefined, 'kl-baslik');
    const sol = el('div');
    sol.append(el('h3', s.ad), el('p', s.dersler || ' ', 'kl-not'));
    const tamam = s.ogrenciler.filter(o => toplam && o.girilen >= toplam).length;
    b.append(sol, chip(`${tamam}/${s.ogrenciler.length}`, s.ogrenciler.length && tamam === s.ogrenciler.length ? 'tamam' : ''));
    const ilerleme = el('div', undefined, 'gz-ilerleme ince');
    const dolgu = el('i');
    dolgu.style.width = (s.ogrenciler.length ? Math.round(100 * tamam / s.ogrenciler.length) : 0) + '%';
    ilerleme.append(dolgu);
    const liste = el('div');
    liste.hidden = !acikSiniflar.has(s.id) && veri.siniflar.length > 1;
    b.setAttribute('role', 'button');
    b.tabIndex = 0;
    const degis = () => { liste.hidden = !liste.hidden; liste.hidden ? acikSiniflar.delete(s.id) : acikSiniflar.add(s.id); };
    b.addEventListener('click', degis);
    b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); degis(); } });
    kart.append(b, ilerleme, liste);
    for (const o of s.ogrenciler) {
      const satir = el('button', undefined, 'gz-ogrenci');
      satir.type = 'button';
      const ad = el('span', undefined, 'gz-ad');
      ad.append(avatarYap(o.ad, o.foto, 'kucuk'), el('b', o.ad));
      const durum = !o.girilen ? chip('Girilmedi') : toplam && o.girilen >= toplam ? chip('Tamam', 'tamam') : chip(`${o.girilen}/${toplam}`, 'vurgu');
      satir.append(ad, durum, el('span', '›', 'kl-git'));
      satir.addEventListener('click', () => ogrenciAc(o, s));
      liste.append(satir);
    }
    kok.append(kart);
  }
}

async function ogrenciAc(o, sinif, mesajMetin) {
  acikSiniflar.add(sinif.id);
  const r = await api('/api/gelisim/rapor?ogrenciId=' + o.id);
  if (!r.ok) return mesaj(r.veri.hata || 'Öğrenci alınamadı', 'hata');
  const v = r.veri;
  const d = secilenDonem();
  const rd = v.donemler.find(x => x.id === d.id);
  ekranAc(kok);
  kok.append(geriDugme('Öğrenciler', async () => { await yukle(veri.donemId); }));

  const baslik = el('div', undefined, 'kl-ust');
  const b = el('div', undefined, 'ot-kim');
  const yazi = el('div');
  yazi.append(el('h2', o.ad, 'kl-buyuk'), el('p', `${sinif.ad}${o.okulNo ? ' · No ' + o.okulNo : ''}`, 'kl-not'));
  b.append(avatarYap(o.ad, o.foto, 'orta'), yazi);
  const raporDugme = el('button', 'Rapor / Yazdır', 'ikincil kucuk'); raporDugme.type = 'button';
  raporDugme.addEventListener('click', () => raporAcOgretmen(o, sinif));
  baslik.append(b, raporDugme);
  kok.append(baslik);

  const girisler = new Map(rd.girisler.map(g => [g.baslikId, g.metin]));
  const aktif = veri.basliklar;

  // Bu dönem: açıksa form (hepsi doluysa kilitli), değilse salt okunur
  const bu = bolum(d.ad, durumRozeti(d));
  kok.append(bu);
  if (d.durum === 'acik') {
    const kap = el('fieldset', undefined, 'salt-kap');
    const alanlar = new Map();
    for (const bl of aktif) {
      const t = Object.assign(el('textarea'), { rows: 3, maxLength: 1000, value: girisler.get(bl.id) || '', placeholder: bl.aciklama || 'Gözleminizi yazın' });
      alanlar.set(bl.id, t);
      kap.append(alan(bl.ad, t));
    }
    bu.append(kap);
    const kaydet = el('button', 'Kaydet', 'birincil'); kaydet.type = 'button';
    const cubuk = el('div', undefined, 'kaydet-cubuk');
    cubuk.append(kaydet);
    kaydet.addEventListener('click', async () => {
      kaydet.disabled = true;
      const s = await api('/api/gelisim/giris-kaydet', { donemId: d.id, ogrenciId: o.id, girisler: Object.fromEntries([...alanlar].map(([id, t]) => [id, t.value])) });
      kaydet.disabled = false;
      if (!s.ok) return mesaj(s.veri.hata || 'Kaydedilemedi', 'hata');
      o.girilen = s.veri.dolu;
      await ogrenciAc(o, sinif, 'Kaydedildi');
    });
    const tumuDolu = aktif.length && aktif.every(bl => girisler.get(bl.id));
    if (tumuDolu) {
      kap.disabled = true;
      const duzenle = el('button', 'Düzenle', 'birincil'); duzenle.type = 'button';
      const salt = el('div', undefined, 'kaydet-cubuk');
      salt.append(duzenle);
      const vazgec = el('button', 'Vazgeç', 'ikincil'); vazgec.type = 'button';
      vazgec.addEventListener('click', () => ogrenciAc(o, sinif));
      duzenle.addEventListener('click', () => {
        mesaj('');
        kap.disabled = false;
        kaydet.textContent = 'Değişiklikleri kaydet';
        cubuk.prepend(vazgec);
        salt.replaceWith(cubuk);
      });
      kok.append(salt);
    } else kok.append(cubuk);
  } else if (d.durum === 'yaklasan') {
    bu.append(el('p', `Bu dönem ${tarihYaz(d.baslangic)} tarihinde açılacak.`, 'kl-not'));
  } else {
    const gor = v.basliklar.filter(bl => rd.girisler.some(g => g.baslikId === bl.id));
    if (!gor.length) bu.append(el('p', 'Bu dönemde bu öğrenci için giriş yapmadınız.', 'kl-not'));
    for (const bl of gor) bu.append(girisBlogu(bl.ad, rd.girisler.find(g => g.baslikId === bl.id).metin));
  }

  // Önceki dönemler: kendi girişlerim, salt okunur (bir sonraki görüşmeden önce bakmak için)
  const onceki = [...v.donemler].reverse().filter(x => x.id !== d.id && x.girisler.length);
  if (onceki.length) {
    const k = bolum('Önceki dönemlerdeki girişlerim');
    for (const x of onceki) {
      const det = el('details', undefined, 'kl-detay');
      det.append(el('summary', `${x.ad} · ${aralikYaz(x)}`));
      for (const bl of v.basliklar) {
        const g = x.girisler.find(y => y.baslikId === bl.id);
        if (g) det.append(girisBlogu(bl.ad, g.metin));
      }
      k.append(det);
    }
    kok.append(k);
  }

  // Veli toplantısı ve görüşmeleri
  const gorusmeler = [...v.donemler.flatMap(x => x.gorusmeler), ...v.donemsizGorusmeler].sort((a, c) => c.tarih.localeCompare(a.tarih) || c.id - a.id);
  const gk = bolum('Veli toplantısı ve görüşmeler');
  const formYeri = el('div');
  const yenile = m => ogrenciAc(o, sinif, m);
  const formAc = (g, tur) => formYeri.replaceChildren(gorusmeForm({ ogrenciId: o.id, donemler: v.donemler, bugun: v.bugun, mevcut: g || null, tur, bitince: yenile, vazgec: () => formYeri.replaceChildren() }));
  const dg = el('div', undefined, 'gz-secim-arac');
  for (const [tur, etiket] of [['toplanti', '+ Veli toplantısı'], ['gorusme', '+ Veli görüşmesi']]) {
    const e = el('button', etiket, 'ikincil kucuk'); e.type = 'button';
    e.addEventListener('click', () => formAc(null, tur));
    dg.append(e);
  }
  if (!gorusmeler.length) gk.append(el('p', 'Henüz toplantı ya da görüşme notu yok.', 'kl-not'));
  for (const g of gorusmeler) gk.append(gorusmeSatiri(g, { duzenle: x => formAc(x), sil: () => yenile('Not silindi') }));
  gk.append(dg, formYeri);
  kok.append(gk);
  if (mesajMetin) mesaj(mesajMetin, 'tamam');
}

// Öğretmenin raporu: yalnızca kendi gözlemleri ve veli toplantısı / görüşme notları (yönetimin yazdıkları dahil)
async function raporAcOgretmen(o, sinif) {
  const r = await api('/api/gelisim/rapor?ogrenciId=' + o.id);
  if (!r.ok) return mesaj(r.veri.hata || 'Rapor alınamadı', 'hata');
  ekranAc(kok);
  kok.append(geriDugme(o.ad, () => ogrenciAc(o, sinif)));
  raporEkrani(kok, r.veri, { ogrenciId: o.id, yenile: () => raporAcOgretmen(o, sinif), not: 'Raporda yalnızca sizin girdiğiniz gözlemler yer alır; veli toplantısı ve görüşme notları yönetimin yazdıklarıyla birlikte görünür.' });
}

function girisBlogu(ad, yazi) {
  const k = el('div', undefined, 'gz-baslik');
  k.append(el('h4', ad), el('p', yazi, 'gz-metin'));
  return k;
}
