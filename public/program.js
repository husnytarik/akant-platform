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
const durumSinifi = d => (d.iptal ? 'iptal' : d.devam === 'gelmedi' ? 'gecikti' : d.islendi ? 'tamam' : 'bekliyor');

function detayCiz(g, d) {
  const k = $('detay');
  k.replaceChildren();
  k.classList.remove('gizli');
  const ust = el('div', undefined, 'detay-ust');
  ust.append(dersChip(d.kisa, d.renk), el('strong', d.kulup !== undefined ? 'Kulüp' + (d.kulup ? ' · ' + d.kulup : '') : d.ders));
  k.appendChild(ust);
  k.appendChild(el('p', `${tarihYaz(g.tarih)} · ${d.dersSaati}. ders · ${d.aralik}${d.ogretmen ? ' · ' + d.ogretmen : ''}`, 'alt'));
  if (d.kulup !== undefined) {
    k.appendChild(el('p', d.kulup ? 'Haftalık kulüp çalışması.' : 'Henüz bir kulübe yerleştirilmedi.', 'alt'));
    const a = el('a', 'Kulüp sayfası');
    a.href = '/kulupler';
    k.appendChild(a);
  } else if (d.iptal) {
    k.appendChild(el('p', 'Bu ders iptal edildi.'));
  } else if (d.islendi) {
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

const YANIT = { bekliyor: 'Yanıt bekleniyor', gelecek: 'Geleceğiz', gelmeyecek: 'Gelmeyecek' };

function etutDetayCiz(g, e) {
  const k = $('detay');
  k.replaceChildren();
  k.classList.remove('gizli');
  const ust = el('div', undefined, 'detay-ust');
  ust.append(dersChip(e.kisa || 'E', e.renk), el('strong', `Etüt · ${e.ders || 'Genel'}`));
  k.appendChild(ust);
  k.appendChild(el('p', `${tarihYaz(g.tarih)} · ${e.saat} · ${e.sure} dk${e.yer ? ' · ' + e.yer : ''}${e.ogretmen ? ' · ' + e.ogretmen : ''}`, 'alt'));
  if (e.konu) k.appendChild(el('p', `Konu: ${e.konu}`));
  if (e.devam) k.appendChild(el('p', `Devam: ${DEVAM[e.devam] || e.devam}`));
  else k.appendChild(el('p', `Veli yanıtı: ${YANIT[e.yanit] || e.yanit}`, 'alt'));
  k.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function gunCiz() {
  const k = $('zaman');
  k.replaceChildren();
  const g = veri.gunler.find(x => x.tarih === tarih);
  $('gun-adi').textContent = tarihYaz(tarih);
  $('bugun').classList.toggle('bugunde', tarih === bugun);
  const etutler = g ? g.etutler : [];
  if (!g || (!g.dersler.length && !etutler.length)) {
    k.appendChild(el('p', g?.tatil ? `${g.tatil} · okul tatil` : g && !g.acik ? 'Bu gün ders günü değil.' : 'Bu günde ders yok.', 'bos-not'));
    return;
  }
  const ogeler = [
    ...g.dersler.map(d => ({ tur: 'ders', d, bas: d.aralik.split('–')[0] })),
    ...etutler.map(e => ({ tur: 'etut', d: e, bas: e.saat })),
  ].sort((x, y) => (x.bas < y.bas ? -1 : 1));
  for (const o of ogeler) {
    const d = o.d;
    const satir = el('button', undefined, 'ders-satir' + (o.tur === 'etut' ? ' etut-satir' : ''));
    satir.type = 'button';
    const zaman = el('div', undefined, 'ders-zaman');
    if (o.tur === 'ders') zaman.append(el('strong', `${d.dersSaati}.`), el('span', o.bas));
    else zaman.append(el('strong', 'Etüt'), el('span', o.bas));
    const orta = el('div', undefined, 'ders-orta');
    orta.append(el('strong', o.tur === 'ders' ? (d.kulup ? `Kulüp · ${d.kulup}` : d.ders) : `${d.ders || 'Genel'}${d.konu ? ' · ' + d.konu : ''}`), el('span', d.ogretmen || ''));
    satir.style.setProperty('--ders', d.renk || '#475569');
    satir.append(zaman, orta);
    // Ders durumu (işlendi/iptal) ile öğrencinin devamı (geldi/gelmedi/geç/izinli) ayrı rozetlerdir
    const rozetler = el('div', undefined, 'rozetler');
    if (o.tur === 'ders') {
      if (d.iptal) rozetler.appendChild(el('span', 'İptal', 'durum-etiket'));
      else if (d.islendi) rozetler.appendChild(el('span', 'İşlendi', 'durum-etiket tamam'));
    }
    if (!d.iptal && d.devam) rozetler.appendChild(el('span', DEVAM[d.devam] || d.devam, 'durum-etiket' + (d.devam === 'gelmedi' ? ' gecikti' : '')));
    if (rozetler.children.length) satir.appendChild(rozetler);
    satir.addEventListener('click', () => (o.tur === 'ders' ? detayCiz(g, d) : etutDetayCiz(g, d)));
    k.appendChild(satir);
  }
}

function haftaCiz() {
  // Ders günü olmayan ve dersi/etüdü bulunmayan günler gösterilmez
  const gorunen = veri.gunler.filter(g => g.acik || g.tatil || g.dersler.length || g.etutler.length);
  const t = el('table', undefined, 'hafta-tablo');
  const bas = document.createElement('tr');
  bas.appendChild(el('th'));
  for (const g of gorunen) {
    const th = el('th', undefined, (g.tarih === bugun ? 'bugun-sutun ' : '') + (g.gun === 0 || g.gun === 6 ? 'hafta-sonu' : '') + (g.tatil ? ' tatil-sutun' : ''));
    if (g.tatil) th.title = g.tatil;
    th.append(el('strong', GUN[g.gun].slice(0, 3)), el('span', kisa(g.tarih)));
    bas.appendChild(th);
  }
  t.appendChild(bas);
  let secilen = null;
  let toplam = 0;
  const secim = (b, g, d, etut) => {
    secilen?.classList.remove('secili');
    secilen = b;
    b.classList.add('secili');
    if (etut) etutDetayCiz(g, d); else detayCiz(g, d);
  };
  for (const satir of saatSatirlari(veri.zamanlar, gorunen)) {
    const tr = document.createElement('tr');
    const z = el('th', undefined, 'saat-hucre');
    z.append(el('strong', satir.etiket), el('span', satir.alt));
    tr.appendChild(z);
    for (const g of gorunen) {
      const td = document.createElement('td');
      td.className = (g.tarih === bugun ? 'bugun-sutun ' : '') + (g.gun === 0 || g.gun === 6 ? 'hafta-sonu' : '');
      const h = hucreIcerik(veri.zamanlar, g, satir);
      for (const d of h.dersler) {
        toplam++;
        const b = el('button', undefined, 'hucre ' + durumSinifi(d));
        b.type = 'button';
        b.style.setProperty('--ders', d.renk);
        b.appendChild(el('strong', d.kisa + (d.iptal ? ' ⊘' : d.devam === 'gelmedi' ? ' ✗' : d.devam === 'izinli' ? ' İ' : d.islendi ? ' ✓' : '')));
        b.addEventListener('click', () => secim(b, g, d, false));
        td.appendChild(b);
      }
      for (const e of h.etutler) {
        const b = el('button', undefined, 'hucre etut');
        b.type = 'button';
        b.style.setProperty('--ders', e.renk);
        b.append(el('strong', e.kisa || 'E'), el('span', 'etüt'));
        b.addEventListener('click', () => secim(b, g, e, true));
        td.appendChild(b);
      }
      tr.appendChild(td);
    }
    t.appendChild(tr);
  }
  const ozet = el('p', undefined, 'hafta-ozet');
  ozet.append(el('strong', `${toplam} saat ders`), veri.sinif ? ` · ${veri.sinif}` : '');
  $('hafta').replaceChildren(ozet, t);
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
  lejantCiz();
}

// Sayfa altı: durum işaretleri + görünen derslerin renkli adları
function lejantCiz() {
  const k = $('lejant');
  k.replaceChildren();
  const gorunen = gorunum === 'gun' ? veri.gunler.filter(x => x.tarih === tarih) : veri.gunler;
  const dersler = new Map();
  for (const g of gorunen) {
    for (const d of g.dersler) dersler.set(d.ders, d);
    for (const e of g.etutler || []) if (e.ders) dersler.set(e.ders, e);
  }
  const durum = el('p', undefined, 'hafta-not');
  durum.append(el('span', '✓ geldi (ders işlendi)'), el('span', '✗ gelmedi'), el('span', 'İ izinli'), el('span', '⊘ ders iptal'), el('span', 'Kesik çizgi: etüt'));
  k.appendChild(durum);
  if (!dersler.size) return;
  const liste = el('div', undefined, 'lejant-dersler');
  for (const [ad, d] of dersler) {
    const oge = el('span', undefined, 'lejant-oge');
    oge.append(dersChip(d.kisa || '?', d.renk), el('span', ad));
    liste.appendChild(oge);
  }
  k.appendChild(liste);
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
