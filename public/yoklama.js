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
  $('ozet').textContent = `Geldi ${say.geldi} · Gelmedi ${say.gelmedi} · Geç ${say.gec} · İzinli ${say.izinli}`;
  $('hepsi-geldi').checked = ogrenciler.length > 0 && say.geldi === ogrenciler.length;
}

function tabloCiz() {
  const t = $('ogrenci-tablo');
  t.replaceChildren();
  const bas = document.createElement('tr');
  bas.append(el('th', 'Öğrenci'), el('th', 'Durum'));
  t.appendChild(bas);
  for (const o of ogrenciler) {
    const tr = document.createElement('tr');
    tr.appendChild(el('td', o.ad));
    const td = document.createElement('td');
    const grup = el('div', undefined, 'cipler');
    for (const [deger, ad] of SECENEKLER) {
      const l = el('label', undefined, 'onay');
      const r = document.createElement('input');
      r.type = 'radio';
      r.name = 'd' + o.ogrenciId;
      r.checked = durumlar.get(o.ogrenciId) === deger;
      r.addEventListener('change', () => { durumlar.set(o.ogrenciId, deger); ozetGuncelle(); });
      l.append(r, document.createTextNode(' ' + ad));
      grup.appendChild(l);
    }
    td.appendChild(grup);
    tr.appendChild(td);
    t.appendChild(tr);
  }
  ozetGuncelle();
}

async function dersleriYukle() {
  $('yoklama').classList.add('gizli');
  secili = null;
  const liste = $('dersler');
  liste.replaceChildren();
  const r = await api('/api/yoklama/dersler?tarih=' + encodeURIComponent($('tarih').value));
  if (!r.ok) { mesaj(r.veri.hata || 'Hata', 'hata'); return; }
  mesaj('');
  if (r.veri.hafta_sonu) { liste.appendChild(el('p', 'Hafta sonu ders yok.', 'alt')); return; }
  if (!r.veri.dersler.length) {
    liste.appendChild(el('p', 'Bu tarihte ders programınızda ders yok.', 'alt'));
    return;
  }
  gunDersleri = r.veri.dersler;
  for (const d of r.veri.dersler) {
    const b = el('button', undefined, 'modul-kart hazir');
    b.type = 'button';
    b.append(
      el('strong', `${d.dersSaati}. ders · ${d.sinif} · ${d.ders}`),
      el('p', d.aralik),
      el('span', d.iptal ? 'Ders iptal edildi' : d.tamam ? `Tamamlandı · ${d.gelmedi} devamsız` : 'Tamamlanmadı', 'durum'),
    );
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
  $('yoklama-baslik').textContent = `${d.sinif} · ${d.dersSaati}. ders · ${d.ders}` + (r.veri.iptal ? ' (iptal edilmiş ders)' : r.veri.tamam ? ' (tamamlanmış ders düzenleniyor)' : '');
  $('konu').value = r.veri.konu;
  $('kazanim').value = r.veri.kazanim;
  $('odev-baslik').value = r.veri.odev?.baslik || '';
  $('odev-aciklama').value = r.veri.odev?.aciklama || '';
  const hafta = new Date(Date.now() + 7 * 864e5).toLocaleDateString('sv-SE');
  $('odev-tarih').value = r.veri.odev?.sonTarih || hafta;
  $('yoklama').classList.remove('gizli');
  if (!ogrenciler.length) $('ozet').textContent = 'Bu sınıfta aktif öğrenci yok.';
  tabloCiz();
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

$('tarih').addEventListener('change', dersleriYukle);

(async () => {
  const ben = await fetch('/api/ben');
  if (!ben.ok) { location.href = '/'; return; }
  const bugun = new Date().toLocaleDateString('sv-SE');
  $('tarih').max = bugun;
  const q = new URLSearchParams(location.search);
  const t = q.get('tarih');
  $('tarih').value = /^\d{4}-\d{2}-\d{2}$/.test(t || '') && t <= bugun ? t : bugun;
  await dersleriYukle();
  const sinifId = Number(q.get('sinifId')), dersSaati = Number(q.get('dersSaati'));
  const hedef = gunDersleri.find(d => d.sinifId === sinifId && d.dersSaati === dersSaati);
  if (hedef) dersAc(hedef);
})();
