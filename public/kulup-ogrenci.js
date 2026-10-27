// Öğrenci / veli: kulüp tercihleri (en çok 3 talep) ve yerleştirildiği kulüp
const kok = $('icerik');
let cocuk = null;
const DEVAM = { geldi: 'Geldi', gelmedi: 'Gelmedi', izinli: 'İzinli' };
const DURUM = { bekliyor: 'Değerlendiriliyor', kabul: 'Yerleştirildi', red: 'Yerleşilemedi' };
const DURUM_SINIF = { bekliyor: 'vurgu', kabul: 'tamam', red: 'dolu' };

const chip = (m, sinif) => el('span', m, 'kl-chip' + (sinif ? ' ' + sinif : ''));

async function yukle() {
  const r = await api('/api/kulup/benim' + (cocuk ? '?cocuk=' + cocuk : ''));
  if (!r.ok) return mesaj(r.veri.hata || 'Bilgiler alınamadı', 'hata');
  ciz(r.veri);
}
yukle();

function ciz(v) {
  kok.replaceChildren();
  cocuk = v.cocuk;
  if (!v.cocuk) return kok.append(el('p', 'Bağlı öğrenci bulunamadı.', 'bos-not'));
  if (v.cocuklar.length > 1) {
    const sec = el('select', undefined, 'kl-cocuk');
    for (const c of v.cocuklar) sec.append(Object.assign(el('option', c.ad), { value: c.id }));
    sec.value = String(v.cocuk);
    sec.addEventListener('change', () => { cocuk = Number(sec.value); yukle(); });
    kok.append(sec);
  }
  if (!v.sinif) return kok.append(el('p', 'Öğrenci bir sınıfa kayıtlı değil.', 'bos-not'));
  if (v.uye) return kok.append(kulubum(v.uye));
  tercihler(v);
}

function kulubum(k) {
  const kap = el('div');
  const kart = el('article', undefined, 'kl-kart buyuk');
  const baslik = el('div', undefined, 'kl-baslik');
  const b = el('div');
  b.append(el('h3', k.ad), el('p', k.tema || ' ', 'kl-not'));
  baslik.append(b, chip('Kulübüm', 'tamam'));
  kart.append(baslik, el('p', `${k.gunAd} · ${k.dersSaati}. ders ${k.aralik}`, 'kl-zaman'),
    el('p', 'Danışman: ' + k.ogretmenler.map(o => o.ad).join(', '), 'kl-kisi'));
  if (k.aciklama) kart.append(el('p', k.aciklama, 'kl-aciklama'));
  kap.append(kart, el('h4', 'Sonraki etkinlikler'));
  for (const p of k.planlar) {
    const s = el('div', undefined, 'kl-calisma sade');
    const sol = el('div');
    sol.append(el('b', p.baslik || 'Henüz belirlenmedi', p.baslik ? '' : 'kl-bos'), el('small', p.baslik ? `${tarihYaz(p.tarih)} · ${TUR[p.tur]}` : tarihYaz(p.tarih)));
    if (p.aciklama) sol.append(el('p', p.aciklama, 'kl-aciklama'));
    s.append(sol);
    kap.append(s);
  }
  if (!k.planlar.length) kap.append(el('p', 'Yaklaşan ders günü yok.', 'bos-not'));
  kap.append(el('h4', 'Geçmiş çalışmalar'));
  if (!k.calismalar.length) kap.append(el('p', 'Henüz çalışma girilmedi.', 'bos-not'));
  for (const w of k.calismalar) {
    const s = el('div', undefined, 'kl-calisma sade');
    const sol = el('div');
    sol.append(el('b', w.baslik), el('small', `${tarihYaz(w.tarih)} · ${TUR[w.tur]}`));
    if (w.aciklama) sol.append(el('p', w.aciklama, 'kl-aciklama'));
    s.append(sol);
    if (w.devam) s.append(chip(DEVAM[w.devam], w.devam === 'gelmedi' ? 'vurgu' : ''));
    kap.append(s);
  }
  return kap;
}

function tercihler(v) {
  // Sıra = tercih sırası; yalnızca bekleyen/ret talepler düzenlenebilir (kabul varsa kulüp ekranı açılır)
  const secili = v.talepler.map(t => t.kulupId);
  const ilk = JSON.stringify(secili);
  const durum = Object.fromEntries(v.talepler.map(t => [t.kulupId, t.durum]));

  // Durum özeti: şu an ne aşamadayız?
  const durumKutu = el('section', undefined, 'kl-durum');
  if (!v.talepler.length) {
    durumKutu.append(chip('Tercih yapılmadı', 'vurgu'), el('h3', 'Henüz kulüp tercihi yapılmadı'),
      el('p', `Aşağıdan en çok ${v.talepSiniri} kulüp seçin. Seçme sırası tercih sıranızdır: önce seçtiğiniz kulüp 1. tercihtir.`, 'kl-not'));
  } else {
    durumKutu.append(chip('Tercih gönderildi', 'tamam'), el('h3', 'Tercihleriniz okula iletildi'),
      el('p', 'Okul yerleştirmeyi yaptığında kulübünüz bu sayfada görünür. O zamana kadar tercihlerinizi değiştirebilirsiniz.', 'kl-not'));
    const sirali = el('div', undefined, 'kl-tercih-sira');
    for (const t of v.talepler) {
      const r = el('div', undefined, 'kl-tercih-satir');
      r.append(el('span', String(t.sira), 'kl-sira'), el('b', t.kulup), chip(DURUM[t.durum], DURUM_SINIF[t.durum]));
      sirali.append(r);
    }
    durumKutu.append(sirali);
  }
  kok.append(durumKutu);
  if (!v.kulupler.length) return kok.append(el('p', `${v.sinif} sınıfı için açık kulüp yok.`, 'bos-not'));
  kok.append(el('h4', 'Kulüpler'), el('p', 'Bir kulübe dokunarak seçin, tekrar dokunarak seçimi kaldırın. Dolu görünen kulüpler de seçilebilir.', 'kl-not'));

  const liste = el('div', undefined, 'kl-liste');
  const kaydet = el('button', 'Kulüp seçin', 'birincil');
  kaydet.type = 'button';
  const cubuk = el('div', undefined, 'pf-kaydet');
  cubuk.append(kaydet);
  kok.append(liste, cubuk);

  function ciz2() {
    liste.replaceChildren();
    for (const k of v.kulupler) {
      const sira = secili.indexOf(k.id) + 1;
      const kart = el('button', undefined, 'kl-kart secilebilir' + (sira ? ' secili' : ''));
      kart.type = 'button';
      kart.setAttribute('aria-pressed', String(!!sira));
      const baslik = el('div', undefined, 'kl-baslik');
      const b = el('div');
      b.append(el('h3', k.ad), el('p', k.tema || ' ', 'kl-not'));
      const sag = el('div', undefined, 'kl-sag');
      if (sira) sag.append(chip(`${sira}. tercih`, 'tamam'));
      else sag.append(chip(k.uyeSayisi >= k.kontenjan ? 'Dolu' : 'Seç', k.uyeSayisi >= k.kontenjan ? 'dolu' : ''));
      baslik.append(b, sag);
      kart.append(baslik, el('p', `${k.gunAd} · ${k.dersSaati}. ders ${k.aralik}`, 'kl-zaman'));
      if (k.aciklama) kart.append(el('p', k.aciklama, 'kl-aciklama'));
      kart.append(el('p', `Danışman: ${k.ogretmenler.map(o => o.ad).join(', ')} · ${k.uyeSayisi}/${k.kontenjan} kişi`, 'kl-kisi'));
      if (sira && durum[k.id] && durum[k.id] !== 'bekliyor') kart.append(chip(DURUM[durum[k.id]]));
      kart.addEventListener('click', () => {
        const i = secili.indexOf(k.id);
        if (i >= 0) secili.splice(i, 1);
        else if (secili.length >= v.talepSiniri) return mesaj(`En fazla ${v.talepSiniri} kulüp seçebilirsiniz`, 'hata');
        else secili.push(k.id);
        mesaj('');
        ciz2();
      });
      liste.append(kart);
    }
    const degisti = JSON.stringify(secili) !== ilk;
    kaydet.disabled = !degisti;
    kaydet.textContent = degisti ? (secili.length ? `Tercihleri gönder (${secili.length})` : 'Tercihleri kaldır') : (v.talepler.length ? 'Tercihler gönderildi' : 'Kulüp seçin');
  }
  ciz2();

  kaydet.addEventListener('click', async () => {
    kaydet.disabled = true;
    const r = await api('/api/kulup/talep', { cocuk: v.cocuk, kulupler: secili });
    if (!r.ok) { kaydet.disabled = false; return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata'); }
    await yukle();
    mesaj(secili.length ? 'Talebiniz alındı; okul yerleştirdiğinde bu sayfada görünür' : 'Talepleriniz kaldırıldı', 'tamam');
  });
}
