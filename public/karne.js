// Dönem karnesi: veriyi çeker, her öğrenci için A4 sayfalara böler.
// Kural: bir bölüm sayfa ortasında ikiye bölünmez. Sığmıyorsa tümü yeni sayfaya geçer; ancak tam bir sayfadan
// büyükse (çok uzun bölümler) öğe sınırlarından, başlığı "(devam)" olarak tekrarlanarak bölünür.
const $ = id => document.getElementById(id);
const el = gEl;
const kapsam = new URLSearchParams(location.search);
const ogrId = Number(kapsam.get('id')) || 0;
const sinifId = Number(kapsam.get('sinifId')) || 0;
let donemId = Number(kapsam.get('donemId')) || 0;
let veri = null;

const sayi = n => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const tarih = t => t ? new Date(t + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const kisaTarih = t => t ? new Date(t + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '';
const bos = '–';

function mesajYaz(m, hata) { $('mesaj').textContent = m || ''; $('mesaj').className = 'mesaj kr-arac' + (hata ? ' hata' : ''); }

function notSinifi(n) {
  if (n === null || n === undefined) return '';
  return n >= 85 ? 'cok-iyi' : n >= 70 ? 'iyi' : n >= 50 ? 'orta' : 'zayif';
}

// ---- Parçalar ----

function tablo(basliklar, satirlar, { sinif = '', son = null } = {}) {
  // Satır: hücre dizisi; hücre metin, Node ya da [içerik, sınıf]. `son` ayrılmış toplam satırıdır, her bölümün sonunda durur.
  const satirYap = (hucreler, sinifi) => {
    const r = el('tr', undefined, sinifi);
    hucreler.forEach((h, j) => {
      const [icerik, s] = Array.isArray(h) ? h : [h, ''];
      const td = el('td', icerik instanceof Node ? undefined : String(icerik ?? bos), [basliklar[j][1], s].filter(Boolean).join(' '));
      if (icerik instanceof Node) td.append(icerik);
      r.append(td);
    });
    return r;
  };
  return {
    n: satirlar.length,
    kur(i0, i1) {
      const t = el('table', undefined, 'kr-tablo ' + sinif);
      const ust = el('thead'), tr = el('tr');
      basliklar.forEach(([ad, s]) => tr.append(el('th', ad, s || '')));
      ust.append(tr); t.append(ust);
      const govde = el('tbody');
      for (const s of satirlar.slice(i0, i1)) govde.append(satirYap(s));
      if (son && i1 === satirlar.length) govde.append(satirYap(son, 'toplam'));
      t.append(govde);
      return t;
    },
  };
}

function ogeSabit(kur) { return { n: 1, kur }; }
function altBaslik(ad) { return el('h4', ad, 'kr-alt-baslik'); }

function cizgiGrafik(denemeler) {
  const W = 420, H = 130, sol = 34, sag = 34, ust = 22, alt = 28;
  const degerler = denemeler.map(d => d.ortalama);
  const en = Math.max(...degerler), az = Math.min(...degerler);
  const tavan = Math.min(100, Math.ceil((en + 6) / 10) * 10), taban = Math.max(0, Math.floor((az - 6) / 10) * 10);
  const aralik = Math.max(10, tavan - taban);
  const x = i => denemeler.length === 1 ? (sol + W - sag) / 2 : sol + (W - sol - sag) * i / (denemeler.length - 1);
  const y = v => ust + (H - ust - alt) * (1 - (v - taban) / aralik);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'kr-cizgi', role: 'img', 'aria-label': 'Deneme sınavı puanları' });
  for (const v of [taban, taban + aralik / 2, taban + aralik]) {
    svg.append(svgEl('line', { x1: sol, x2: W - sag, y1: y(v), y2: y(v), class: 'izgara' }));
    const t = svgEl('text', { x: sol - 6, y: y(v) + 3.5, 'text-anchor': 'end', class: 'eksen' }); t.textContent = Math.round(v); svg.append(t);
  }
  if (denemeler.length > 1) svg.append(svgEl('polyline', { points: degerler.map((v, i) => `${x(i)},${y(v)}`).join(' '), class: 'cizgi' }));
  denemeler.forEach((d, i) => {
    svg.append(svgEl('circle', { cx: x(i), cy: y(d.ortalama), r: 4, class: 'nokta' }));
    const v = svgEl('text', { x: x(i), y: y(d.ortalama) - 9, 'text-anchor': 'middle', class: 'deger' }); v.textContent = sayi(d.ortalama); svg.append(v);
    const e = svgEl('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', class: 'eksen' });
    e.textContent = d.ad.replace(/ Sınavı$/, '').slice(0, 22); svg.append(e);
  });
  return svg;
}

const SIRA = o => o ? `${o.sira} / ${o.sayi}` : bos;
const DEGISIM = d => !d ? bos : d.fark === 0 ? '0' : (d.fark > 0 ? '+' : '−') + sayi(Math.abs(d.fark));

// ---- Bölümler ----
// Bölüm: { ad, ogeler: [{ n, kur(i0, i1) }] }; boş bölüm hiç çizilmez.

function bolumDersler(o) {
  if (!o.dersler.length) return null;
  const satirlar = o.dersler.map(d => [
    d.ders, [d.ogretmen || bos, 'soluk'],
    [d.yazililar.length ? d.yazililar.map(y => y.puan).join(' · ') : bos, 'soluk'],
    [d.not === null ? bos : sayi(d.not), 'not ' + notSinifi(d.not)],
    [d.devam.gelmedi || (d.devam.toplam ? 0 : bos), d.devam.gelmedi ? 'vurgulu' : 'soluk'], [d.devam.izinli || (d.devam.toplam ? 0 : bos), 'soluk'],
  ]);
  const g = o.genel;
  return {
    ad: 'Dersler', ogeler: [tablo(
      [['Ders'], ['Öğretmen'], ['Yazılı / performans', 'sag'], ['Not', 'sag'], ['Devamsız', 'sag'], ['İzinli', 'sag']], satirlar,
      { son: ['Genel ortalama', '', '', [g.ortalama === null ? bos : sayi(g.ortalama), 'not ' + notSinifi(g.ortalama)], [g.devamsiz, g.devamsiz ? 'vurgulu' : ''], g.izinli] },
    )],
  };
}

function bolumSinav(o) {
  const dn = o.sinav.denemeler;
  if (!dn.length && !o.sinav.tekrar.length && !o.sinav.katilmadi.length) return null;
  const ogeler = [];
  if (dn.length) {
    ogeler.push(ogeSabit(() => {
      const k = el('div', undefined, 'kr-sinav-ozet');
      const sol = el('div', undefined, 'kr-buyuk');
      sol.append(el('b', o.genel.denemeOrtalama === null ? bos : sayi(o.genel.denemeOrtalama)), el('span', 'Deneme ortalaması'), el('small', dn.length + ' deneme'));
      k.append(sol, cizgiGrafik(dn));
      return k;
    }));
    ogeler.push(tablo(
      [['Sınav'], ['Tarih'], ['Puan', 'sag'], ['Değişim', 'sag'], ['Sınıf sırası', 'sag'], ['Okul sırası', 'sag'], ['Katılan', 'sag']],
      dn.map(d => [d.ad, [kisaTarih(d.tarih), 'soluk'], [sayi(d.ortalama), 'not ' + notSinifi(d.ortalama)],
        [DEGISIM(d.degisim), d.degisim ? (d.degisim.fark > 0 ? 'artis' : d.degisim.fark < 0 ? 'azalis' : 'soluk') : 'soluk'],
        SIRA(d.siralama?.sinif), SIRA(d.siralama?.okul), [d.giren, 'soluk']])));
  }
  if (o.sinav.tekrar.length) {
    ogeler.push(ogeSabit(() => {
      const k = el('div', undefined, 'kr-liste');
      k.append(altBaslik('Tekrar edilmesi gereken konular'));
      for (const t of o.sinav.tekrar) {
        const s = el('p', undefined, 'kr-madde');
        s.append(el('b', t.ders), el('span', t.kazanim.replace(/^[A-ZÇĞİÖŞÜ.\d]+\s+[–-]\s+/, '')), el('em', 'Başarı %' + Math.round(t.oran)));
        k.append(s);
      }
      return k;
    }));
  }
  if (o.sinav.katilmadi.length) {
    ogeler.push(ogeSabit(() => {
      const k = el('div', undefined, 'kr-liste');
      k.append(altBaslik('Katılmadığı sınavlar'));
      for (const s of o.sinav.katilmadi) { const p = el('p', undefined, 'kr-madde'); p.append(el('b', s.ad), el('span', tarih(s.tarih))); k.append(p); }
      return k;
    }));
  }
  return { ad: 'Sınavlar', ogeler };
}

const ODEV_RENK = { yapildi: '#5b9a73', duzeltme: '#d6a243', yapilmadi: '#c0584f', isaretsiz: '#c9c4b8' };
const ODEV_DURUM = { yapilamadi: 'Yapılmadı', duzeltme: 'Düzeltme istendi', isaretsiz: 'İşaretlenmedi' };

function bolumOdev(o) {
  const t = o.odev.toplam;
  if (!t.verilen) return null;
  const ogeler = [ogeSabit(() => {
    const k = el('div', undefined, 'kr-odev-ozet');
    const dil = [
      { deger: t.yapildi, renk: ODEV_RENK.yapildi, etiket: 'Yapıldı' }, { deger: t.duzeltme, renk: ODEV_RENK.duzeltme, etiket: 'Düzeltme' },
      { deger: t.yapilmadi, renk: ODEV_RENK.yapilmadi, etiket: 'Yapılmadı' }, { deger: t.isaretsiz, renk: ODEV_RENK.isaretsiz, etiket: 'İşaretlenmedi' },
    ];
    k.append(halkaGrafik(dil, t.yuzde === null ? bos : '%' + t.yuzde, 'yapma', 112));
    const sag = el('div', undefined, 'kr-odev-sag');
    sag.append(el('p', `Dönem boyunca ${t.verilen} ödev verildi.`, 'kr-cumle'), gosterge(dil));
    k.append(sag);
    return k;
  })];
  ogeler.push(tablo(
    [['Ders'], ['Verilen', 'sag'], ['Yapılan', 'sag'], ['Düzeltme', 'sag'], ['Yapılmayan', 'sag'], ['Yapma yüzdesi', 'sag yuzde']],
    o.odev.dersler.map(d => [d.ders, d.verilen, d.yapildi, d.duzeltme, [d.yapilmadi + d.isaretsiz, d.yapilmadi ? 'vurgulu' : ''],
      (() => { const w = el('span', undefined, 'kr-yuzde'); const c = el('i'); c.style.setProperty('--w', (d.yuzde || 0) + '%'); w.append(c, el('b', d.yuzde === null ? bos : '%' + d.yuzde)); return w; })()])));
  if (o.odev.eksik.length) {
    ogeler.push(ogeSabit(() => {
      const k = el('div', undefined, 'kr-liste');
      k.append(altBaslik('Tamamlanmayan son ödevler'));
      for (const e of o.odev.eksik) {
        const p = el('p', undefined, 'kr-madde');
        p.append(el('b', e.ders), el('span', e.baslik), el('em', `${ODEV_DURUM[e.durum] || ''} · ${kisaTarih(e.son)}`));
        k.append(p);
      }
      return k;
    }));
  }
  return { ad: 'Ödevler', ogeler };
}

const ETUT_DURUM = { geldi: 'Katıldı', gelmedi: 'Katılmadı', izinli: 'İzinli' };

function bolumEtut(o) {
  const e = o.etut;
  if (!e.ozet.toplam) return null;
  return {
    ad: 'Etütler', ogeler: [
      ogeSabit(() => el('p', `${e.ozet.toplam} etüt planlandı: ${e.ozet.geldi} katıldı${e.ozet.gelmedi ? ', ' + e.ozet.gelmedi + ' katılmadı' : ''}${e.ozet.izinli ? ', ' + e.ozet.izinli + ' izinli' : ''}.`, 'kr-cumle')),
      tablo([['Tarih'], ['Ders'], ['Konu'], ['Durum', 'sag']], e.liste.map(x => [[tarih(x.tarih), 'soluk'], x.ders || bos, x.konu || bos,
        [ETUT_DURUM[x.devam] || 'Bekliyor', x.devam === 'gelmedi' ? 'vurgulu' : 'soluk']])),
    ],
  };
}

function bolumGelisim(o) {
  const { gozlemler, gorusmeler } = o.gelisim;
  if (!gozlemler.length && !gorusmeler.length) return null;
  const gruplar = new Map();
  for (const g of gozlemler) (gruplar.get(g.baslik) || gruplar.set(g.baslik, []).get(g.baslik)).push(g);
  const ogeler = [...gruplar].map(([baslik, liste]) => ogeSabit(() => {
    const k = el('div', undefined, 'kr-gozlem');
    k.append(altBaslik(baslik));
    for (const g of liste) {
      const p = el('p', undefined, 'kr-not');
      p.append(el('b', g.ogretmen + (g.ders ? ' · ' + g.ders : '')), document.createTextNode(g.metin));
      k.append(p);
    }
    return k;
  }));
  if (gorusmeler.length) ogeler.push(ogeSabit(() => {
    const k = el('div', undefined, 'kr-gozlem');
    k.append(altBaslik('Görüşmeler'));
    for (const g of gorusmeler) {
      const p = el('p', undefined, 'kr-not');
      p.append(el('b', `${g.tur} · ${tarih(g.tarih)} · ${g.yazan}`), document.createTextNode(g.notu));
      k.append(p);
    }
    return k;
  }));
  return { ad: 'Gelişim gözlemleri', ogeler };
}

// ---- Sayfa iskeleti ----

function logoYap(okul) {
  const k = el('span', undefined, 'kr-logo');
  if (okul.logo) { const i = el('img'); i.alt = ''; i.src = okul.logo; k.append(i); }
  return k;
}

function istatistik(ad, deger, sinif = '') {
  const k = el('div', undefined, 'kr-ist ' + sinif);
  k.append(el('b', deger), el('span', ad));
  return k;
}

function ustHero(o) {
  const p = o.ogrenci, g = o.genel, d = veri.donem;
  const k = el('header', undefined, 'kr-hero');
  const foto = el('div', undefined, 'kr-foto');
  foto.append(avatarYap(p.ad, p.foto));
  const orta = el('div', undefined, 'kr-kimlik');
  orta.append(el('p', 'Öğrenci gelişim karnesi', 'kr-tur'), el('h2', p.ad));
  const bilgi = el('dl', undefined, 'kr-bilgi');
  for (const [a, b] of [['Okul no', p.okulNo], ['Sınıf', p.sinif], ['Veli', p.veli], ['Sınıf öğretmeni', p.mentor], ['Dönem', d.ad + (d.acik ? ' · devam ediyor' : '')]]) {
    if (!b) continue;
    const s = el('div'); s.append(el('dt', a), el('dd', b)); bilgi.append(s);
  }
  orta.append(bilgi);
  const sag = el('div', undefined, 'kr-okul');
  sag.append(logoYap(veri.okul), el('span', veri.okul.ad));
  k.append(foto, orta, sag);
  const sarmal = el('div', undefined, 'kr-ust');
  const sayilar = el('div', undefined, 'kr-ozet');
  sayilar.append(
    istatistik('Not ortalaması', g.ortalama === null ? bos : sayi(g.ortalama), 'not ' + notSinifi(g.ortalama)),
    istatistik('Deneme ortalaması', g.denemeOrtalama === null ? bos : sayi(g.denemeOrtalama)),
    istatistik('Ödev yapma', g.odevYuzde === null ? bos : '%' + g.odevYuzde),
    istatistik('Devamsız ders', String(g.devamsiz), g.devamsiz ? 'vurgulu' : ''),
    istatistik('Etüt', String(g.etut)),
  );
  sarmal.append(k, sayilar);
  return sarmal;
}

function ustDevam(o) {
  const k = el('header', undefined, 'kr-ust-kucuk');
  k.append(el('b', o.ogrenci.ad), el('span', [o.ogrenci.sinif, veri.donem.ad].filter(Boolean).join(' · ')), logoYap(veri.okul));
  return k;
}

function yeniSayfa(o, ilk) {
  const s = el('section', undefined, 'kr-sayfa');
  const ic = el('div', undefined, 'kr-ic');
  const alt = el('footer', undefined, 'kr-alt');
  s.append(ilk ? ustHero(o) : ustDevam(o), ic, alt);
  $('karne').append(s);
  return { s, ic, alt };
}

const sigar = ic => ic.scrollHeight <= ic.clientHeight + 1;

function bolumElementi(ad, birimler) {
  const k = el('section', undefined, 'kr-bolum');
  k.append(el('h3', ad));
  // Ardışık birimler aynı öğeden geliyorsa tek parça (tablo satırları) olarak kurulur
  for (let i = 0; i < birimler.length;) {
    let j = i; while (j + 1 < birimler.length && birimler[j + 1].oge === birimler[i].oge) j++;
    k.append(birimler[i].oge.kur(birimler[i].i, birimler[j].i + 1));
    i = j + 1;
  }
  return k;
}

function ogrenciSayfalari(o) {
  const sayfalar = [];
  let sayfa = null;
  const yeni = () => { sayfa = yeniSayfa(o, sayfalar.length === 0); sayfalar.push(sayfa); return sayfa; };
  yeni();

  for (const b of [bolumDersler(o), bolumSinav(o), bolumOdev(o), bolumEtut(o), bolumGelisim(o)]) {
    if (!b) continue;
    const birimler = b.ogeler.flatMap(oge => Array.from({ length: oge.n }, (_, i) => ({ oge, i })));
    // 1) Tümü bu sayfaya sığıyor mu, 2) yeni sayfaya sığıyor mu
    const tam = bolumElementi(b.ad, birimler);
    sayfa.ic.append(tam);
    if (sigar(sayfa.ic)) continue;
    tam.remove();
    if (sayfa.ic.children.length) {
      yeni(); sayfa.ic.append(tam);
      if (sigar(sayfa.ic)) continue;
      tam.remove();
    }
    // 3) Tek başına bir sayfadan büyük: öğe sınırlarından böl
    let kalan = birimler, ilkParca = true;
    while (kalan.length) {
      if (!ilkParca && sayfa.ic.children.length) yeni();
      let n = kalan.length, parca;
      for (; n > 0; n--) {
        parca = bolumElementi(ilkParca ? b.ad : b.ad + ' (devam)', kalan.slice(0, n));
        sayfa.ic.append(parca);
        if (sigar(sayfa.ic) || n === 1) break;
        parca.remove();
      }
      kalan = kalan.slice(n); ilkParca = false;
    }
  }

  const bugun = tarih(veri.rapor);
  sayfalar.forEach((s, i) => {
    s.alt.append(el('span', veri.okul.ad + ' · ' + veri.donem.ad), el('span', 'Düzenlenme: ' + bugun), el('span', `Sayfa ${i + 1} / ${sayfalar.length}`));
  });
  return sayfalar.length;
}

// ---- Akış ----

function olcekle() {
  const kok = $('karne');
  kok.style.removeProperty('zoom');
  const gen = kok.firstElementChild?.getBoundingClientRect().width || 794;
  const kullanilabilir = document.documentElement.clientWidth - 24;
  if (kullanilabilir < gen) kok.style.setProperty('zoom', (kullanilabilir / gen).toFixed(3));
}

async function ciz() {
  const kok = $('karne');
  kok.replaceChildren();
  kok.style.removeProperty('zoom');
  const liste = veri.ogrenciler;
  if (!liste.length) { mesajYaz('Bu sınıfta öğrenci yok.'); $('k-yazdir').disabled = true; return; }
  await document.fonts.ready;
  let toplam = 0;
  for (const o of liste) toplam += ogrenciSayfalari(o);
  await Promise.all([...kok.querySelectorAll('img')].map(i => i.complete ? null : new Promise(ok => { i.addEventListener('load', ok); i.addEventListener('error', ok); })));
  olcekle();
  $('k-baslik').textContent = veri.sinif ? `${veri.sinif.ad} sınıfı karneleri` : liste[0].ogrenci.ad;
  $('k-bilgi').textContent = [liste.length > 1 ? liste.length + ' öğrenci' : '', toplam + ' sayfa', veri.donem.acik ? 'dönem devam ediyor' : ''].filter(Boolean).join(' · ');
  document.title = 'neademy - ' + $('k-baslik').textContent;
  $('k-yazdir').disabled = false;
  document.body.dataset.hazir = '1';
}

function donemSecimi() {
  const s = $('k-donem');
  s.replaceChildren();
  for (const d of veri.donemler) {
    const o = el('option', d.ad + (d.baslamadi ? ' (başlamadı)' : d.acik ? ' (devam ediyor)' : ''));
    o.value = d.id; o.selected = d.id === veri.donem.id;
    s.append(o);
  }
  s.classList.toggle('gizli', veri.donemler.length < 2);
}

async function yukle() {
  const q = new URLSearchParams();
  if (sinifId) q.set('sinifId', sinifId); else q.set('id', ogrId);
  if (donemId) q.set('donemId', donemId);
  document.body.dataset.hazir = '';
  $('k-yazdir').disabled = true;
  mesajYaz('Karne hazırlanıyor…');
  const r = await fetch('/api/karne?' + q);
  if (r.status === 401) { location.href = '/'; return; }
  const v = await r.json();
  if (!r.ok) { mesajYaz(v.hata || 'Karne açılamadı', true); return; }
  if (!v.donem) { mesajYaz('Bu sınıfta öğrenci yok.'); return; }
  veri = v; donemId = v.donem.id;
  mesajYaz('');
  donemSecimi();
  await ciz();
}

(async () => {
  if (!ogrId && !sinifId) { location.href = '/panel'; return; }
  const ben = await fetch('/api/ben').then(r => r.json()).catch(() => ({}));
  $('geri').href = ben.rol === 'veli' ? '/ogrencim'
    : sinifId ? (ben.rol === 'yonetim' ? '/ogrenciler' : '/ogrencilerim') : '/ogrenci-dosyasi?id=' + ogrId;
  $('k-donem').addEventListener('change', e => { donemId = Number(e.target.value); yukle(); });
  $('k-yazdir').addEventListener('click', () => window.print());
  window.addEventListener('resize', () => { if (veri) olcekle(); });
  await yukle();
})();
