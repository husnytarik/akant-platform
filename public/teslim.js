const $ = id => document.getElementById(id);
let liste = [];
let secili = 0;

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
  return { ok: r.ok, veri: await r.json().catch(() => ({})) };
}

function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

function alan(etiket, kontrol, id) {
  kontrol.id = id;
  const l = el('label', etiket); l.htmlFor = id;
  const kap = document.createElement('div');
  kap.append(l, kontrol);
  return kap;
}

const YAKINLIK = ['Anne', 'Baba', 'Anneanne', 'Babaanne', 'Dede', 'Teyze', 'Hala', 'Amca', 'Dayı', 'Abla / Ağabey', 'Servis şoförü', 'Diğer'];

function ekleForm(ogrenci) {
  const f = el('form', undefined, 'ekle-form gizli');
  const ad = el('input'); ad.maxLength = 80; ad.required = true; ad.autocomplete = 'off';
  const yakinlik = el('select');
  for (const y of YAKINLIK) yakinlik.append(Object.assign(el('option', y), { value: y }));
  const tel = el('input'); tel.type = 'tel'; tel.maxLength = 20; tel.required = true; tel.placeholder = '05xx xxx xx xx';
  const satir = el('div', undefined, 'form-satir');
  satir.append(alan('Yakınlık', yakinlik, 't-yakin'), alan('Telefon', tel, 't-tel'));
  const b = el('button', 'Kaydet', 'birincil'); b.type = 'submit';
  f.append(alan('Ad soyad', ad, 't-ad'), satir, b);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const r = await api('/api/teslim/ekle', { ogrenciId: ogrenci.id, ad: ad.value, yakinlik: yakinlik.value, telefon: tel.value });
    if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
    mesaj(`${ad.value.trim()} yetkili olarak eklendi.`, 'tamam');
    yukle();
  });
  return f;
}

function kisi(k) {
  const kart = el('div', undefined, 'not-kart');
  const ust = el('div', undefined, 'not-ust');
  ust.append(el('strong', k.ad), el('span', k.yakinlik, 'alt'));
  const tel = el('a', k.telefon); tel.href = 'tel:' + k.telefon.replace(/\s/g, '');
  const p = el('p'); p.append(tel);
  const s = el('button', 'Sil', 'ikincil tehlike kucuk'); s.type = 'button';
  s.addEventListener('click', async () => {
    if (!confirm(`${k.ad} teslim yetkililerinden çıkarılsın mı?`)) return;
    const r = await api('/api/teslim/sil', { id: k.id });
    if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
    mesaj('Kişi çıkarıldı.', 'tamam');
    yukle();
  });
  kart.append(ust, p, s);
  return kart;
}

function ciz() {
  const icerik = $('icerik');
  icerik.replaceChildren();
  const sek = $('sekmeler');
  sek.replaceChildren();
  sek.classList.toggle('gizli', liste.length < 2);
  liste.forEach((c, i) => {
    const b = el('button', c.ad.split(' ')[0]); b.type = 'button'; b.setAttribute('aria-pressed', String(i === secili));
    b.addEventListener('click', () => { secili = i; mesaj(''); ciz(); });
    sek.append(b);
  });
  const c = liste[secili];
  if (!c) return icerik.append(el('p', 'Bağlı öğrenci bulunamadı.', 'alt'));

  const form = ekleForm(c);
  const ust = el('div', undefined, 'ekle-ust');
  const d = el('button', '+ Kişi ekle', 'ekle-ac'); d.type = 'button';
  d.addEventListener('click', () => {
    const kapali = form.classList.toggle('gizli');
    d.textContent = kapali ? '+ Kişi ekle' : 'Vazgeç';
    d.classList.toggle('acik', !kapali);
  });
  ust.append(el('h3', `${c.ad} için yetkili kişiler`, 'baslik3'), d);
  icerik.append(ust, form);
  icerik.append(el('p', 'Anne ve baba her zaman yetkilidir. Buraya yalnızca onlar dışında öğrenciyi teslim alabilecek kişileri ekleyin; okul teslimde kimlik isteyebilir.', 'alt'));
  if (!c.kisiler.length) icerik.append(el('p', 'Henüz kimse eklenmedi.', 'alt'));
  for (const k of c.kisiler) icerik.append(kisi(k));
}

async function yukle() {
  const r = await api('/api/teslim/liste');
  if (!r.ok) { location.href = '/panel'; return; }
  liste = r.veri.ogrenciler;
  ciz();
}
yukle();
