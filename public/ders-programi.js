const $ = id => document.getElementById(id);
const KISA = { 1: 'Pzt', 2: 'Sal', 3: 'Çar', 4: 'Per', 5: 'Cum', 6: 'Cmt', 0: 'Paz' };
let yapi = null;
let atamalar = [];        // seçili sınıfın öğretmeni atanmış dersleri
let hucreler = new Map(); // `${gun}-${saat}` -> hücre
let firca = null;         // seçili ders (atama id); null = seçim yok
let mesgul = new Map();   // fırçadaki öğretmenin başka sınıflardaki saatleri: `${gun}-${saat}` -> sınıf adı

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

async function yapiYukle() {
  const r = await api('/api/yonetim/sinif-yapisi');
  yapi = r.veri;

  const onceki = $('program-sinif').value;
  doldur($('program-sinif'), yapi.siniflar, s => s.id,
    s => `${s.sube} · ${s.ad}`, yapi.siniflar.length ? null : "Önce Okul kurulumu'ndan sınıf açın");
  if (onceki && yapi.siniflar.some(s => String(s.id) === onceki)) $('program-sinif').value = onceki;

  // Aynı kişi birden fazla şubede öğretmense tek satırda göster
  const tekil = new Map();
  for (const o of yapi.ogretmenler) if (!tekil.has(o.userId)) tekil.set(o.userId, o);
  const prev = $('ogretmen-sec').value;
  doldur($('ogretmen-sec'), [...tekil.values()], o => o.userId, o => o.ad, 'Öğretmen seçin');
  if (prev) $('ogretmen-sec').value = prev;
}

const acikGunler = () => yapi.okul.gunler.filter(g => g.acik);
const secilenSinif = () => yapi.siniflar.find(s => String(s.id) === $('program-sinif').value)?.ad;

// Gün sütunları ve ders saati satırlarından oluşan ızgara; hucreYaz her hücreyi üretir
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

// Fırçadaki öğretmenin başka sınıflardaki saatlerini yükler (çakışan hücreler çizgili görünür)
async function mesguluYukle() {
  mesgul = new Map();
  const a = atamalar.find(x => x.id === firca);
  if (!a) return;
  const r = await api('/api/yonetim/ogretmen-programi?userId=' + a.ogretmenUserId);
  const sinif = secilenSinif();
  for (const h of r.veri.hucreler) if (h.sinif !== sinif) mesgul.set(`${h.gun}-${h.saat}`, h.sinif);
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
      b.title = `Öğretmen bu saatte ${mesgul.get(`${gun}-${saat}`)} sınıfında`;
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
  if (!sinifId) { atamalar = []; hucreler = new Map(); fircaCiz(); izgaraCiz(); return; }
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

// ---- Öğretmen programı (salt okunur) ----
async function ogretmenProgrami() {
  const userId = $('ogretmen-sec').value;
  const kap = $('ogretmen-grid');
  if (!userId) { kap.replaceChildren(); return; }
  const r = await api('/api/yonetim/ogretmen-programi?userId=' + userId);
  const hucre = new Map(r.veri.hucreler.map(h => [`${h.gun}-${h.saat}`, h]));
  izgaraKur(kap, (gun, saat) => {
    const h = hucre.get(`${gun}-${saat}`);
    const b = el('div', undefined, 'prg-hucre salt' + (h ? ' dolu' : ''));
    if (h) {
      b.style.setProperty('--ders', h.renk);
      b.append(el('strong', h.sinif), el('small', h.kisa || h.ders.slice(0, 3)));
    }
    return b;
  });
}

$('ogretmen-sec').addEventListener('change', ogretmenProgrami);

// ---- Sekmeler ----
document.querySelectorAll('.sekmeler button').forEach(b => {
  b.addEventListener('click', async () => {
    document.querySelectorAll('.sekmeler button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('s-program').classList.toggle('gizli', b.dataset.sekme !== 'program');
    $('s-ogretmen').classList.toggle('gizli', b.dataset.sekme !== 'ogretmen');
    mesaj('');
    await yapiYukle();
    if (b.dataset.sekme === 'program') programYukle(false); else ogretmenProgrami();
  });
});

yapiYukle().then(() => programYukle(false));
