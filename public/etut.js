const $ = id => document.getElementById(id);
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

function dugme(metin, tikla, sinif = 'ikincil kucuk') {
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
  const n = seciliOgrenciler.size;
  $('secim-ozet').textContent = n ? `Davet edilecek öğrenci: ${n}` : 'Henüz öğrenci seçilmedi.';
}

function ogrenciListesiCiz() {
  const liste = $('ogrenci-liste');
  liste.replaceChildren();
  const g = gorunenOgrenciler();
  for (const o of g) liste.appendChild(onayKutusu(o.ad, seciliOgrenciler, o.id, ozetGuncelle));
  if (!g.length) liste.appendChild(el('p', 'Bu sınıfta öğrenci yok.', 'alt'));
  ozetGuncelle();
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
  kart.appendChild(el('strong', e.konu + (iptal ? ' (iptal edildi)' : '')));
  kart.appendChild(el('p', zamanYaz(e), 'alt'));
  if (e.ders || e.yer) kart.appendChild(bilgiSatiri(e));
  const say = { bekliyor: 0, gelecek: 0, gelmeyecek: 0 };
  for (const k of e.katilimcilar) say[k.yanit]++;
  kart.appendChild(el('p', `Davetli ${e.katilimcilar.length} · Gelecek ${say.gelecek} · Gelmeyecek ${say.gelmeyecek} · Bekliyor ${say.bekliyor}`));

  const d = document.createElement('details');
  d.appendChild(el('summary', 'Öğrenci durumları'));
  const t = el('table');
  for (const k of e.katilimcilar) {
    const tr = document.createElement('tr');
    tr.append(el('td', k.ad), el('td', YANIT_ADI[k.yanit]));
    t.appendChild(tr);
  }
  d.appendChild(t);
  kart.appendChild(d);
  if (!iptal) {
    kart.appendChild(dugme('Etüdü iptal et', async () => {
      const r = await api('/api/etut/iptal', { etutId: e.id });
      if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
      mesaj('Etüt iptal edildi.', 'tamam');
      listeYukle();
    }));
  }
  return kart;
}

function veliKarti(e) {
  const kart = el('div', undefined, 'kutu');
  const iptal = e.durum === 'iptal';
  kart.appendChild(el('strong', `${e.ogrenci}: ${e.konu}` + (iptal ? ' (iptal edildi)' : '')));
  kart.appendChild(el('p', zamanYaz(e), 'alt'));
  kart.appendChild(el('p', ['Öğretmen: ' + e.ogretmen, e.ders, e.yer].filter(Boolean).join(' · '), 'alt'));
  if (e.not) kart.appendChild(el('p', 'Not: ' + e.not));
  kart.appendChild(el('p', 'Durum: ' + YANIT_ADI[e.yanit]));
  if (!iptal) {
    const yanitla = yanit => async () => {
      const r = await api('/api/etut/yanit', { etutId: e.id, ogrenciId: e.ogrenciId, yanit });
      if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
      mesaj('Yanıtınız öğretmene iletildi.', 'tamam');
      listeYukle();
    };
    kart.append(
      dugme('Gelecek', yanitla('gelecek'), e.yanit === 'gelecek' ? 'birincil kucuk' : 'ikincil kucuk'),
      document.createTextNode('  '),
      dugme('Gelmeyecek', yanitla('gelmeyecek'), e.yanit === 'gelmeyecek' ? 'birincil kucuk' : 'ikincil kucuk'),
    );
  }
  return kart;
}

function ogrenciKarti(e) {
  const kart = el('div', undefined, 'kutu');
  kart.appendChild(el('strong', e.konu + (e.durum === 'iptal' ? ' (iptal edildi)' : '')));
  kart.appendChild(el('p', zamanYaz(e), 'alt'));
  kart.appendChild(el('p', ['Öğretmen: ' + e.ogretmen, e.ders, e.yer].filter(Boolean).join(' · '), 'alt'));
  if (e.not) kart.appendChild(el('p', 'Not: ' + e.not));
  kart.appendChild(el('p', 'Veli yanıtı: ' + YANIT_ADI[e.yanit]));
  return kart;
}

async function listeYukle() {
  const r = await api('/api/etut/liste');
  const liste = $('liste');
  liste.replaceChildren();
  const etutler = r.veri.etutler || [];
  if (!etutler.length) {
    liste.appendChild(el('p', rol === 'veli' ? 'Çocuğunuz için davet yok.' : 'Henüz etüt yok.', 'alt'));
    if (rol === 'veli' && !(r.veri.cocuklar || []).length) {
      liste.appendChild(el('p', 'Hesabınıza bağlı öğrenci yok. Okul yönetimi ile iletişime geçin.', 'alt'));
    }
    return;
  }
  const kart = rol === 'ogretmen' ? ogretmenKarti : rol === 'veli' ? veliKarti : ogrenciKarti;
  for (const e of etutler) liste.appendChild(kart(e));
}

(async () => {
  const ben = await fetch('/api/ben');
  if (!ben.ok) { location.href = '/'; return; }
  rol = (await ben.json()).rol;
  if (!['ogretmen', 'ogrenci', 'veli'].includes(rol)) { location.href = '/panel'; return; }
  $('baslik').textContent = rol === 'veli' ? 'Etüt onayları' : rol === 'ogrenci' ? 'Etütlerim' : 'Etüt';
  $('liste-baslik').textContent = rol === 'ogretmen' ? 'Açtığım etütler' : 'Etütler';
  if (rol === 'ogretmen') {
    $('yeni').classList.remove('gizli');
    $('tarih').min = new Date().toLocaleDateString('sv-SE');
    await secenekYukle();
  }
  await listeYukle();
})();
