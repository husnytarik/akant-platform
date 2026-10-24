// Alt sayfa bandı: öğretmende dersin rengini uygular ve bir sonraki sayfanın ilk çiziminde kullanılmak üzere saklar
(async () => {
  try {
    const r = await fetch('/api/ben');
    if (!r.ok) return;
    const k = await r.json();
    if (k.renk) document.documentElement.style.setProperty('--bant', k.renk);
    else document.documentElement.style.removeProperty('--bant');
    try { localStorage.setItem('ana-renk', k.renk || ''); } catch {}
  } catch {}
})();
