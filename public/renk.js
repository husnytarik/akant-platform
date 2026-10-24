// Bant rengini ilk çizimden önce uygular (son girişte önbelleğe alınan renk); bant.js sunucudan gelen değerle düzeltir
try { const r = localStorage.getItem('ana-renk'); if (r) document.documentElement.style.setProperty('--ana', r); } catch {}
