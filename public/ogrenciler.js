const $ = id => document.getElementById(id);
const el = gEl;
let veri = null;

async function yukle() {
  const r = await fetch('/api/ogrenci/liste');
  if (r.status === 401) { location.href = '/'; return; }
  const v = await r.json();
  if (!r.ok) { $('mesaj').textContent = v.hata || 'Hata'; return; }
  veri = v;
  const ben = await fetch('/api/ben').then(x => x.json()).catch(() => ({}));
  document.querySelector('a[href="/ogrenci-kayit"]').classList.toggle('gizli', (ben.yetkiler || []).length > 0 && !ben.yetkiler.includes('ogrenci-kayit'));
  const okul = $('okul');
  okul.replaceChildren(new Option('Tüm okullar', ''));
  for (const s of v.subeler) okul.append(new Option(s.ad, String(s.id)));
  sinifSecenekleri();
  ciz();
}

function sinifSecenekleri() {
  const sinif = $('sinif'), okul = Number($('okul').value);
  sinif.replaceChildren(new Option('Tüm sınıflar', ''), new Option('Sınıfsız', 'yok'));
  for (const s of veri.siniflar.filter(x => !okul || x.subeId === okul)) {
    sinif.append(new Option(okul ? s.ad : `${veri.subeler.find(b => b.id === s.subeId)?.ad} · ${s.ad}`, String(s.id)));
  }
}

function ciz() {
  const ara = $('ara').value.trim().toLocaleLowerCase('tr');
  const okul = $('okul').value, sinif = $('sinif').value;
  const bol = ad => { const p = ad.trim().split(/\s+/); return p.length > 1 ? [p.slice(0, -1).join(' '), p.at(-1)] : [ad, '']; };
  const gorunen = veri.ogrenciler
    .filter(o => !ara || o.ad.toLocaleLowerCase('tr').includes(ara) || String(o.okulNo || '').includes(ara))
    .filter(o => !okul || String(o.subeId) === okul)
    .filter(o => !sinif || (sinif === 'yok' ? !o.sinifId : String(o.sinifId) === sinif))
    .sort((a, b) => bol(a.ad)[1].localeCompare(bol(b.ad)[1], 'tr') || a.ad.localeCompare(b.ad, 'tr'));
  $('sayi').textContent = `${gorunen.length} öğrenci`;
  const k = $('liste');
  k.replaceChildren();
  if (!gorunen.length) k.append(el('p', 'Gösterilecek öğrenci yok.', 'bos-not'));
  for (const o of gorunen) {
    const a = el('a', undefined, 'ol-satir');
    a.href = '/ogrenci-dosyasi?id=' + o.id;
    const orta = el('div', undefined, 'ol-orta');
    orta.append(el('strong', o.ad), el('small', [veri.subeler.length > 1 ? o.sube : '', o.sinif || 'Sınıfsız', o.okulNo ? 'No ' + o.okulNo : ''].filter(Boolean).join(' · ')));
    const sag = el('div', undefined, 'ol-etiket');
    if (o.durum !== 'aktif') sag.append(el('span', 'Pasif'));
    if (o.yemek === 'almayacak') sag.append(el('span', 'Yemek yok'));
    if (o.ozelSayisi) sag.append(el('span', 'Özel durum', 'uyari'));
    a.append(avatarYap(o.ad, o.foto), orta, sag);
    k.append(a);
  }
}

$('ara').addEventListener('input', ciz);
$('okul').addEventListener('change', () => { sinifSecenekleri(); ciz(); });
$('sinif').addEventListener('change', ciz);
yukle();
