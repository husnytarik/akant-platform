// Girişten gelindiyse bant ilk çizimde büyük başlasın (kayma/yanıp sönme olmasın)
try { const r = localStorage.getItem('ana-renk'); if (r) document.documentElement.style.setProperty('--ana', r); } catch {}
try { if (sessionStorage.getItem('giris-anim') === '1') document.documentElement.classList.add('giris-gec'); } catch {}
