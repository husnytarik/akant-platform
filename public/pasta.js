// Ortak pasta menü: bir öğenin çevresinde yuvarlak seçenek butonları açar (yoklama, etüt yoklaması)
const PASTA_IKON = { geldi: '✓', gelmedi: '✗', gec: 'G', izinli: 'İ' };
const PASTA_YON = { geldi: [0, -1], izinli: [1, 0], gelmedi: [0, 1], gec: [-1, 0] };
const pasta = document.createElement('div');
pasta.className = 'pasta gizli';
const pastaPerde = document.createElement('div');
pastaPerde.className = 'pasta-perde gizli';
document.body.append(pastaPerde, pasta);
const pastaKapat = () => { pasta.classList.add('gizli'); pastaPerde.classList.add('gizli'); pasta.replaceChildren(); };
pastaPerde.addEventListener('click', pastaKapat);
document.addEventListener('keydown', e => { if (e.key === 'Escape') pastaKapat(); });

const PASTA_NS = 'http://www.w3.org/2000/svg';
const pastaSvg = (tag, nitelik) => {
  const e = document.createElementNS(PASTA_NS, tag);
  for (const [k, v] of Object.entries(nitelik || {})) e.setAttribute(k, v);
  return e;
};
// Halka diliminin yolu: merkez (0,0), iç/dış yarıçap, açı aralığı (radyan)
function pastaYol(ic, dis, a0, a1) {
  const n = (r, a) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  return `M ${n(dis, a0)} A ${dis} ${dis} 0 0 1 ${n(dis, a1)} L ${n(ic, a1)} A ${ic} ${ic} 0 0 0 ${n(ic, a0)} Z`;
}

// ad: ortada görünen isim, hedef: dokunulan öğe, secenekler: [[değer, etiket], ...], mevcut: seçili değer, sec(değer)
// Seçenekler birleşik bir pasta (halka) olarak, her biri bir dilim şeklinde açılır
function pastaAc(ad, hedef, secenekler, mevcut, sec) {
  pasta.replaceChildren();
  const r = hedef.getBoundingClientRect(), DIS = 104, IC = 40, pay = DIS + 8;
  const cx = Math.min(Math.max(r.left + r.width / 2, pay), window.innerWidth - pay);
  const cy = Math.min(Math.max(r.top + r.height / 2, pay), window.innerHeight - pay);
  pasta.style.setProperty('left', cx + 'px');
  pasta.style.setProperty('top', cy + 'px');
  const svg = pastaSvg('svg', { viewBox: `${-DIS - 4} ${-DIS - 4} ${2 * DIS + 8} ${2 * DIS + 8}`, width: 2 * DIS + 8, height: 2 * DIS + 8, class: 'pasta-svg', role: 'group' });
  const bosluk = 0.035;
  for (const [deger, etiket] of secenekler) {
    const [dx, dy] = PASTA_YON[deger];
    const orta = Math.atan2(dy, dx);
    const g = pastaSvg('g', { class: 'pasta-pay s-' + deger, role: 'button', tabindex: 0, 'aria-label': etiket, 'aria-pressed': String(mevcut === deger) });
    g.appendChild(pastaSvg('path', { d: pastaYol(IC, DIS, orta - Math.PI / 4 + bosluk, orta + Math.PI / 4 - bosluk) }));
    const m = (IC + DIS) / 2;
    const ikon = pastaSvg('text', { x: (m * dx).toFixed(1), y: (m * dy - 3).toFixed(1), class: 'pasta-ikon' });
    ikon.textContent = PASTA_IKON[deger];
    const yazi = pastaSvg('text', { x: (m * dx).toFixed(1), y: (m * dy + 14).toFixed(1), class: 'pasta-yazi' });
    yazi.textContent = etiket;
    g.append(ikon, yazi);
    const sec2 = () => { pastaKapat(); sec(deger); };
    g.addEventListener('click', sec2);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sec2(); } });
    svg.appendChild(g);
  }
  const orta = document.createElement('span');
  orta.className = 'pasta-ad';
  orta.textContent = ad;
  pasta.append(svg, orta);
  pastaPerde.classList.remove('gizli');
  pasta.classList.remove('gizli');
}
