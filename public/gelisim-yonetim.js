// Yönetim: öğrenci raporu (yazdırılır), dönemler ve takip, gözlem başlıkları.
// Dönem ve başlık önce salt okunur açılır; değişiklik yalnızca "Düzenle" ile, kaydet çubuklu ekranda yapılır.
const kok = $('icerik');
let ayar = null;
let aktifSekme = 'rapor';
let sekmeAc;

async function yukle() {
  const r = await api('/api/gelisim/ayar');
  if (!r.ok) return mesaj(r.veri.hata || 'Ayarlar alınamadı', 'hata');
  ayar = r.veri;
}
function ana(ilk) {
  ekranAc(kok);
  sekmeAc = sekmeler(kok, [['rapor', 'Rapor'], ['donemler', 'Dönemler'], ['basliklar', 'Başlıklar']], ilk || aktifSekme, (ad, alan) => {
    aktifSekme = ad;
    if (ad === 'rapor') raporSec(alan);
    else if (ad === 'donemler') donemler(alan);
    else basliklar(alan);
  });
}
async function yeniden(m) {
  await yukle();
  ana();
  if (m) mesaj(m, 'tamam');
}
(async () => { await yukle(); if (ayar) ana('rapor'); })();

// ---------- Rapor ----------
async function raporSec(alanKutu) {
  const r = await api('/api/gelisim/siniflar');
  if (!r.ok) return mesaj(r.veri.hata || 'Sınıflar alınamadı', 'hata');
  const { siniflar } = r.veri;
  alanKutu.append(el('p', 'Sınıf ve öğrenciyi seçin; tüm öğretmenlerin girdiği veriler tek raporda toplanır.', 'kl-not'));
  const sinif = el('select'), ogr = el('select');
  secenekler(sinif, siniflar.map(s => [s.id, s.ad]), 'Sınıf seçin');
  secenekler(ogr, [], 'Önce sınıf seçin');
  ogr.disabled = true;
  const ac = el('button', 'Raporu aç', 'birincil');
  ac.type = 'button';
  ac.disabled = true;
  sinif.addEventListener('change', () => {
    const s = siniflar.find(x => String(x.id) === sinif.value);
    secenekler(ogr, (s?.ogrenciler || []).map(o => [o.id, o.ad + (o.okulNo ? ' · ' + o.okulNo : '')]), s ? 'Öğrenci seçin' : 'Önce sınıf seçin');
    ogr.disabled = !s;
    ac.disabled = true;
  });
  ogr.addEventListener('change', () => { ac.disabled = !ogr.value; });
  const kutu = el('div', undefined, 'kl-form');
  kutu.append(alan('Sınıf', sinif), alan('Öğrenci', ogr), ac);
  alanKutu.append(kutu);
  ac.addEventListener('click', () => raporAc(Number(ogr.value)));
}

async function raporAc(ogrenciId) {
  const r = await api('/api/gelisim/rapor?ogrenciId=' + ogrenciId);
  if (!r.ok) return mesaj(r.veri.hata || 'Rapor alınamadı', 'hata');
  ekranAc(kok);
  kok.append(geriDugme('Rapor', () => ana('rapor')));
  raporEkrani(kok, r.veri, { ogrenciId, yenile: () => raporAc(ogrenciId) });
}

// ---------- Dönemler ----------
function donemler(alanKutu) {
  const ust = el('div', undefined, 'kl-ust');
  const yeni = el('button', '+ Yeni dönem', 'birincil kucuk');
  yeni.type = 'button';
  yeni.addEventListener('click', () => donemForm(null));
  ust.append(el('p', 'Öğretmenler yalnızca dönem açıkken giriş yapar.', 'kl-not'), yeni);
  const liste = el('div', undefined, 'kl-liste');
  alanKutu.append(ust, liste);
  if (!ayar.donemler.length) liste.append(el('p', 'Henüz dönem yok. “Yeni dönem” ile ilkini açın.', 'bos-not'));
  for (const d of ayar.donemler) {
    const kart = el('button', undefined, 'kl-kart secilebilir');
    kart.type = 'button';
    const b = el('div', undefined, 'kl-baslik');
    const sol = el('div');
    sol.append(el('h3', d.ad), el('p', aralikYaz(d), 'kl-zaman'));
    const sag = el('div', undefined, 'kl-sag');
    sag.append(durumRozeti(d), el('span', '›', 'kl-git'));
    b.append(sol, sag);
    kart.append(b);
    if (d.toplantiTarihi) kart.append(el('p', 'Veli toplantısı: ' + tarihYaz(d.toplantiTarihi), 'kl-kisi'));
    kart.addEventListener('click', () => donemDetay(d.id));
    liste.append(kart);
  }
}

async function donemDetay(id) {
  const d = ayar.donemler.find(x => x.id === id);
  if (!d) return ana('donemler');
  const r = await api('/api/gelisim/takip?donemId=' + id);
  if (!r.ok) return mesaj(r.veri.hata || 'Takip alınamadı', 'hata');
  ekranAc(kok);
  kok.append(geriDugme('Dönemler', () => ana('donemler')));
  const ust = el('div', undefined, 'kl-ust');
  const b = el('div');
  b.append(el('h2', d.ad, 'kl-buyuk'), el('p', aralikYaz(d), 'kl-not'));
  const duzenle = el('button', 'Düzenle', 'birincil kucuk');
  duzenle.type = 'button';
  duzenle.addEventListener('click', () => donemForm(d));
  ust.append(b, duzenle);

  const genel = bolum('Dönem', durumRozeti(d));
  genel.append(bilgi('Giriş tarihleri', aralikYaz(d)), bilgi('Veli toplantısı', d.toplantiTarihi ? tarihYaz(d.toplantiTarihi) : 'Belirlenmedi'),
    bilgi('Başlık sayısı', String(r.veri.baslikSayisi)));

  if (d.durum === 'kapandi') {
    const ac = el('button', 'Yeniden aç (7 gün)', 'ikincil kucuk'); ac.type = 'button';
    ac.addEventListener('click', async () => {
      if (!confirm(`${d.ad} 7 gün için yeniden açılsın mı? Öğretmenler yorumlarını güncelleyebilir.`)) return;
      const x = new Date(ayar.bugun + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 7);
      const r = await api('/api/gelisim/donem-kaydet', { id: d.id, ad: d.ad, baslangic: d.baslangic, bitis: x.toISOString().slice(0, 10), toplantiTarihi: d.toplantiTarihi });
      if (!r.ok) return mesaj(r.veri.hata || 'Açılamadı', 'hata');
      await yukle();
      await donemDetay(d.id);
      mesaj('Dönem yeniden açıldı', 'tamam');
    });
    const dg = el('div', undefined, 'kl-dugmeler'); dg.append(ac);
    genel.append(dg);
  }

  const takip = bolum('Öğretmen girişleri', `${r.veri.ogretmenler.filter(t => t.tamam === t.ogrenciSayisi).length}/${r.veri.ogretmenler.length} tamam`);
  if (!r.veri.ogretmenler.length) takip.append(el('p', 'Öğrencisi olan öğretmen yok.', 'kl-not'));
  for (const t of r.veri.ogretmenler) {
    const s = el('div', undefined, 'kl-uye');
    const ad = el('span');
    ad.append(document.createTextNode(t.ad));
    if (t.dersler) ad.append(el('small', ' · ' + t.dersler));
    const bitti = t.tamam === t.ogrenciSayisi;
    s.append(ad, chip(`${t.tamam}/${t.ogrenciSayisi} öğrenci`, bitti ? 'tamam' : t.tamam || t.kismi ? 'vurgu' : ''));
    takip.append(s);
  }
  kok.append(ust, genel, takip);
}

function donemForm(d) {
  ekranAc(kok);
  const ust = el('div', undefined, 'adim-ust kl-ekran-ust');
  ust.append(el('h2', d ? d.ad : 'Yeni dönem', 'kl-buyuk'), el('span', d ? 'Düzenleniyor' : 'Yeni kayıt', 'rozet ' + (d ? 'tamam' : 'bekliyor')));
  kok.append(ust);
  const bugun = ayar.bugun;
  const gunEkle = (t, n) => { const x = new Date(t + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const ad = Object.assign(el('input'), { maxLength: 60, value: d?.ad || '', placeholder: 'Örn. Kasım gözlemi' });
  const bas = Object.assign(el('input'), { type: 'date', value: d?.baslangic || bugun });
  const bit = Object.assign(el('input'), { type: 'date', value: d?.bitis || gunEkle(bugun, 14) });
  const top = Object.assign(el('input'), { type: 'date', value: d?.toplantiTarihi || '' });
  const kutu = bolum('Bilgiler');
  const iki = el('div', undefined, 'kl-iki');
  iki.append(alan('Giriş başlangıcı', bas), alan('Giriş bitişi', bit));
  kutu.append(alan('Dönem adı', ad), iki, alan('Veli toplantısı tarihi (isteğe bağlı)', top),
    el('p', 'Öğretmenler yorumlarını başlangıç ve bitiş tarihleri arasında girebilir; bitince dönem yalnızca okunur olur.', 'kl-not'));
  kok.append(kutu);

  if (d) {
    const diger = bolum('Diğer işlemler');
    const sil = el('button', 'Dönemi sil', 'ikincil kucuk tehlike'); sil.type = 'button';
    sil.addEventListener('click', async () => {
      if (!confirm(`${d.ad} silinsin mi?`)) return;
      const r = await api('/api/gelisim/donem-sil', { id: d.id });
      if (!r.ok) return mesaj(r.veri.hata || 'Silinemedi', 'hata');
      await yeniden('Dönem silindi');
    });
    const dg = el('div', undefined, 'kl-dugmeler'); dg.append(sil);
    diger.append(dg);
    kok.append(diger);
  }

  const vazgec = el('button', 'Vazgeç', 'ikincil'); vazgec.type = 'button';
  vazgec.addEventListener('click', () => (d ? donemDetay(d.id) : ana('donemler')));
  const kaydet = el('button', d ? 'Değişiklikleri kaydet' : 'Dönemi aç', 'birincil'); kaydet.type = 'button';
  const cubuk = el('div', undefined, 'kaydet-cubuk');
  cubuk.append(vazgec, kaydet);
  kok.append(cubuk);
  kaydet.addEventListener('click', async () => {
    kaydet.disabled = true;
    const r = await api('/api/gelisim/donem-kaydet', { id: d?.id, ad: ad.value, baslangic: bas.value, bitis: bit.value, toplantiTarihi: top.value });
    kaydet.disabled = false;
    if (!r.ok) { mesaj(r.veri.hata || 'Kaydedilemedi', 'hata'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    await yukle();
    if (!d) return yeniden('Dönem açıldı');
    await donemDetay(d.id);
    mesaj('Dönem güncellendi', 'tamam');
  });
  ad.focus({ preventScroll: true });
}

// ---------- Başlıklar ----------
function basliklar(alanKutu) {
  const ust = el('div', undefined, 'kl-ust');
  const yeni = el('button', '+ Yeni başlık', 'birincil kucuk');
  yeni.type = 'button';
  yeni.addEventListener('click', () => baslikForm(null));
  ust.append(el('p', `${ayar.basliklar.filter(b => b.aktif).length} aktif başlık · sıra raporda da bu şekildedir`, 'kl-not'), yeni);
  const liste = el('div', undefined, 'kl-liste');
  alanKutu.append(ust, liste);
  if (!ayar.basliklar.length) liste.append(el('p', 'Henüz başlık yok. Örn. Akademik süreç, Dikkat ve ders içi davranış…', 'bos-not'));
  ayar.basliklar.forEach((b, i) => {
    const kart = el('div', undefined, 'kl-kart kl-satir' + (b.aktif ? '' : ' pasif'));
    const sol = el('button', undefined, 'gz-baslik-dugme'); sol.type = 'button';
    sol.append(el('b', b.ad), el('small', b.aciklama || (b.aktif ? ' ' : 'Pasif')));
    sol.addEventListener('click', () => baslikForm(b));
    const sag = el('div', undefined, 'kl-sag');
    const tasi = (yon, etiket, aria, kapali) => {
      const t = el('button', etiket, 'kl-mini'); t.type = 'button'; t.disabled = kapali; t.setAttribute('aria-label', aria);
      t.addEventListener('click', async () => {
        const r = await api('/api/gelisim/baslik-sira', { id: b.id, yon });
        if (!r.ok) return mesaj(r.veri.hata || 'Taşınamadı', 'hata');
        await yeniden();
      });
      return t;
    };
    sag.append(tasi('yukari', '↑', 'Yukarı taşı', i === 0), tasi('asagi', '↓', 'Aşağı taşı', i === ayar.basliklar.length - 1));
    kart.append(sol, sag);
    liste.append(kart);
  });
}

function baslikForm(b) {
  ekranAc(kok);
  const ust = el('div', undefined, 'adim-ust kl-ekran-ust');
  ust.append(el('h2', b ? b.ad : 'Yeni başlık', 'kl-buyuk'), el('span', b ? 'Düzenleniyor' : 'Yeni kayıt', 'rozet ' + (b ? 'tamam' : 'bekliyor')));
  kok.append(ust);
  const ad = Object.assign(el('input'), { maxLength: 60, value: b?.ad || '', placeholder: 'Örn. Sorumluluk ve öz düzenleme' });
  const aciklama = Object.assign(el('textarea'), { rows: 3, maxLength: 200, value: b?.aciklama || '', placeholder: 'Öğretmenlere yol gösteren kısa not: neye bakılmalı?' });
  const aktif = Object.assign(el('input'), { type: 'checkbox', checked: b ? b.aktif : true });
  const etiket = el('label', undefined, 'kl-sec');
  etiket.append(aktif, el('span', 'Aktif (öğretmenlere gösterilir)'));
  const kutu = bolum('Başlık');
  kutu.append(alan('Başlık adı', ad), alan('Öğretmenlere açıklama (isteğe bağlı)', aciklama), etiket);
  kok.append(kutu);

  if (b) {
    const diger = bolum('Diğer işlemler');
    const sil = el('button', 'Başlığı sil', 'ikincil kucuk tehlike'); sil.type = 'button';
    sil.addEventListener('click', async () => {
      if (!confirm(`${b.ad} silinsin mi?`)) return;
      const r = await api('/api/gelisim/baslik-sil', { id: b.id });
      if (!r.ok) return mesaj(r.veri.hata || 'Silinemedi', 'hata');
      await yeniden('Başlık silindi');
    });
    const dg = el('div', undefined, 'kl-dugmeler'); dg.append(sil);
    diger.append(dg);
    if (b.girisSayisi) diger.append(el('p', `Bu başlığa ${b.girisSayisi} yorum girilmiş; silinemez, “Aktif” işaretini kaldırarak gizleyebilirsiniz.`, 'kl-not'));
    kok.append(diger);
  }

  const vazgec = el('button', 'Vazgeç', 'ikincil'); vazgec.type = 'button';
  vazgec.addEventListener('click', () => ana('basliklar'));
  const kaydet = el('button', b ? 'Değişiklikleri kaydet' : 'Başlığı ekle', 'birincil'); kaydet.type = 'button';
  const cubuk = el('div', undefined, 'kaydet-cubuk');
  cubuk.append(vazgec, kaydet);
  kok.append(cubuk);
  kaydet.addEventListener('click', async () => {
    kaydet.disabled = true;
    const r = await api('/api/gelisim/baslik-kaydet', { id: b?.id, ad: ad.value, aciklama: aciklama.value, aktif: aktif.checked });
    kaydet.disabled = false;
    if (!r.ok) { mesaj(r.veri.hata || 'Kaydedilemedi', 'hata'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    await yeniden(b ? 'Başlık güncellendi' : 'Başlık eklendi');
  });
  ad.focus({ preventScroll: true });
}
