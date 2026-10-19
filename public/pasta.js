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

// ad: ortada görünen isim, hedef: dokunulan öğe, secenekler: [[değer, etiket], ...], mevcut: seçili değer, sec(değer)
function pastaAc(ad, hedef, secenekler, mevcut, sec) {
  pasta.replaceChildren();
  const r = hedef.getBoundingClientRect(), R = 64, pay = R + 30;
  const cx = Math.min(Math.max(r.left + r.width / 2, pay), window.innerWidth - pay);
  const cy = Math.min(Math.max(r.top + r.height / 2, pay), window.innerHeight - pay);
  pasta.style.setProperty('left', cx + 'px');
  pasta.style.setProperty('top', cy + 'px');
  const orta = document.createElement('span');
  orta.className = 'pasta-ad';
  orta.textContent = ad;
  pasta.appendChild(orta);
  for (const [deger, etiket] of secenekler) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pasta-dugme s-' + deger;
    b.textContent = PASTA_IKON[deger];
    b.title = etiket;
    b.setAttribute('aria-label', etiket);
    b.setAttribute('aria-pressed', String(mevcut === deger));
    b.style.setProperty('--x', PASTA_YON[deger][0] * R + 'px');
    b.style.setProperty('--y', PASTA_YON[deger][1] * R + 'px');
    b.addEventListener('click', () => { pastaKapat(); sec(deger); });
    pasta.appendChild(b);
  }
  pastaPerde.classList.remove('gizli');
  pasta.classList.remove('gizli');
}
