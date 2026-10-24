const $ = id => document.getElementById(id);
const el = gEl;
const RENK = { geldi: '#2e9e5b', gelmedi: '#d64545', gec: '#e0a100', izinli: '#8a867d' };
const DURUM_AD = { gelmedi: 'Gelmedi', gec: 'Geç', izinli: 'İzinli' };
const kisaTarih = t => t.split('-').reverse().slice(0, 2).join('.');
const bas = ad => ad.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toLocaleUpperCase('tr');
const yuzde = d => d.toplam ? Math.round((d.toplam - d.gelmedi) / d.toplam * 100) : 100;

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
  k.appendChild(el('p', `${s.ad} · ${s.ogrenciler.length} öğrenci`, 'alt'));
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
  ({ genel: genelCiz, devam: devamCiz, sinav: sinavCiz, gelisim: gelisimCiz, odev: odevCiz })[ad]();
}

const satir = (ad, deger) => { const s = el('div', undefined, 'profil-satir'); s.append(el('span', ad), el('strong', deger)); return s; };

const tarihYaz = t => t.split('-').reverse().join('.');
const bosMu = o => !o || !Object.values(o).some(Boolean);
const aramaLink = (ad, tel, rozet) => {
  const a = el('a', undefined, 'veli-kart');
  a.href = 'tel:' + tel.replace(/\s/g, '');
  a.append(el('strong', ad), el('span', rozet ? `${rozet} · ${tel}` : tel));
  return a;
};

// Veli görüşmesi için tek bakış: iletişim, devam, sınav, ödev ve en son görüşme notu
function genelCiz() {
  const k = $('icerik');
  k.replaceChildren();
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

function gorusmeKarti(g) {
  const kart = el('div', undefined, 'ogd-not');
  kart.append(el('small', `${tarihYaz(g.tarih)} · ${g.tur === 'toplanti' ? 'Veli toplantısı' : 'Veli görüşmesi'} · ${g.yazan}`), el('p', g.notu));
  return kart;
}

// Gelişim: dönem dönem, başlık başlık tüm öğretmenlerin gözlemleri ve görüşme notları
function gelisimCiz() {
  const k = $('icerik');
  k.replaceChildren();
  const dolu = dosya.donemler.filter(d => d.girisler.length || d.gorusmeler.length);
  if (!dolu.length && !dosya.donemsizGorusmeler.length) return k.appendChild(el('p', 'Gelişim gözlemi veya görüşme notu yok.', 'bos-not'));
  dolu.forEach((d, i) => {
    const det = el('details', undefined, 'ogd-donem');
    det.open = i === 0;
    const ust = el('summary');
    ust.append(el('strong', d.ad), el('small', `${d.girisler.length} gözlem${d.gorusmeler.length ? ` · ${d.gorusmeler.length} görüşme` : ''}`));
    det.append(ust);
    const baslikGrup = new Map();
    for (const g of d.girisler) { if (!baslikGrup.has(g.baslik)) baslikGrup.set(g.baslik, []); baslikGrup.get(g.baslik).push(g); }
    for (const [baslik, liste] of baslikGrup) {
      const blok = el('div', undefined, 'ogd-baslik');
      blok.append(el('h4', baslik));
      for (const g of liste) {
        const y = el('div', undefined, 'ogd-not');
        y.append(el('small', `${g.ogretmen}${g.ders ? ' · ' + g.ders : ''}`), el('p', g.metin));
        blok.append(y);
      }
      det.append(blok);
    }
    if (d.gorusmeler.length) {
      const blok = el('div', undefined, 'ogd-baslik');
      blok.append(el('h4', 'Veli görüşmeleri'));
      for (const g of d.gorusmeler) blok.append(gorusmeKarti(g));
      det.append(blok);
    }
    k.appendChild(det);
  });
  if (dosya.donemsizGorusmeler.length) {
    k.appendChild(el('h3', 'Diğer veli görüşmeleri', 'baslik3'));
    for (const g of dosya.donemsizGorusmeler) k.appendChild(gorusmeKarti(g));
  }
}

const ODEV_AD = { verildi: 'Verildi', yapildi: 'Yaptı · onay bekliyor', yapilamadi: 'Yapamadı', dogrulandi: 'Doğrulandı', duzeltme: 'Düzeltme istendi' };
const ODEV_SINIF = { verildi: 'bekle', yapildi: 'bekle', yapilamadi: 'eksik', dogrulandi: 'onay', duzeltme: 'eksik' };
const ETUT_DEVAM = { geldi: 'Geldi', gelmedi: 'Gelmedi', izinli: 'İzinli' };

function odevCiz() {
  const k = $('icerik');
  k.replaceChildren();
  k.append(el('h3', 'Son ödevler', 'baslik3'));
  if (!dosya.odevler.length) k.appendChild(el('p', 'Ödev kaydı yok.', 'alt'));
  for (const x of dosya.odevler) {
    const s = el('div', undefined, 'ogd-satir');
    const sol = el('div');
    sol.append(el('strong', x.baslik), el('small', `${x.ders} · son ${tarihYaz(x.son)}`));
    if (x.ogretmenNotu) sol.append(el('small', 'Öğretmen notu: ' + x.ogretmenNotu));
    s.append(sol, el('span', ODEV_AD[x.durum], 'hz-durum ' + ODEV_SINIF[x.durum]));
    k.appendChild(s);
  }
  k.append(el('h3', 'Kulüp', 'baslik3'));
  if (!dosya.kulup) k.appendChild(el('p', 'Bir kulübe üye değil.', 'alt'));
  else {
    const s = el('div', undefined, 'ogd-satir');
    const sol = el('div');
    sol.append(el('strong', dosya.kulup.ad), el('small', dosya.kulup.tema || 'Kulüp'));
    s.append(sol, el('span', dosya.kulup.toplam ? `${dosya.kulup.geldi}/${dosya.kulup.toplam} çalışma` : 'Çalışma yok', 'ogd-sayi'));
    k.appendChild(s);
  }
  k.append(el('h3', 'Etütler', 'baslik3'));
  if (!dosya.etutler.length) k.appendChild(el('p', 'Etüt kaydı yok.', 'alt'));
  for (const x of dosya.etutler) {
    const s = el('div', undefined, 'ogd-satir');
    const sol = el('div');
    sol.append(el('strong', x.konu), el('small', `${tarihYaz(x.tarih)}${x.ders ? ' · ' + x.ders : ''}`));
    const rozet = x.durum === 'iptal' ? 'İptal' : x.devam ? ETUT_DEVAM[x.devam] : ({ bekliyor: 'Yanıt bekliyor', gelecek: 'Gelecek', gelmeyecek: 'Gelmeyecek' })[x.yanit];
    s.append(sol, el('span', rozet, 'ogd-sayi'));
    k.appendChild(s);
  }
}

function devamCiz() {
  const k = $('icerik');
  k.replaceChildren();
  const d = profil.devam;
  const AD = { geldi: 'Geldi', gec: 'Geç', izinli: 'İzinli', gelmedi: 'Gelmedi' };
  const dilimler = ['geldi', 'gec', 'izinli', 'gelmedi'].map(x => ({ deger: d[x], renk: RENK[x], etiket: AD[x] }));
  const ozet = el('div', undefined, 'devam-ozet');
  const sag = el('div', undefined, 'devam-sag');
  sag.append(gosterge(dilimler), el('p', `${d.toplam} yoklamada`, 'alt'));
  ozet.append(halkaGrafik(dilimler, `%${yuzde(d)}`, 'devam', 120), sag);
  k.append(ozet, el('h3', 'Derslere göre', 'baslik3'));
  for (const x of profil.dersler) {
    const s = el('div', undefined, 'ders-devam');
    s.append(el('span', x.ders), yiginCubuk([{ deger: x.toplam - x.gelmedi, renk: RENK.geldi, etiket: 'Geldi' }, { deger: x.gelmedi, renk: RENK.gelmedi, etiket: 'Gelmedi' }]), el('strong', `%${yuzde(x)}`));
    k.appendChild(s);
  }
  k.appendChild(el('h3', 'Son devamsızlıklar', 'baslik3'));
  if (!profil.son.length) k.appendChild(el('p', 'Kayıtlı devamsızlık yok.', 'alt'));
  for (const x of profil.son) {
    const s = satir(`${kisaTarih(x.tarih)} · ${x.dersSaati}. ders · ${x.ders || ''}`, DURUM_AD[x.durum]);
    s.lastChild.style.color = RENK[x.durum];
    k.appendChild(s);
  }
}

// Yayınlanmış sınavlar: kart açılınca derslere göre doğru/yanlış/boş ve eksik kazanımlar aynı yerde görünür
async function sinavCiz() {
  const k = $('icerik');
  k.replaceChildren();
  const r = await api('/api/sinav/ogrenci?id=' + secili);
  if (!r.ok) return k.appendChild(el('p', r.veri.hata || 'Hata', 'alt'));
  if (!r.veri.sinavlar.length) return k.appendChild(el('p', 'Yayınlanmış sınav sonucu yok.', 'bos-not'));
  for (const s of r.veri.sinavlar) {
    const kart = el('details', undefined, 'ogs-kart');
    const ust = el('summary', undefined, 'ogs-ust');
    const kim = el('div', undefined, 'ogs-kim');
    kim.append(el('strong', s.ad), el('small', kisaTarih(s.tarih)));
    const puan = el('div', undefined, 'ogs-puan');
    puan.append(el('b', String(s.ortalama)), el('small', `ortalama · ${s.sira}. sıra (${s.giren} öğrenci)`));
    ust.append(kim, puan);
    kart.append(ust);
    for (const d of s.dersler) {
      const h = el('div', undefined, 'ogs-ayr');
      const baslik = el('div', undefined, 'ogs-ayr-ust');
      const sayilar = s.yazili || d.dogru === null ? '' : `${d.dogru} D · ${d.yanlis} Y · ${d.bos} B`;
      baslik.append(el('strong', d.ders), el('small', sayilar), el('b', String(d.net ?? d.puan)));
      h.append(baslik);
      const eksik = (d.kazanimlar || []).filter(x => x.durum !== 'Edinildi');
      if (eksik.length) {
        const l = el('ul', undefined, 'ogs-kaz');
        for (const x of eksik) l.append(el('li', `${x.kazanim} — ${x.durum}`));
        h.append(el('small', 'Geliştirilecek kazanımlar', 'ogs-kaz-baslik'), l);
      }
      kart.append(h);
    }
    k.appendChild(kart);
  }
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
