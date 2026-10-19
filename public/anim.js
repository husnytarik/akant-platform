// Girişten gelindiyse bant ilk çizimde büyük başlasın (kayma/yanıp sönme olmasın)
try { if (sessionStorage.getItem('giris-anim') === '1') document.documentElement.classList.add('giris-gec'); } catch {}
