const $ = id => document.getElementById(id);
const KISA = { 1: 'Pzt', 2: 'Sal', 3: 'Çar', 4: 'Per', 5: 'Cum', 6: 'Cmt', 0: 'Paz' };
const GUN_UZUN = { 1: 'Pazartesi', 2: 'Salı', 3: 'Çarşamba', 4: 'Perşembe', 5: 'Cuma', 6: 'Cumartesi', 0: 'Pazar' };
const TUR_AD = { nobet: 'Nöbet', gorev: 'Görev' };
let yapi = null;
let atamalar = [];        // seçili sınıfın öğretmeni atanmış dersleri
let hucreler = new Map(); // `${gun}-${saat}` -> hücre
let firca = null;         // seçili ders (atama id); null = seçim yok
let mesgul = new Map();   // fırçadaki öğretmenin dolu saatleri: `${gun}-${saat}` -> neden

// Öğretmen sekmesi
let ogDers = new Map();   // öğretmenin ders hücreleri
let ogDurum = null;       // { kapali, azami, gorevler }
let kapaliKume = new Set(); // düzenlemede işaretlenen "müsait değil" hücreleri

// Nöbet / görev sekmesi
let gorevler = [];
let gorevDuzenlenen = null;

function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

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
  if (r.status === 403) { location.href = '/panel'; throw new Error('yetki'); }
  const v = await r.json().catch(() => ({}));
  return { ok: r.ok, veri: v };
}

function doldur(sel, liste, deger, etiket, bos) {
  sel.replaceChildren();
  if (bos) sel.appendChild(new Option(bos, ''));
  for (const x of liste) sel.appendChild(new Option(etiket(x), deger(x)));
}

const acikGunler = () => yapi.okul.gunler.filter(g => g.acik);
const soyad = ad => String(ad || '').split(' ').pop();
const secilenSinif = () => yapi.siniflar.find(s => String(s.id) === $('program-sinif').value);

// "1, 2, 3, 5" -> "1–3, 5. ders"
function saatAraligi(saatler) {
  const parcalar = [];
  for (let i = 0; i < saatler.length; i++) {
    let j = i;
    while (saatler[j + 1] === saatler[j] + 1) j++;
    parcalar.push(j > i ? `${saatler[i]}–${saatler[j]}` : String(saatler[i]));
    i = j;
  }
  return parcalar.join(', ') + '. ders';
}

async function yapiYukle() {
  const r = await api('/api/yonetim/sinif-yapisi');
  yapi = r.veri;

  const onceki = $('program-sinif').value;
  doldur($('program-sinif'), yapi.siniflar, s => s.id,
    s => `${s.sube} · ${s.ad}`, yapi.siniflar.length ? null : "Önce Okul kurulumu'ndan sınıf açın");
  if (onceki && yapi.siniflar.some(s => String(s.id) === onceki)) $('program-sinif').value = onceki;

  // Aynı kişi birden fazla okulda öğretmense tek satırda göster
  const tekil = new Map();
  for (const o of yapi.ogretmenler) if (!tekil.has(o.userId)) tekil.set(o.userId, o);
  const ogretmenler = [...tekil.values()];
  const prev = $('ogretmen-sec').value;
  doldur($('ogretmen-sec'), ogretmenler, o => o.userId, o => o.ad, 'Öğretmen seçin');
  if (prev) $('ogretmen-sec').value = prev;
  const prevG = $('gorev-suz').value;
  doldur($('gorev-suz'), ogretmenler, o => o.userId, o => o.ad, 'Tüm öğretmenler');
  if (prevG) $('gorev-suz').value = prevG;
  doldur($('g-ogretmen'), ogretmenler, o => o.userId, o => o.ad, 'Öğretmen seçin');
  doldur($('g-gun'), acikGunler(), g => g.no, g => g.ad);
}

// ---- Ortak: salt okunur haftalık tablo ----
// icerik(gun, saat) -> null ya da { tur, renk, ust, alt }
function tabloKur(kap, icerik) {
  const t = el('table', undefined, 'prg-tablo');
  const bas = el('tr');
  bas.appendChild(el('th'));
  for (const g of acikGunler()) {
    const th = el('th');
    th.append(el('span', KISA[g.no], 'kisa'), el('span', GUN_UZUN[g.no], 'uzun'));
    bas.appendChild(th);
  }
  const ust = el('thead');
  ust.appendChild(bas);
  const govde = el('tbody');
  yapi.okul.saatler.forEach((z, i) => {
    const tr = el('tr');
    const th = el('th', undefined, 'prg-satir-ad');
    th.append(el('strong', String(i + 1)), el('small', z.bas + (z.bit ? '–' + z.bit : '')));
    tr.appendChild(th);
    for (const g of acikGunler()) {
      const td = el('td');
      const c = icerik(g.no, i + 1);
      if (c) {
        td.className = 'dolu ' + c.tur;
        if (c.renk) td.style.setProperty('--ders', c.renk);
        if (c.ust) td.appendChild(el('strong', c.ust));
        if (c.alt) td.appendChild(el('small', c.alt));
      }
      tr.appendChild(td);
    }
    govde.appendChild(tr);
  });
  t.append(ust, govde);
  kap.replaceChildren(t);
}

// Gün sütunları ve ders saati satırlarından oluşan dokunulabilir ızgara
function izgaraKur(kap, hucreYaz) {
  const gunler = acikGunler();
  kap.replaceChildren();
  kap.style.setProperty('--sutun', gunler.length);
  kap.appendChild(el('span', undefined, 'prg-kose'));
  for (const g of gunler) kap.appendChild(el('span', KISA[g.no], 'prg-gun'));
  yapi.okul.saatler.forEach((z, i) => {
    const saat = i + 1;
    const et = el('span', undefined, 'prg-saat');
    et.append(el('strong', String(saat)), el('small', z.bas));
    kap.appendChild(et);
    for (const g of gunler) kap.appendChild(hucreYaz(g.no, saat));
  });
}

// ---- Sınıf programı ----
function sinifTablosu() {
  const s = secilenSinif();
  $('sinif-baslik').textContent = s ? s.ad : 'Sınıf programı';
  $('sinif-yazdir').textContent = s ? `${s.sube} · ${s.ad} sınıfı haftalık ders programı` : '';
  if (!s) return $('sinif-tablo').replaceChildren();
  tabloKur($('sinif-tablo'), (gun, saat) => {
    const h = hucreler.get(`${gun}-${saat}`);
    return h && { tur: 'ders', renk: h.renk, ust: h.ders, alt: h.ogretmen ? soyad(h.ogretmen) : '' };
  });
}

function fircaCiz() {
  const k = $('fircalar');
  k.replaceChildren();
  if (!atamalar.length) {
    k.appendChild(el('p', 'Bu sınıfa öğretmeni atanmış ders yok. Okul kurulumu > Sınıflar bölümünden ders ve öğretmen atayın.', 'bos-not'));
    return;
  }
  for (const a of atamalar) {
    const b = el('button', undefined, 'prg-firca' + (firca === a.id ? ' secili' : '') + (a.kullanilan >= a.haftalikSaat ? ' tam' : ''));
    b.type = 'button';
    b.style.setProperty('--ders', a.renk);
    b.setAttribute('aria-pressed', String(firca === a.id));
    b.append(el('strong', a.ders), el('small', a.ogretmen), el('span', `${a.kullanilan}/${a.haftalikSaat}`, 'prg-sayi'));
    b.addEventListener('click', () => fircaSec(firca === a.id ? null : a.id));
    k.appendChild(b);
  }
}

// Fırçadaki öğretmenin dolu saatlerini yükler (çakışan hücreler çizgili görünür)
async function mesguluYukle() {
  mesgul = new Map();
  const a = atamalar.find(x => x.id === firca);
  if (!a) return;
  const [p, d] = await Promise.all([
    api('/api/yonetim/ogretmen-programi?userId=' + a.ogretmenUserId),
    api('/api/yonetim/ogretmen-durum?userId=' + a.ogretmenUserId),
  ]);
  const sinif = secilenSinif()?.ad;
  for (const h of p.veri.hucreler) if (h.sinif !== sinif) mesgul.set(`${h.gun}-${h.saat}`, `${h.sinif} sınıfında derste`);
  for (const k of d.veri.kapali) mesgul.set(`${k.gun}-${k.saat}`, 'Müsait değil');
  for (const g of d.veri.gorevler) {
    if (g.tekrar === 'haftalik') for (const s of g.saatler) mesgul.set(`${g.gun}-${s}`, `${TUR_AD[g.tur]}: ${g.ad}`);
  }
}

async function fircaSec(id) {
  firca = id;
  await mesguluYukle();
  fircaCiz();
  izgaraCiz();
}

function izgaraCiz() {
  izgaraKur($('program-grid'), (gun, saat) => {
    const h = hucreler.get(`${gun}-${saat}`);
    const b = el('button', undefined, 'prg-hucre' + (h ? ' dolu' : ''));
    b.type = 'button';
    const gunAd = yapi.okul.gunler.find(g => g.no === gun).ad;
    b.setAttribute('aria-label', `${gunAd} ${saat}. ders${h ? ': ' + h.ders : ''}`);
    if (h) {
      b.style.setProperty('--ders', h.renk);
      b.appendChild(el('strong', h.kisa || h.ders.slice(0, 3)));
    } else if (firca !== null && mesgul.has(`${gun}-${saat}`)) {
      b.classList.add('mesgul');
      b.title = mesgul.get(`${gun}-${saat}`);
    }
    b.addEventListener('click', () => hucreTikla(gun, saat, h));
    return b;
  });
}

async function hucreTikla(gun, saat, h) {
  let atamaId;
  if (h && (firca === null || h.atamaId === firca)) atamaId = null;   // boşalt
  else if (firca !== null) atamaId = firca;                           // seçili dersle doldur
  else return mesaj('Önce yukarıdaki listeden bir ders seçin.');
  const r = await api('/api/yonetim/program-hucre', { sinifId: Number($('program-sinif').value), gun, saat, atamaId });
  mesaj(r.ok ? '' : (r.veri.hata || 'Hata'), r.ok ? '' : 'hata');
  await programYukle(true);
}

async function programYukle(fircaKalsin) {
  const sinifId = $('program-sinif').value;
  if (!fircaKalsin) firca = null;
  if (!sinifId) { atamalar = []; hucreler = new Map(); fircaCiz(); izgaraCiz(); sinifTablosu(); return; }
  const [a, p] = await Promise.all([
    api('/api/yonetim/atamalar?sinifId=' + sinifId),
    api('/api/yonetim/program?sinifId=' + sinifId),
  ]);
  atamalar = a.veri.atamalar.filter(x => x.ogretmenUyelikId);
  if (firca !== null && !atamalar.some(x => x.id === firca)) firca = null;
  hucreler = new Map(p.veri.hucreler.map(h => [`${h.gun}-${h.saat}`, h]));
  await mesguluYukle();
  fircaCiz();
  izgaraCiz();
  sinifTablosu();
}

$('program-sinif').addEventListener('change', () => { mesaj(''); programYukle(false); });

$('oto').addEventListener('click', async () => {
  const sinifId = Number($('program-sinif').value);
  if (!sinifId) return;
  const bastan = hucreler.size > 0 && confirm('Programda dolu hücreler var.\n\nTamam: mevcut programı silip baştan kur\nİptal: yalnızca eksik saatleri tamamla');
  const r = await api('/api/yonetim/program-otomatik', { sinifId, bastan });
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  const eksik = r.veri.eksik.map(e => `${e.ders} (${e.kalan} saat)`).join(', ');
  mesaj(`${r.veri.yerlesen} ders saati yerleştirildi.` + (eksik ? ` Yer bulunamayan: ${eksik}.` : ''), eksik ? 'hata' : 'tamam');
  await programYukle(true);
});

$('temizle').addEventListener('click', async () => {
  const sinifId = Number($('program-sinif').value);
  if (!sinifId || !hucreler.size) return;
  if (!confirm('Bu sınıfın tüm haftalık programı silinsin mi?')) return;
  const r = await api('/api/yonetim/program-temizle', { sinifId });
  mesaj(r.ok ? 'Program temizlendi.' : (r.veri.hata || 'Hata'), r.ok ? 'tamam' : 'hata');
  await programYukle(true);
});

// ---- Öğretmen programı ----
const haftalikGorevler = () => (ogDurum?.gorevler || []).filter(g => g.tekrar === 'haftalik');

function gorevHaritasi() {
  const m = new Map();
  for (const g of haftalikGorevler()) for (const s of g.saatler) m.set(`${g.gun}-${s}`, g);
  return m;
}

async function ogretmenYukle() {
  const userId = $('ogretmen-sec').value;
  if (!userId) {
    ogDers = new Map(); ogDurum = null;
    $('ogretmen-baslik').textContent = 'Öğretmen programı';
    $('ogretmen-yazdir').textContent = '';
    $('ogretmen-tablo').replaceChildren(); $('ogretmen-ozet').replaceChildren(); $('musait-grid').replaceChildren();
    $('ogretmen-aciklama').replaceChildren();
    return;
  }
  const [p, d] = await Promise.all([
    api('/api/yonetim/ogretmen-programi?userId=' + userId),
    api('/api/yonetim/ogretmen-durum?userId=' + userId),
  ]);
  ogDers = new Map(p.veri.hucreler.map(h => [`${h.gun}-${h.saat}`, h]));
  ogDurum = d.veri;
  kapaliKume = new Set(ogDurum.kapali.map(k => `${k.gun}-${k.saat}`));
  $('azami').value = ogDurum.azami ?? '';
  ogretmenCiz();
}

function ogretmenCiz() {
  const ad = $('ogretmen-sec').selectedOptions[0]?.textContent || '';
  $('ogretmen-baslik').textContent = ad;
  $('ogretmen-yazdir').textContent = `${ad} · haftalık ders programı`;
  const gorev = gorevHaritasi();
  const kapali = new Set(ogDurum.kapali.map(k => `${k.gun}-${k.saat}`));
  tabloKur($('ogretmen-tablo'), (gun, saat) => {
    const anahtar = `${gun}-${saat}`;
    const h = ogDers.get(anahtar);
    if (h) return { tur: 'ders', renk: h.renk, ust: h.sinif, alt: h.ders };
    const g = gorev.get(anahtar);
    if (g) return { tur: g.tur, ust: g.ad, alt: g.yer || TUR_AD[g.tur] };
    if (kapali.has(anahtar)) return { tur: 'kapali' };
    return null;
  });

  const toplam = acikGunler().length * yapi.okul.saatler.length;
  const ders = ogDers.size, gorevSayi = gorev.size;
  const bos = Math.max(0, toplam - ders - gorevSayi - kapali.size);
  const ozet = $('ogretmen-ozet');
  ozet.replaceChildren();
  const ekle = (sayi, ad, sinif) => {
    const s = el('span', undefined, sinif);
    s.append(el('b', String(sayi)), document.createTextNode(' ' + ad));
    ozet.appendChild(s);
  };
  ekle(ders + (ogDurum.azami ? ` / ${ogDurum.azami}` : ''), 'ders', ogDurum.azami && ders > ogDurum.azami ? 'asim' : '');
  ekle(gorevSayi, 'nöbet / görev');
  ekle(kapali.size, 'müsait değil');
  ekle(bos, 'boş');

  const a = $('ogretmen-aciklama');
  a.replaceChildren();
  for (const [tur, ad2] of [['ders', 'Ders'], ['nobet', 'Nöbet'], ['gorev', 'Görev'], ['kapali', 'Müsait değil']]) {
    const s = el('span');
    s.append(el('i', undefined, 'nokta ' + tur), document.createTextNode(ad2));
    a.appendChild(s);
  }
  musaitIzgara();
}

function musaitIzgara() {
  const gorev = gorevHaritasi();
  izgaraKur($('musait-grid'), (gun, saat) => {
    const anahtar = `${gun}-${saat}`;
    const h = ogDers.get(anahtar), g = gorev.get(anahtar);
    const b = el('button', undefined, 'prg-hucre');
    b.type = 'button';
    if (h) {
      b.classList.add('dolu'); b.disabled = true;
      b.style.setProperty('--ders', h.renk);
      b.appendChild(el('strong', h.sinif));
    } else if (g) {
      b.classList.add('dolu', 'gorev-hucre'); b.disabled = true;
      b.appendChild(el('strong', TUR_AD[g.tur]));
    } else {
      if (kapaliKume.has(anahtar)) b.classList.add('kapali');
      b.setAttribute('aria-pressed', String(kapaliKume.has(anahtar)));
      b.addEventListener('click', () => {
        if (kapaliKume.has(anahtar)) kapaliKume.delete(anahtar); else kapaliKume.add(anahtar);
        musaitIzgara();
      });
    }
    return b;
  });
}

$('ogretmen-sec').addEventListener('change', () => { mesaj(''); ogretmenYukle(); });

$('musait-kaydet').addEventListener('click', async () => {
  const userId = Number($('ogretmen-sec').value);
  if (!userId) return;
  const kapali = [...kapaliKume].map(k => { const [gun, saat] = k.split('-').map(Number); return { gun, saat }; });
  const r = await api('/api/yonetim/ogretmen-musait', { userId, kapali, azami: $('azami').value });
  if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
  mesaj('Kaydedildi.', 'tamam');
  duzenKapat('ogretmen');
  await ogretmenYukle();
});

$('musait-vazgec').addEventListener('click', () => { duzenKapat('ogretmen'); ogretmenYukle(); });

// ---- Nöbet ve görev ----
function gorevZamani(g) {
  const saat = saatAraligi(g.saatler);
  if (g.tekrar === 'haftalik') return `Her ${GUN_UZUN[g.gun]} · ${saat}`;
  const t = new Date(g.tarih + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
  return `${t} · ${saat}`;
}

async function gorevYukle() {
  const r = await api('/api/yonetim/gorevler');
  gorevler = r.veri.gorevler || [];
  gorevCiz();
}

function gorevCiz() {
  const kap = $('gorev-liste');
  kap.replaceChildren();
  const suz = $('gorev-suz').value;
  const liste = gorevler.filter(g => !suz || String(g.userId) === suz);
  if (!liste.length) kap.appendChild(el('p', 'Henüz nöbet ya da görevlendirme girilmedi.', 'bos-not'));
  for (const [tur, baslik] of [['nobet', 'Nöbetler'], ['gorev', 'Görevlendirmeler']]) {
    const grup = liste.filter(g => g.tur === tur);
    if (!grup.length) continue;
    kap.appendChild(el('h3', baslik, 'prg-grup'));
    for (const g of grup) {
      const s = el('div', undefined, 'kur-satir');
      const sol = el('div', undefined, 'kur-sol');
      sol.append(el('strong', g.ogretmen), el('small', [g.ad, g.yer].filter(Boolean).join(' · ')), el('small', gorevZamani(g)));
      s.appendChild(sol);
      const sag = el('div', undefined, 'duzen-alan prg-satir-dugme');
      const d = el('button', 'Düzenle', 'ikincil kucuk'); d.type = 'button';
      d.addEventListener('click', () => gorevFormuAc(g));
      const sil = el('button', 'Sil', 'ikincil kucuk'); sil.type = 'button';
      sil.addEventListener('click', async () => {
        if (!confirm(`${g.ogretmen}: ${g.ad} silinsin mi?`)) return;
        const r = await api('/api/yonetim/gorev-sil', { id: g.id });
        mesaj(r.ok ? 'Silindi.' : (r.veri.hata || 'Silinemedi'), r.ok ? 'tamam' : 'hata');
        gorevYukle();
      });
      sag.append(d, sil);
      s.appendChild(sag);
      kap.appendChild(s);
    }
  }
}

function saatSecimi(secili) {
  const kap = $('g-saatler');
  kap.replaceChildren();
  yapi.okul.saatler.forEach((z, i) => {
    const b = el('button', undefined, 'prg-saat-chip');
    b.type = 'button';
    b.dataset.saat = String(i + 1);
    b.setAttribute('aria-pressed', String(secili.includes(i + 1)));
    b.append(el('strong', String(i + 1)), el('small', z.bas));
    b.addEventListener('click', () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')));
    kap.appendChild(b);
  });
}
const secilenSaatler = () => [...$('g-saatler').querySelectorAll('[aria-pressed=true]')].map(b => Number(b.dataset.saat));

function tekrarGoster() {
  const tek = $('g-tekrar').value === 'tek';
  $('g-gun-kap').classList.toggle('gizli', tek);
  $('g-tarih-kap').classList.toggle('gizli', !tek);
}

function gorevFormuAc(g) {
  gorevDuzenlenen = g || null;
  $('gorev-baslik').textContent = g ? 'Nöbet / görevi düzenle' : 'Yeni nöbet / görev';
  $('g-ogretmen').value = g ? g.userId : ($('gorev-suz').value || '');
  $('g-tur').value = g?.tur || 'nobet';
  $('g-ad').value = g?.ad || '';
  $('g-yer').value = g?.yer || '';
  $('g-tekrar').value = g?.tekrar || 'haftalik';
  if (g?.tekrar === 'haftalik') $('g-gun').value = g.gun;
  $('g-tarih').value = g?.tarih || '';
  saatSecimi(g?.saatler || []);
  tekrarGoster();
  $('gorev-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('g-tekrar').addEventListener('change', tekrarGoster);
$('gorev-suz').addEventListener('change', gorevCiz);
$('g-vazgec').addEventListener('click', () => gorevFormuAc(null));

$('gorev-form').addEventListener('submit', async e => {
  e.preventDefault();
  const r = await api('/api/yonetim/gorev-kaydet', {
    id: gorevDuzenlenen?.id, userId: Number($('g-ogretmen').value), tur: $('g-tur').value,
    ad: $('g-ad').value, yer: $('g-yer').value, tekrar: $('g-tekrar').value,
    gun: Number($('g-gun').value), tarih: $('g-tarih').value, saatler: secilenSaatler(),
  });
  if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
  mesaj('Kaydedildi.', 'tamam');
  gorevFormuAc(null);
  gorevYukle();
});

// ---- Düzenle / Yazdır / sekmeler ----
function duzenKapat(bolum) {
  $('s-' + bolum).classList.remove('duzende');
  const d = document.querySelector(`.duzen-dugme[data-bolum=${bolum}]`);
  d.textContent = 'Düzenle';
  d.classList.replace('birincil', 'ikincil');
}

document.querySelectorAll('.duzen-dugme').forEach(d => {
  d.addEventListener('click', () => {
    const sec = $('s-' + d.dataset.bolum);
    const ac = !sec.classList.contains('duzende');
    sec.classList.toggle('duzende', ac);
    d.textContent = ac ? 'Bitti' : 'Düzenle';
    d.classList.toggle('birincil', ac);
    d.classList.toggle('ikincil', !ac);
    mesaj('');
    if (d.dataset.bolum === 'ogretmen' && !ac) ogretmenYukle();   // kaydedilmemiş işaretler atılır
    if (d.dataset.bolum === 'gorev' && ac) gorevFormuAc(null);
  });
});

document.querySelectorAll('.yazdir-dugme').forEach(b => b.addEventListener('click', () => window.print()));

document.querySelectorAll('.sekmeler button').forEach(b => {
  b.addEventListener('click', async () => {
    document.querySelectorAll('.sekmeler button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    for (const s of ['sinif', 'ogretmen', 'gorev']) $('s-' + s).classList.toggle('gizli', b.dataset.sekme !== s);
    mesaj('');
    await yapiYukle();
    if (b.dataset.sekme === 'sinif') programYukle(false);
    else if (b.dataset.sekme === 'ogretmen') ogretmenYukle();
    else gorevYukle();
  });
});

yapiYukle().then(() => programYukle(false));
