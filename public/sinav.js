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
      el('span', s.sahip
        ? `${s.okunan} öğrenci cevabı girildi · ${KAT_YAZI(s.yanlisKat)} · ${s.yayin ? 'Yayında' : 'Yayınlanmadı'} · ${s.kazanimli}/${s.soru} soruya kazanım girildi`
        : `Paylaşılan sınav · Sahibi: ${s.sahipAd} · ${s.kazanimli}/${s.soru} soruya kazanım girildi`, 'alt'),
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
  // Sınav sahibi olmayan öğretmen yalnızca kazanım sekmesini kullanır
  for (const b of $('d-sekmeler').querySelectorAll('button')) b.classList.toggle('gizli', !acik.sahip && b.dataset.sekme !== 'kazanim');
  sekmeSec(!acik.sahip || sekme === 'kazanim' ? 'kazanim' : 'cevap');
  bolum('detay-bolum');
}

function sekmeSec(ad) {
  sekme = ad;
  for (const b of $('d-sekmeler').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.sekme === ad));
  mesaj('');
  ({ cevap: cevapCiz, sonuc: sonucCiz, analiz: analizCiz, kazanim: kazanimCiz, anahtar: anahtarCiz })[ad]();
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
  kutu.append(el('p', `${v.giren} / ${v.beklenen} öğrenci sınava girdi. ${KAT_YAZI(v.sinav.yanlisKat)}; puan = net / soru sayısı × 100. Karne için öğrencinin adına tıklayın.`, 'alt'));
  const tablo = el('table', '', 'sinav-tablo');
  const bas = el('tr'); bas.append(el('th', 'Sıra'), el('th', 'Öğrenci'), el('th', 'Sınıf'));
  for (const d of v.dersler) bas.append(el('th', `${d.ders} D/Y/B`), el('th', 'Net'), el('th', 'Puan'));
  bas.append(el('th', 'Ortalama'));
  tablo.append(bas);
  const sirali = [...v.ogrenciler].sort((a, b) => (a.sira || 1e9) - (b.sira || 1e9) || a.ad.localeCompare(b.ad, 'tr'));
  for (const g of sirali) {
    const tr = el('tr'); tr.append(el('td', g.sira ? String(g.sira) : '–'));
    const adHucre = el('td');
    if (g.ortalama === null) adHucre.textContent = g.ad;
    else {
      const b = el('button', g.ad, 'baglanti'); b.type = 'button'; b.title = 'Öğrenci karnesi';
      b.addEventListener('click', () => karneAc(g.ogrenciId));
      adHucre.append(b);
    }
    tr.append(adHucre, el('td', g.sinif));
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
    if (a.kazanimlar.length) {
      kutu.append(el('h4', 'Kazanım başarısı (sınıf geneli)', 'baslik3'));
      const kt = el('table', '', 'sinav-tablo');
      const kb = el('tr'); for (const t of ['Kazanım', 'Sorular', 'Başarı']) kb.append(el('th', t));
      kt.append(kb);
      for (const k of a.kazanimlar) {
        const tr = el('tr'); const bt = el('td'); const cubuk = el('span', '', 'basari-cubuk'); cubuk.style.setProperty('--oran', k.oran + '%');
        bt.append(cubuk, document.createTextNode(' %' + k.oran));
        tr.append(el('td', k.kazanim), el('td', k.sorular.join(', ')), bt); kt.append(tr);
      }
      kutu.append(kt);
    } else kutu.append(el('p', 'Bu derste soru-kazanım eşlemesi yapılmamış; "Kazanımlar" sekmesinden girin.', 'alt'));
  }
}

const durumSinif = d => ({ Edinildi: 'durum-edinildi', Kısmen: 'durum-kismen', Eksik: 'durum-eksik' })[d];

// Öğrenci karnesi: ders sonuçları + kazanım bazında edinilen/eksik konular
async function karneAc(ogrenciId) {
  const kutu = $('d-icerik');
  const r = await api('/api/sinav/sonuc?kazanim=1&id=' + acik.sinav.id);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  const v = r.veri, g = v.ogrenciler.find(x => x.ogrenciId === ogrenciId);
  kutu.replaceChildren();
  const ust = el('div', '', 'form-satir');
  const geri = el('button', '← Sonuçlar', 'ikincil'); geri.type = 'button';
  geri.addEventListener('click', () => sekmeSec('sonuc'));
  const yaz = el('button', 'Yazdır', 'ikincil'); yaz.type = 'button';
  yaz.addEventListener('click', () => window.print());
  ust.append(geri, yaz);
  kutu.append(ust, el('h3', `${g.ad} · ${g.sinif}`, 'baslik3'),
    el('p', `${v.sinav.ad} · ${tarihYaz(v.sinav.tarih)} · Ortalama puan ${g.ortalama} · Sıra ${g.sira} / ${v.giren}`));
  for (const d of v.dersler) {
    const x = g.dersler[d.id];
    if (!x) continue;
    kutu.append(el('h4', `${d.ders}: ${x.dogru} doğru, ${x.yanlis} yanlış, ${x.bos} boş · net ${x.net} · puan ${x.puan}`, 'baslik3'));
    const liste = g.kazanim[d.id] || [];
    if (!liste.length) { kutu.append(el('p', 'Bu ders için kazanım eşlemesi girilmemiş.', 'alt')); continue; }
    const t = el('table', '', 'sinav-tablo');
    const b = el('tr'); for (const h of ['Kazanım', 'Sorular', 'Doğru', 'Durum']) b.append(el('th', h));
    t.append(b);
    for (const k of liste) {
      const tr = el('tr');
      tr.append(el('td', k.kazanim), el('td', k.sorular.join(', ')), el('td', `${k.dogru}/${k.toplam}`), el('td', k.durum, 'durum ' + durumSinif(k.durum)));
      t.append(tr);
    }
    kutu.append(t);
  }
}

// Kazanımlar: her sorunun ölçtüğü kazanım; aynı dersi veren öğretmenler ortak doldurur
let kazProgramDersleri = null;
async function kazanimCiz() {
  const kutu = $('d-icerik');
  kutu.replaceChildren();
  const r = await api('/api/sinav/kazanimlar?id=' + acik.sinav.id);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  if (!kazProgramDersleri) {
    const p = await api('/api/kazanim?dersler=1');
    kazProgramDersleri = p.ok ? p.veri.dersler : [];
  }
  const seviye = new Set(r.veri.siniflar.map(n => parseInt(n, 10)).filter(Boolean));
  const sinifNo = seviye.size === 1 ? [...seviye][0] : '';
  kutu.append(el('p', 'Her soru için ölçtüğü kazanımı seçin veya yazın. Öğrenci soruyu doğru yaparsa bu kazanımı edinmiş sayılır; karnede ve sınıf analizinde görünür. Aynı dersi veren öğretmenler bu bölümü birlikte doldurabilir.', 'alt'));
  for (const d of r.veri.dersler) {
    kutu.append(el('h3', d.ders + (d.duzenle ? '' : ' (salt okunur)'), 'baslik3'));
    const sel = el('select'); sel.setAttribute('aria-label', 'Kazanım programı dersi');
    const hepsi = el('option', 'Tüm dersler'); hepsi.value = ''; sel.append(hepsi);
    for (const ad of kazProgramDersleri) { const o = el('option', ad); o.value = ad; sel.append(o); }
    if (kazProgramDersleri.includes(d.ders)) sel.value = d.ders;
    const liste = el('div', '', 'kazanim-liste gizli');
    let aktif = null, zaman = null, sayac = 0;
    const ara = async () => {
      if (!aktif) return;
      const benim = ++sayac, girdi = aktif;
      const p = new URLSearchParams({ q: girdi.value.trim(), sinif: sinifNo });
      if (sel.value) p.set('ders', sel.value);
      const k = await api('/api/kazanim?' + p);
      if (benim !== sayac || aktif !== girdi) return;
      liste.replaceChildren();
      if (!k.ok) return liste.classList.add('gizli');
      for (const x of k.veri.kazanimlar) {
        const b = el('button', '', 'kazanim-oge'); b.type = 'button';
        b.append(el('strong', x.kod || 'Kod yok'), document.createTextNode(' ' + x.metin));
        b.addEventListener('click', () => { girdi.value = ((x.kod ? x.kod + ' – ' : '') + x.metin).slice(0, 300); liste.classList.add('gizli'); aktif = null; });
        liste.append(b);
      }
      if (!k.veri.kazanimlar.length) liste.append(el('p', 'Sonuç yok. Program seçimini "Tüm dersler" yapın veya elle yazın.', 'alt'));
      liste.classList.remove('gizli');
    };
    sel.addEventListener('change', ara);
    if (d.duzenle) kutu.append(el('label', 'Kazanım programı'), sel);
    const tablo = el('table', '', 'sinav-tablo');
    const bas = el('tr'); for (const h of ['Soru', 'Doğru şık', 'Kazanım', 'Giren']) bas.append(el('th', h));
    tablo.append(bas);
    const girdiler = [];
    for (const q of d.sorular) {
      const tr = el('tr', undefined, q.iptal ? 'iptal-soru' : '');
      const hucre = el('td'); const gi = el('input'); gi.value = q.kazanim; gi.maxLength = 300; gi.autocomplete = 'off';
      gi.setAttribute('aria-label', `${d.ders} soru ${q.no} kazanımı`);
      if (!d.duzenle) gi.readOnly = true;
      else {
        gi.addEventListener('input', () => { aktif = gi; hucre.append(liste); clearTimeout(zaman); zaman = setTimeout(ara, 250); });
        gi.addEventListener('focus', () => { aktif = gi; hucre.append(liste); ara(); });
        gi.addEventListener('keydown', e => { if (e.key === 'Escape') { liste.classList.add('gizli'); aktif = null; } });
      }
      hucre.append(gi);
      if (d.duzenle && q.no > 1) {
        const ayni = el('button', '↑ Üsttekiyle aynı', 'ikincil kucuk'); ayni.type = 'button';
        ayni.addEventListener('click', () => { gi.value = girdiler[q.no - 2].value; liste.classList.add('gizli'); });
        hucre.append(ayni);
      }
      tr.append(el('td', q.no + (q.iptal ? ' (iptal)' : '')), el('td', q.dogruSik), hucre, el('td', q.kim, 'alt'));
      girdiler.push(gi);
      tablo.append(tr);
    }
    kutu.append(tablo);
    if (d.duzenle) {
      const kaydet = el('button', `${d.ders} kazanımlarını kaydet`); kaydet.type = 'button';
      kaydet.addEventListener('click', async () => {
        liste.classList.add('gizli');
        const s = await api('/api/sinav/kazanimlar', { id: acik.sinav.id, dersId: d.id, sorular: girdiler.map((gi, i) => ({ no: i + 1, kazanim: gi.value })) });
        if (!s.ok) return mesaj(s.veri.hata || 'Kaydedilemedi', 'hata');
        await kazanimCiz();
        mesaj(`${d.ders} kazanımları kaydedildi.`, 'tamam');
      });
      kutu.append(kaydet);
    }
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
