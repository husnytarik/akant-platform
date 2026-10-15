const ROL_ADI = { yonetim: 'Yönetim', ogretmen: 'Öğretmen', ogrenci: 'Öğrenci', veli: 'Veli' };

(async () => {
  const [ben, mod] = await Promise.all([fetch('/api/ben'), fetch('/api/moduller')]);
  if (!ben.ok || !mod.ok) { location.href = '/'; return; }
  const k = await ben.json();
  const { moduller } = await mod.json();

  document.getElementById('ad').textContent = k.ad;
  document.getElementById('rol').textContent = ROL_ADI[k.rol] || k.rol;
  document.getElementById('sube').textContent = k.sube || '';
  document.getElementById('aciklama').textContent = 'Yetkili olduğunuz modüller:';

  const grid = document.getElementById('moduller');
  for (const m of moduller) {
    const kart = document.createElement(m.yol ? 'a' : 'div');
    kart.className = 'modul-kart';
    if (m.yol) { kart.href = m.yol; kart.classList.add('hazir'); }
    const b = document.createElement('strong');
    b.textContent = m.ad;
    const p = document.createElement('p');
    p.textContent = m.aciklama;
    const d = document.createElement('span');
    d.className = 'durum';
    d.textContent = m.durum === 'hazir' ? 'Aç' : 'Yakında';
    kart.append(b, p, d);
    grid.appendChild(kart);
  }
})();

document.getElementById('cikis').addEventListener('click', async () => {
  await fetch('/api/cikis', { method: 'POST' });
  location.href = '/';
});
