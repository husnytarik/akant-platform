const $ = id => document.getElementById(id);
let secenekler = { siniflar: [], dersler: [] };
let acik = null;      // açık sınavın detayı
let sekme = 'cevap';

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

function bolum(ad) {
  for (const b of ['liste-bolum', 'yeni-bolum', 'detay-bolum']) $(b).classList.toggle('gizli', b !== ad);
  mesaj('');
}

const tarihYaz = t => t.split('-').reverse().join('.');
const KAT_YAZI = k => (k ? `${k} yanlış 1 doğruyu götürür` : 'yanlış götürmez');

// ---------- Liste ----------
async function listeYukle() {
  const r = await api('/api/sinav/liste');
  const kutu = $('liste');
  kutu.replaceChildren();
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  if (!r.veri.sinavlar.length) kutu.append(el('p', 'Henüz sınav yok. "Yeni sınav" ile başlayın.', 'alt'));
  for (const s of r.veri.sinavlar) {
    const kart = el('button', '', 'sinav-kart');
    kart.type = 'button';
    kart.append(
      el('strong', s.ad),
      el('span', `${tarihYaz(s.tarih)} · ${s.siniflar.join(', ')} · ${s.dersler.join(', ')}`, 'alt'),
      el('span', `${s.okunan} öğrenci cevabı girildi · ${KAT_YAZI(s.yanlisKat)} · ${s.yayin ? 'Yayında' : 'Yayınlanmadı'}`, 'alt'),
    );
    kart.addEventListener('click', () => detayAc(s.id));
    kutu.append(kart);
  }
}

// ---------- Yeni sınav ----------
function dersSatiri(ders = '', n = '', anahtar = '') {
  const s = el('div', '', 'sinav-ders');
  const sel = el('select');
  sel.setAttribute('aria-label', 'Ders');
  for (const d of secenekler.dersler) { const o = el('option', d); o.value = d; sel.append(o); }
  if (ders) sel.value = ders;
  const sayi = el('input'); sayi.type = 'number'; sayi.min = 1; sayi.max = 200; sayi.value = n; sayi.placeholder = 'Soru sayısı';
  sayi.setAttribute('aria-label', 'Soru sayısı');
  const ank = el('input', undefined, 'cevap-giris'); ank.placeholder = 'Cevap anahtarı: ABCDABCD...'; ank.value = anahtar; ank.autocomplete = 'off';
  ank.setAttribute('aria-label', 'Cevap anahtarı');
  const sayac = el('span', '', 'alt');
  const guncelle = () => { sayac.textContent = `${ank.value.replace(/\s/g, '').length} harf`; };
  ank.addEventListener('input', guncelle); guncelle();
  const sil = el('button', 'Kaldır', 'ikincil'); sil.type = 'button';
  sil.addEventListener('click', () => s.remove());
  s.append(sel, sayi, ank, sayac, sil);
  return s;
}

async function yeniAc() {
  const r = await api('/api/sinav/secenekler');
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  secenekler = r.veri;
  if (!secenekler.siniflar.length) return mesaj('Size atanmış sınıf/ders yok.', 'hata');
  $('s-ad').value = '';
  $('s-tarih').value = new Date().toLocaleDateString('sv-SE');
  $('s-kat').value = '0';
  const kutu = $('s-siniflar');
  kutu.replaceChildren();
  for (const c of secenekler.siniflar) {
    const l = el('label', '', 'kazanim-hepsi');
    const cb = el('input'); cb.type = 'checkbox'; cb.value = c.id;
    l.append(cb, document.createTextNode(' ' + c.name));
    kutu.append(l);
  }
  $('s-dersler').replaceChildren(dersSatiri());
  bolum('yeni-bolum');
}

function dersleriTopla(kutu) {
  return [...kutu.querySelectorAll('.sinav-ders')].map(s => {
    const [sel, sayi, ank] = s.querySelectorAll('select, input');
    return { ders: sel.value, soruSayisi: Number(sayi.value), anahtar: ank.value };
  });
}

async function olustur() {
  const r = await api('/api/sinav/olustur', {
    ad: $('s-ad').value, tarih: $('s-tarih').value, yanlisKat: Number($('s-kat').value),
    sinifIds: [...$('s-siniflar').querySelectorAll('input:checked')].map(i => Number(i.value)),
    dersler: dersleriTopla($('s-dersler')),
  });
  if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
  await detayAc(r.veri.id);
  mesaj('Sınav oluşturuldu. Şimdi öğrenci cevaplarını girebilirsiniz.', 'tamam');
}

// ---------- Detay ----------
async function detayAc(id) {
  const r = await api('/api/sinav/detay?id=' + id);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  acik = r.veri;
  $('d-baslik').textContent = `${acik.sinav.ad} · ${tarihYaz(acik.sinav.tarih)} · ${acik.siniflar.map(c => c.name).join(', ')}`;
  sekmeSec('cevap');
  bolum('detay-bolum');
}

function sekmeSec(ad) {
  sekme = ad;
  for (const b of $('d-sekmeler').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.sekme === ad));
  mesaj('');
  ({ cevap: cevapCiz, sonuc: sonucCiz, analiz: analizCiz, anahtar: anahtarCiz })[ad]();
}

// Cevaplar: öğrenci başına, derslerin sırasıyla cevap dizisi
function cevapCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const d = acik;
  kutu.append(el('p', `Her öğrenci için A-E harflerini yazın, boş bırakılan soru için "-" kullanın. ${KAT_YAZI(d.sinav.yanlisKat)}.`, 'alt'));

  const topluKutu = el('details', '', 'toplu');
  topluKutu.append(el('summary', 'Toplu yapıştır (optik okuyucu çıktısı)'));
  topluKutu.append(el('p', `Her satır bir öğrenci, aşağıdaki sıradadır. Satırdaki cevaplar ${d.dersler.map(x => `${x.ders} (${x.soruSayisi})`).join(' + ')} sırasıyla arka arkaya yazılır; boş soru "-" olur.`, 'alt'));
  const ta = el('textarea'); ta.rows = 6; ta.setAttribute('aria-label', 'Toplu cevaplar');
  const uygula = el('button', 'Satırları uygula', 'ikincil'); uygula.type = 'button';
  topluKutu.append(ta, uygula);
  kutu.append(topluKutu);

  const tablo = el('table', '', 'sinav-tablo');
  const bas = el('tr'); bas.append(el('th', 'Öğrenci'), el('th', 'Sınıf'));
  for (const x of d.dersler) bas.append(el('th', `${x.ders} (${x.soruSayisi})`));
  tablo.append(bas);
  const girisler = [];
  for (const g of d.ogrenciler) {
    const tr = el('tr'); tr.append(el('td', g.ad), el('td', g.sinif));
    const satir = [];
    for (const x of d.dersler) {
      const td = el('td'); const gi = el('input', undefined, 'cevap-giris'); gi.value = (g.cevaplar[x.id] || '').replace(/-/g, '-');
      gi.maxLength = x.soruSayisi; gi.autocomplete = 'off'; gi.spellcheck = false;
      gi.setAttribute('aria-label', `${g.ad} ${x.ders}`);
      td.append(gi); tr.append(td); satir.push([g, x, gi]);
    }
    girisler.push(satir);
    tablo.append(tr);
  }
  kutu.append(tablo);
  if (!d.ogrenciler.length) kutu.append(el('p', 'Seçilen sınıflarda aktif öğrenci yok.', 'alt'));

  uygula.addEventListener('click', () => {
    const satirlar = ta.value.split('\n').map(s => s.replace(/\s/g, '')).filter(Boolean);
    if (satirlar.length > girisler.length) return mesaj(`Satır sayısı (${satirlar.length}) öğrenci sayısından (${girisler.length}) fazla.`, 'hata');
    satirlar.forEach((s, i) => {
      let konum = 0;
      for (const [, x, gi] of girisler[i]) { gi.value = s.slice(konum, konum + x.soruSayisi); konum += x.soruSayisi; }
    });
    mesaj(`${satirlar.length} satır uygulandı. Kaydetmeyi unutmayın.`, 'tamam');
  });

  const kaydet = el('button', 'Cevapları kaydet'); kaydet.type = 'button';
  kaydet.addEventListener('click', async () => {
    const kayitlar = girisler.flat().map(([g, x, gi]) => ({ ogrenciId: g.ogrenciId, dersId: x.id, cevaplar: gi.value }));
    const r = await api('/api/sinav/cevaplar', { id: d.sinav.id, kayitlar });
    if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
    await detayAc(d.sinav.id);
    mesaj('Cevaplar kaydedildi.', 'tamam');
  });
  kutu.append(kaydet);
}

// Sonuçlar: öğrenci başına ders ders doğru/yanlış/boş/net/puan ve genel sıra
async function sonucCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const r = await api('/api/sinav/sonuc?id=' + acik.sinav.id);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  const v = r.veri;
  kutu.append(el('p', `${v.giren} / ${v.beklenen} öğrenci sınava girdi. ${KAT_YAZI(v.sinav.yanlisKat)}; puan = net / soru sayısı × 100.`, 'alt'));
  const tablo = el('table', '', 'sinav-tablo');
  const bas = el('tr'); bas.append(el('th', 'Sıra'), el('th', 'Öğrenci'), el('th', 'Sınıf'));
  for (const d of v.dersler) bas.append(el('th', `${d.ders} D/Y/B`), el('th', 'Net'), el('th', 'Puan'));
  bas.append(el('th', 'Ortalama'));
  tablo.append(bas);
  const sirali = [...v.ogrenciler].sort((a, b) => (a.sira || 1e9) - (b.sira || 1e9) || a.ad.localeCompare(b.ad, 'tr'));
  for (const g of sirali) {
    const tr = el('tr'); tr.append(el('td', g.sira ? String(g.sira) : '–'), el('td', g.ad), el('td', g.sinif));
    for (const d of v.dersler) {
      const x = g.dersler[d.id];
      tr.append(el('td', x ? `${x.dogru}/${x.yanlis}/${x.bos}` : '–'), el('td', x ? String(x.net) : '–'), el('td', x ? String(x.puan) : '–'));
    }
    tr.append(el('td', g.ortalama === null ? '–' : String(g.ortalama), 'kalin'));
    tablo.append(tr);
  }
  kutu.append(tablo);
}

// Madde analizi: soru başına doğru/yanlış/boş, başarı, zorluk, ayırt edicilik, şık dağılımı
async function analizCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const r = await api('/api/sinav/sonuc?id=' + acik.sinav.id);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  for (const a of r.veri.analiz) {
    kutu.append(el('h3', `${a.ders} · ${a.giren} öğrenci`, 'baslik3'));
    if (!a.giren) { kutu.append(el('p', 'Henüz cevap girilmedi.', 'alt')); continue; }
    const tablo = el('table', '', 'sinav-tablo');
    const bas = el('tr');
    for (const t of ['Soru', 'Doğru şık', 'Doğru', 'Yanlış', 'Boş', 'Başarı', 'Zorluk', 'Ayırt edicilik', 'A', 'B', 'C', 'D', 'E']) bas.append(el('th', t));
    tablo.append(bas);
    for (const q of a.sorular) {
      const tr = el('tr', undefined, q.iptal ? 'iptal-soru' : '');
      tr.append(el('td', q.no + (q.iptal ? ' (iptal)' : '')), el('td', q.dogruSik), el('td', String(q.dogru)), el('td', String(q.yanlis)), el('td', String(q.bos)));
      const bt = el('td'); const cubuk = el('span', '', 'basari-cubuk'); cubuk.style.setProperty('--oran', q.basari + '%');
      bt.append(cubuk, document.createTextNode(' %' + q.basari)); tr.append(bt);
      tr.append(el('td', q.zorluk || ''), el('td', q.ayirt === null ? '–' : String(q.ayirt)));
      for (const s of 'ABCDE') tr.append(el('td', String(q.dagilim[s]), s === q.dogruSik ? 'dogru-sik' : ''));
      tablo.append(tr);
    }
    kutu.append(tablo);
  }
}

// Anahtar düzeltme ve soru iptali: kayıtlı cevaplar korunur, sonuçlar yeniden hesaplanır
function anahtarCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const d = acik;
  kutu.append(el('p', d.sinav.yayin ? 'Bu sınavın sonuçları öğrenci ve velilere yayında.' : 'Sonuçlar henüz yayınlanmadı; öğrenci ve veli görmez.', 'alt'));
  kutu.append(el('p', 'Anahtarı düzeltirseniz tüm sonuçlar yeniden hesaplanır. İptal edilen soru tüm öğrencilere doğru sayılır.', 'alt'));
  const sel = el('select'); sel.setAttribute('aria-label', 'Yanlış katsayısı');
  for (const k of [0, 4, 3, 2]) { const o = el('option', KAT_YAZI(k)); o.value = k; sel.append(o); }
  sel.value = String(d.sinav.yanlisKat);
  kutu.append(el('label', 'Yanlış doğruyu götürür mü?'), sel);
  const alanlar = [];
  for (const x of d.dersler) {
    kutu.append(el('h3', `${x.ders} (${x.soruSayisi} soru)`, 'baslik3'));
    const ank = el('input', undefined, 'cevap-giris'); ank.value = x.anahtar; ank.maxLength = x.soruSayisi; ank.setAttribute('aria-label', 'Cevap anahtarı ' + x.ders);
    const ip = el('input'); ip.value = x.iptal.join(', '); ip.placeholder = 'İptal edilen soru numaraları, örn. 7, 12'; ip.setAttribute('aria-label', 'İptal edilen sorular ' + x.ders);
    kutu.append(el('label', 'Cevap anahtarı'), ank, el('label', 'İptal edilen sorular'), ip);
    alanlar.push([x, ank, ip]);
  }
  const kaydet = el('button', 'Kaydet ve yeniden hesapla'); kaydet.type = 'button';
  kaydet.addEventListener('click', async () => {
    const r = await api('/api/sinav/anahtar', {
      id: d.sinav.id, yanlisKat: Number(sel.value),
      dersler: alanlar.map(([x, ank, ip]) => ({ id: x.id, anahtar: ank.value, iptal: ip.value.split(/[\s,;]+/).filter(Boolean).map(Number) })),
    });
    if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
    await detayAc(d.sinav.id);
    sekmeSec('anahtar');
    mesaj('Anahtar güncellendi, sonuçlar yeniden hesaplandı.', 'tamam');
  });
  const yayin = el('button', d.sinav.yayin ? 'Yayından kaldır' : 'Sonuçları yayınla', 'ikincil'); yayin.type = 'button';
  yayin.addEventListener('click', async () => {
    const yeni = !d.sinav.yayin;
    if (yeni && !confirm('Sonuçlar öğrenci ve velilere görünecek. Yayınlansın mı?')) return;
    const r = await api('/api/sinav/yayin', { id: d.sinav.id, yayin: yeni });
    if (!r.ok) return mesaj(r.veri.hata || 'Güncellenemedi', 'hata');
    await detayAc(d.sinav.id);
    sekmeSec('anahtar');
    mesaj(yeni ? 'Sonuçlar yayınlandı.' : 'Sonuçlar yayından kaldırıldı.', 'tamam');
  });
  const sil = el('button', 'Sınavı sil', 'ikincil'); sil.type = 'button';
  sil.addEventListener('click', async () => {
    if (!confirm('Bu sınav ve girilen tüm cevaplar silinecek. Emin misiniz?')) return;
    const r = await api('/api/sinav/sil', { id: d.sinav.id });
    if (!r.ok) return mesaj(r.veri.hata || 'Silinemedi', 'hata');
    bolum('liste-bolum'); await listeYukle();
  });
  const satir = el('div', '', 'form-satir');
  satir.append(kaydet, yayin, sil);
  kutu.append(satir);
}

$('yeni-ac').addEventListener('click', yeniAc);
$('s-vazgec').addEventListener('click', () => bolum('liste-bolum'));
$('ders-ekle').addEventListener('click', () => $('s-dersler').append(dersSatiri()));
$('s-kaydet').addEventListener('click', olustur);
$('geri').addEventListener('click', async () => { bolum('liste-bolum'); await listeYukle(); });
$('d-sekmeler').addEventListener('click', e => { const b = e.target.closest('button'); if (b) sekmeSec(b.dataset.sekme); });
listeYukle();
