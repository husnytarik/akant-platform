const $ = id => document.getElementById(id);
const el = gEl;
const RENK = { geldi: '#2e9e5b', gelmedi: '#d64545', gec: '#e0a100', izinli: '#8a867d' };
const DURUM_AD = { gelmedi: 'Gelmedi', gec: 'Geç', izinli: 'İzinli' };
const kisaTarih = t => t.split('-').reverse().slice(0, 2).join('.');
const bas = ad => ad.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toLocaleUpperCase('tr');
const yuzde = d => d.toplam ? Math.round((d.toplam - d.gelmedi) / d.toplam * 100) : 100;

let veri = null, sinifNo = 0, secili = null, profil = null;

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
    b.append(el('span', bas(o.ad), 'ogr-avatar'), orta, sag);
    b.addEventListener('click', () => ac(o.id));
    k.appendChild(b);
  }
}

async function ac(id) {
  if (secili === id) return kapat();
  secili = id;
  listeCiz();
  const r = await api('/api/ogrencilerim/profil?id=' + id);
  if (!r.ok) { $('mesaj').textContent = r.veri.hata || 'Hata'; return; }
  profil = r.veri;
  const p = r.veri.ogrenci;
  $('p-baslik').textContent = p.ad;
  $('p-alt').textContent = `${p.sinif}${p.okulNo ? ' · No ' + p.okulNo : ''}`;
  $('profil').classList.remove('gizli');
  sekmeAc('genel');
  $('profil').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function kapat() {
  secili = null; profil = null;
  $('profil').classList.add('gizli');
  listeCiz();
}

function sekmeAc(ad) {
  for (const b of $('sekmeler').children) b.setAttribute('aria-pressed', String(b.dataset.sekme === ad));
  ({ genel: genelCiz, devam: devamCiz, sinav: sinavCiz })[ad]();
}

const satir = (ad, deger) => { const s = el('div', undefined, 'profil-satir'); s.append(el('span', ad), el('strong', deger)); return s; };

function genelCiz() {
  const k = $('icerik');
  k.replaceChildren();
  const d = profil.devam, p = profil.ogrenci;
  const kimlik = el('div', undefined, 'profil-blok');
  kimlik.append(satir('Sınıf', p.sinif), satir('Okul no', p.okulNo || '—'), satir('Devam', `%${yuzde(d)} · ${d.gelmedi} gün gelmedi`));
  k.append(el('h3', 'Öğrenci', 'baslik3'), kimlik, el('h3', 'Veliler', 'baslik3'));
  if (!profil.veliler.length) k.appendChild(el('p', 'Bağlı veli kaydı yok.', 'alt'));
  for (const v of profil.veliler) {
    const a = el('a', undefined, 'veli-kart');
    a.href = 'tel:' + v.telefon.replace(/\s/g, '');
    a.append(el('strong', v.ad), el('span', v.telefon));
    k.appendChild(a);
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

async function sinavCiz() {
  const k = $('icerik');
  k.replaceChildren();
  const r = await api('/api/sinav/ogrenci?id=' + secili);
  if (!r.ok) return k.appendChild(el('p', r.veri.hata || 'Hata', 'alt'));
  if (!r.veri.sinavlar.length) return k.appendChild(el('p', 'Yayınlanmış sınav sonucu yok.', 'bos-not'));
  for (const s of r.veri.sinavlar) {
    const kart = el('div', undefined, 'sinav-ozet');
    const ust = el('div', undefined, 'sinav-ozet-ust');
    ust.append(el('strong', s.ad), el('span', kisaTarih(s.tarih)));
    const alt = el('div', undefined, 'sinav-ozet-alt');
    alt.append(el('b', String(s.ortalama)), el('span', `ortalama · ${s.sira}/${s.giren}. sıra`));
    const dersler = el('div', undefined, 'sinav-dersler');
    for (const d of s.dersler) {
      const c = el('span', undefined, 'sinav-ders');
      c.append(document.createTextNode(d.ders + ' '), el('b', String(d.net)));
      dersler.appendChild(c);
    }
    kart.append(ust, alt, dersler);
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
