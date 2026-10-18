// Telefonda tablo satırlarını kart olarak göstermek için hücrelere sütun başlığını etiket olarak ekler.
(() => {
  const ATLA = '.program, .hafta-tablo, .sinav-tablo, #ogrenci-tablo';
  let bekle = null;
  const isle = () => {
    for (const t of document.querySelectorAll('table')) {
      if (t.matches(ATLA)) continue;
      const basliklar = [...t.querySelectorAll('thead th')].map(th => th.textContent.trim());
      if (!basliklar.length) continue;
      t.dataset.kart = '1';
      for (const tr of t.querySelectorAll('tbody tr')) {
        const hucreler = [...tr.children];
        if (hucreler.length === 1 && hucreler[0].colSpan > 1) continue; // boş satır notu
        hucreler.forEach((td, i) => { if (td.dataset.label === undefined) td.dataset.label = basliklar[i] || ''; });
      }
    }
  };
  const planla = () => { clearTimeout(bekle); bekle = setTimeout(isle, 30); };
  new MutationObserver(planla).observe(document.documentElement, { childList: true, subtree: true });
  isle();
})();
