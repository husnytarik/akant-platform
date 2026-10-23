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

const secilenDonem = () => veri.donemler.find(d => d.id === veri.donemId);

function ana() {
  ekranAc(kok);
  if (!veri.donemler.length) return kok.append(el('p', 'Yönetim henüz bir gözlem dönemi tanımlamadı.', 'bos-not'));
  if (!veri.siniflar.length) return kok.append(el('p', 'Size bağlı sınıf bulunamadı.', 'bos-not'));
  const d = secilenDonem();

  const sec = el('select');
  secenekler(sec, veri.donemler.map(x => [x.id, `${x.ad} · ${DURUM[x.durum]}`]));
  sec.value = String(d.id);
  sec.addEventListener('change', () => yukle(Number(sec.value)));
  const ust = el('div', undefined, 'kl-form');
  ust.append(alan('Dönem', sec));
  const not = d.durum === 'acik' ? `Giriş ${tarihYaz(d.bitis)} tarihine kadar açık.`
    : d.durum === 'yaklasan' ? `Bu dönem ${tarihYaz(d.baslangic)} tarihinde açılacak; şimdilik yalnızca görüntülenir.`
    : 'Bu dönem kapandı; girişler yalnızca görüntülenir.';
  ust.append(el('p', not + (d.toplantiTarihi ? ` Veli toplantısı: ${tarihYaz(d.toplantiTarihi)}.` : ''), 'kl-not'));
  kok.append(ust);

  const toplam = veri.basliklar.length;
  for (const s of veri.siniflar) {
    const kart = el('article', undefined, 'kl-kart');
    const b = el('div', undefined, 'kl-baslik');
    const sol = el('div');
    sol.append(el('h3', s.ad), el('p', s.dersler || ' ', 'kl-not'));
    const tamam = s.ogrenciler.filter(o => toplam && o.girilen >= toplam).length;
    b.append(sol, chip(`${tamam}/${s.ogrenciler.length} tamam`, s.ogrenciler.length && tamam === s.ogrenciler.length ? 'tamam' : ''));
    const liste = el('div');
    liste.hidden = !acikSiniflar.has(s.id) && veri.siniflar.length > 1;
    b.setAttribute('role', 'button');
    b.tabIndex = 0;
    const degis = () => { liste.hidden = !liste.hidden; liste.hidden ? acikSiniflar.delete(s.id) : acikSiniflar.add(s.id); };
    b.addEventListener('click', degis);
    b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); degis(); } });
    kart.append(b, liste);
    for (const o of s.ogrenciler) {
      const satir = el('button', undefined, 'gz-ogrenci');
      satir.type = 'button';
      const ad = el('span', o.ad);
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
  const b = el('div');
  b.append(el('h2', o.ad, 'kl-buyuk'), el('p', `${sinif.ad}${o.okulNo ? ' · No ' + o.okulNo : ''}`, 'kl-not'));
  baslik.append(b);
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
  const formAc = g => formYeri.replaceChildren(gorusmeForm({ ogrenciId: o.id, donemler: v.donemler, bugun: v.bugun, mevcut: g || null, bitince: yenile, vazgec: () => formYeri.replaceChildren() }));
  const ekle = el('button', '+ Not ekle', 'ikincil kucuk'); ekle.type = 'button';
  ekle.addEventListener('click', () => formAc(null));
  if (!gorusmeler.length) gk.append(el('p', 'Henüz toplantı ya da görüşme notu yok.', 'kl-not'));
  for (const g of gorusmeler) gk.append(gorusmeSatiri(g, { duzenle: formAc, sil: () => yenile('Not silindi') }));
  const dg = el('div', undefined, 'kl-dugmeler'); dg.append(ekle);
  gk.append(dg, formYeri);
  kok.append(gk);
  if (mesajMetin) mesaj(mesajMetin, 'tamam');
}

function girisBlogu(ad, yazi) {
  const k = el('div', undefined, 'gz-baslik');
  k.append(el('h4', ad), el('p', yazi, 'gz-metin'));
  return k;
}
