// Kazanım seçici: öğretmen ünite ve kazanımı yazmaz, listeden seçer.
// kazanimSecici({ tek, secili, degisti }) -> kutu; kutu.kodlar() seçilen kodlar, kutu.hazir ise yüklenince { var } döner.
// Dersin MEB kazanım listesi yoksa (var: false) kutu gizlenir ve çağıran serbest metne döner.
// derslerim.js içinden gelen: el, api, ders
function kazanimSecici({ tek = false, secili = [], degisti } = {}) {
  const kutu = el('div', undefined, 'ks');
  const secim = new Set(secili);
  let gruplar = [];
  let acik = null;

  const ozet = el('div', undefined, 'ks-ozet');
  const unite = el('select'); unite.setAttribute('aria-label', 'Ünite');
  const liste = el('div', undefined, 'ks-liste');
  const metinDe = kod => { for (const g of gruplar) { const k = g.kazanimlar.find(x => x.kod === kod); if (k) return k.metin; } return ''; };

  const ozetCiz = () => {
    ozet.replaceChildren();
    ozet.classList.toggle('gizli', !secim.size);
    for (const kod of secim) {
      const c = el('button', undefined, 'ks-cip'); c.type = 'button';
      c.title = metinDe(kod);
      c.append(el('span', kod), el('i', '×'));
      c.addEventListener('click', () => { secim.delete(kod); ciz(); });
      ozet.append(c);
    }
  };
  const ciz = () => {
    liste.replaceChildren();
    const g = gruplar.find(x => x.anahtar === acik);
    for (const k of g ? g.kazanimlar : []) {
      const satir = el('label', undefined, 'ks-satir' + (secim.has(k.kod) ? ' secili' : ''));
      const kutucuk = el('input'); kutucuk.type = tek ? 'radio' : 'checkbox'; kutucuk.name = 'ks-' + (tek ? 'tek' : 'cok'); kutucuk.checked = secim.has(k.kod);
      const yazi = el('span', undefined, 'ks-yazi');
      yazi.append(el('b', k.kod), document.createTextNode(' ' + k.metin));
      satir.append(kutucuk, yazi);
      kutucuk.addEventListener('click', () => {
        if (tek) { const ayni = secim.has(k.kod); secim.clear(); if (!ayni) secim.add(k.kod); }
        else if (secim.has(k.kod)) secim.delete(k.kod); else secim.add(k.kod);
        ciz();
      });
      liste.append(satir);
    }
    for (const g of gruplar) if (g.secenek) { const n = g.kazanimlar.filter(k => secim.has(k.kod)).length; g.secenek.textContent = g.secenek.textContent.replace(/ \(\d+ seçili\)$/, '') + (n ? ` (${n} seçili)` : ''); }
    ozetCiz();
    if (degisti) degisti([...secim]);
  };

  kutu.append(ozet, unite, liste);
  kutu.kodlar = () => [...secim];
  kutu.metin = metinDe;
  kutu.hazir = (async () => {
    const r = await api('/api/mufredat/kazanimlar?' + new URLSearchParams({ sinifId: ders.sinifId, ders: ders.ders }));
    if (!r.ok || !r.veri.var) { kutu.classList.add('gizli'); return { var: false }; }
    gruplar = r.veri.gruplar;
    // Seçili kazanımların ünitesi açık gelsin
    const ilk = gruplar.find(g => g.kazanimlar.some(k => secim.has(k.kod))) || gruplar[0];
    acik = ilk.anahtar;
    for (const g of gruplar) {
      const ipucu = g.ad || (g.kazanimlar[0] ? g.kazanimlar[0].metin.replace(/-\s+/g, '').slice(0, 38) + '…' : '');
      const o = el('option', [g.baslik, ipucu].filter(Boolean).join(' · ')); o.value = g.anahtar;
      g.secenek = o;
      unite.append(o);
    }
    unite.value = acik;
    unite.addEventListener('change', () => { acik = unite.value; ciz(); });
    ciz();
    return { var: true };
  })();
  return kutu;
}
