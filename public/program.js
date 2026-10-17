const $ = id => document.getElementById(id);
const GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DEVAM = { geldi: 'Geldi', gelmedi: 'Gelmedi', gec: 'Geç kaldı', izinli: 'İzinli' };

let tarih = '';
let bugun = '';
let cocuk = null;
let veri = null;
let gorunum = 'gun';

function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

function gunKaydir(t, n) {
  const d = new Date(t + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function tarihYaz(t) {
  const d = new Date(t + 'T00:00:00Z');
  return `${d.getUTCDate()} ${AY[d.getUTCMonth()]} ${GUN[d.getUTCDay()]}`;
}

const kisa = t => t.split('-').reverse().slice(0, 2).join('.');

// Hücre/satır rengi: gelmedi → kırmızı, ders işlendi → sol çizgi
const durumSinifi = d => (d.devam === 'gelmedi' ? 'gecikti' : d.islendi ? 'tamam' : 'bekliyor');

function detayCiz(g, d) {
  const k = $('detay');
  k.replaceChildren();
  k.classList.remove('gizli');
  k.appendChild(el('strong', d.ders));
  k.appendChild(el('p', `${tarihYaz(g.tarih)} · ${d.dersSaati}. ders · ${d.aralik}${d.ogretmen ? ' · ' + d.ogretmen : ''}`, 'alt'));
  if (d.islendi) {
    k.appendChild(el('p', `İşlenen konu: ${d.konu || '—'}`));
    if (d.devam) k.appendChild(el('p', `Devam: ${DEVAM[d.devam] || d.devam}`));
  } else {
    k.appendChild(el('p', g.tarih > bugun ? 'Ders henüz işlenmedi.' : 'Bu ders için kayıt girilmemiş.', 'alt'));
  }
  if (d.odevler.length) {
    k.appendChild(el('p', 'Ödevler:'));
    for (const o of d.odevler) k.appendChild(el('p', `• ${o.baslik} (son: ${kisa(o.sonTarih)})`, 'alt'));
  }
  k.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function gunCiz() {
  const k = $('zaman');
  k.replaceChildren();
  const g = veri.gunler.find(x => x.tarih === tarih);
  $('gun-adi').textContent = tarihYaz(tarih);
  $('bugun').classList.toggle('bugunde', tarih === bugun);
  if (!g || !g.dersler.length) {
    k.appendChild(el('p', g && (g.gun === 0 || g.gun === 6) ? 'Hafta sonu ders yok.' : 'Bu günde ders yok.', 'alt'));
    return;
  }
  for (const d of g.dersler) {
    const satir = el('button', undefined, 'ders-satir');
    satir.type = 'button';
    const zaman = el('div', undefined, 'ders-zaman');
    zaman.append(el('strong', `${d.dersSaati}.`), el('span', d.aralik.split('–')[0]));
    const orta = el('div', undefined, 'ders-orta');
    orta.append(el('strong', d.ders), el('span', d.ogretmen || ''));
    satir.append(zaman, orta);
    if (d.devam === 'gelmedi') satir.appendChild(el('span', 'Gelmedi', 'durum-etiket gecikti'));
    else if (d.islendi) satir.appendChild(el('span', 'İşlendi', 'durum-etiket tamam'));
    satir.addEventListener('click', () => detayCiz(g, d));
    k.appendChild(satir);
  }
}

function haftaCiz() {
  const t = el('table', undefined, 'hafta-tablo');
  const bas = document.createElement('tr');
  bas.appendChild(el('th'));
  for (const g of veri.gunler) {
    const th = el('th', undefined, (g.tarih === bugun ? 'bugun-sutun ' : '') + (g.gun === 0 || g.gun === 6 ? 'hafta-sonu' : ''));
    th.append(el('strong', GUN[g.gun].slice(0, 3)), el('span', kisa(g.tarih)));
    bas.appendChild(th);
  }
  t.appendChild(bas);
  let secilen = null;
  let toplam = 0;
  for (let p = 1; p <= veri.zamanlar.length; p++) {
    if (!veri.gunler.some(g => g.dersler.some(x => x.dersSaati === p))) continue;
    const tr = document.createElement('tr');
    const z = el('th', undefined, 'saat-hucre');
    z.append(el('strong', String(p)), el('span', veri.zamanlar[p - 1].split('–')[0]));
    tr.appendChild(z);
    for (const g of veri.gunler) {
      const td = document.createElement('td');
      td.className = (g.tarih === bugun ? 'bugun-sutun ' : '') + (g.gun === 0 || g.gun === 6 ? 'hafta-sonu' : '');
      const d = g.dersler.find(x => x.dersSaati === p);
      if (d) {
        toplam++;
        const b = el('button', undefined, 'hucre ' + durumSinifi(d));
        b.type = 'button';
        b.append(el('strong', d.ders.length > 6 ? d.ders.slice(0, 5) + '.' : d.ders));
        b.addEventListener('click', () => {
          secilen?.classList.remove('secili');
          secilen = b;
          b.classList.add('secili');
          detayCiz(g, d);
        });
        td.appendChild(b);
      }
      tr.appendChild(td);
    }
    t.appendChild(tr);
  }
  const ozet = el('p', undefined, 'hafta-ozet');
  ozet.append(el('strong', `${toplam} saat ders`), veri.sinif ? ` · ${veri.sinif}` : '');
  const not = el('p', undefined, 'hafta-not');
  not.append(el('span', 'Kırmızı: derse gelmedi'), el('span', 'Sol çizgi: ders işlendi'));
  $('hafta').replaceChildren(ozet, t, not);
  const son = veri.gunler[6].tarih;
  $('gun-adi').textContent = `${tarihYaz(veri.pazartesi).split(' ').slice(0, 2).join(' ')} – ${tarihYaz(son).split(' ').slice(0, 2).join(' ')}`;
  $('bugun').classList.toggle('bugunde', veri.gunler.some(g => g.tarih === bugun));
}


async function yukle() {
  const q = `tarih=${encodeURIComponent(tarih)}` + (cocuk ? `&cocuk=${cocuk}` : '');
  const r = await fetch('/api/ders/program?' + q);
  if (r.status === 401) { location.href = '/'; return; }
  if (!r.ok) { location.href = '/panel'; return; }
  veri = await r.json();
  bugun = veri.bugun;
  if (!tarih) tarih = bugun;
  if (!veri.cocuklar.length) { $('mesaj').textContent = 'Bağlı öğrenci bulunamadı.'; return; }
  cocuk = veri.cocuk;
  const sec = $('cocuk');
  if (veri.cocuklar.length > 1) {
    $('cocuk-kutu').classList.remove('gizli');
    if (!sec.options.length) {
      for (const c of veri.cocuklar) sec.appendChild(new Option(c.ad, c.id));
    }
    sec.value = String(cocuk);
  }
  $('detay').classList.add('gizli');
  $('zaman').classList.toggle('gizli', gorunum !== 'gun');
  $('hafta').classList.toggle('gizli', gorunum !== 'hafta');
  if (gorunum === 'gun') gunCiz(); else haftaCiz();
}

$('gorunum').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  gorunum = b.dataset.gorunum;
  $('bugun').textContent = gorunum === 'hafta' ? 'Bu hafta' : 'Bugün';
  for (const x of $('gorunum').children) x.setAttribute('aria-pressed', String(x === b));
  yukle();
});
const adim = n => { tarih = gunKaydir(tarih, gorunum === 'hafta' ? 7 * n : n); yukle(); };
$('geri').addEventListener('click', () => adim(-1));
$('ileri').addEventListener('click', () => adim(1));
$('bugun').addEventListener('click', () => { tarih = bugun; yukle(); });
$('cocuk').addEventListener('change', e => { cocuk = Number(e.target.value); yukle(); });

yukle();
