// Ortak, bağımlılıksız küçük grafikler (SVG, DOM ile): halka, yığın çubuk, sütun
const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, nitelik) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(nitelik || {})) e.setAttribute(k, v);
  return e;
}
function gEl(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

// Halka grafik: dilimler [{deger, renk, etiket}], ortada büyük metin + küçük alt metin
function halkaGrafik(dilimler, orta, alt, boyut = 120) {
  const r = 46, c = 2 * Math.PI * r;
  const toplam = dilimler.reduce((t, d) => t + d.deger, 0);
  const svg = svgEl('svg', { viewBox: '0 0 120 120', width: boyut, height: boyut, class: 'halka', role: 'img' });
  svg.appendChild(svgEl('circle', { cx: 60, cy: 60, r, fill: 'none', stroke: '#efe9dd', 'stroke-width': 13 }));
  let ofset = 0;
  if (toplam > 0) {
    for (const d of dilimler) {
      if (d.deger <= 0) continue;
      const uzun = (d.deger / toplam) * c;
      const yay = svgEl('circle', {
        cx: 60, cy: 60, r, fill: 'none', stroke: d.renk, 'stroke-width': 13,
        'stroke-dasharray': `${Math.max(uzun - 2, 0.5)} ${c}`, 'stroke-dashoffset': -ofset,
        transform: 'rotate(-90 60 60)', 'stroke-linecap': 'round',
      });
      const t = svgEl('title'); t.textContent = `${d.etiket}: ${d.deger}`; yay.appendChild(t);
      svg.appendChild(yay);
      ofset += uzun;
    }
  }
  const m = svgEl('text', { x: 60, y: alt ? 61 : 67, 'text-anchor': 'middle', class: 'halka-orta' });
  m.textContent = orta; svg.appendChild(m);
  if (alt) { const a = svgEl('text', { x: 60, y: 78, 'text-anchor': 'middle', class: 'halka-alt' }); a.textContent = alt; svg.appendChild(a); }
  return svg;
}

// Yığın çubuk: tek satırda oransal renkli bölümler
function yiginCubuk(dilimler) {
  const toplam = dilimler.reduce((t, d) => t + d.deger, 0);
  const k = gEl('div', undefined, 'yigin');
  if (!toplam) { k.classList.add('bos'); return k; }
  for (const d of dilimler) {
    if (d.deger <= 0) continue;
    const p = gEl('span', undefined, 'yigin-parca');
    p.style.setProperty('--w', (d.deger / toplam * 100).toFixed(2) + '%');
    p.style.setProperty('--c', d.renk);
    p.title = `${d.etiket}: ${d.deger}`;
    k.appendChild(p);
  }
  return k;
}

// Açıklama satırı: renkli nokta + etiket + sayı
function gosterge(dilimler) {
  const k = gEl('div', undefined, 'gosterge');
  for (const d of dilimler) {
    const o = gEl('span', undefined, 'gosterge-oge');
    o.style.setProperty('--c', d.renk);
    o.append(gEl('i'), gEl('b', String(d.deger)), document.createTextNode(' ' + d.etiket));
    k.appendChild(o);
  }
  return k;
}

// Sütun grafik: [{etiket, deger, renk?}], en büyük değere göre ölçeklenir
function sutunGrafik(veri, yukseklik = 110) {
  const enBuyuk = Math.max(1, ...veri.map(v => v.deger));
  const k = gEl('div', undefined, 'sutunlar');
  k.style.setProperty('--yuk', yukseklik + 'px');
  for (const v of veri) {
    const s = gEl('div', undefined, 'sutun');
    const cubuk = gEl('span', undefined, 'sutun-cubuk');
    cubuk.style.setProperty('--h', Math.max(4, v.deger / enBuyuk * yukseklik).toFixed(0) + 'px');
    if (v.renk) cubuk.style.setProperty('--c', v.renk);
    cubuk.title = `${v.etiket}: ${v.deger}`;
    s.append(gEl('em', String(v.deger)), cubuk, gEl('small', v.etiket));
    k.appendChild(s);
  }
  return k;
}
