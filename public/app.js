const $ = id => document.getElementById(id);

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

function panele() {
  try { sessionStorage.setItem('giris-anim', '1'); } catch {}
  location.href = '/panel';
}

function adim(n) {
  $('adim1').classList.toggle('gizli', n !== 1);
  $('adim2').classList.toggle('gizli', n !== 2);
  $('adim3').classList.toggle('gizli', n !== 3);
  $('demo').classList.toggle('gizli', n !== 1 || !demoAcik);
  if (n === 2) $('kod').focus();
}

// Oturum açıldıktan sonra: tek profil varsa doğrudan panele, çoksa seçtir.
async function girisSonrasi(coklu) {
  if (!coklu) return panele();
  await profilleriGoster();
}

const ROL_AD = { yonetim: 'Yönetim', ogretmen: 'Öğretmen', ogrenci: 'Öğrenci', veli: 'Veli' };
const ROL_RENK = { yonetim: '#5a78a8', ogretmen: '#c2410c', ogrenci: '#2e8b6a', veli: '#8a5fb0' };
const ROL_IKON = {
  yonetim: 'M3 21V8l9-5 9 5v13M9 21v-6h6v6M3 21h18',
  ogretmen: 'M3 5h18v11H3zM8 21h8M12 16v5',
  ogrenci: 'M2 9l10-5 10 5-10 5zM6 11.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5',
  veli: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c.5-3.5 3-5 6-5s5.5 1.5 6 5M17 11a2.5 2.5 0 100-5M18 15c2 .4 3.2 1.8 3.5 5',
};

function ikon(rol) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', ROL_IKON[rol] || ROL_IKON.ogrenci);
  svg.appendChild(p);
  return svg;
}

async function profilleriGoster() {
  const r = await fetch('/api/profiller');
  if (!r.ok) { adim(1); return; }
  const { profiller } = await r.json();
  const kutu = $('profiller');
  kutu.replaceChildren();
  for (const p of profiller) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'profil-kart';
    b.style.setProperty('--pr', p.renk || ROL_RENK[p.rol] || '#5a78a8');
    const av = document.createElement('span');
    av.className = 'profil-av';
    av.appendChild(ikon(p.rol));
    const yazi = document.createElement('span');
    yazi.className = 'profil-yazi';
    const s1 = document.createElement('strong');
    s1.textContent = p.unvan || ROL_AD[p.rol];
    const s2 = document.createElement('small');
    s2.textContent = [ROL_AD[p.rol], p.sube].filter(Boolean).join(' · ');
    yazi.append(s1, s2);
    b.append(av, yazi);
    b.addEventListener('click', async () => {
      b.disabled = true;
      const { ok, veri } = await istek('/api/profil/sec', { id: p.id });
      if (!ok) { b.disabled = false; return mesaj(veri.hata || 'Bir hata oluştu', 'hata'); }
      panele();
    });
    kutu.appendChild(b);
  }
  mesaj('');
  adim(3);
}

let demoAcik = false;
fetch('/api/giris/ayar').then(r => r.json()).then(a => {
  demoAcik = !!a.demo;
  $('demo').classList.toggle('gizli', !demoAcik || !$('adim1').offsetParent);
}).catch(() => {});

document.querySelectorAll('#demo button').forEach(b => {
  b.addEventListener('click', async () => {
    const d = await istek('/api/giris/demo', { rol: b.dataset.rol });
    if (!d.ok) return mesaj(d.veri.hata || 'Bir hata oluştu', 'hata');
    girisSonrasi(d.veri.coklu);
  });
});

$('adim1').addEventListener('submit', async e => {
  e.preventDefault();
  mesaj('Gönderiliyor...');
  const { ok, veri } = await istek('/api/giris/kod', {
    kimlik: $('kimlik').value, telefon: $('telefon').value,
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
    kimlik: $('kimlik').value, telefon: $('telefon').value, kod: $('kod').value,
  });
  if (!ok) return mesaj(veri.hata || 'Bir hata oluştu', 'hata');
  girisSonrasi(veri.coklu);
});

$('geri').addEventListener('click', () => { adim(1); mesaj(''); });

// Panelden "Profil değiştir" ile gelindiyse doğrudan seçiciyi aç
if (new URLSearchParams(location.search).has('profil')) profilleriGoster();
