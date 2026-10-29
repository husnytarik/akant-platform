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
// Fotoğraf/logo kırpıcı: yuvarlak çerçevede sürükle, yakınlaştır/uzaklaştır, "Uygula" ile kare çıktı üretir.
// Sayfa politikası blob/data görsellere izin vermediğinden her şey canvas üzerinde çizilir.
// Döner: { blob, tuval } (tuval: küçük önizleme) ya da vazgeçilirse null. Dosya okunamazsa hata fırlatır.
// secenek: { tur: 'jpeg' | 'png' (png: saydamlık korunur, logo için), kenar, baslik }
async function fotoKirp(dosya, { tur = 'jpeg', kenar = 480, baslik = 'Fotoğrafı ayarlayın' } = {}) {
  const bmp = await createImageBitmap(dosya);
  const logo = tur === 'png';
  const D = 260;            // yuvarlak çerçevenin çapı (CSS px)
  const T = 320;            // tuval kenarı
  // Fotoğrafta çerçeve hep dolu kalır; logoda tamamı çerçeveye sığana kadar küçültülebilir
  const enAz = logo ? D / Math.hypot(bmp.width, bmp.height) : D / Math.min(bmp.width, bmp.height);
  const enCok = Math.max(enAz * 6, D / Math.min(bmp.width, bmp.height) * 4);
  let olcek = logo ? D / Math.max(bmp.width, bmp.height) : enAz;
  olcek = Math.max(enAz, Math.min(enCok, olcek));
  let ox = 0, oy = 0;       // görüntü merkezinin çerçeve merkezine göre kayması

  const yap = (etiket, sinif, metin) => { const e = document.createElement(etiket); if (sinif) e.className = sinif; if (metin) e.textContent = metin; return e; };
  const kutu = yap('div', 'kirp-zemin');
  const kart = yap('div', 'kirp-kart');
  kart.setAttribute('role', 'dialog');
  kart.setAttribute('aria-modal', 'true');
  const tuval = yap('canvas', 'kirp-tuval');
  tuval.width = tuval.height = T;
  const kay = yap('div', 'kirp-kay');
  const eksi = yap('button', '', '−'); eksi.type = 'button'; eksi.setAttribute('aria-label', 'Uzaklaştır');
  const arti = yap('button', '', '+'); arti.type = 'button'; arti.setAttribute('aria-label', 'Yakınlaştır');
  const cubuk = yap('input');
  cubuk.type = 'range'; cubuk.min = '0'; cubuk.max = '1000'; cubuk.setAttribute('aria-label', 'Yakınlaştırma');
  kay.append(eksi, cubuk, arti);
  const alt = yap('div', 'kirp-alt');
  const vazgec = yap('button', 'ikincil', 'Vazgeç'); vazgec.type = 'button';
  const uygula = yap('button', 'birincil', 'Uygula'); uygula.type = 'button';
  alt.append(vazgec, uygula);
  kart.append(yap('h3', '', baslik), tuval, yap('small', '', 'Sürükleyerek konumlayın, çubukla yakınlaştırın.'), kay, alt);
  kutu.append(kart);

  const kisit = () => {
    olcek = Math.max(enAz, Math.min(enCok, olcek));
    // Fotoğrafta çerçeve boşluk göstermez; logoda görüntü çerçeve içinde serbestçe gezdirilir
    const sx = logo ? D / 2 : Math.max(0, (bmp.width * olcek - D) / 2);
    const sy = logo ? D / 2 : Math.max(0, (bmp.height * olcek - D) / 2);
    ox = Math.max(-sx, Math.min(sx, ox));
    oy = Math.max(-sy, Math.min(sy, oy));
  };
  const ciz = () => {
    kisit();
    const g = tuval.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, T, T);
    if (logo) { // saydamlığı gösteren dama zemin
      g.fillStyle = '#eceae4';
      for (let y = 0; y < T; y += 16) for (let x = (y / 16) % 2 ? 0 : 16; x < T; x += 32) g.fillRect(x, y, 16, 16);
    }
    g.drawImage(bmp, T / 2 + ox - bmp.width * olcek / 2, T / 2 + oy - bmp.height * olcek / 2, bmp.width * olcek, bmp.height * olcek);
    g.fillStyle = 'rgba(30,25,15,.55)'; // çerçeve dışını karart
    g.beginPath();
    g.rect(0, 0, T, T);
    g.arc(T / 2, T / 2, D / 2, 0, Math.PI * 2, true);
    g.fill('evenodd');
    g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.arc(T / 2, T / 2, D / 2, 0, Math.PI * 2); g.stroke();
    cubuk.value = Math.round(Math.log(olcek / enAz) / Math.log(enCok / enAz) * 1000);
  };
  const yakinlik = yeni => { olcek = yeni; ciz(); };
  cubuk.addEventListener('input', () => yakinlik(enAz * Math.pow(enCok / enAz, cubuk.value / 1000)));
  eksi.addEventListener('click', () => yakinlik(olcek / 1.15));
  arti.addEventListener('click', () => yakinlik(olcek * 1.15));
  tuval.addEventListener('wheel', e => { e.preventDefault(); yakinlik(olcek * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });

  // Tek parmak/fare: sürükle; iki parmak: yakınlaştır
  const isaretler = new Map();
  let sonUzaklik = 0;
  const oran = () => T / tuval.getBoundingClientRect().width;
  tuval.addEventListener('pointerdown', e => { tuval.setPointerCapture(e.pointerId); isaretler.set(e.pointerId, [e.clientX, e.clientY]); sonUzaklik = 0; });
  tuval.addEventListener('pointermove', e => {
    if (!isaretler.has(e.pointerId)) return;
    const [px, py] = isaretler.get(e.pointerId);
    isaretler.set(e.pointerId, [e.clientX, e.clientY]);
    if (isaretler.size >= 2) {
      const [a, b] = [...isaretler.values()];
      const u = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (sonUzaklik) olcek *= u / sonUzaklik;
      sonUzaklik = u;
    } else { ox += (e.clientX - px) * oran(); oy += (e.clientY - py) * oran(); }
    ciz();
  });
  const birak = e => { isaretler.delete(e.pointerId); sonUzaklik = 0; };
  tuval.addEventListener('pointerup', birak);
  tuval.addEventListener('pointercancel', birak);

  const onceki = document.activeElement;
  document.body.append(kutu);
  document.body.classList.add('kirp-acik');
  ciz();
  uygula.focus();

  return await new Promise(bitti => {
    const kapat = sonuc => {
      document.removeEventListener('keydown', tus, true);
      kutu.remove();
      document.body.classList.remove('kirp-acik');
      bmp.close?.();
      onceki?.focus?.();
      bitti(sonuc);
    };
    const tus = e => { if (e.key === 'Escape') { e.stopPropagation(); kapat(null); } };
    document.addEventListener('keydown', tus, true);
    vazgec.addEventListener('click', () => kapat(null));
    kutu.addEventListener('pointerdown', e => { if (e.target === kutu) kapat(null); });
    uygula.addEventListener('click', async () => {
      uygula.disabled = true;
      const f = kenar / D; // çerçeve (D px) -> çıktı (kenar px)
      const cikti = document.createElement('canvas');
      cikti.width = cikti.height = kenar;
      const g = cikti.getContext('2d');
      if (!logo) { g.fillStyle = '#fff'; g.fillRect(0, 0, kenar, kenar); }
      g.drawImage(bmp, kenar / 2 + ox * f - bmp.width * olcek * f / 2, kenar / 2 + oy * f - bmp.height * olcek * f / 2, bmp.width * olcek * f, bmp.height * olcek * f);
      const blob = await new Promise(ok => cikti.toBlob(ok, logo ? 'image/png' : 'image/jpeg', 0.85));
      const kucuk = document.createElement('canvas');
      kucuk.width = kucuk.height = 160;
      kucuk.getContext('2d').drawImage(cikti, 0, 0, 160, 160);
      kapat(blob ? { blob, tuval: kucuk } : null);
    });
  });
}
