// Öğretmen: danışmanı olduğum kulüpler, üyeler ve haftalık çalışmalar (yoklamalı)
const kok = $('icerik');
let veri = null;

async function yukle() {
  const r = await api('/api/kulup/kuluplerim');
  if (!r.ok) return mesaj(r.veri.hata || 'Kulüpler alınamadı', 'hata');
  veri = r.veri;
  ciz();
}
yukle();

const chip = (m, sinif) => el('span', m, 'kl-chip' + (sinif ? ' ' + sinif : ''));
const DEVAM = [['geldi', 'Geldi'], ['gelmedi', 'Gelmedi'], ['izinli', 'İzinli']];

function ciz() {
  kok.replaceChildren();
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

  const form = el('div');
  const yeni = el('button', '+ Çalışma ekle', 'birincil kucuk');
  yeni.type = 'button';
  yeni.addEventListener('click', () => calismaForm(form, k, null));

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
  c.append(ust, form);

  if (!k.calismalar.length) c.append(el('p', 'Henüz çalışma girilmedi.', 'kl-not'));
  for (const w of k.calismalar) {
    const s = el('button', undefined, 'kl-calisma');
    s.type = 'button';
    const sol = el('div');
    sol.append(el('b', w.baslik), el('small', `${tarihYaz(w.tarih)} · ${TUR[w.tur]}`));
    s.append(sol, el('span', `${w.geldi}/${w.geldi + w.gelmedi + w.izinli}`, 'kl-sayi'));
    s.addEventListener('click', async () => {
      const r = await api('/api/kulup/calisma?id=' + w.id);
      if (!r.ok) return mesaj(r.veri.hata || 'Çalışma alınamadı', 'hata');
      calismaForm(form, k, r.veri);
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    c.append(s);
  }
  return c;
}

function calismaForm(kap, k, mevcut) {
  kap.replaceChildren();
  const f = el('form', undefined, 'kl-form');
  f.noValidate = true;
  f.append(el('h3', mevcut ? 'Çalışmayı düzenle' : 'Yeni çalışma'));
  const tarih = Object.assign(el('input'), { type: 'date', value: mevcut?.calisma.tarih || veri.bugun, max: veri.bugun });
  const tur = el('select');
  secenekler(tur, Object.entries(TUR));
  tur.value = mevcut?.calisma.tur || 'deney';
  const baslik = Object.assign(el('input'), { maxLength: 100, value: mevcut?.calisma.baslik || '', placeholder: 'Örn. Basit elektrik devresi' });
  const aciklama = Object.assign(el('textarea'), { rows: 3, maxLength: 1000, value: mevcut?.calisma.aciklama || '', placeholder: 'Bu hafta ne yapıldı? (isteğe bağlı)' });
  const iki = el('div', undefined, 'kl-iki');
  iki.append(alan('Tarih', tarih), alan('Tür', tur));
  f.append(iki, alan('Başlık', baslik), alan('Açıklama', aciklama));

  const durum = {};
  f.append(el('h4', 'Yoklama'));
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
  f.append(yoklama);

  const dugmeler = el('div', undefined, 'kl-dugmeler');
  const kaydet = el('button', 'Kaydet', 'birincil kucuk');
  kaydet.type = 'submit';
  const vazgec = el('button', 'Vazgeç', 'ikincil kucuk');
  vazgec.type = 'button';
  vazgec.addEventListener('click', () => kap.replaceChildren());
  dugmeler.append(kaydet, vazgec);
  if (mevcut) {
    const sil = el('button', 'Sil', 'ikincil kucuk tehlike');
    sil.type = 'button';
    sil.addEventListener('click', async () => {
      if (!confirm('Bu çalışma kaydı silinsin mi?')) return;
      const r = await api('/api/kulup/calisma-sil', { id: mevcut.calisma.id });
      if (!r.ok) return mesaj(r.veri.hata || 'Silinemedi', 'hata');
      await yukle();
      mesaj('Çalışma silindi', 'tamam');
    });
    dugmeler.append(sil);
  }
  f.append(dugmeler);

  f.addEventListener('submit', async e => {
    e.preventDefault();
    kaydet.disabled = true;
    const r = await api('/api/kulup/calisma-kaydet', {
      id: mevcut?.calisma.id, kulupId: k.id, tarih: tarih.value, tur: tur.value, baslik: baslik.value, aciklama: aciklama.value, katilim: durum,
    });
    kaydet.disabled = false;
    if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
    await yukle();
    mesaj('Çalışma kaydedildi', 'tamam');
  });
  kap.append(f);
  baslik.focus();
}
