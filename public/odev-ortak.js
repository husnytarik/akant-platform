// Ödev takibi ortak parçaları: yardımcılar ve öğrenci / veli / öğretmen için aynı ödev ekranı.
// Durum adları sunucudan gelir (odev.js DURUMLAR); burada yalnızca kodlara göre renk seçilir.
const $ = id => document.getElementById(id);
function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}
async function api(yol, govde) {
  const r = await fetch(yol, govde ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(govde) } : undefined);
  if (r.status === 401) { location.href = '/'; throw new Error('oturum'); }
  return { ok: r.ok, veri: await r.json().catch(() => ({})) };
}
const mesaj = (m, tur) => { const e = $('mesaj'); e.textContent = m || ''; e.className = 'mesaj' + (tur ? ' ' + tur : ''); };
const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const tarihYaz = t => { const [, a, g] = t.split('-').map(Number); return `${g} ${AYLAR[a - 1]}`; };
const saatYaz = ms => { const d = new Date(ms); return `${d.getDate()} ${AYLAR[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const DURUM_RENK = { verildi: '', yapildi: 'vurgu', yapilamadi: 'dolu', dogrulandi: 'tamam', duzeltme: 'duzelt' };
const durumChip = (durumlar, kod) => el('span', durumlar[kod].ad, 'kl-chip' + (DURUM_RENK[kod] ? ' ' + DURUM_RENK[kod] : ''));
const chip = (m, sinif) => el('span', m, 'kl-chip' + (sinif ? ' ' + sinif : ''));

function alan(etiket, girdi) {
  const k = el('div', undefined, 'kl-alan');
  const l = el('label', etiket);
  girdi.id = girdi.id || 'od-' + Math.random().toString(36).slice(2, 8);
  l.htmlFor = girdi.id;
  k.append(l, girdi);
  return k;
}
function geriDugme(metin, f) {
  const b = el('button', '← ' + metin, 'kl-geri');
  b.type = 'button';
  b.addEventListener('click', f);
  return b;
}
function ekranAc(kok) { mesaj(''); window.scrollTo(0, 0); kok.replaceChildren(); }
function bolum(baslik, sag) {
  const k = el('div', undefined, 'adim');
  const u = el('div', undefined, 'adim-ust');
  u.append(el('h3', baslik));
  if (sag) u.append(typeof sag === 'string' ? el('span', sag, 'alt') : sag);
  k.append(u);
  return k;
}

// Fotoğrafı yüklemeden önce küçültür (en çok 1600 px, JPEG); sayfa politikası blob/data önizlemeye izin vermez, önizleme sunucudan gelir
async function resimKucult(dosya) {
  const bmp = await createImageBitmap(dosya);
  const oran = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const tuval = document.createElement('canvas');
  tuval.width = Math.round(bmp.width * oran);
  tuval.height = Math.round(bmp.height * oran);
  const bg = tuval.getContext('2d');
  bg.fillStyle = '#fff';
  bg.fillRect(0, 0, tuval.width, tuval.height);
  bg.drawImage(bmp, 0, 0, tuval.width, tuval.height);
  bmp.close?.();
  return await new Promise((ok, hata) => tuval.toBlob(b => b ? ok(b) : hata(new Error('küçültülemedi')), 'image/jpeg', 0.82));
}
async function resimYukle(odevId, amac, dosya) {
  let govde;
  try { govde = await resimKucult(dosya); } catch { return { ok: false, veri: { hata: 'Bu fotoğraf okunamadı, başka bir fotoğraf deneyin' } }; }
  const r = await fetch(`/api/odev/dosya-yukle?odevId=${odevId}&amac=${amac}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: govde });
  if (r.status === 401) { location.href = '/'; throw new Error('oturum'); }
  return { ok: r.ok, veri: await r.json().catch(() => ({})) };
}

// Fotoğrafa dokununca tam ekran gösterir
function resimAc(id) {
  const perde = el('div', undefined, 'od-perde');
  const img = el('img');
  img.src = '/api/odev/dosya?id=' + id;
  img.alt = 'Ödev fotoğrafı';
  const kapat = el('button', '✕', 'od-perde-kapat');
  kapat.type = 'button';
  kapat.setAttribute('aria-label', 'Kapat');
  const bitir = () => { perde.remove(); document.removeEventListener('keydown', tus); };
  const tus = e => { if (e.key === 'Escape') bitir(); };
  perde.addEventListener('click', bitir);
  document.addEventListener('keydown', tus);
  perde.append(img, kapat);
  document.body.append(perde);
}
function resimIzgara(idler, sil) {
  const izgara = el('div', undefined, 'od-izgara');
  for (const id of idler) {
    const h = el('div', undefined, 'od-resim');
    const b = el('button', undefined, 'od-resim-ac');
    b.type = 'button';
    b.setAttribute('aria-label', 'Fotoğrafı büyüt');
    const img = el('img');
    img.src = '/api/odev/dosya?id=' + id;
    img.alt = '';
    img.loading = 'lazy';
    b.append(img);
    b.addEventListener('click', () => resimAc(id));
    h.append(b);
    if (sil) {
      const x = el('button', '✕', 'od-resim-sil');
      x.type = 'button';
      x.setAttribute('aria-label', 'Fotoğrafı sil');
      x.addEventListener('click', () => sil(id));
      h.append(x);
    }
    izgara.append(h);
  }
  return izgara;
}
// Gizli dosya seçici açan düğme; seçilen her fotoğraf için bitir(dosya) çağrılır
function resimEkleDugmesi(etiket, bitir) {
  const girdi = el('input');
  girdi.type = 'file';
  girdi.accept = 'image/*';
  girdi.hidden = true;
  const b = el('button', etiket, 'ikincil kucuk');
  b.type = 'button';
  b.addEventListener('click', () => girdi.click());
  girdi.addEventListener('change', async () => {
    const d = girdi.files[0];
    girdi.value = '';
    if (!d) return;
    b.disabled = true;
    await bitir(d);
    b.disabled = false;
  });
  const k = el('span');
  k.append(b, girdi);
  return k;
}

// Bir öğrencinin tek ödev ekranı. rol: ogrenci (işaretler, fotoğraf ekler, soru sorar), veli (salt okunur), ogretmen (doğrular, yanıtlar)
async function odevEkrani(kok, { odevId, ogrenciId, geri, geriMetin, degisti }) {
  const q = `odevId=${odevId}` + (ogrenciId ? `&ogrenciId=${ogrenciId}` : '');
  const r = await api('/api/odev/detay?' + q);
  if (!r.ok) return mesaj(r.veri.hata || 'Ödev alınamadı', 'hata');
  const v = r.veri;
  const { durumlar, odev, durum } = v;
  const yenile = async metin => { kok.replaceChildren(); await odevEkrani(kok, { odevId, ogrenciId, geri, geriMetin, degisti }); if (metin) mesaj(metin, 'tamam'); degisti?.(); };
  const eylem = async (yol, govde, metin) => {
    const s = await api(yol, govde);
    if (!s.ok) return mesaj(s.veri.hata || 'İşlem yapılamadı', 'hata');
    await yenile(metin);
  };
  const dogrulandi = durum.kod === 'dogrulandi';
  kok.append(geriDugme(geriMetin, geri));

  // Ödev bilgisi
  if (v.rol === 'ogretmen') {
    const kim = el('div', undefined, 'ot-kim');
    const yazi = el('div');
    yazi.append(el('strong', v.ogrenci.ad), el('small', odev.sinif));
    kim.append(avatarYap(v.ogrenci.ad, v.ogrenci.foto, 'orta'), yazi);
    kok.append(kim);
  }
  const ust = el('div', undefined, 'kl-ust');
  const b = el('div');
  b.append(el('h2', odev.baslik, 'kl-buyuk'), el('p', `${odev.ders}${odev.ogretmen ? ' · ' + odev.ogretmen : ''}`, 'kl-not'));
  if (v.rol === 'veli') b.append(el('p', `${v.ogrenci.ad} · ${odev.sinif}`, 'kl-not'));
  ust.append(b);
  kok.append(ust);
  const son = el('p', `Son tarih: ${tarihYaz(odev.sonTarih)}${odev.sonTarih < v.bugun ? ' (geçti)' : odev.sonTarih === v.bugun ? ' (bugün)' : ''}`, 'od-son' + (odev.sonTarih < v.bugun && !dogrulandi ? ' gecti' : ''));
  kok.append(son);
  if (odev.aciklama) kok.append(el('p', odev.aciklama, 'odev-aciklama'));
  if (odev.kazanim) kok.append(el('p', 'Kazanım: ' + odev.kazanim, 'odev-aciklama'));

  // Durum
  const dk = bolum('Durum', durumChip(durumlar, durum.kod));
  dk.append(el('p', durumlar[durum.kod].aciklama + (durum.dogrulama ? ` · ${saatYaz(durum.dogrulama)}` : durum.isaret ? ` · ${saatYaz(durum.isaret)}` : ''), 'kl-not'));
  if (durum.ogrenciNotu) dk.append(el('p', 'Öğrenci notu: ' + durum.ogrenciNotu, 'od-not'));
  if (durum.ogretmenNotu) dk.append(el('p', 'Öğretmen notu: ' + durum.ogretmenNotu, 'od-not ogretmen'));
  kok.append(dk);

  if (v.rol === 'ogrenci') {
    if (dogrulandi) dk.append(el('p', 'Öğretmeniniz bu ödevi doğruladı; artık değiştirilemez.', 'kl-not'));
    else {
      const not = Object.assign(el('input'), { type: 'text', maxLength: 300, value: durum.ogrenciNotu, placeholder: 'İsterseniz kısa bir not yazın' });
      const dugmeler = el('div', undefined, 'od-dugmeler');
      const yaptim = el('button', durum.kod === 'yapildi' ? 'Yaptım ✓' : 'Yaptım', 'birincil kucuk');
      const yapamadim = el('button', 'Yapamadım', 'ikincil kucuk');
      for (const [d, kod] of [[yaptim, 'yapildi'], [yapamadim, 'yapilamadi']]) {
        d.type = 'button';
        d.addEventListener('click', () => eylem('/api/odev/isaretle', { odevId, durum: kod, not: not.value }, kod === 'yapildi' ? 'Öğretmenin onayına gönderildi' : 'Kaydedildi'));
      }
      dugmeler.append(yaptim, yapamadim);
      if (durum.kod === 'yapildi' || durum.kod === 'yapilamadi') {
        const geriAl = el('button', 'Geri al', 'ikincil kucuk');
        geriAl.type = 'button';
        geriAl.addEventListener('click', () => eylem('/api/odev/isaretle', { odevId, durum: 'verildi' }, 'İşaret kaldırıldı'));
        dugmeler.append(geriAl);
      }
      dk.append(alan('Not (isteğe bağlı)', not), dugmeler);
    }
  }

  if (v.rol === 'ogretmen') {
    const not = Object.assign(el('input'), { type: 'text', maxLength: 300, value: '', placeholder: 'Not (düzeltme için zorunlu)' });
    const dugmeler = el('div', undefined, 'od-dugmeler od-ikili');
    const islem = (islemAdi, metin) => () => eylem('/api/odev/dogrula', { odevId, ogrenciId: v.ogrenci.id, islem: islemAdi, not: not.value }, metin);
    if (!dogrulandi) {
      const d = el('button', 'Doğrula', 'birincil kucuk'); d.type = 'button';
      d.addEventListener('click', islem('dogrula', 'Doğrulandı'));
      const dz = el('button', 'Düzeltme iste', 'ikincil kucuk'); dz.type = 'button';
      dz.addEventListener('click', islem('duzeltme', 'Düzeltme istendi'));
      dugmeler.append(d, dz);
      dk.append(alan('Öğretmen notu', not), dugmeler);
    } else {
      const g = el('button', 'Onayı kaldır', 'ikincil kucuk'); g.type = 'button';
      g.addEventListener('click', islem('geri', 'Onay kaldırıldı'));
      dugmeler.append(g);
      dk.append(dugmeler);
    }
  }

  // Fotoğraflar (öğrencinin teslim ettiği çalışma)
  const salt = v.rol !== 'ogrenci' || dogrulandi;
  if (v.dosyalar.length || !salt) {
    const fk = bolum('Fotoğraflar', v.dosyalar.length ? `${v.dosyalar.length}` : undefined);
    if (v.dosyalar.length) fk.append(resimIzgara(v.dosyalar.map(d => d.id), salt ? null : async id => {
      const s = await api('/api/odev/dosya-sil', { id });
      if (!s.ok) return mesaj(s.veri.hata || 'Silinemedi', 'hata');
      await yenile();
    }));
    else fk.append(el('p', 'Yaptığınız çalışmanın fotoğrafını ekleyebilirsiniz.', 'kl-not'));
    if (!salt) fk.append(resimEkleDugmesi('Fotoğraf ekle', async dosya => {
      const s = await resimYukle(odevId, 'teslim', dosya);
      if (!s.ok) return mesaj(s.veri.hata || 'Fotoğraf yüklenemedi', 'hata');
      await yenile('Fotoğraf eklendi');
    }));
    kok.append(fk);
  }

  // Sorular ve yanıtlar
  const sk = bolum(v.rol === 'ogretmen' ? 'Öğrencinin soruları' : 'Sorular');
  if (!v.mesajlar.length) sk.append(el('p', v.rol === 'ogrenci' ? 'Takıldığınız yeri öğretmeninize sorabilirsiniz.' : 'Henüz soru yok.', 'kl-not'));
  for (const m of v.mesajlar) {
    const benim = (v.rol === 'ogrenci' && m.yazanRol === 'ogrenci') || (v.rol === 'ogretmen' && m.yazanRol === 'ogretmen');
    const balon = el('div', undefined, 'od-mesaj' + (benim ? ' benim' : '') + (m.yeni ? ' yeni' : ''));
    balon.append(el('small', `${m.yazan} · ${saatYaz(m.zaman)}`), el('p', m.metin));
    if (m.dosyalar.length) balon.append(resimIzgara(m.dosyalar));
    sk.append(balon);
  }
  if (v.rol !== 'veli') {
    const metin = Object.assign(el('textarea'), { rows: 3, maxLength: 800, placeholder: v.rol === 'ogrenci' ? 'Sorunuzu yazın' : 'Yanıtınızı yazın' });
    const ekler = [];
    const ekAlan = el('div');
    const ekCiz = () => {
      ekAlan.replaceChildren();
      if (ekler.length) ekAlan.append(resimIzgara(ekler, async id => {
        await api('/api/odev/dosya-sil', { id });
        ekler.splice(ekler.indexOf(id), 1);
        ekCiz();
      }));
    };
    const alt = el('div', undefined, 'od-dugmeler' + (v.rol === 'ogretmen' ? ' od-tek' : ''));
    if (v.rol === 'ogrenci') alt.append(resimEkleDugmesi('Fotoğraf ekle', async dosya => {
      const s = await resimYukle(odevId, 'soru', dosya);
      if (!s.ok) return mesaj(s.veri.hata || 'Fotoğraf yüklenemedi', 'hata');
      ekler.push(s.veri.id);
      ekCiz();
    }));
    const gonder = el('button', v.rol === 'ogrenci' ? 'Soruyu gönder' : 'Yanıtla', 'birincil kucuk');
    gonder.type = 'button';
    gonder.addEventListener('click', async () => {
      gonder.disabled = true;
      const s = await api('/api/odev/mesaj-gonder', { odevId, ogrenciId: v.ogrenci.id, metin: metin.value, dosyaIds: ekler });
      gonder.disabled = false;
      if (!s.ok) return mesaj(s.veri.hata || 'Gönderilemedi', 'hata');
      await yenile(v.rol === 'ogrenci' ? 'Sorunuz öğretmeninize gönderildi' : 'Yanıt gönderildi');
    });
    alt.append(gonder);
    const form = el('div', undefined, 'kl-form');
    form.append(metin, ekAlan, alt);
    sk.append(form);
  }
  kok.append(sk);
}
