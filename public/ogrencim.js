const $ = id => document.getElementById(id);
let liste = [];
let secili = 0;

function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

function satir(etiket, deger, href) {
  const s = el(href ? 'a' : 'div', undefined, 'og-satir');
  if (href) s.href = href;
  s.append(el('span', etiket), el('strong', deger));
  return s;
}

function sayac(sayi, ad, uyari) {
  const k = el('div', undefined, 'og-sayac' + (uyari ? ' kirmizi' : ''));
  k.append(el('strong', String(sayi)), el('span', ad));
  return k;
}

function tel(ad, telefon) {
  const s = el('div', undefined, 'og-satir');
  s.append(el('span', ad));
  if (telefon) { const a = el('a', telefon); a.href = 'tel:' + telefon.replace(/\s/g, ''); s.append(a); }
  return s;
}

function ciz() {
  const icerik = $('icerik');
  icerik.replaceChildren();
  const sek = $('sekmeler');
  sek.replaceChildren();
  sek.classList.toggle('gizli', liste.length < 2);
  liste.forEach((c, i) => {
    const b = el('button', c.ad.split(' ')[0]); b.type = 'button'; b.setAttribute('aria-pressed', String(i === secili));
    b.addEventListener('click', () => { secili = i; ciz(); });
    sek.append(b);
  });
  const c = liste[secili];
  if (!c) return icerik.append(el('p', 'Bağlı öğrenci bulunamadı.', 'alt'));

  const ust = el('div', undefined, 'og-ust');
  const kim = el('div');
  kim.append(el('strong', c.ad), el('small', [c.sinif, c.okulNo ? `No ${c.okulNo}` : '', c.okul].filter(Boolean).join(' · ')));
  ust.append(avatarYap(c.ad, c.foto, 'buyuk'), kim);

  const sayilar = el('div', undefined, 'og-sayilar');
  sayilar.append(
    sayac('%' + c.devam.yuzde, 'Devam', c.devam.yuzde < 90),
    sayac(c.devam.gelmedi, 'Gelmediği ders', c.devam.gelmedi > 5),
    sayac(c.odev.yapilacak, 'Yapılacak ödev', c.odev.geciken > 0),
  );

  const kisayol = el('div', undefined, 'og-liste');
  kisayol.append(
    satir('Devamsızlık', `${c.devam.gelmedi} gelmedi · ${c.devam.gec} geç · ${c.devam.izinli} izinli`, '/devamsizlik'),
    satir('Ödevler', c.odev.geciken ? `${c.odev.yapilacak} yapılacak · ${c.odev.geciken} gecikmiş` : `${c.odev.yapilacak} yapılacak · ${c.odev.onayda} onay bekliyor`, '/odevler'),
    satir('Sınav sonuçları', 'Yayınlanan sonuçlar', '/notlarim'),
    satir('Dönem karnesi', 'Dersler, sınavlar, ödevler, gelişim', '/karne?id=' + c.id),
    satir('Ders programı', 'Haftalık çizelge', '/program'),
  );
  if (c.kulup) kisayol.append(satir('Kulüp', c.kulup, '/kulupler'));

  icerik.append(ust, sayilar, el('h3', 'Kişiler', 'og-baslik'));
  const kisiler = el('div', undefined, 'og-liste');
  if (c.rehber) kisiler.append(tel('Sınıf öğretmeni · ' + c.rehber.ad, c.rehber.telefon));
  for (const v of c.veliler) kisiler.append(tel('Veli · ' + v.ad, v.telefon));
  icerik.append(kisiler, el('h3', 'Durum', 'og-baslik'), kisayol);

  if (c.ogretmenler.length) {
    icerik.append(el('h3', 'Öğretmenler', 'og-baslik'));
    const o = el('div', undefined, 'og-liste');
    for (const t of c.ogretmenler) o.append(satir(t.ders, t.ad));
    icerik.append(o);
  }
}

(async () => {
  const r = await fetch('/api/ogrencim');
  if (r.status === 401) { location.href = '/'; return; }
  if (!r.ok) { location.href = '/panel'; return; }
  liste = (await r.json()).ogrenciler;
  ciz();
})();
