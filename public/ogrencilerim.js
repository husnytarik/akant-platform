const $ = id => document.getElementById(id);
const el = gEl;
const { yuzde, satir, aramaLink, gorusmeKarti, tarihYaz } = OgrOrtak;

let veri = null, sinifNo = 0, secili = null, profil = null, dosya = null;

async function api(yol) {
  const r = await fetch(yol);
  if (r.status === 401) { location.href = '/'; throw new Error('oturum'); }
  return { ok: r.ok, veri: await r.json() };
}

function listeCiz() {
  const k = $('liste');
  k.replaceChildren();
  const s = veri.siniflar[sinifNo];
  if (!s) return k.appendChild(el('p', 'Mentor olduğunuz bir sınıf yok.', 'bos-not'));
  const ust = el('div', undefined, 'ekle-ust');
  const karne = el('a', 'Sınıf karneleri', 'ekle-ac');
  karne.href = '/karne?sinifId=' + s.id;
  ust.append(el('p', `${s.ad} · ${s.ogrenciler.length} öğrenci`, 'alt'), karne);
  k.appendChild(ust);
  for (const o of s.ogrenciler) {
    const b = el('button', undefined, 'ogr-kart' + (secili === o.id ? ' secili' : ''));
    b.type = 'button';
    const orta = el('div', undefined, 'ogr-orta');
    orta.append(el('strong', o.ad), el('span', o.okulNo ? 'No ' + o.okulNo : 'No yok'));
    const sag = el('div', undefined, 'ogr-devam' + (o.gelmedi >= 5 ? ' dusuk' : ''));
    sag.append(el('strong', `%${yuzde(o)}`), el('span', `${o.gelmedi} gelmedi`));
    b.append(avatarYap(o.ad, o.foto), orta, sag);
    b.addEventListener('click', () => ac(o.id));
    k.appendChild(b);
  }
}

async function ac(id) {
  if (secili === id) return kapat();
  secili = id;
  listeCiz();
  const [r, d] = await Promise.all([api('/api/ogrencilerim/profil?id=' + id), api('/api/ogrencilerim/dosya?id=' + id)]);
  if (!r.ok || !d.ok) { $('mesaj').textContent = (r.ok ? d : r).veri.hata || 'Hata'; return; }
  profil = r.veri; dosya = d.veri;
  const p = r.veri.ogrenci;
  $('p-baslik').textContent = p.ad;
  $('p-foto').replaceChildren(avatarYap(p.ad, p.foto, 'buyuk'));
  $('p-alt').textContent = `${p.sinif}${p.okulNo ? ' · No ' + p.okulNo : ''}`;
  $('p-dosya').href = '/ogrenci-dosyasi?id=' + id;
  $('profil').classList.remove('gizli');
  sekmeAc('genel');
  $('profil').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function kapat() {
  secili = null; profil = null; dosya = null;
  $('profil').classList.add('gizli');
  listeCiz();
}

function sekmeAc(ad) {
  for (const b of $('sekmeler').children) b.setAttribute('aria-pressed', String(b.dataset.sekme === ad));
  const k = $('icerik');
  k.replaceChildren();
  ({
    genel: genelCiz,
    devam: () => OgrOrtak.devam(k, profil),
    sinav: sinavCiz,
    gelisim: () => OgrOrtak.gelisim(k, dosya),
    odev: () => OgrOrtak.odev(k, dosya),
  })[ad]();
}

// Veli görüşmesi için tek bakış: iletişim, devam, sınav, ödev ve en son görüşme notu
function genelCiz() {
  const k = $('icerik');
  const d = profil.devam, p = profil.ogrenci, b = dosya.bilgi;
  const kimlik = el('div', undefined, 'profil-blok');
  kimlik.append(satir('Sınıf', p.sinif), satir('Okul no', p.okulNo || '—'), satir('Devam', `%${yuzde(d)} · ${d.gelmedi} gün gelmedi`));
  const acik = dosya.odevler.filter(x => ['verildi', 'yapilamadi', 'duzeltme'].includes(x.durum)).length;
  kimlik.append(satir('Bekleyen ödev', acik ? `${acik} ödev` : 'Yok'));
  if (dosya.kulup) kimlik.append(satir('Kulüp', dosya.kulup.ad));
  k.append(el('h3', 'Öğrenci', 'baslik3'), kimlik, el('h3', 'İletişim', 'baslik3'));
  if (!profil.veliler.length) k.appendChild(el('p', 'Bağlı veli kaydı yok.', 'alt'));
  for (const v of profil.veliler) k.appendChild(aramaLink(v.ad, v.telefon, 'Veli'));
  if (b.yakinAd && b.yakinTelefon) k.appendChild(aramaLink(b.yakinAd, b.yakinTelefon, 'Acil durum' + (b.yakinYakinlik ? ' · ' + b.yakinYakinlik : '')));
  if (b.telefon2) k.appendChild(aramaLink('İkinci telefon', b.telefon2));
  const adres = [b.adres, b.ilce, b.il].filter(Boolean).join(', ');
  if (adres) k.appendChild(el('p', adres, 'alt'));
  // Son görüşme notları
  const gorusmeler = [...dosya.donemsizGorusmeler, ...dosya.donemler.flatMap(x => x.gorusmeler)].sort((a, c) => c.tarih.localeCompare(a.tarih)).slice(0, 3);
  k.appendChild(el('h3', 'Son görüşme notları', 'baslik3'));
  if (!gorusmeler.length) k.appendChild(el('p', 'Kayıtlı veli görüşmesi yok.', 'alt'));
  for (const g of gorusmeler) k.appendChild(gorusmeKarti(g));
}

async function sinavCiz() {
  const k = $('icerik');
  const r = await api('/api/sinav/ogrenci?id=' + secili);
  if (!r.ok) return k.appendChild(el('p', r.veri.hata || 'Hata', 'alt'));
  OgrOrtak.sinav(k, r.veri.sinavlar);
}

(async () => {
  const r = await api('/api/ogrencilerim');
  if (!r.ok) { location.href = '/panel'; return; }
  veri = r.veri;
  if (veri.siniflar.length > 1) {
    const sk = $('siniflar');
    sk.classList.remove('gizli');
    veri.siniflar.forEach((s, i) => {
      const b = el('button', s.ad); b.type = 'button'; b.setAttribute('aria-pressed', String(i === 0));
      b.addEventListener('click', () => {
        sinifNo = i; kapat();
        for (const x of sk.children) x.setAttribute('aria-pressed', String(x === b));
      });
      sk.appendChild(b);
    });
  }
  listeCiz();
  $('p-kapat').addEventListener('click', kapat);
  for (const b of $('sekmeler').children) b.addEventListener('click', () => sekmeAc(b.dataset.sekme));
})();
