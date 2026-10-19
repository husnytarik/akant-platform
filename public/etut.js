const $ = id => document.getElementById(id);
const DEVAM_SECENEK = [['geldi', 'Geldi'], ['gelmedi', 'Gelmedi'], ['izinli', 'İzinli']];
const DEVAM_ADI = { geldi: 'Geldi', gelmedi: 'Gelmedi', izinli: 'İzinli' };
const YANIT_ADI = { bekliyor: 'Bekliyor', gelecek: 'Gelecek', gelmeyecek: 'Gelmeyecek' };
let rol = null;
let secenek = null;
const seciliOgrenciler = new Set();

function mesaj(metin, tur = '') {
  $('mesaj').textContent = metin;
  $('mesaj').className = 'mesaj ' + tur;
}

async function api(yol, govde) {
  const r = await fetch(yol, govde === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(govde),
  });
  if (r.status === 401) { location.href = '/'; throw new Error('oturum'); }
  const veri = await r.json().catch(() => ({}));
  return { ok: r.ok, veri };
}

function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

function dugme(metin, tikla, sinif = 'ikincil') {
  const b = el('button', metin, sinif);
  b.type = 'button';
  b.addEventListener('click', tikla);
  return b;
}

const tarihYaz = t => { const [y, a, g] = t.split('-'); return `${g}.${a}.${y}`; };
function bitis(saat, sure) {
  const t = Number(saat.slice(0, 2)) * 60 + Number(saat.slice(3, 5)) + sure;
  return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}
const zamanYaz = e => `${tarihYaz(e.tarih)} · ${e.saat}–${bitis(e.saat, e.sureDk)} (${e.sureDk} dk)`;


const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
// Kart başlığı: tarih rozeti + konu + saat/yer satırları (ikonlu)
function etutBaslik(e, baslik, bilgiler) {
  const ust = el('div', undefined, 'etut-ust');
  const [, a, g] = e.tarih.split('-');
  const rozet = el('div', undefined, 'tarih-rozet');
  rozet.append(el('strong', String(Number(g))), el('span', AY[Number(a) - 1]));
  const orta = el('div', undefined, 'etut-orta');
  orta.appendChild(el('strong', baslik));
  orta.appendChild(el('span', `${e.saat}–${bitis(e.saat, e.sureDk)} · ${e.sureDk} dk`, 'etut-saat'));
  for (const b of bilgiler.filter(Boolean)) orta.appendChild(el('span', b, 'alt'));
  ust.append(rozet, orta);
  return ust;
}

// Davet yanıtlarının dağılımı: yığın çubuk + gösterge
function katilimOzeti(katilimcilar) {
  const say = { gelecek: 0, gelmeyecek: 0, bekliyor: 0 };
  for (const k of katilimcilar) say[k.yanit]++;
  const d = [
    { deger: say.gelecek, renk: '#2e9e5b', etiket: 'gelecek' },
    { deger: say.gelmeyecek, renk: '#d64545', etiket: 'gelmeyecek' },
    { deger: say.bekliyor, renk: '#c9c2b2', etiket: 'bekliyor' },
  ];
  const k = el('div', undefined, 'katilim');
  k.append(yiginCubuk(d), gosterge(d));
  return k;
}

function onayKutusu(metin, kume, id, degisti) {
  const l = el('label', undefined, 'onay');
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.checked = kume.has(id);
  c.addEventListener('change', () => { c.checked ? kume.add(id) : kume.delete(id); degisti(); });
  l.append(c, document.createTextNode(' ' + metin));
  return l;
}

function gorunenOgrenciler() {
  const f = $('ogrenci-sinif').value;
  return secenek.ogrenciler.filter(o => String(o.sinifId) === f);
}

function ozetGuncelle() {
  const g = gorunenOgrenciler();
  const secili = g.filter(o => seciliOgrenciler.has(o.id)).length;
  const hepsi = $('hepsi');
  hepsi.checked = g.length > 0 && secili === g.length;
  hepsi.indeterminate = secili > 0 && secili < g.length;
  hepsi.disabled = !g.length;
  sinifChipleriCiz();
  const n = seciliOgrenciler.size;
  $('secim-ozet').textContent = n ? `Davet edilecek öğrenci: ${n}` : 'Henüz öğrenci seçilmedi.';
}

// Sınıf düğmeleri: dokununca sınıfın tüm öğrencileri eklenir/çıkarılır; kısmi seçim "7/17" olarak görünür
function sinifChipleriCiz() {
  const kap = $('sinif-chips');
  if (!kap || !secenek) return;
  kap.replaceChildren();
  const seviyeler = new Map();
  for (const s of secenek.siniflar) {
    const sv = (String(s.ad).match(/^\d+/) || ['Diğer'])[0];
    if (!seviyeler.has(sv)) seviyeler.set(sv, []);
    seviyeler.get(sv).push(s);
  }
  const oglar = sid => secenek.ogrenciler.filter(o => o.sinifId === sid);
  const degistir = (sinifler, ekle) => {
    for (const s of sinifler) for (const o of oglar(s.id)) ekle ? seciliOgrenciler.add(o.id) : seciliOgrenciler.delete(o.id);
    ogrenciListesiCiz();
  };
  for (const [sv, sinifler] of [...seviyeler].sort((x, y) => x[0].localeCompare(y[0], 'tr', { numeric: true }))) {
    const grup = el('div', undefined, 'sinif-grup');
    const toplamSeciliTum = sinifler.every(s => oglar(s.id).length && oglar(s.id).every(o => seciliOgrenciler.has(o.id)));
    const ust = el('div', undefined, 'sinif-grup-ust');
    const tum = el('button', toplamSeciliTum ? 'Tümünü kaldır' : 'Tümü', 'sinif-tum');
    tum.type = 'button';
    tum.addEventListener('click', () => degistir(sinifler, !toplamSeciliTum));
    ust.append(el('span', /^\d+$/.test(sv) ? sv + '. sınıflar' : sv, 'mini-baslik'), tum);
    const satir = el('div', undefined, 'sinif-satir');
    for (const s of sinifler) {
      const og = oglar(s.id);
      const sec = og.filter(o => seciliOgrenciler.has(o.id)).length;
      const durum = !sec ? 'yok' : sec === og.length ? 'tam' : 'kismi';
      const b = el('button', undefined, 'sinif-chip ' + durum);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(durum === 'tam'));
      b.append(el('strong', s.ad), el('small', durum === 'yok' ? String(og.length) : `${sec}/${og.length}`));
      b.addEventListener('click', () => degistir([s], durum !== 'tam'));
      satir.appendChild(b);
    }
    grup.append(ust, satir);
    kap.appendChild(grup);
  }
}

function ogrenciListesiCiz() {
  const liste = $('ogrenci-liste');
  liste.replaceChildren();
  const g = gorunenOgrenciler();
  for (const o of g) liste.appendChild(onayKutusu(o.ad, seciliOgrenciler, o.id, ozetGuncelle));
  if (!g.length) liste.appendChild(el('p', 'Bu sınıfta öğrenci yok.', 'alt'));
  ozetGuncelle();
}

function sekmeSec(ad) {
  for (const b of $('e-sekmeler').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.sekme === ad));
  $('yeni').classList.toggle('gizli', ad !== 'yeni');
  $('liste-bolum').classList.toggle('gizli', ad !== 'liste');
}

let dinleyiciVar = false;
async function secenekYukle() {
  const r = await api('/api/etut/secenek');
  secenek = r.veri;
  const ders = $('ders');
  ders.replaceChildren(new Option('Seçilmedi', ''));
  for (const d of secenek.dersler) ders.appendChild(new Option(d.ad, d.id));
  const sure = $('sure');
  sure.replaceChildren();
  for (const s of secenek.sureler) sure.appendChild(new Option(`${s} dakika`, s));
  sure.value = '40';

  const f = $('ogrenci-sinif');
  f.replaceChildren();
  for (const s of secenek.siniflar) f.appendChild(new Option(s.ad, s.id));
  if (!secenek.siniflar.length) f.appendChild(new Option('Şubenizde sınıf yok', ''));
  if (!dinleyiciVar) {
    dinleyiciVar = true;
    f.addEventListener('change', ogrenciListesiCiz);
    $('hepsi').addEventListener('change', () => {
      for (const o of gorunenOgrenciler()) $('hepsi').checked ? seciliOgrenciler.add(o.id) : seciliOgrenciler.delete(o.id);
      ogrenciListesiCiz();
    });
  }
  ogrenciListesiCiz();
}

function cakismaGoster(v) {
  const ul = $('cakisma-liste');
  ul.replaceChildren();
  for (const c of v.ogrenci) {
    ul.appendChild(el('li', `${c.sinif} sınıfı, ${c.gun} ${c.dersSaati}. ders (${c.aralik}) ${c.ders} dersi: ${c.ogrenciSayisi} davetli öğrenci derste`));
  }
  for (const c of v.ogretmen) {
    ul.appendChild(el('li', `Sizin dersiniz: ${c.gun} ${c.dersSaati}. ders (${c.aralik}) ${c.sinif} ${c.ders}`));
  }
  $('cakisma').classList.remove('gizli');
}

function formVerisi(onayla) {
  return {
    konu: $('konu').value, dersId: $('ders').value, yer: $('yer').value, not: $('not').value,
    tarih: $('tarih').value, saat: $('saat').value, sureDk: Number($('sure').value),
    sinifIds: [], ogrenciIds: [...seciliOgrenciler], cakismayiOnayla: onayla,
  };
}

async function gonder(onayla) {
  const r = await api('/api/etut/ekle', formVerisi(onayla));
  if (r.veri.cakisma) {
    mesaj('Ders programıyla çakışma var, aşağıdaki uyarıyı inceleyin.', 'hata');
    cakismaGoster(r.veri);
    return;
  }
  $('cakisma').classList.add('gizli');
  if (!r.ok) return mesaj(r.veri.hata || 'Bir hata oluştu', 'hata');
  mesaj(`Etüt oluşturuldu, ${r.veri.ogrenciSayisi} öğrencinin velisine onay isteği iletildi.`, 'tamam');
  $('etut-form').reset();
  $('sure').value = '40';
  seciliOgrenciler.clear();
  await secenekYukle();
  await listeYukle();
  sekmeSec('liste');
}

$('etut-form').addEventListener('submit', e => { e.preventDefault(); gonder(false); });
$('yine-de').addEventListener('click', () => gonder(true));
// Form değişince eski uyarı geçersiz olur
$('etut-form').addEventListener('input', () => $('cakisma').classList.add('gizli'));

// ---- Listeler ----
function bilgiSatiri(e) {
  const p = el('p', [e.ders, e.yer].filter(Boolean).join(' · '), 'alt');
  return p;
}

function ogretmenKarti(e) {
  const kart = el('div', undefined, 'kutu');
  const iptal = e.durum === 'iptal';
  if (iptal) kart.classList.add('iptal');
  kart.appendChild(etutBaslik(e, e.konu + (iptal ? ' (iptal)' : ''), [[e.ders, e.yer].filter(Boolean).join(' · ')]));
  if (e.not) kart.appendChild(el('p', 'Not: ' + e.not, 'etut-not'));
  kart.appendChild(katilimOzeti(e.katilimcilar));

  const d = document.createElement('details');
  const alinan = e.katilimcilar.filter(k => k.devam).length;
  d.appendChild(el('summary', alinan ? `Öğrenci durumları ve yoklama (${alinan}/${e.katilimcilar.length} işaretli)` : 'Öğrenci durumları ve yoklama'));
  const bugun = new Date().toLocaleDateString('sv-SE');
  const yoklamaAcik = !iptal && e.tarih <= bugun;
  const durum = new Map(e.katilimcilar.map(k => [k.ogrenciId, k.devam || 'geldi']));
  const t = el('div', undefined, 'yoklama-liste' + (yoklamaAcik ? ' hapli' : ''));
  const IS = { geldi: '✓', gelmedi: '✗', izinli: 'İ' };
  for (const k of e.katilimcilar) {
    if (yoklamaAcik) {
      const hap = el('button', undefined, 'yok-hap iki d-' + durum.get(k.ogrenciId));
      hap.type = 'button';
      const govde = el('span', undefined, 'yok-govde');
      govde.append(el('span', k.ad, 'yok-isim'), el('small', YANIT_ADI[k.yanit], 'etiket mini y-' + k.yanit));
      const ikon = el('span', PASTA_IKON[durum.get(k.ogrenciId)], 'yok-ikon');
      hap.append(govde, ikon);
      hap.addEventListener('click', () => pastaAc(k.ad, hap, DEVAM_SECENEK, durum.get(k.ogrenciId), deger => {
        durum.set(k.ogrenciId, deger);
        hap.className = 'yok-hap iki d-' + deger;
        ikon.textContent = PASTA_IKON[deger];
      }));
      t.appendChild(hap);
      continue;
    }
    const satir = el('div', undefined, 'yok-satir');
    const ad = el('div', undefined, 'yok-ad');
    ad.append(el('span', k.ad), el('small', YANIT_ADI[k.yanit], 'etiket mini y-' + k.yanit));
    satir.appendChild(ad);
    const m = el('span', k.devam ? IS[k.devam] : '–', 'isaret ' + (k.devam || 'yok'));
    m.setAttribute('aria-label', k.devam ? DEVAM_ADI[k.devam] : 'Kayıt yok');
    satir.appendChild(m);
    t.appendChild(satir);
  }
  d.appendChild(t);
  if (yoklamaAcik) {
    d.appendChild(dugme('Yoklamayı kaydet', async () => {
      const r = await api('/api/etut/yoklama', {
        etutId: e.id, kayitlar: e.katilimcilar.map(k => ({ ogrenciId: k.ogrenciId, durum: durum.get(k.ogrenciId) })),
      });
      if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
      mesaj(`Yoklama kaydedildi: ${r.veri.geldi} geldi, ${r.veri.gelmedi} gelmedi, ${r.veri.izinli} izinli.`, 'tamam');
      listeYukle();
    }, 'birincil'));
  } else if (!iptal) {
    d.appendChild(el('p', 'Yoklama etüt günü açılır.', 'alt'));
  }
  kart.appendChild(d);
  if (!iptal) {
    kart.appendChild(dugme('Etüdü iptal et', async () => {
      const r = await api('/api/etut/iptal', { etutId: e.id });
      if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
      mesaj('Etüt iptal edildi.', 'tamam');
      listeYukle();
    }, 'ikincil tehlike'));
  }
  return kart;
}

function veliKarti(e) {
  const kart = el('div', undefined, 'kutu');
  const iptal = e.durum === 'iptal';
  if (iptal) kart.classList.add('iptal');
  kart.appendChild(etutBaslik(e, `${e.ogrenci}: ${e.konu}` + (iptal ? ' (iptal)' : ''), ['Öğretmen: ' + e.ogretmen, [e.ders, e.yer].filter(Boolean).join(' · ')]));
  if (e.not) kart.appendChild(el('p', 'Not: ' + e.not, 'etut-not'));
  const rozetler = el('div', undefined, 'etut-rozetler');
  rozetler.appendChild(el('span', 'Yanıt: ' + YANIT_ADI[e.yanit], 'etiket y-' + e.yanit));
  if (e.devam) rozetler.appendChild(el('span', DEVAM_ADI[e.devam], 'etiket y-' + e.devam));
  kart.appendChild(rozetler);
  if (!iptal) {
    const yanitla = yanit => async () => {
      const r = await api('/api/etut/yanit', { etutId: e.id, ogrenciId: e.ogrenciId, yanit });
      if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
      mesaj('Yanıtınız öğretmene iletildi.', 'tamam');
      listeYukle();
    };
    kart.append(
      dugme('Gelecek', yanitla('gelecek'), e.yanit === 'gelecek' ? 'birincil' : 'ikincil'),
      dugme('Gelmeyecek', yanitla('gelmeyecek'), e.yanit === 'gelmeyecek' ? 'birincil' : 'ikincil'),
    );
  }
  return kart;
}

function ogrenciKarti(e) {
  const kart = el('div', undefined, 'kutu');
  if (e.durum === 'iptal') kart.classList.add('iptal');
  kart.appendChild(etutBaslik(e, e.konu + (e.durum === 'iptal' ? ' (iptal)' : ''), ['Öğretmen: ' + e.ogretmen, [e.ders, e.yer].filter(Boolean).join(' · ')]));
  if (e.not) kart.appendChild(el('p', 'Not: ' + e.not, 'etut-not'));
  const rozetler = el('div', undefined, 'etut-rozetler');
  rozetler.appendChild(el('span', YANIT_ADI[e.yanit], 'etiket y-' + e.yanit));
  if (e.devam) rozetler.appendChild(el('span', DEVAM_ADI[e.devam], 'etiket y-' + e.devam));
  kart.appendChild(rozetler);
  return kart;
}

async function listeYukle() {
  const r = await api('/api/etut/liste');
  const liste = $('liste');
  liste.replaceChildren();
  const etutler = r.veri.etutler || [];
  if (!etutler.length) {
    liste.appendChild(el('p', rol === 'veli' ? 'Çocuğunuz için davet yok.' : rol === 'ogretmen' ? 'Henüz etüt açmadınız. "Yeni etüt" sekmesinden başlayın.' : 'Henüz davet edildiğiniz etüt yok.', 'bos-not'));
    if (rol === 'veli' && !(r.veri.cocuklar || []).length) {
      liste.appendChild(el('p', 'Hesabınıza bağlı öğrenci yok. Okul yönetimi ile iletişime geçin.', 'bos-not'));
    }
    return;
  }
  if (rol === 'ogretmen') return ogretmenListesi(liste, etutler);
  const kart = rol === 'veli' ? veliKarti : ogrenciKarti;
  for (const e of etutler) liste.appendChild(kart(e));
}

// Öğretmen: derslerdeki gibi kısa satırlar (tarih · saat), seçilen etüdün detayı altta
let seciliEtut = null;
function ogretmenListesi(liste, etutler) {
  const bugun = new Date().toLocaleDateString('sv-SE');
  const detay = el('div', undefined, 'etut-detay');
  const satirlar = new Map();
  const goster = e => {
    seciliEtut = e.id;
    for (const [id, s] of satirlar) s.setAttribute('aria-pressed', String(id === e.id));
    detay.replaceChildren(ogretmenKarti(e));
  };
  const grup = (baslik, dizi) => {
    if (!dizi.length) return;
    liste.appendChild(el('h3', baslik, 'mini-baslik'));
    for (const e of dizi) {
      const [, a, g] = e.tarih.split('-');
      const s = el('button', undefined, 'etut-satir' + (e.durum === 'iptal' ? ' iptal' : ''));
      s.type = 'button';
      s.setAttribute('aria-pressed', 'false');
      const rozet = el('span', undefined, 'tarih-rozet kucuk');
      rozet.append(el('strong', String(Number(g))), el('span', AY[Number(a) - 1]));
      const orta = el('span', undefined, 'etut-satir-orta');
      orta.append(el('strong', e.konu + (e.durum === 'iptal' ? ' (iptal)' : '')),
        el('small', `${e.saat}–${bitis(e.saat, e.sureDk)}${[e.ders, e.yer].filter(Boolean).length ? ' · ' + [e.ders, e.yer].filter(Boolean).join(' · ') : ''}`));
      const gel = e.katilimcilar.filter(k => k.yanit === 'gelecek').length;
      const sag = el('span', `${gel}/${e.katilimcilar.length}`, 'etut-satir-sayi');
      s.append(rozet, orta, sag);
      s.addEventListener('click', () => { goster(e); detay.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
      satirlar.set(e.id, s);
      liste.appendChild(s);
    }
  };
  grup('Yaklaşan', etutler.filter(e => e.tarih >= bugun).sort((x, y) => (x.tarih + x.saat).localeCompare(y.tarih + y.saat)));
  grup('Geçmiş', etutler.filter(e => e.tarih < bugun).sort((x, y) => (y.tarih + y.saat).localeCompare(x.tarih + x.saat)));
  liste.appendChild(detay);
  const eskisi = etutler.find(e => e.id === seciliEtut);
  if (eskisi) goster(eskisi);
  else detay.appendChild(el('p', 'Listeden bir etüt seçin; katılım ve yoklama burada görünür.', 'bos-not'));
}

(async () => {
  const ben = await fetch('/api/ben');
  if (!ben.ok) { location.href = '/'; return; }
  rol = (await ben.json()).rol;
  if (!['ogretmen', 'ogrenci', 'veli'].includes(rol)) { location.href = '/panel'; return; }
  $('baslik').textContent = rol === 'veli' ? 'Etüt onayları' : rol === 'ogrenci' ? 'Etütlerim' : 'Etüt';
  $('liste-baslik').textContent = rol === 'ogretmen' ? 'Açtığım etütler' : 'Etütler';
  if (rol === 'ogretmen') {
    $('e-sekmeler').classList.remove('gizli');
    $('e-sekmeler').addEventListener('click', e => { const b = e.target.closest('button'); if (b) sekmeSec(b.dataset.sekme); });
    sekmeSec('liste');
    $('tarih').min = new Date().toLocaleDateString('sv-SE');
    await secenekYukle();
  }
  await listeYukle();
})();
