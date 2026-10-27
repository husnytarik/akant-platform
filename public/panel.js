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

const dersLink = (tarih, d) => `/derslerim?tarih=${tarih}&${d.kulupId ? 'kulupId=' + d.kulupId : 'sinifId=' + d.sinifId}&dersSaati=${d.dersSaati}`;

// Öğretmen ana sayfası: bugünkü dersler (tıklayınca "Dersi bitir") ve tamamlanmamış geçmiş dersler
async function ogretmenDersleri() {
  const [l, g] = await Promise.all([fetch('/api/ders/liste'), fetch('/api/ders/gecikenler')]);
  if (!l.ok || !g.ok) return;
  const liste = await l.json();
  const geciken = await g.json();
  document.getElementById('bugun-dersler').classList.remove('gizli');

  bekleyenler(geciken);

  const k = document.getElementById('bugun-liste');
  if (liste.hafta_sonu) return k.appendChild(el('p', 'Bugün ders günü değil.', 'bos-not'));
  if (!liste.gunluk.length) return k.appendChild(el('p', 'Bugün dersiniz yok.', 'bos-not'));
  // Yalnızca en yakın ders: şu an süren ya da sıradaki; hepsi bittiyse sonuncusu
  const simdi = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const idx = liste.gunluk.findIndex(d => d.aralik.split('–')[1] >= simdi);
  const d = liste.gunluk[idx < 0 ? liste.gunluk.length - 1 : idx];
  const kart = el('a', undefined, 'siradaki');
  kart.href = '/derslerim';
  kart.style.setProperty('--ders', d.renk || '#475569');
  const ust = el('div', undefined, 'siradaki-ust');
  const bitti = idx < 0;
  ust.append(el('span', bitti ? 'Bugünkü son dersiniz' : 'Sıradaki dersim'), el('span', `bugün ${liste.gunluk.length} ders`));
  const govde = el('div', undefined, 'siradaki-govde');
  const zaman = el('div', undefined, 'siradaki-saat');
  zaman.append(el('strong', d.aralik.split('–')[0]), el('span', `${d.dersSaati}. ders`));
  const orta = el('div', undefined, 'siradaki-orta');
  orta.append(el('strong', d.sinif), el('span', d.kulupId ? 'Kulüp dersi' : d.ders));
  govde.append(zaman, orta);
  const isaret = { tamam: ['✓', 'Tamamlandı'], gecikti: ['!', 'Tamamlanmadı'], iptal: ['İptal', 'İptal edildi'] }[d.durum];
  if (isaret) { const i = el('span', isaret[0], 'durum-isaret ' + d.durum); i.title = isaret[1]; i.setAttribute('aria-label', isaret[1]); govde.appendChild(i); }
  kart.append(ust, govde);
  k.appendChild(kart);
}


// Bekleyenler: tamamlanmamış dersler, atlanmış kazanımlar ve yazılmamış gelişim gözlemleri tek kartta, aynı satır düzeninde
const BK_IKON = {
  ders: 'M12 8v5M12 16.5v.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  kazanim: 'M4 12a8 8 0 018-8 8 8 0 015.7 2.3L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 01-8 8 8 8 0 01-5.7-2.3L4 15.5M4 20v-4.5h4.5',
  gelisim: 'M3 17l6-6 4 4 8-8M15 7h6v6',
};

function bekleyenSatiri(tur, baslik, alt, sayi, govde) {
  const satir = el(govde ? 'details' : 'a', undefined, 'bk-satir bk-' + tur);
  const ust = el(govde ? 'summary' : 'span', undefined, 'bk-ust');
  const ikon = el('span', undefined, 'bk-ikon');
  ikon.appendChild(svgIkon(BK_IKON[tur]));
  const metin = el('span', undefined, 'bk-metin');
  metin.append(el('strong', baslik), el('small', alt));
  ust.append(ikon, metin, el('b', String(sayi), 'bk-sayi'));
  if (govde) satir.append(ust, govde);
  else { satir.href = '/gelisim'; satir.append(ust); }
  return satir;
}

async function bekleyenler(geciken) {
  const [m, g] = await Promise.all([fetch('/api/mufredat/takip'), fetch('/api/gelisim/bekleyen')]);
  const satirlar = [];

  if (geciken.sayi) {
    const liste = el('div', undefined, 'bk-liste');
    for (const d of geciken.dersler) {
      const a = el('a', `${kisaTarih(d.tarih)} · ${d.dersSaati}. ders · ${d.kulupId ? 'Kulüp · ' : ''}${d.sinif}`);
      a.href = dersLink(d.tarih, d);
      liste.appendChild(a);
    }
    satirlar.push(bekleyenSatiri('ders', 'Tamamlanmamış ders', 'Dersi bitirmeyi unuttuklarınız', geciken.sayi, liste));
  }

  // Müfredat takibi: sonraki üniteye geçilmiş ama derslerde hiç girilmemiş kazanımlar (ders, konu ya da ödevde girilince listeden düşer)
  if (m.ok) {
    const { siniflar } = await m.json();
    const kartlar = siniflar.map(s => ({ s, eksik: s.atlananUniteler.flatMap(u => u.eksik) })).filter(x => x.eksik.length);
    if (kartlar.length) {
      const liste = el('div', undefined, 'bk-liste');
      for (const { s, eksik } of kartlar) {
        const kart = el('div', undefined, 'kh-kart');
        const ust = el('div', undefined, 'kh-ust');
        ust.append(el('b', `${s.sinif} · ${s.ders}`), el('span', `${eksik.length} kazanım`));
        kart.append(ust);
        for (const k of eksik) {
          const satir = el('div', undefined, 'kh-satir');
          const metin = el('p', undefined, 'kh-kazanim');
          metin.append(el('strong', k.kod), document.createTextNode(' ' + k.metin));
          satir.append(metin);
          kart.append(satir);
        }
        liste.append(kart);
      }
      satirlar.push(bekleyenSatiri('kazanim', 'Atlanmış kazanım', 'Sonraki üniteye geçildi, işlenmedi', kartlar.reduce((t, x) => t + x.eksik.length, 0), liste));
    }
  }

  // Gelişim gözlemi: açık dönemde ve geçmiş dönemlerde gözlemi yazılmamış öğrenci sayısı
  if (g.ok) {
    const { donemler } = await g.json();
    const toplam = durum => donemler.filter(d => d.durum === durum).reduce((t, d) => t + d.eksik, 0);
    const acik = toplam('acik'), gecmis = toplam('kapandi');
    if (acik + gecmis) {
      const alt = [acik && `${acik} bu dönem`, gecmis && `${gecmis} geçmiş dönem`].filter(Boolean).join(' · ');
      satirlar.push(bekleyenSatiri('gelisim', 'Gelişim gözlemi yazılmamış', alt, acik + gecmis));
    }
  }

  if (!satirlar.length) return;
  const kutu = document.getElementById('bekleyenler');
  kutu.append(...satirlar);
  kutu.classList.remove('gizli');
}

// Modül kareleri için çizgi ikonlar
const IKON_YOL = {
  etut: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  derslerim: 'M4 5h16v14H4zM4 10h16M9 5v14',
  'not-girisi': 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  ogrencilerim: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c.5-3.5 3-5 6-5s5.5 1.5 6 5M17 11a2.5 2.5 0 100-5M18 15c2 .4 3.2 1.8 3.5 5',
  'veli-bilgilendirme': 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
  'kullanici-rol': 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c.8-4.2 4-6 8-6s7.2 1.8 8 6',
  'okul-kurulum': 'M3 21V8l9-5 9 5v13M9 21v-6h6v6M3 21h18',
  'okul-takvimi': 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3.5 2',
  'ders-programi-yonetimi': 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  'ders-programi': 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  duyuru: 'M4 10v4h3l7 4V6L7 10zM17 9a4 4 0 010 6',
  duyurular: 'M4 10v4h3l7 4V6L7 10zM17 9a4 4 0 010 6',
  rapor: 'M5 20V10M12 20V4M19 20v-7',
  notlarim: 'M5 20V10M12 20V4M19 20v-7',
  'odev-takip': 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h3',
  'odev-takip-ogretmen': 'M6 3h12v18H6zM9 8h6M9 13l2 2 4-4',
  ogrencim: 'M2 9l10-5 10 5-10 5zM6 11.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5',
  'devamsizlik-veli': 'M9 12l2 2 4-4M12 21a9 9 0 100-18 9 9 0 000 18z',
  'devamsizlik-ogrenci': 'M9 12l2 2 4-4M12 21a9 9 0 100-18 9 9 0 000 18z',
  teslim: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
};
IKON_YOL['sinav-yonetim'] = IKON_YOL['not-girisi'];
IKON_YOL['duyurular-ogretmen'] = IKON_YOL.duyurular;
IKON_YOL['kulup-yonetimi'] = IKON_YOL['kulup-ogretmen'] = IKON_YOL['kulup-ogrenci'] = 'M12 3l2.4 5.2 5.6.7-4.1 3.9 1.1 5.6L12 15.6 7 18.4l1.1-5.6L4 8.9l5.6-.7z';
IKON_YOL['gelisim-yonetim'] = IKON_YOL['gelisim-ogretmen'] = 'M3 17l6-6 4 4 8-8M15 7h6v6';
IKON_YOL['etut-ogrenci'] = IKON_YOL['etut-veli'] = IKON_YOL.etut;

function modulIkon(id) {
  return svgIkon(IKON_YOL[id] || 'M12 3l2.5 6 6.5.5-5 4.2 1.7 6.3L12 16.8 6.3 20l1.7-6.3-5-4.2L9.5 9z');
}

function svgIkon(yol) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', yol);
  svg.appendChild(path);
  return svg;
}

const ROL_ADI = { yonetim: 'Yönetim', ogretmen: 'Öğretmen', ogrenci: 'Öğrenci', veli: 'Veli' };

(async () => {
  const [ben, mod] = await Promise.all([fetch('/api/ben'), fetch('/api/moduller')]);
  if (!ben.ok || !mod.ok) { location.href = '/'; return; }
  const k = await ben.json();
  const { moduller } = await mod.json();

  document.getElementById('ad').textContent = k.ad;
  document.getElementById('unvan').textContent = k.unvan;
  if (k.foto) {
    const im = document.createElement('img');
    im.src = k.foto; im.alt = ''; im.className = 'avatar-foto';
    document.getElementById('avatar').replaceChildren(im);
  }
  const bh = document.getElementById('bas-harf');
  if (bh) bh.textContent = k.ad.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toLocaleUpperCase('tr-TR');
  if (k.renk) document.documentElement.style.setProperty('--bant', k.renk);
  else document.documentElement.style.removeProperty('--bant');
  try { localStorage.setItem('ana-renk', k.renk || ''); } catch {}
  const bant = document.getElementById('bant');
  let anim = false;
  try { anim = sessionStorage.getItem('giris-anim') === '1'; sessionStorage.removeItem('giris-anim'); } catch {}
  const kok = document.documentElement;
  if (anim) {
    bant.classList.add('buyuk');
    kok.classList.remove('giris-gec');
    // İlk çizim büyük halde yapıldı; kısa bir bekleyişten sonra mevcut konumdan yukarı daralır
    setTimeout(() => bant.classList.remove('buyuk'), 450);
  } else kok.classList.remove('giris-gec');
  document.getElementById('rol').textContent = ROL_ADI[k.rol] || k.rol;
  document.getElementById('sube').textContent = k.sube || '';
  if (k.coklu) document.getElementById('profil-degis').classList.remove('gizli');

  if (k.rol === 'ogretmen') ogretmenDersleri();

  const grid = document.getElementById('moduller');
  for (const m of moduller) {
    const kare = document.createElement(m.yol ? 'a' : 'div');
    kare.className = 'kare' + (m.yol ? '' : ' soon');
    if (m.yol) kare.href = m.yol;
    kare.title = m.aciklama;
    kare.dataset.modul = m.id;
    const ic = document.createElement('span');
    ic.className = 'kare-ikon';
    ic.appendChild(modulIkon(m.id));
    kare.append(ic, el('strong', m.ad));
    if (!m.yol) kare.appendChild(el('small', 'Yakında'));
    grid.appendChild(kare);
  }
  if (!grid.children.length) grid.appendChild(el('p', 'Size açık modül yok.', 'bos-not'));
})();

document.getElementById('cikis').addEventListener('click', async () => {
  await fetch('/api/cikis', { method: 'POST' });
  try { localStorage.removeItem('ana-renk'); } catch {}
  location.href = '/';
});
