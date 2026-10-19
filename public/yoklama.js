const $ = id => document.getElementById(id);
const SECENEKLER = [['geldi', 'Geldi'], ['gelmedi', 'Gelmedi'], ['gec', 'Geç'], ['izinli', 'İzinli']];
let secili = null;     // { sinifId, dersSaati, sinif, ders }
let durumlar = new Map();
let ogrenciler = [];
let gunDersleri = [];

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
  const veri = await r.json().catch(() => ({}));
  return { ok: r.ok, veri };
}

function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

function ozetGuncelle() {
  const say = { geldi: 0, gelmedi: 0, gec: 0, izinli: 0 };
  for (const o of ogrenciler) say[durumlar.get(o.ogrenciId)]++;
  $('ozet').textContent = `${say.geldi} geldi` + (say.gelmedi ? ` · ${say.gelmedi} gelmedi` : '') + (say.gec ? ` · ${say.gec} geç` : '') + (say.izinli ? ` · ${say.izinli} izinli` : '');
  $('hepsi-geldi').checked = ogrenciler.length > 0 && say.geldi === ogrenciler.length;
}

const IKON = { geldi: '✓', gelmedi: '✗', gec: 'G', izinli: 'İ' };
function tabloCiz() {
  const t = $('ogrenci-liste');
  t.replaceChildren();
  for (const o of ogrenciler) {
    const kap = el('div', undefined, 'yok-kap d-' + durumlar.get(o.ogrenciId));
    const satir = el('div', undefined, 'yok-satir');
    satir.appendChild(el('span', o.ad, 'yok-ad'));
    const sec = el('button', IKON[durumlar.get(o.ogrenciId)], 'yok-sec');
    sec.type = 'button';
    sec.setAttribute('aria-expanded', 'false');
    sec.setAttribute('aria-label', o.ad + ' yoklama durumu');
    const menu = el('div', undefined, 'yok-menu gizli');
    for (const [deger, ad] of SECENEKLER) {
      const b = el('button', IKON[deger], 'yok-kare s-' + deger);
      b.type = 'button';
      b.title = ad;
      b.setAttribute('aria-label', ad);
      b.setAttribute('aria-pressed', String(durumlar.get(o.ogrenciId) === deger));
      b.addEventListener('click', () => {
        durumlar.set(o.ogrenciId, deger);
        kap.className = 'yok-kap d-' + deger;
        sec.textContent = IKON[deger];
        for (const x of menu.children) x.setAttribute('aria-pressed', String(x === b));
        menu.classList.add('gizli');
        sec.setAttribute('aria-expanded', 'false');
        ozetGuncelle();
      });
      menu.appendChild(b);
    }
    sec.addEventListener('click', () => {
      const acik = menu.classList.contains('gizli');
      for (const m of t.querySelectorAll('.yok-menu')) m.classList.add('gizli');
      for (const x of t.querySelectorAll('.yok-sec')) x.setAttribute('aria-expanded', 'false');
      if (acik) { menu.classList.remove('gizli'); sec.setAttribute('aria-expanded', 'true'); }
    });
    satir.appendChild(sec);
    kap.append(satir, menu);
    t.appendChild(kap);
  }
  ozetGuncelle();
}

async function dersleriYukle() {
  $('yoklama').classList.add('gizli');
  $('yoklama-bos').classList.remove('gizli');
  secili = null;
  const liste = $('dersler');
  liste.replaceChildren();
  const r = await api('/api/yoklama/dersler?tarih=' + encodeURIComponent($('tarih').value));
  if (!r.ok) { mesaj(r.veri.hata || 'Hata', 'hata'); return; }
  mesaj('');
  if (r.veri.hafta_sonu) { liste.appendChild(el('p', 'Hafta sonu ders yok.', 'bos-not')); return; }
  if (!r.veri.dersler.length) {
    liste.appendChild(el('p', 'Bu tarihte ders programınızda ders yok.', 'bos-not'));
    return;
  }
  gunDersleri = r.veri.dersler;
  for (const d of r.veri.dersler) {
    const b = el('button', undefined, 'ders-oge');
    b.type = 'button';
    b.dataset.key = d.sinifId + '-' + d.dersSaati;
    b.setAttribute('aria-pressed', 'false');
    const isaret = d.iptal ? ['İptal', 'iptal'] : d.tamam ? ['✓', 'tamam'] : null;
    const sol = el('div', undefined, 'ders-oge-metin');
    sol.append(el('strong', d.sinif), el('span', `${d.aralik.split('–')[0]} · ${d.dersSaati}. ders` + (d.tamam && d.gelmedi ? ` · ${d.gelmedi} devamsız` : ''), 'alt'));
    b.appendChild(sol);
    if (isaret) { const i = el('span', isaret[0], 'durum-isaret ' + isaret[1]); i.setAttribute('aria-label', d.iptal ? 'İptal edildi' : 'Tamamlandı'); b.appendChild(i); }
    b.addEventListener('click', () => dersAc(d));
    liste.appendChild(b);
  }
}

async function dersAc(d) {
  const q = new URLSearchParams({ tarih: $('tarih').value, sinifId: d.sinifId, dersSaati: d.dersSaati });
  const r = await api('/api/yoklama/ogrenciler?' + q);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  mesaj('');
  secili = d;
  ogrenciler = r.veri.ogrenciler;
  durumlar = new Map(ogrenciler.map(o => [o.ogrenciId, o.durum]));
  $('yoklama-baslik').textContent = `${d.sinif} · ${d.ders} · ${d.dersSaati}. ders`;
  $('yoklama-durum').textContent = r.veri.iptal ? 'İptal edilmiş' : r.veri.tamam ? 'Düzenleniyor' : 'Yeni kayıt';
  $('yoklama-durum').className = 'rozet ' + (r.veri.iptal ? 'iptal' : r.veri.tamam ? 'tamam' : 'bekliyor');
  for (const b of document.querySelectorAll('.ders-oge')) b.setAttribute('aria-pressed', String(b.dataset.key === d.sinifId + '-' + d.dersSaati));
  $('konu').value = r.veri.konu;
  $('kazanim').value = r.veri.kazanim;
  $('odev-baslik').value = r.veri.odev?.baslik || '';
  $('odev-aciklama').value = r.veri.odev?.aciklama || '';
  const hafta = new Date(Date.now() + 7 * 864e5).toLocaleDateString('sv-SE');
  $('odev-tarih').value = r.veri.odev?.sonTarih || hafta;
  $('yoklama').classList.remove('gizli');
  if (!ogrenciler.length) $('ozet').textContent = 'Bu sınıfta aktif öğrenci yok.';
  tabloCiz();
  $('yoklama-bos').classList.add('gizli');
  $('yoklama').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('hepsi-geldi').addEventListener('change', () => {
  if (!$('hepsi-geldi').checked) return ozetGuncelle();
  for (const o of ogrenciler) durumlar.set(o.ogrenciId, 'geldi');
  tabloCiz();
});

$('kaydet').addEventListener('click', async () => {
  if (!secili) return;
  const r = await api('/api/yoklama/kaydet', {
    tarih: $('tarih').value, sinifId: secili.sinifId, dersSaati: secili.dersSaati,
    kayitlar: ogrenciler.map(o => ({ ogrenciId: o.ogrenciId, durum: durumlar.get(o.ogrenciId) })),
    konu: $('konu').value, kazanim: $('kazanim').value,
    odev: { baslik: $('odev-baslik').value, aciklama: $('odev-aciklama').value, sonTarih: $('odev-tarih').value },
  });
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  mesaj(`Ders tamamlandı: ${r.veri.gelmedi} gelmedi, ${r.veri.gec} geç, ${r.veri.izinli} izinli.`, 'tamam');
  $('yoklama').classList.add('gizli');
  await dersleriYukle();
});

$('iptal').addEventListener('click', async () => {
  if (!secili) return;
  if (!confirm('Bu ders iptal edilsin mi? Girilen yoklama, konu ve ödev silinir.')) return;
  const r = await api('/api/yoklama/iptal', { tarih: $('tarih').value, sinifId: secili.sinifId, dersSaati: secili.dersSaati });
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  mesaj('Ders iptal edildi.', 'tamam');
  $('yoklama').classList.add('gizli');
  await dersleriYukle();
});

function gunYazisi() {
  const t = $('tarih').value, bugun = new Date().toLocaleDateString('sv-SE');
  const ad = new Date(t + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
  $('gun-yazi').textContent = (t === bugun ? 'Bugün · ' : '') + ad;
  $('sonraki').disabled = t >= bugun;
}
function gunKaydir(n) {
  const d = new Date($('tarih').value + 'T12:00:00');
  d.setDate(d.getDate() + n);
  const t = d.toLocaleDateString('sv-SE');
  if (t > $('tarih').max) return;
  $('tarih').value = t;
  $('tarih').dispatchEvent(new Event('change'));
}
$('onceki').addEventListener('click', () => gunKaydir(-1));
$('sonraki').addEventListener('click', () => gunKaydir(1));
$('tarih').addEventListener('change', () => { gunYazisi(); dersleriYukle(); });

(async () => {
  const ben = await fetch('/api/ben');
  if (!ben.ok) { location.href = '/'; return; }
  const bugun = new Date().toLocaleDateString('sv-SE');
  $('tarih').max = bugun;
  const q = new URLSearchParams(location.search);
  const t = q.get('tarih');
  $('tarih').value = /^\d{4}-\d{2}-\d{2}$/.test(t || '') && t <= bugun ? t : bugun;
  gunYazisi();
  await dersleriYukle();
  const sinifId = Number(q.get('sinifId')), dersSaati = Number(q.get('dersSaati'));
  const hedef = gunDersleri.find(d => d.sinifId === sinifId && d.dersSaati === dersSaati);
  if (hedef) dersAc(hedef);
})();

// Kazanım arama: MEB programlarından, dersin adı ve sınıf düzeyine göre
let kazanimZamanlayici = null, kazanimSecilenDers = null;
// Ders listesi bir kez yüklenir; seçili ders programda varsa otomatik seçilir
async function kazanimDersleri() {
  const sel = $('kazanim-ders');
  if (sel.options.length === 1) {
    const r = await api('/api/kazanim?dersler=1');
    if (r.ok) for (const d of r.veri.dersler) { const o = el('option', d); o.value = d; sel.append(o); }
  }
  if (kazanimSecilenDers !== secili.ders) {
    kazanimSecilenDers = secili.ders;
    sel.value = [...sel.options].some(o => o.value === secili.ders) ? secili.ders : '';
  }
}
async function kazanimAra() {
  const kutu = $('kazanim-liste');
  const q = $('kazanim').value.trim();
  if (!secili) return;
  await kazanimDersleri();
  const sinifNo = parseInt(secili.sinif, 10) || '';
  const p = new URLSearchParams({ q, sinif: sinifNo });
  if ($('kazanim-ders').value) p.set('ders', $('kazanim-ders').value);
  const r = await api('/api/kazanim?' + p);
  kutu.replaceChildren();
  if (!r.ok) return kutu.classList.add('gizli');
  for (const k of r.veri.kazanimlar) {
    const b = el('button', '', 'kazanim-oge');
    b.type = 'button';
    b.append(el('strong', k.kod || 'Kod yok'), document.createTextNode(' ' + k.metin));
    b.addEventListener('click', () => {
      $('kazanim').value = ((k.kod ? k.kod + ' – ' : '') + k.metin).slice(0, 300);
      kutu.classList.add('gizli');
    });
    kutu.append(b);
  }
  if (!r.veri.kazanimlar.length) kutu.append(el('p', 'Sonuç yok. "Tüm programlarda ara"yı deneyin veya elle yazın.', 'alt'));
  kutu.classList.remove('gizli');
}
$('kazanim').addEventListener('input', () => { clearTimeout(kazanimZamanlayici); kazanimZamanlayici = setTimeout(kazanimAra, 250); });
$('kazanim').addEventListener('focus', kazanimAra);
$('kazanim-ders').addEventListener('change', kazanimAra);
