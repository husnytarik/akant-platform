function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

const kisaTarih = t => t.split('-').reverse().slice(0, 2).join('.');

function durumRozeti(d) {
  if (d.durum === 'tamam') return el('span', `Tamamlandı · ${d.gelmedi} gelmedi`, 'durum-etiket tamam');
  if (d.durum === 'gecikti') return el('span', 'Süresi geçti · tamamlanmadı', 'durum-etiket gecikti');
  return el('span', 'Bekliyor', 'durum-etiket');
}

const dersLink = (tarih, d) => `/yoklama?tarih=${tarih}&sinifId=${d.sinifId}&dersSaati=${d.dersSaati}`;

// Öğretmen ana sayfası: bugünkü dersler (tıklayınca "Dersi bitir") ve tamamlanmamış geçmiş dersler
async function ogretmenDersleri() {
  const [l, g] = await Promise.all([fetch('/api/ders/liste'), fetch('/api/ders/gecikenler')]);
  if (!l.ok || !g.ok) return;
  const liste = await l.json();
  const geciken = await g.json();
  document.getElementById('bugun-dersler').classList.remove('gizli');

  const uyari = document.getElementById('geciken');
  if (geciken.sayi) {
    uyari.classList.remove('gizli');
    const ek = el('details');
    ek.appendChild(el('summary', `${geciken.sayi} tamamlanmamış ders`));
    const ul = el('div', undefined, 'uyari-liste');
    for (const d of geciken.dersler) {
      const a = el('a', `${kisaTarih(d.tarih)} · ${d.dersSaati}. ders · ${d.sinif}`);
      a.href = dersLink(d.tarih, d);
      ul.appendChild(a);
    }
    ek.appendChild(ul);
    uyari.appendChild(ek);
  }

  const k = document.getElementById('bugun-liste');
  if (liste.hafta_sonu) return k.appendChild(el('p', 'Bugün ders yok (hafta sonu).', 'bos-not'));
  if (!liste.gunluk.length) return k.appendChild(el('p', 'Bugün dersiniz yok.', 'bos-not'));
  // Yalnızca en yakın ders: şu an süren ya da sıradaki; hepsi bittiyse sonuncusu
  const simdi = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const yakin = liste.gunluk.find(d => d.aralik.split('–')[1] >= simdi) || liste.gunluk[liste.gunluk.length - 1];
  document.getElementById('bugun-baslik').textContent = liste.gunluk.length > 1 ? `Sıradaki ders · bugün ${liste.gunluk.length} ders` : 'Bugünkü dersim';
  for (const d of [yakin]) {
    const satir = el('a', undefined, 'ders-satir');
    satir.href = '/derslerim';
    satir.style.setProperty('--ders', d.renk || '#475569');
    const zaman = el('div', undefined, 'ders-zaman');
    zaman.append(el('strong', d.aralik.split('–')[0]), el('span', `${d.dersSaati}. ders`));
    const orta = el('div', undefined, 'ders-orta');
    orta.append(el('strong', d.sinif));
    satir.append(zaman, orta);
    const isaret = { tamam: ['✓', 'Tamamlandı'], gecikti: ['!', 'Tamamlanmadı'], iptal: ['İptal', 'İptal edildi'] }[d.durum];
    if (isaret) { const i = el('span', isaret[0], 'durum-isaret ' + d.durum); i.title = isaret[1]; i.setAttribute('aria-label', isaret[1]); satir.appendChild(i); }
    k.appendChild(satir);
  }
}

const ROL_ADI = { yonetim: 'Yönetim', ogretmen: 'Öğretmen', ogrenci: 'Öğrenci', veli: 'Veli' };

(async () => {
  const [ben, mod] = await Promise.all([fetch('/api/ben'), fetch('/api/moduller')]);
  if (!ben.ok || !mod.ok) { location.href = '/'; return; }
  const k = await ben.json();
  const { moduller } = await mod.json();

  document.getElementById('ad').textContent = k.ad;
  document.getElementById('unvan').textContent = k.unvan;
  document.getElementById('bas-harf').textContent = k.ad.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toLocaleUpperCase('tr-TR');
  if (k.renk) document.documentElement.style.setProperty('--ana', k.renk);
  const bant = document.getElementById('bant');
  let anim = false;
  try { anim = sessionStorage.getItem('giris-anim') === '1'; sessionStorage.removeItem('giris-anim'); } catch {}
  if (anim) {
    bant.classList.add('buyuk');
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => bant.classList.remove('buyuk'), 350)));
  }
  document.getElementById('rol').textContent = ROL_ADI[k.rol] || k.rol;
  document.getElementById('sube').textContent = k.sube || '';
  document.getElementById('aciklama').textContent = k.rol === 'ogretmen' ? '' : 'Yetkili olduğunuz modüller:';

  if (k.rol === 'ogretmen') ogretmenDersleri();

  const grid = document.getElementById('moduller');
  const yakinda = document.getElementById('yakinda-liste');
  for (const m of moduller) {
    if (k.rol === 'ogretmen' && m.id === 'yoklama') continue; // dersler listesinden zaten ulaşılıyor
    if (!m.yol) {
      const cip = document.createElement('span');
      cip.className = 'cip';
      cip.textContent = m.ad;
      cip.title = m.aciklama;
      yakinda.appendChild(cip);
      continue;
    }
    const kart = document.createElement('a');
    kart.className = 'modul-kart';
    if (m.yol) { kart.href = m.yol; kart.classList.add('hazir'); }
    const b = document.createElement('strong');
    b.textContent = m.ad;
    kart.append(b, document.createElement('span'));
    kart.title = m.aciklama;
    grid.appendChild(kart);
  }
  if (!grid.children.length) grid.appendChild(Object.assign(document.createElement('p'), { className: 'bos-not', textContent: 'Size açık modül yok.' }));
  if (!yakinda.children.length) document.getElementById('yakinda').classList.add('gizli');
})();

document.getElementById('cikis').addEventListener('click', async () => {
  await fetch('/api/cikis', { method: 'POST' });
  location.href = '/';
});
