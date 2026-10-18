const $ = id => document.getElementById(id);
const GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

let tarih = '';
let bugun = '';
let veri = null;
let ders = null;      // açık ders: { atamaId, sinif, ders, dersSaati? }
let sekme = 'ogrenciler';
const DURUM_YAZI = {
  tamam: d => `Tamamlandı · ${d.gelmedi} gelmedi`,
  gecikti: () => 'Süresi geçti · tamamlanmadı',
  bekliyor: () => 'Bekliyor',
  iptal: () => 'Ders iptal edildi',
};
let gorunum = 'gun';   // 'gun' | 'hafta'

function mesaj(metin, tur = '') {
  $('mesaj').textContent = metin;
  $('mesaj').className = 'mesaj ' + tur;
}

async function api(yol, govde) {
  const r = await fetch(yol, govde === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(govde),
  });
  if (r.status === 401) { location.href = '/'; throw new Error('oturum'); }
  if (r.status === 403) { location.href = '/panel'; throw new Error('yetki'); }
  const v = await r.json().catch(() => ({}));
  return { ok: r.ok, veri: v };
}

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

function kisaTarih(t) {
  const [y, a, g] = t.split('-');
  return `${g}.${a}.${y}`;
}

function etutDetayCiz(k, g, e) {
  k.replaceChildren();
  k.classList.remove('gizli');
  const ust = el('div', undefined, 'detay-ust');
  ust.append(dersChip(e.kisa || 'E', e.renk), el('strong', `Etüt · ${e.ders || 'Genel'}`));
  k.appendChild(ust);
  k.appendChild(el('p', `${tarihYaz(g.tarih)} · ${e.saat} · ${e.sure} dk${e.yer ? ' · ' + e.yer : ''}`, 'alt'));
  if (e.konu) k.appendChild(el('p', `Konu: ${e.konu}`));
  k.appendChild(el('p', `${e.kisi} öğrenci davetli`));
  const a = el('a', 'Etüt sayfası', 'dugme-link');
  a.href = '/etut';
  k.appendChild(a);
  k.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function detayCiz(k, g, d) {
  k.replaceChildren();
  k.classList.remove('gizli');
  const ust = el('div', undefined, 'detay-ust');
  ust.append(dersChip(d.kisa, d.renk), el('strong', `${d.sinif} · ${d.ders}`));
  k.appendChild(ust);
  k.appendChild(el('p', `${tarihYaz(g.tarih)} · ${d.dersSaati}. ders · ${d.aralik}`, 'alt'));
  k.appendChild(el('p', DURUM_YAZI[d.durum](d)));
  const butonlar = el('div', undefined, 'hafta-butonlar');
  if (g.tarih <= bugun) {
    const a = el('a', d.durum === 'tamam' || d.durum === 'iptal' ? 'Dersi düzenle' : 'Dersi bitir', 'dugme-link');
    a.href = `/yoklama?tarih=${g.tarih}&sinifId=${d.sinifId}&dersSaati=${d.dersSaati}`;
    butonlar.appendChild(a);
  }
  const b = el('button', 'Öğrenciler, konu, ödev', 'ikincil');
  b.type = 'button';
  b.addEventListener('click', () => { tarih = g.tarih; gorunumSec('gun', d); });
  butonlar.appendChild(b);
  k.appendChild(butonlar);
  k.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function haftaYukle() {
  const r = await api('/api/ders/hafta?tarih=' + encodeURIComponent(tarih));
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  mesaj('');
  bugun = r.veri.bugun;
  const son = r.veri.gunler[6].tarih;
  $('gun-adi').textContent = `${tarihYaz(r.veri.pazartesi).split(' ').slice(0, 2).join(' ')} – ${tarihYaz(son).split(' ').slice(0, 2).join(' ')}`;
  $('bugun').classList.toggle('bugunde', r.veri.gunler.some(g => g.tarih === bugun));
  const t = el('table', undefined, 'hafta-tablo');
  const bas = document.createElement('tr');
  bas.appendChild(el('th'));
  for (const g of r.veri.gunler) {
    const th = el('th', undefined, (g.tarih === bugun ? 'bugun-sutun ' : '') + (g.gun === 0 || g.gun === 6 ? 'hafta-sonu' : ''));
    th.append(el('strong', GUN[g.gun].slice(0, 3)), el('span', `${g.tarih.slice(8)}.${g.tarih.slice(5, 7)}`));
    bas.appendChild(th);
  }
  t.appendChild(bas);
  const detay = el('div', undefined, 'hafta-detay gizli');
  let secilen = null;
  const secim = (b, g, d, etut) => {
    secilen?.classList.remove('secili');
    secilen = b;
    b.classList.add('secili');
    if (etut) etutDetayCiz(detay, g, d); else detayCiz(detay, g, d);
  };
  for (const satir of saatSatirlari(r.veri.zamanlar, r.veri.gunler)) {
    const tr = document.createElement('tr');
    const z = el('th', undefined, 'saat-hucre');
    z.append(el('strong', satir.etiket), el('span', satir.alt));
    tr.appendChild(z);
    for (const g of r.veri.gunler) {
      const td = document.createElement('td');
      td.className = (g.tarih === bugun ? 'bugun-sutun ' : '') + (g.gun === 0 || g.gun === 6 ? 'hafta-sonu' : '');
      const h = hucreIcerik(r.veri.zamanlar, g, satir);
      for (const d of h.dersler) {
        const b = el('button', undefined, 'hucre ' + d.durum);
        b.type = 'button';
        b.style.setProperty('--ders', d.renk);
        b.append(el('strong', d.kisa + ({ tamam: ' ✓', gecikti: ' !', iptal: ' ⊘' }[d.durum] || '')), el('span', d.sinif));
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
  const dersSayisi = r.veri.gunler.reduce((n, g) => n + g.dersler.length, 0);
  const etutler = r.veri.gunler.flatMap(g => g.etutler.map(e => ({ ...e, tarih: g.tarih })));
  const etutDk = etutler.reduce((n, e) => n + e.sure, 0);
  const ozet = el('p', undefined, 'hafta-ozet');
  ozet.append(el('strong', `${dersSayisi} saat ders`));
  if (etutler.length) ozet.append(` · ${etutler.length} etüt (${etutDk} dk)`);
  const etutKutu = el('div', undefined, 'hafta-etut');
  if (etutler.length) {
    etutKutu.appendChild(el('strong', 'Etütler'));
    for (const e of etutler) {
      etutKutu.appendChild(el('p', `${tarihYaz(e.tarih).split(' ').slice(0, 3).join(' ')} · ${e.saat} · ${e.ders || 'Etüt'}${e.konu ? ' · ' + e.konu : ''} · ${e.kisi} öğrenci${e.yer ? ' · ' + e.yer : ''}`));
    }
  }
  const aciklama = el('p', undefined, 'hafta-not');
  aciklama.append(el('span', '✓ ders işlendi'), el('span', '⊘ ders iptal'), el('span', '! süresi geçti, tamamlanmadı'), el('span', 'Kesik çizgi: etüt'));
  $('hafta').replaceChildren(ozet, t, aciklama, detay, etutKutu);
  atamaCiz();
}

async function gunYukle() {
  if (gorunum === 'hafta') return haftaYukle();
  const r = await api('/api/ders/liste?tarih=' + encodeURIComponent(tarih));
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  mesaj('');
  veri = r.veri;
  bugun = veri.bugun;
  $('gun-adi').textContent = tarihYaz(tarih);
  $('bugun').classList.toggle('bugunde', tarih === bugun);
  zamanCiz();
  atamaCiz();
}

function zamanCiz() {
  const k = $('zaman');
  k.replaceChildren();
  if (!veri.gunluk.length && !veri.etutler.length) {
    k.appendChild(el('p', veri.hafta_sonu ? 'Hafta sonu ders yok.' : 'Bu günde dersiniz yok.', 'bos-not'));
    if (veri.hafta_sonu) {
      const git = el('button', 'Pazartesi gününe git', 'ikincil'); git.type = 'button';
      git.addEventListener('click', () => { do { tarih = gunKaydir(tarih, 1); } while ([0, 6].includes(new Date(tarih + 'T12:00:00').getDay())); gunYukle(); });
      k.appendChild(git);
    }
    return;
  }
  const ogeler = [
    ...veri.gunluk.map(d => ({ tur: 'ders', d, bas: d.aralik.split('–')[0] })),
    ...veri.etutler.map(e => ({ tur: 'etut', d: e, bas: e.saat })),
  ].sort((x, y) => (x.bas < y.bas ? -1 : 1));
  for (const o of ogeler) {
    const d = o.d;
    const satir = el('button', undefined, 'ders-satir' + (o.tur === 'etut' ? ' etut-satir' : ''));
    satir.type = 'button';
    if (o.tur === 'ders' && ders && ders.atamaId === d.atamaId) satir.classList.add('secili');
    const zaman = el('div', undefined, 'ders-zaman');
    if (o.tur === 'ders') zaman.append(el('strong', `${d.dersSaati}.`), el('span', o.bas));
    else zaman.append(el('strong', 'Etüt'), el('span', o.bas));
    const orta = el('div', undefined, 'ders-orta');
    orta.append(el('strong', o.tur === 'ders' ? `${d.sinif} · ${d.ders}` : `${d.ders || 'Genel'}${d.konu ? ' · ' + d.konu : ''}`));
    if (o.tur === 'etut') orta.append(el('span', `${d.kisi} öğrenci${d.yer ? ' · ' + d.yer : ''}`));
    satir.style.setProperty('--ders', d.renk || '#475569');
    satir.append(zaman, orta);
    if (o.tur === 'ders') {
      const rozet = durumRozeti(d);
      if (rozet.textContent) satir.appendChild(rozet);
      satir.addEventListener('click', () => dersAc(d, true));
    } else {
      satir.addEventListener('click', () => { location.href = '/etut'; });
    }
    k.appendChild(satir);
  }
}

function durumRozeti(d) {
  if (d.durum === 'iptal') return el('span', 'İptal edildi', 'durum-etiket');
  if (d.durum === 'tamam') return el('span', `Tamamlandı · ${d.gelmedi} gelmedi`, 'durum-etiket tamam');
  if (d.durum === 'gecikti') return el('span', 'Süresi geçti · tamamlanmadı', 'durum-etiket gecikti');
  return el('span', tarih > bugun ? '' : 'Bekliyor', 'durum-etiket');
}

function atamaCiz() {
  const k = $('atamalar');
  k.replaceChildren();
  if (!veri.atamalar.length) return k.appendChild(el('p', 'Size atanmış ders yok.', 'bos-not'));
  for (const a of veri.atamalar) {
    const b = el('button', undefined, 'modul-kart hazir');
    b.type = 'button';
    b.append(dersChip(a.kisa, a.renk), el('strong', `${a.sinif} · ${a.ders}`), el('p', `${a.ogrenciSayisi} öğrenci`));
    b.addEventListener('click', () => dersAc(a, false));
    k.appendChild(b);
  }
}

function dersBos() {
  ders = null;
  $('p-baslik').textContent = 'Ders detayı';
  $('p-alt').textContent = 'Yukarıdan bir ders seçin.';
  $('p-kapat').classList.add('gizli');
  for (const b of $('sekmeler').children) { b.disabled = true; b.classList.remove('gizli'); b.setAttribute('aria-pressed', String(b.dataset.sekme === 'ogrenciler')); }
  $('icerik').replaceChildren(el('p', 'Bir ders seçtiğinizde öğrenci listesi, işlenen konular ve ödevler burada görünür.', 'bos-not'));
}

function dersAc(d, programdan) {
  ders = { atamaId: d.atamaId, sinifId: d.sinifId, sinif: d.sinif, ders: d.ders, dersSaati: programdan ? d.dersSaati : null };
  $('p-baslik').replaceChildren(dersChip(d.kisa, d.renk), ` ${d.sinif} · ${d.ders}`);
  $('p-alt').textContent = programdan ? `${tarihYaz(tarih)} · ${d.dersSaati}. ders · ${d.aralik}` : 'Öğrenciler, konular ve ödevler';
  $('p-kapat').classList.remove('gizli');
  for (const b of $('sekmeler').children) b.disabled = false;
  zamanCiz();
  const bitirVar = ders.dersSaati !== null;
  $('sekmeler').querySelector('[data-sekme="yoklama"]').classList.toggle('gizli', !bitirVar);
  if (!bitirVar && sekme === 'yoklama') sekme = 'ogrenciler';
  sekmeAc(sekme);
  $('panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function sekmeAc(ad) {
  sekme = ad;
  for (const b of $('sekmeler').children) b.setAttribute('aria-pressed', String(b.dataset.sekme === ad));
  const yukle = { ogrenciler: ogrencilerCiz, yoklama: yoklamaCiz, konular: konularCiz, odevler: odevlerCiz }[ad];
  yukle();
}

async function ogrencilerCiz() {
  const k = $('icerik');
  k.replaceChildren();
  const r = await api('/api/ders/ogrenciler?atamaId=' + ders.atamaId);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  k.appendChild(el('p', `${r.veri.ogrenciler.length} öğrenci`, 'alt'));
  const t = el('table');
  const bas = document.createElement('tr');
  bas.append(el('th', '#'), el('th', 'Öğrenci'), el('th', 'Bu derste devamsızlık'));
  t.appendChild(bas);
  r.veri.ogrenciler.forEach((o, i) => {
    const tr = document.createElement('tr');
    tr.append(el('td', String(i + 1)), el('td', o.ad), el('td', o.devamsiz ? `${o.devamsiz} gün` : '-'));
    t.appendChild(tr);
  });
  const sar = el('div', undefined, 'tablo-sar');
  sar.appendChild(t);
  k.appendChild(sar);
}

function yoklamaCiz() {
  const k = $('icerik');
  k.replaceChildren();
  const tar = tarih > bugun ? bugun : tarih;
  if (!ders.dersSaati) {
    k.appendChild(el('p', 'Dersi bitirmek için yukarıdaki günlük programdan bir ders saati seçin.', 'alt'));
    return;
  }
  if (tarih > bugun) k.appendChild(el('p', 'Gelecek tarih için yoklama alınamaz.', 'alt'));
  else {
    k.appendChild(el('p', 'Yoklama, işlenen konu ve kazanımı girerek dersi tamamlayın.', 'alt'));
    const a = el('a', 'Dersi bitir');
    a.href = `/yoklama?tarih=${tar}&sinifId=${ders.sinifId}&dersSaati=${ders.dersSaati}`;
    a.className = 'dugme-link';
    k.appendChild(a);
  }
}

function listeKart(baslik, alt, aciklama, sil) {
  const kart = el('div', undefined, 'not-kart');
  const ust = el('div', undefined, 'not-ust');
  ust.append(el('strong', baslik), el('span', alt, 'alt'));
  kart.appendChild(ust);
  if (aciklama) kart.appendChild(el('p', aciklama));
  const s = el('button', 'Sil', 'ikincil tehlike kucuk');
  s.type = 'button';
  s.addEventListener('click', sil);
  kart.appendChild(s);
  return kart;
}

function ekleForm({ tarihEtiket, tarihDeger, tarihMax, tarihMin, buton, gonder }) {
  const f = el('form', undefined, 'ekle-form');
  const satir = el('div', undefined, 'form-satir');
  const sol = document.createElement('div');
  const l1 = el('label', 'Başlık'); l1.htmlFor = 'f-baslik';
  const baslik = el('input'); baslik.id = 'f-baslik'; baslik.maxLength = 120; baslik.required = true;
  sol.append(l1, baslik);
  const sag = document.createElement('div');
  const l2 = el('label', tarihEtiket); l2.htmlFor = 'f-tarih';
  const t = el('input'); t.id = 'f-tarih'; t.type = 'date'; t.required = true; t.value = tarihDeger;
  if (tarihMax) t.max = tarihMax;
  if (tarihMin) t.min = tarihMin;
  sag.append(l2, t);
  satir.append(sol, sag);
  const l3 = el('label', 'Açıklama (isteğe bağlı)'); l3.htmlFor = 'f-aciklama';
  const ac = el('input'); ac.id = 'f-aciklama'; ac.maxLength = 500;
  const b = el('button', buton, 'birincil'); b.type = 'submit';
  f.append(satir, l3, ac, b);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const r = await gonder({ atamaId: ders.atamaId, baslik: baslik.value, tarih: t.value, aciklama: ac.value });
    if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
    mesaj('Kaydedildi.', 'tamam');
    sekmeAc(sekme);
  });
  return f;
}

async function konularCiz() {
  const k = $('icerik');
  k.replaceChildren();
  k.appendChild(ekleForm({
    tarihEtiket: 'İşlendiği tarih', tarihDeger: tarih > bugun ? bugun : tarih, tarihMax: bugun,
    buton: 'Konu ekle', gonder: g => api('/api/ders/konu-ekle', g),
  }));
  const r = await api('/api/ders/konular?atamaId=' + ders.atamaId);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  k.appendChild(el('h3', 'İşlenen konular', 'baslik3'));
  if (!r.veri.konular.length) k.appendChild(el('p', 'Henüz konu girilmemiş.', 'alt'));
  for (const x of r.veri.konular) {
    k.appendChild(listeKart(x.baslik, kisaTarih(x.tarih), x.aciklama, async () => {
      const s = await api('/api/ders/konu-sil', { id: x.id });
      if (!s.ok) return mesaj(s.veri.hata || 'Hata', 'hata');
      sekmeAc(sekme);
    }));
  }
}

async function odevlerCiz() {
  const k = $('icerik');
  k.replaceChildren();
  k.appendChild(ekleForm({
    tarihEtiket: 'Son teslim tarihi', tarihDeger: gunKaydir(bugun, 7), tarihMin: bugun,
    buton: 'Ödev ver', gonder: g => api('/api/ders/odev-ekle', g),
  }));
  const r = await api('/api/ders/odevler?atamaId=' + ders.atamaId);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  k.appendChild(el('h3', 'Verilen ödevler', 'baslik3'));
  if (!r.veri.odevler.length) k.appendChild(el('p', 'Henüz ödev verilmemiş.', 'alt'));
  for (const x of r.veri.odevler) {
    k.appendChild(listeKart(x.baslik, 'Son: ' + kisaTarih(x.sonTarih), x.aciklama, async () => {
      const s = await api('/api/ders/odev-sil', { id: x.id });
      if (!s.ok) return mesaj(s.veri.hata || 'Hata', 'hata');
      sekmeAc(sekme);
    }));
  }
}

async function gorunumSec(ad, acilacak) {
  gorunum = ad;
  $('bugun').textContent = ad === 'hafta' ? 'Bu hafta' : 'Bugün';
  for (const b of $('gorunum').children) b.setAttribute('aria-pressed', String(b.dataset.gorunum === ad));
  $('zaman').classList.toggle('gizli', ad !== 'gun');
  $('hafta').classList.toggle('gizli', ad !== 'hafta');
  $('siniflar').classList.toggle('gizli', ad !== 'siniflar');
  $('gun-seridi').classList.toggle('gizli', ad === 'siniflar');
  await gunYukle();
  if (acilacak && veri) {
    const d = veri.gunluk.find(x => x.atamaId === acilacak.atamaId && x.dersSaati === acilacak.dersSaati);
    if (d) dersAc(d, true);
  }
}

$('gorunum').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) gorunumSec(b.dataset.gorunum);
});
$('geri').addEventListener('click', () => { tarih = gunKaydir(tarih, gorunum === 'hafta' ? -7 : -1); gunYukle(); });
$('ileri').addEventListener('click', () => { tarih = gunKaydir(tarih, gorunum === 'hafta' ? 7 : 1); gunYukle(); });
$('bugun').addEventListener('click', () => { tarih = bugun; gunYukle(); });
$('p-kapat').addEventListener('click', () => { dersBos(); zamanCiz(); });
$('sekmeler').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b && ders) sekmeAc(b.dataset.sekme);
});

(async () => {
  const ben = await fetch('/api/ben');
  if (!ben.ok) { location.href = '/'; return; }
  tarih = new Date().toLocaleDateString('sv-SE');
  await gunYukle();
})();
