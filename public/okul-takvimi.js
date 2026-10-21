const $ = id => document.getElementById(id);
const KISA = { 1: 'Pzt', 2: 'Sal', 3: 'Çar', 4: 'Per', 5: 'Cum', 6: 'Cmt', 0: 'Paz' };
let gunler = [];   // [{ no, ad, acik }]
let saatler = [];  // [{ bas, bit }]

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

const dk = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const saatYaz = n => String(Math.floor(n / 60) % 24).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');

function gunCiz() {
  const k = $('gunler');
  k.replaceChildren();
  for (const g of gunler) {
    const b = el('button', KISA[g.no], 'gun-cip' + (g.acik ? ' acik' : ''));
    b.type = 'button';
    b.title = g.ad;
    b.setAttribute('aria-pressed', String(g.acik));
    b.setAttribute('aria-label', g.ad);
    b.addEventListener('click', () => { g.acik = !g.acik; gunCiz(); });
    k.appendChild(b);
  }
}

function saatCiz() {
  const k = $('saatler');
  k.replaceChildren();
  saatler.forEach((s, i) => {
    const satir = el('div', undefined, 'saat-satir');
    const no = el('span', String(i + 1), 'saat-no');
    const bas = el('input'); bas.type = 'time'; bas.value = s.bas; bas.required = true; bas.setAttribute('aria-label', `${i + 1}. ders başlangıç`);
    const bit = el('input'); bit.type = 'time'; bit.value = s.bit; bit.required = true; bit.setAttribute('aria-label', `${i + 1}. ders bitiş`);
    bas.addEventListener('change', () => { s.bas = bas.value; });
    bit.addEventListener('change', () => { s.bit = bit.value; });
    const sil = el('button', '×', 'saat-sil');
    sil.type = 'button';
    sil.title = 'Bu ders saatini kaldır';
    sil.setAttribute('aria-label', `${i + 1}. ders saatini kaldır`);
    sil.disabled = saatler.length < 2;
    sil.addEventListener('click', () => { saatler.splice(i, 1); saatCiz(); });
    satir.append(no, bas, el('span', '–', 'saat-tire'), bit, sil);
    k.appendChild(satir);
  });
}

$('saat-ekle').addEventListener('click', () => {
  const son = saatler[saatler.length - 1];
  let bas = '08:00', bit = '08:40';
  if (son && son.bit) { bas = saatYaz(dk(son.bit) + 10); bit = saatYaz(dk(son.bit) + 50); }
  if (saatler.length >= 14) return mesaj('En fazla 14 ders saati tanımlanabilir', 'hata');
  saatler.push({ bas, bit });
  saatCiz();
});

$('kaydet').addEventListener('click', async () => {
  $('kaydet').disabled = true;
  try {
    const r = await fetch('/api/yonetim/okul-ayar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gunler: gunler.filter(g => g.acik).map(g => g.no), saatler }),
    });
    const v = await r.json().catch(() => ({}));
    if (!r.ok) return mesaj(v.hata || 'Kaydedilemedi', 'hata');
    gunler = v.okul.gunler; saatler = v.okul.saatler;
    gunCiz(); saatCiz();
    mesaj('Okul takvimi kaydedildi.', 'tamam');
  } finally { $('kaydet').disabled = false; }
});

(async () => {
  const r = await fetch('/api/okul/ayar');
  if (r.status === 401) { location.href = '/'; return; }
  const v = await r.json();
  gunler = v.gunler; saatler = v.saatler;
  gunCiz(); saatCiz();
})();
