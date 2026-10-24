// Ortak öğrenci/kullanıcı avatarı: fotoğraf varsa onu, yoksa baş harfleri gösterir.
function avatarBas(ad) {
  return String(ad || '').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toLocaleUpperCase('tr');
}
function avatarYap(ad, foto, sinif) {
  const k = document.createElement('span');
  k.className = 'ogr-avatar' + (sinif ? ' ' + sinif : '');
  if (foto) {
    const img = document.createElement('img');
    img.className = 'avatar-foto';
    img.alt = '';
    img.loading = 'lazy';
    img.src = foto;
    img.addEventListener('error', () => { img.remove(); k.textContent = avatarBas(ad); });
    k.append(img);
  } else k.textContent = avatarBas(ad);
  return k;
}
// Seçilen fotoğrafı kare kırpıp küçültür (yüz çoğunlukla üst yarıda olduğundan yukarıdan hizalar)
async function fotoKucult(dosya, kenar = 480) {
  const bmp = await createImageBitmap(dosya);
  const k = Math.min(bmp.width, bmp.height);
  const sx = (bmp.width - k) / 2, sy = Math.max(0, Math.min(bmp.height - k, (bmp.height - k) * 0.25));
  const tuval = document.createElement('canvas');
  tuval.width = tuval.height = Math.min(kenar, k);
  const bg = tuval.getContext('2d');
  bg.fillStyle = '#fff';
  bg.fillRect(0, 0, tuval.width, tuval.height);
  bg.drawImage(bmp, sx, sy, k, k, 0, 0, tuval.width, tuval.height);
  bmp.close?.();
  return await new Promise((ok, hata) => tuval.toBlob(b => b ? ok(b) : hata(new Error('küçültülemedi')), 'image/jpeg', 0.85));
}
