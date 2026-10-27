// Kulüpler: ortak yardımcılar ve role göre ekran seçimi (yonetim / ogretmen / ogrenci-veli)
const $ = id => document.getElementById(id);
function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}
async function api(yol, govde) {
  const r = await fetch(yol, govde ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(govde) } : undefined);
  if (r.status === 401) { location.href = '/'; throw new Error('oturum'); }
  return { ok: r.ok, veri: await r.json().catch(() => ({})) };
}
const mesaj = (m, tur) => { const e = $('mesaj'); e.textContent = m || ''; e.className = 'mesaj' + (tur ? ' ' + tur : ''); };
const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const tarihYaz = t => { const [, a, g] = t.split('-').map(Number); return `${g} ${AYLAR[a - 1]}`; };
const TUR = { deney: 'Deney', proje: 'Proje', sunum: 'Sunum', gezi: 'Gezi', diger: 'Diğer', calisma: 'Çalışma', prova: 'Prova', konser: 'Konser', gosteri: 'Gösteri', turnuva: 'Turnuva' };

// Hap sekmeler: ciz(ad) seçilen sekmenin içeriğini çizer
function sekmeler(kap, liste, ilk, ciz) {
  const bar = el('div', undefined, 'sekmeler');
  const dugmeler = liste.map(([ad, etiket]) => {
    const b = el('button', etiket);
    b.type = 'button';
    b.addEventListener('click', () => ac(ad));
    bar.append(b);
    return [ad, b];
  });
  const alan = el('div');
  kap.append(bar, alan);
  function ac(ad) {
    for (const [a, b] of dugmeler) b.setAttribute('aria-pressed', String(a === ad));
    mesaj('');
    alan.replaceChildren();
    ciz(ad, alan);
  }
  ac(ilk);
  return ac;
}

// Etiketli giriş alanı
function alan(etiket, girdi, sinif) {
  const k = el('div', undefined, 'kl-alan' + (sinif ? ' ' + sinif : ''));
  const l = el('label', etiket);
  girdi.id = girdi.id || 'kl-' + Math.random().toString(36).slice(2, 8);
  l.htmlFor = girdi.id;
  k.append(l, girdi);
  return k;
}
function secenekler(sel, liste, bos) {
  sel.replaceChildren();
  if (bos) sel.append(Object.assign(el('option', bos), { value: '' }));
  for (const [d, e] of liste) sel.append(Object.assign(el('option', e), { value: String(d) }));
}

// Ayrıntı ekranları: geri düğmesi ve salt okunur bilgi satırı
function geriDugme(metin, f) {
  const b = el('button', '← ' + metin, 'kl-geri');
  b.type = 'button';
  b.addEventListener('click', f);
  return b;
}
function bilgi(etiket, deger) {
  const s = el('div', undefined, 'kl-bilgi');
  s.append(el('small', etiket), typeof deger === 'string' ? el('span', deger) : deger);
  return s;
}
// Ekran değişince başa dön, eski mesajı sil
function ekranAc(kok) { mesaj(''); window.scrollTo(0, 0); kok.replaceChildren(); }

(async () => {
  const r = await api('/api/ben');
  if (!r.ok) return;
  const rol = r.veri.rol;
  const betik = { yonetim: 'yonetim', ogretmen: 'ogretmen', ogrenci: 'ogrenci', veli: 'ogrenci' }[rol];
  if (!betik) return mesaj('Bu sayfa rolünüze açık değil', 'hata');
  $('baslik').textContent = { yonetim: 'Öğrenci kulüpleri', ogretmen: 'Kulüplerim', ogrenci: 'Kulüp', veli: 'Kulüp' }[rol];
  const s = document.createElement('script');
  s.src = `/kulup-${betik}.js`;
  document.body.append(s);
})();
