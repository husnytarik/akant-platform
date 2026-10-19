const $ = id => document.getElementById(id);
let rol = 'yonetim';

function mesaj(metin, tur = '') {
  const m = $('mesaj');
  m.textContent = metin;
  m.className = 'mesaj ' + tur;
}

async function istek(yol, govde) {
  const r = await fetch(yol, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(govde),
  });
  const v = await r.json().catch(() => ({}));
  return { ok: r.ok, durum: r.status, veri: v };
}

document.querySelectorAll('.sekmeler button').forEach(b => {
  b.addEventListener('click', async () => {
    rol = b.dataset.rol;
    // Test aşaması: sunucu izin veriyorsa role göre demo hesapla doğrudan gir.
    const d = await istek('/api/giris/demo', { rol });
    if (d.ok) { { try { sessionStorage.setItem('giris-anim', '1'); } catch {} location.href = '/panel'; } return; }
    document.querySelectorAll('.sekmeler button').forEach(x =>
      x.setAttribute('aria-pressed', String(x === b)));
    adim(1);
    mesaj('');
  });
});

function adim(n) {
  $('adim1').classList.toggle('gizli', n !== 1);
  $('adim2').classList.toggle('gizli', n !== 2);
  if (n === 2) $('kod').focus();
}

$('adim1').addEventListener('submit', async e => {
  e.preventDefault();
  mesaj('Gönderiliyor...');
  const { ok, veri } = await istek('/api/giris/kod', {
    rol, kimlik: $('kimlik').value, telefon: $('telefon').value,
  });
  if (!ok) return mesaj(veri.hata || 'Bir hata oluştu', 'hata');
  mesaj(veri.mesaj, 'tamam');
  const dev = $('dev');
  if (veri.gelistiriciKodu) {
    dev.textContent = 'Geliştirme modu: SMS bağlı değil. Kodunuz: ' + veri.gelistiriciKodu;
    dev.classList.remove('gizli');
  } else {
    dev.classList.add('gizli');
  }
  adim(2);
});

$('adim2').addEventListener('submit', async e => {
  e.preventDefault();
  const { ok, veri } = await istek('/api/giris/dogrula', {
    rol, kimlik: $('kimlik').value, telefon: $('telefon').value, kod: $('kod').value,
  });
  if (!ok) return mesaj(veri.hata || 'Bir hata oluştu', 'hata');
  { try { sessionStorage.setItem('giris-anim', '1'); } catch {} location.href = '/panel'; }
});

$('geri').addEventListener('click', () => { adim(1); mesaj(''); });
