// Öğretmen: danışmanı olduğum kulüpler, üyeler ve haftalık çalışmalar (yoklamalı)
// Çalışmaya dokununca salt okunur ayrıntı açılır; değişiklik yalnızca "Düzenle" ile, kaydet çubuklu ekranda yapılır.
const kok = $('icerik');
let veri = null;

async function yukle(goster = true) {
  const r = await api('/api/kulup/kuluplerim');
  if (!r.ok) return mesaj(r.veri.hata || 'Kulüpler alınamadı', 'hata');
  veri = r.veri;
  if (goster) ciz();
}
yukle();

const chip = (m, sinif) => el('span', m, 'kl-chip' + (sinif ? ' ' + sinif : ''));
const DEVAM = [['geldi', 'Geldi'], ['gelmedi', 'Gelmedi'], ['izinli', 'İzinli']];
const DEVAM_AD = Object.fromEntries(DEVAM);

function ciz() {
  ekranAc(kok);
  if (!veri.kulupler.length) return kok.append(el('p', 'Danışmanı olduğunuz bir kulüp yok.', 'bos-not'));
  for (const k of veri.kulupler) kok.append(kart(k));
}

function kart(k) {
  const c = el('article', undefined, 'kl-kart');
  const baslik = el('div', undefined, 'kl-baslik');
  const b = el('div');
  b.append(el('h3', k.ad), el('p', k.tema || ' ', 'kl-not'));
  baslik.append(b, chip(`${k.uyeSayisi} öğrenci`));
  c.append(baslik, el('p', `${k.gunAd} · ${k.dersSaati}. ders ${k.aralik}`, 'kl-zaman'));
  const ortak = k.ogretmenler.filter(o => o.ad).map(o => o.ad);
  if (ortak.length > 1) c.append(el('p', 'Danışmanlar: ' + ortak.join(', '), 'kl-kisi'));

  const yeni = el('button', '+ Çalışma ekle', 'birincil kucuk');
  yeni.type = 'button';
  yeni.addEventListener('click', () => calismaForm(k, null));

  const uyeler = el('details', undefined, 'kl-detay');
  uyeler.append(el('summary', `Üyeler (${k.uyeler.length})`));
  if (!k.uyeler.length) uyeler.append(el('p', 'Henüz kulübe yerleştirilen öğrenci yok.', 'kl-not'));
  for (const u of k.uyeler) {
    const s = el('div', undefined, 'kl-uye');
    s.append(el('span', u.ad), el('small', u.sinif || ''));
    uyeler.append(s);
  }
  c.append(uyeler, el('div', undefined, 'kl-ayrac'));

  const ust = el('div', undefined, 'kl-ust');
  ust.append(el('h4', 'Haftalık çalışmalar'), yeni);
  c.append(ust);

  if (!k.calismalar.length) c.append(el('p', 'Henüz çalışma girilmedi.', 'kl-not'));
  for (const w of k.calismalar) {
    const s = el('button', undefined, 'kl-calisma');
    s.type = 'button';
    const sol = el('div');
    sol.append(el('b', w.baslik), el('small', `${tarihYaz(w.tarih)} · ${TUR[w.tur]}`));
    s.append(sol, el('span', `${w.geldi}/${w.geldi + w.gelmedi + w.izinli}`, 'kl-sayi'), el('span', '›', 'kl-git'));
    s.addEventListener('click', () => calismaDetay(k, w.id));
    c.append(s);
  }
  return c;
}

// Salt okunur ayrıntı
async function calismaDetay(k, id) {
  const r = await api('/api/kulup/calisma?id=' + id);
  if (!r.ok) return mesaj(r.veri.hata || 'Çalışma alınamadı', 'hata');
  const { calisma: w, katilim } = r.veri;
  ekranAc(kok);
  kok.append(geriDugme(k.ad, ciz));

  const ust = el('div', undefined, 'kl-ust');
  const b = el('div');
  b.append(el('h2', w.baslik, 'kl-buyuk'), el('p', `${tarihYaz(w.tarih)} · ${TUR[w.tur]}`, 'kl-not'));
  const duzenle = el('button', 'Düzenle', 'birincil kucuk');
  duzenle.type = 'button';
  duzenle.addEventListener('click', () => calismaForm(k, r.veri));
  ust.append(b, duzenle);

  const genel = el('div', undefined, 'adim');
  const gUst = el('div', undefined, 'adim-ust');
  gUst.append(el('h3', 'Çalışma'));
  genel.append(gUst, bilgi('Kulüp', k.ad), bilgi('Tarih', tarihYaz(w.tarih)), bilgi('Tür', TUR[w.tur]));
  genel.append(bilgi('Açıklama', w.aciklama || 'Açıklama girilmemiş'));

  const say = { geldi: 0, gelmedi: 0, izinli: 0 };
  for (const u of k.uyeler) { const d = katilim[u.uyelikId]; if (d) say[d]++; }
  const yok = el('div', undefined, 'adim');
  const yUst = el('div', undefined, 'adim-ust');
  yUst.append(el('h3', 'Yoklama'), el('span', `${say.geldi} geldi · ${say.gelmedi} gelmedi · ${say.izinli} izinli`, 'alt'));
  yok.append(yUst);
  if (!k.uyeler.length) yok.append(el('p', 'Kulüpte öğrenci yok.', 'kl-not'));
  for (const u of k.uyeler) {
    const s = el('div', undefined, 'kl-yok');
    const d = katilim[u.uyelikId];
    s.append(el('span', u.ad), d ? chip(DEVAM_AD[d], d === 'gelmedi' ? 'vurgu' : d === 'geldi' ? 'tamam' : '') : chip('Girilmemiş'));
    yok.append(s);
  }
  kok.append(ust, genel, yok);
}

// Düzenleme ekranı (mevcut boşsa yeni çalışma)
function calismaForm(k, mevcut) {
  ekranAc(kok);
  const ust = el('div', undefined, 'adim-ust kl-ekran-ust');
  ust.append(el('h2', mevcut ? mevcut.calisma.baslik : 'Yeni çalışma', 'kl-buyuk'), el('span', mevcut ? 'Düzenleniyor' : 'Yeni kayıt', 'rozet ' + (mevcut ? 'tamam' : 'bekliyor')));
  kok.append(ust);

  const tarih = Object.assign(el('input'), { type: 'date', value: mevcut?.calisma.tarih || veri.bugun, max: veri.bugun });
  const tur = el('select');
  secenekler(tur, Object.entries(TUR));
  tur.value = mevcut?.calisma.tur || 'deney';
  const baslik = Object.assign(el('input'), { maxLength: 100, value: mevcut?.calisma.baslik || '', placeholder: 'Örn. Basit elektrik devresi' });
  const aciklama = Object.assign(el('textarea'), { rows: 3, maxLength: 1000, value: mevcut?.calisma.aciklama || '', placeholder: 'Bu hafta ne yapıldı? (isteğe bağlı)' });
  const iki = el('div', undefined, 'kl-iki');
  iki.append(alan('Tarih', tarih), alan('Tür', tur));
  const genel = el('div', undefined, 'adim');
  const gUst = el('div', undefined, 'adim-ust');
  gUst.append(el('h3', 'Çalışma'), el('span', k.ad, 'alt'));
  genel.append(gUst, iki, alan('Başlık', baslik), alan('Açıklama', aciklama));

  const durum = {};
  const yok = el('div', undefined, 'adim');
  const yUst = el('div', undefined, 'adim-ust');
  yUst.append(el('h3', 'Yoklama'));
  yok.append(yUst);
  const yoklama = el('div', undefined, 'kl-yoklama');
  if (!k.uyeler.length) yoklama.append(el('p', 'Kulüpte öğrenci yok.', 'kl-not'));
  for (const u of k.uyeler) {
    durum[u.uyelikId] = mevcut?.katilim[u.uyelikId] || 'geldi';
    const s = el('div', undefined, 'kl-yok');
    s.append(el('span', u.ad));
    const grup = el('div', undefined, 'kl-3');
    const dugmeler = DEVAM.map(([d, e]) => {
      const x = el('button', e);
      x.type = 'button';
      x.dataset.durum = d;
      x.addEventListener('click', () => { durum[u.uyelikId] = d; isaretle(); });
      grup.append(x);
      return x;
    });
    const isaretle = () => dugmeler.forEach(x => x.setAttribute('aria-pressed', String(x.dataset.durum === durum[u.uyelikId])));
    isaretle();
    s.append(grup);
    yoklama.append(s);
  }
  yok.append(yoklama);
  kok.append(genel, yok);

  if (mevcut) {
    const sil = el('button', 'Çalışmayı sil', 'ikincil kucuk tehlike');
    sil.type = 'button';
    sil.addEventListener('click', async () => {
      if (!confirm('Bu çalışma kaydı silinsin mi?')) return;
      const r = await api('/api/kulup/calisma-sil', { id: mevcut.calisma.id });
      if (!r.ok) return mesaj(r.veri.hata || 'Silinemedi', 'hata');
      await yukle();
      mesaj('Çalışma silindi', 'tamam');
    });
    const diger = el('div', undefined, 'adim');
    const dUst = el('div', undefined, 'adim-ust');
    dUst.append(el('h3', 'Diğer işlemler'));
    diger.append(dUst, sil);
    kok.append(diger);
  }

  const vazgec = el('button', 'Vazgeç', 'ikincil');
  vazgec.type = 'button';
  vazgec.addEventListener('click', () => mevcut ? calismaDetay(k, mevcut.calisma.id) : ciz());
  const kaydet = el('button', mevcut ? 'Değişiklikleri kaydet' : 'Çalışmayı kaydet', 'birincil');
  kaydet.type = 'button';
  const cubuk = el('div', undefined, 'kaydet-cubuk');
  cubuk.append(vazgec, kaydet);
  kok.append(cubuk);

  kaydet.addEventListener('click', async () => {
    kaydet.disabled = true;
    const r = await api('/api/kulup/calisma-kaydet', {
      id: mevcut?.calisma.id, kulupId: k.id, tarih: tarih.value, tur: tur.value, baslik: baslik.value, aciklama: aciklama.value, katilim: durum,
    });
    kaydet.disabled = false;
    if (!r.ok) { mesaj(r.veri.hata || 'Kaydedilemedi', 'hata'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    await yukle(false);
    k = veri.kulupler.find(x => x.id === k.id) || k;
    if (mevcut) await calismaDetay(k, mevcut.calisma.id);
    else ciz();
    mesaj('Çalışma kaydedildi', 'tamam');
  });
  baslik.focus({ preventScroll: true });
}
