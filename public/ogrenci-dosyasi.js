const $ = id => document.getElementById(id);
const el = gEl;
const { yuzde, kisaTarih, tarihYaz, satir, aramaLink } = OgrOrtak;
const id = Number(new URLSearchParams(location.search).get('id')) || 0;
const YEMEK = { alacak: 'Yemek alacak', almayacak: 'Yemek almayacak' };
const CINSIYET = { kiz: 'Kız', erkek: 'Erkek' };
let rapor = null, kayit = null, sinavlar = [];

async function api(yol) {
  const r = await fetch(yol);
  if (r.status === 401) { location.href = '/'; throw new Error('oturum'); }
  return { ok: r.ok, veri: await r.json() };
}

const sayi = n => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const fark = (a, b) => (a === null || b === null || a === undefined || b === undefined ? null : Math.round((a - b) * 10) / 10);
function farkRozeti(f, birim = '') {
  if (f === null) return null;
  const k = farkBilgi(f);
  return el('em', `${k.ok} ${k.yazi}${birim}`, 'fark ' + k.sinif);
}
const blok = (baslik, ...icerik) => { const k = el('section', undefined, 'ok-blok'); k.append(el('h3', baslik, 'baslik3'), ...icerik); return k; };

// ---- Genel durum raporu ----
function genel(k, tam) {
  const denemeler = sinavlar.filter(s => !s.yazili).sort((a, b) => a.tarih.localeCompare(b.tarih));
  const sonDeneme = denemeler.at(-1);
  const dv = rapor.devam;
  const bek = rapor.bekleyenOdev;

  // Üstte dört sayı
  const ozet = el('div', undefined, 'ok-ozet');
  const hucre = (deger, etiket, ek) => {
    const h = el('div');
    h.append(el('strong', deger), el('span', etiket));
    if (ek) h.append(ek);
    ozet.append(h);
  };
  hucre(`%${yuzde(dv)}`, `devam · ${dv.gelmedi} ders saati gelmedi`);
  hucre(sonDeneme ? sayi(sonDeneme.ortalama) : '—', 'son deneme ortalaması', sonDeneme?.degisim ? farkRozeti(sonDeneme.degisim.fark) : null);
  hucre(sonDeneme?.siralama?.sinif ? `${sonDeneme.siralama.sinif.sira}.` : '—', sonDeneme?.siralama?.sinif ? `sınıf sırası · ${sonDeneme.siralama.sinif.sayi} öğrenci` : 'sınıf sırası');
  hucre(String(bek.bekleyen), bek.geciken ? `bekleyen ödev · ${bek.geciken} gecikmiş` : 'bekleyen ödev');
  k.append(ozet);

  // Dikkat edilecekler: kayıttaki özel durumlar + verilerden çıkan uyarılar
  const notlar = [];
  for (const x of kayit.ozelDurumlar) notlar.push([x.baslik + (x.aciklama ? ' — ' + x.aciklama : ''), 'ozel']);
  if (kayit.kayit.yemek === 'almayacak') notlar.push(['Okul yemeği almıyor.', 'ozel']);
  if (dv.gelmedi >= 5) notlar.push([`${dv.gelmedi} ders saati devamsızlığı var.`, 'uyari']);
  if (bek.geciken) notlar.push([`${bek.geciken} ödevin teslim tarihi geçti.`, 'uyari']);
  if (sonDeneme?.degisim && sonDeneme.degisim.fark < 0) notlar.push([`Son denemede ortalama ${sayi(-sonDeneme.degisim.fark)} puan düştü (${sonDeneme.degisim.ad} → ${sonDeneme.ad}).`, 'uyari']);
  const don = rapor.donemKarsilastirma;
  if (don.length > 1) {
    const [onceki, son] = [don.at(-2), don.at(-1)];
    if (onceki.devam.yuzde !== null && son.devam.yuzde !== null && son.devam.yuzde < onceki.devam.yuzde - 3) notlar.push([`Devam oranı bir önceki döneme göre düştü (%${onceki.devam.yuzde} → %${son.devam.yuzde}).`, 'uyari']);
  }
  if (notlar.length) {
    const liste = el('ul', undefined, 'ok-notlar');
    for (const [m, tur] of notlar) liste.append(el('li', m, tur));
    k.append(blok('Dikkat edilecekler', liste));
  }

  // Sınav gelişimi: denemelerin sırayla ortalaması ve son denemenin derslere göre değişimi
  const sinavBlogu = blok('Sınav gelişimi');
  if (!sinavlar.length) sinavBlogu.append(el('p', 'Yayınlanmış sınav sonucu yok.', 'alt'));
  if (denemeler.length) {
    sinavBlogu.append(el('p', 'Deneme sınavı ortalamaları', 'ok-alt-baslik'),
      sutunGrafik(denemeler.map(s => ({ etiket: kisaTarih(s.tarih), deger: s.ortalama, renk: s === sonDeneme ? 'var(--ana)' : undefined })), 90));
    if (sonDeneme.degisim) {
      const f = sonDeneme.degisim.fark;
      sinavBlogu.append(el('p', `${sonDeneme.ad}: ${sayi(sonDeneme.ortalama)} puan — ${sonDeneme.degisim.ad} sınavına göre ${f > 0 ? sayi(f) + ' puan arttı' : f < 0 ? sayi(-f) + ' puan düştü' : 'değişmedi'}.`, 'alt'));
      const dersler = sonDeneme.dersler.filter(d => d.onceki !== null && d.onceki !== undefined);
      for (const d of dersler) {
        const s = el('div', undefined, 'ogd-satir');
        const sag = el('div', undefined, 'ok-sag');
        sag.append(el('b', sayi(d.puan)), farkRozeti(fark(d.puan, d.onceki)) || '');
        s.append(el('strong', d.ders), sag);
        sinavBlogu.append(s);
      }
    } else sinavBlogu.append(el('p', `${sonDeneme.ad}: ${sayi(sonDeneme.ortalama)} puan. Karşılaştırılacak önceki deneme yok.`, 'alt'));
  }
  const yazililar = sinavlar.filter(s => s.yazili).sort((a, b) => b.tarih.localeCompare(a.tarih));
  if (yazililar.length) {
    sinavBlogu.append(el('p', 'Yazılı sınavlar', 'ok-alt-baslik'));
    for (const s of yazililar) {
      const sat = el('div', undefined, 'ogd-satir');
      const sol = el('div');
      sol.append(el('strong', s.dersler[0]?.ders || s.ad), el('small', `${tarihYaz(s.tarih)}${s.siralama?.sinif ? ` · sınıfta ${s.siralama.sinif.sira}./${s.siralama.sinif.sayi}` : ''}`));
      sat.append(sol, el('b', sayi(s.ortalama), 'ogd-sayi'));
      sinavBlogu.append(sat);
    }
  }
  k.append(sinavBlogu);

  // Dönem karşılaştırması
  const donemBlogu = blok('Dönem karşılaştırması');
  if (!don.length) donemBlogu.append(el('p', 'Henüz başlamış bir dönem yok.', 'alt'));
  const baslikSatiri = el('div', undefined, 'ok-donem ok-donem-baslik');
  for (const m of ['', 'Devam', 'Ödev', 'Gözlem']) baslikSatiri.append(el('span', m));
  if (don.length) donemBlogu.append(baslikSatiri);
  don.forEach((d, i) => {
    const onceki = don[i - 1];
    const s = el('div', undefined, 'ok-donem');
    const ad = el('strong', d.ad); if (d.acik) ad.append(el('small', ' · sürüyor'));
    const hucre2 = (deger, birim, once) => {
      const h = el('span', deger === null ? '—' : birim + deger);
      const f = fark(deger, once);
      if (f !== null && f !== 0) h.append(farkRozeti(f));
      return h;
    };
    s.append(ad, hucre2(d.devam.yuzde, '%', onceki?.devam.yuzde), hucre2(d.odev.oran, '%', onceki?.odev.oran), el('span', String(d.gozlem)));
    donemBlogu.append(s);
  });
  k.append(donemBlogu);

  // Son gelişim gözlemleri
  const sonDonem = rapor.donemler.find(d => d.girisler.length);
  if (sonDonem && !tam) {
    const liste = el('div');
    for (const g of sonDonem.girisler.slice(0, 4)) {
      const y = el('div', undefined, 'ogd-not');
      y.append(el('small', `${g.baslik} · ${g.ogretmen}${g.ders ? ' · ' + g.ders : ''}`), el('p', g.metin));
      liste.append(y);
    }
    k.append(blok(`Gelişim gözlemleri · ${sonDonem.ad}`, liste, el('p', 'Tüm gözlemler için Gelişim sekmesine bakın.', 'alt')));
  }
}

// ---- Kayıt bilgileri (önce görüntüleme; düzenleme ayrı sayfada) ----
function kayitCiz(k) {
  const o = kayit.ogrenci, y = kayit.kayit, i = kayit.iletisim;
  const dogum = y.dogumTarihi ? tarihYaz(y.dogumTarihi) + (y.dogumYeri ? ' · ' + y.dogumYeri : '') : y.dogumYeri || '—';
  const kimlik = el('div', undefined, 'profil-blok');
  kimlik.append(satir(o.kimlikTuru, o.kimlik || '—'), satir('Okul', o.sube || '—'), satir('Sınıf', o.sinif || 'Sınıfsız'), satir('Okul no', o.okulNo || '—'),
    satir('Doğum', dogum), satir('Cinsiyet', CINSIYET[y.cinsiyet] || '—'), satir('Kan grubu', y.kanGrubu || '—'),
    satir('Kayıt', [kayit.kayitTuruAd, y.kayitTarihi && tarihYaz(y.kayitTarihi)].filter(Boolean).join(' · ') || '—'));
  if (y.oncekiOkul) kimlik.append(satir('Önceki okul', y.oncekiOkul));
  kimlik.append(satir('Yemek', YEMEK[y.yemek] || 'Belirtilmemiş'));
  k.append(el('h3', 'Öğrenci', 'baslik3'), kimlik);

  k.append(el('h3', 'Özel durum', 'baslik3'));
  if (!kayit.ozelDurumlar.length) k.append(el('p', 'Kayıtlı özel durum yok.', 'alt'));
  for (const x of kayit.ozelDurumlar) {
    const s = el('div', undefined, 'ogd-satir');
    const sol = el('div');
    sol.append(el('strong', x.baslik));
    if (x.aciklama) sol.append(el('small', x.aciklama));
    s.append(sol, el('span', kayit.secenekler.ozelTur[x.tur] || x.tur, 'hz-durum eksik'));
    k.append(s);
  }

  k.append(el('h3', 'Aile ve iletişim', 'baslik3'));
  if (!kayit.aile.length) k.append(el('p', 'Bağlı veli kaydı yok.', 'alt'));
  for (const v of kayit.aile) {
    const a = aramaLink(v.ad, v.telefon, [v.yakinlik || 'Veli', v.meslek].filter(Boolean).join(' · '));
    k.append(a);
    if (v.email) k.append(el('p', v.email, 'ok-eposta'));
  }
  if (i.yakinAd && i.yakinTelefon) k.append(aramaLink(i.yakinAd, i.yakinTelefon, 'Acil durum' + (i.yakinYakinlik ? ' · ' + i.yakinYakinlik : '')));
  k.append(aramaLink('Öğrenci / kayıtlı telefon', o.telefon));
  if (i.email) k.append(el('p', i.email, 'ok-eposta'));
  const adres = [i.adres, i.ilce, i.il].filter(Boolean).join(', ');
  if (adres) k.append(el('p', adres, 'alt'));
}

function sekmeAc(ad) {
  for (const b of $('sekmeler').children) b.setAttribute('aria-pressed', String(b.dataset.sekme === ad));
  const k = $('icerik');
  k.replaceChildren();
  ({
    genel: () => genel(k),
    sinav: () => OgrOrtak.sinav(k, sinavlar),
    gelisim: () => OgrOrtak.gelisim(k, rapor),
    devam: () => OgrOrtak.devam(k, rapor),
    odev: () => OgrOrtak.odev(k, rapor),
    kayit: () => kayitCiz(k),
  })[ad]();
}

// Yazdırma: tüm sekmeler tek raporda, sırayla
function tamRaporKur() {
  $('tam-rapor')?.remove();
  const tam = el('div'); tam.id = 'tam-rapor';
  const bolumler = [
    ['Genel durum', k => genel(k, true)],
    ['Sınavlar', k => OgrOrtak.sinav(k, sinavlar)],
    ['Gelişim', k => OgrOrtak.gelisim(k, rapor)],
    ['Devam', k => OgrOrtak.devam(k, rapor)],
    ['Ödev ve etkinlik', k => OgrOrtak.odev(k, rapor)],
    ['Kayıt bilgileri', k => kayitCiz(k)],
  ];
  for (const [ad, ciz] of bolumler) {
    const b = el('section', undefined, 'rapor-bolum');
    b.append(el('h2', ad));
    const k = el('div'); ciz(k); b.append(k);
    tam.append(b);
  }
  for (const d of tam.querySelectorAll('details')) d.open = true;
  $('dosya').append(tam);
}

(async () => {
  if (!id) { location.href = '/panel'; return; }
  const [r, y, s] = await Promise.all([api('/api/ogrenci/rapor?id=' + id), api('/api/ogrenci/kayit?id=' + id), api('/api/sinav/ogrenci?id=' + id)]);
  if (!r.ok || !y.ok) { $('mesaj').textContent = (r.ok ? y : r).veri.hata || 'Öğrenci bulunamadı'; $('mesaj').className = 'mesaj hata'; return; }
  rapor = r.veri; kayit = y.veri;
  kayit.kayitTuruAd = kayit.secenekler.kayitTuru[kayit.kayit.kayitTuru] || '';
  sinavlar = s.ok ? s.veri.sinavlar : [];
  const p = rapor.ogrenci;
  document.title = `Akant Koleji - ${p.ad}`;
  $('d-baslik').textContent = p.ad;
  $('d-foto').replaceChildren(avatarYap(p.ad, p.foto, 'buyuk'));
  $('d-alt').textContent = [p.sube, p.sinif || 'Sınıfsız', p.okulNo ? 'No ' + p.okulNo : '', p.mentor ? 'Sınıf öğretmeni: ' + p.mentor : ''].filter(Boolean).join(' · ');
  $('d-rapor-tarih').textContent = tarihYaz(rapor.rapor);
  $('geri').href = kayit.duzenleyebilir ? '/ogrenciler' : '/ogrencilerim';
  if (kayit.duzenleyebilir) { const d = $('d-duzenle'); d.href = '/ogrenci-kayit?id=' + id; d.classList.remove('gizli'); }
  $('dosya').classList.remove('gizli');
  for (const b of $('sekmeler').children) b.addEventListener('click', () => sekmeAc(b.dataset.sekme));
  $('d-yazdir').addEventListener('click', () => window.print());
  window.addEventListener('beforeprint', tamRaporKur);
  window.addEventListener('afterprint', () => $('tam-rapor')?.remove());
  sekmeAc(new URLSearchParams(location.search).get('sekme') || 'genel');
})();
