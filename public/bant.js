// Alt sayfa bandı: öğretmende dersin rengini uygular
(async () => {
  try {
    const r = await fetch('/api/ben');
    if (!r.ok) return;
    const k = await r.json();
    if (k.renk) document.documentElement.style.setProperty('--ana', k.renk);
  } catch {}
})();
