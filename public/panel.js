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
    uyari.appendChild(el('strong', `Tamamlanmamış ${geciken.sayi} dersiniz var`));
    const ul = el('div', undefined, 'uyari-liste');
    const satir = d => {
      const a = el('a', `${kisaTarih(d.tarih)} · ${d.dersSaati}. ders · ${d.sinif} ${d.ders}`);
      a.href = dersLink(d.tarih, d);
      return a;
    };
    for (const d of geciken.dersler.slice(0, 3)) ul.appendChild(satir(d));
    uyari.appendChild(ul);
    if (geciken.dersler.length > 3) {
      const ek = el('details');
      ek.appendChild(el('summary', `${geciken.dersler.length - 3} ders daha`));
      const ul2 = el('div', undefined, 'uyari-liste');
      for (const d of geciken.dersler.slice(3)) ul2.appendChild(satir(d));
      ek.appendChild(ul2);
      uyari.appendChild(ek);
    }
  }

  const k = document.getElementById('bugun-liste');
  if (liste.hafta_sonu) return k.appendChild(el('p', 'Bugün ders yok (hafta sonu).', 'bos-not'));
  if (!liste.gunluk.length) return k.appendChild(el('p', 'Bugün dersiniz yok.', 'bos-not'));
  for (const d of liste.gunluk) {
    const satir = el('a', undefined, 'ders-satir');
    satir.href = dersLink(liste.tarih, d);
    const zaman = el('div', undefined, 'ders-zaman');
    const [bas, bit] = d.aralik.split('–');
    zaman.append(el('strong', `${d.dersSaati}.`), el('span', bas));
    const orta = el('div', undefined, 'ders-orta');
    orta.append(el('strong', `${d.sinif} · ${d.ders}`));
    satir.append(zaman, dersChip(d.kisa, d.renk), orta);
    const rozet = durumRozeti(d);
    if (rozet.textContent) satir.appendChild(rozet);
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
    const p = document.createElement('p');
    p.textContent = m.aciklama;
    const d = document.createElement('span');
    d.className = 'durum';
    d.textContent = m.durum === 'hazir' ? 'Aç' : 'Yakında';
    kart.append(b, p, d);
    grid.appendChild(kart);
  }
  if (!grid.children.length) grid.appendChild(Object.assign(document.createElement('p'), { className: 'bos-not', textContent: 'Size açık modül yok.' }));
  if (!yakinda.children.length) document.getElementById('yakinda').classList.add('gizli');
})();

document.getElementById('cikis').addEventListener('click', async () => {
  await fetch('/api/cikis', { method: 'POST' });
  location.href = '/';
});
