// Yönetim: kulüpler, öğrenci talepleri ve kulüp saatleri
// Kulübe dokununca salt okunur ayrıntı açılır; değişiklik yalnızca "Düzenle" ile, kaydet çubuklu ekranda yapılır.
let veri = null;
const kok = $('icerik');
let sekmeAc, aktifSekme = 'kulupler';

async function yukle() {
  const r = await api('/api/kulup/yonetim');
  if (!r.ok) return mesaj(r.veri.hata || 'Kulüpler alınamadı', 'hata');
  veri = r.veri;
}

// Sekmeli ana ekran
function ana(ilk) {
  kok.replaceChildren();
  sekmeAc = sekmeler(kok, [['kulupler', 'Kulüpler'], ['talepler', 'Talepler'], ['saatler', 'Kulüp saatleri']], ilk, (ad, alan) => {
    aktifSekme = ad;
    if (ad === 'kulupler') kulupler(alan);
    else if (ad === 'talepler') talepler(alan);
    else saatler(alan);
  });
}

(async () => {
  await yukle();
  if (veri) ana('kulupler');
})();

const chip = (m, sinif) => el('span', m, 'kl-chip' + (sinif ? ' ' + sinif : ''));

async function yeniden(m) {
  await yukle();
  ana(aktifSekme);
  if (m) mesaj(m, 'tamam');
}

// ---------- Kulüpler ----------
function kulupler(alan) {
  const ust = el('div', undefined, 'kl-ust');
  const yeni = el('button', '+ Yeni kulüp', 'birincil kucuk');
  yeni.type = 'button';
  ust.append(el('p', `${veri.kulupler.filter(k => k.aktif).length} aktif kulüp`, 'kl-not'), yeni);
  const liste = el('div', undefined, 'kl-liste');
  alan.append(ust, liste);
  yeni.addEventListener('click', () => kulupForm(null));

  if (!veri.kulupler.length) liste.append(el('p', 'Henüz kulüp yok. “Yeni kulüp” ile ilkini açın.', 'bos-not'));
  for (const k of veri.kulupler) liste.append(kulupKarti(k));
}

function kulupKarti(k) {
  const kart = el('button', undefined, 'kl-kart secilebilir' + (k.aktif ? '' : ' pasif'));
  kart.type = 'button';
  const baslik = el('div', undefined, 'kl-baslik');
  const b = el('div');
  b.append(el('h3', k.ad), el('p', k.tema || ' ', 'kl-not'));
  const sag = el('div', undefined, 'kl-sag');
  sag.append(chip(`${k.uyeSayisi}/${k.kontenjan}`, k.uyeSayisi >= k.kontenjan ? 'dolu' : ''), el('span', '›', 'kl-git'));
  baslik.append(b, sag);
  kart.append(baslik, el('p', `${k.gunAd} · ${k.dersSaati}. ders ${k.aralik}`, 'kl-zaman'));
  const etiketler = el('div', undefined, 'kl-chipler');
  for (const d of k.seviyeler) etiketler.append(chip(`${d}. sınıf`));
  if (k.bekleyen) etiketler.append(chip(`${k.bekleyen} talep`, 'vurgu'));
  if (!k.aktif) etiketler.append(chip('Pasif'));
  kart.append(etiketler, el('p', k.ogretmenler.map(o => o.ad).join(', '), 'kl-kisi'));
  kart.addEventListener('click', () => kulupDetay(k.id));
  return kart;
}

// Salt okunur ayrıntı
async function kulupDetay(id) {
  const k = veri.kulupler.find(x => x.id === id);
  if (!k) return ana('kulupler');
  const r = await api('/api/kulup/uyeler?kulupId=' + id);
  if (!r.ok) return mesaj(r.veri.hata || 'Üyeler alınamadı', 'hata');
  ekranAc(kok);
  kok.append(geriDugme('Kulüpler', () => ana('kulupler')));

  const ust = el('div', undefined, 'kl-ust');
  const b = el('div');
  b.append(el('h2', k.ad, 'kl-buyuk'), el('p', k.tema || ' ', 'kl-not'));
  const duzenle = el('button', 'Düzenle', 'birincil kucuk');
  duzenle.type = 'button';
  duzenle.addEventListener('click', () => kulupForm(k));
  ust.append(b, duzenle);

  const genel = el('div', undefined, 'adim');
  const gUst = el('div', undefined, 'adim-ust');
  gUst.append(el('h3', 'Kulüp'), el('span', k.aktif ? 'Aktif' : 'Pasif', 'rozet ' + (k.aktif ? 'tamam' : 'bekliyor')));
  genel.append(gUst,
    bilgi('Zaman', `${k.gunAd} · ${k.dersSaati}. ders ${k.aralik}`),
    bilgi('Sınıflar', k.seviyeler.map(d => `${d}. sınıf`).join(', ') || '-'),
    bilgi('Öğretmenler', k.ogretmenler.map(o => o.ad).join(', ') || '-'),
    bilgi('Kontenjan', `${k.uyeSayisi} / ${k.kontenjan}` + (k.bekleyen ? ` · ${k.bekleyen} bekleyen talep` : '')));
  if (k.aciklama) genel.append(bilgi('Tanıtım', k.aciklama));

  const uyeler = el('div', undefined, 'adim');
  const uUst = el('div', undefined, 'adim-ust');
  uUst.append(el('h3', 'Üyeler'), el('span', String(r.veri.uyeler.length), 'alt'));
  uyeler.append(uUst);
  if (!r.veri.uyeler.length) uyeler.append(el('p', 'Henüz üye yok.', 'kl-not'));
  for (const u of r.veri.uyeler) {
    const s = el('div', undefined, 'kl-uye');
    s.append(el('span', u.ad), el('small', u.sinif || ''));
    uyeler.append(s);
  }
  kok.append(ust, genel, uyeler);
}

// Düzenleme ekranı (k boşsa yeni kulüp)
async function kulupForm(k) {
  let uyeListesi = [];
  if (k) {
    const r = await api('/api/kulup/uyeler?kulupId=' + k.id);
    if (!r.ok) return mesaj(r.veri.hata || 'Üyeler alınamadı', 'hata');
    uyeListesi = r.veri.uyeler;
  }
  ekranAc(kok);
  const ust = el('div', undefined, 'adim-ust kl-ekran-ust');
  ust.append(el('h2', k ? k.ad : 'Yeni kulüp', 'kl-buyuk'), el('span', k ? 'Düzenleniyor' : 'Yeni kayıt', 'rozet ' + (k ? 'tamam' : 'bekliyor')));
  kok.append(ust);

  const ad = Object.assign(el('input'), { maxLength: 60, value: k?.ad || '', placeholder: 'Örn. Robotik ve Kodlama' });
  const tema = Object.assign(el('input'), { maxLength: 60, value: k?.tema || '', placeholder: 'Örn. Bilim ve teknoloji' });
  const aciklama = Object.assign(el('textarea'), { rows: 3, maxLength: 500, value: k?.aciklama || '', placeholder: 'Öğrenci ve velinin göreceği kısa tanıtım' });
  const kontenjan = Object.assign(el('input'), { type: 'number', min: 1, max: 300, value: k?.kontenjan || 20, inputMode: 'numeric' });
  const gun = el('select'), saat = el('select');
  secenekler(gun, veri.gunler.map(g => [g.gun, g.ad]), 'Gün seçin');
  secenekler(saat, veri.zamanlar.map((z, i) => [i + 1, `${i + 1}. ders · ${z}`]), 'Ders saati seçin');
  if (k) { gun.value = String(k.gun); saat.value = String(k.dersSaati); }

  const bilgiKutu = el('div', undefined, 'adim');
  const zaman = el('div', undefined, 'kl-iki');
  zaman.append(alan('Gün', gun), alan('Ders saati', saat));
  bilgiKutu.append(el('div', undefined, 'adim-ust'), alan('Kulüp adı', ad), alan('Tema (isteğe bağlı)', tema), alan('Tanıtım (isteğe bağlı)', aciklama),
    alan('Kontenjan', kontenjan), zaman);
  bilgiKutu.firstChild.append(el('h3', 'Bilgiler'));

  const secimKutusu = (baslik, ipucu, ogeler, secili) => {
    const kutu = el('div', undefined, 'adim');
    const u = el('div', undefined, 'adim-ust');
    u.append(el('h3', baslik));
    kutu.append(u);
    if (ipucu) kutu.append(el('p', ipucu, 'kl-not'));
    const girdiler = [];
    const sar = el('div', undefined, 'kl-secenekler');
    for (const [deger, etiket] of ogeler) {
      const l = el('label', undefined, 'kl-sec');
      const g = el('input');
      g.type = 'checkbox';
      g.value = String(deger);
      g.checked = secili.includes(String(deger));
      l.append(g, el('span', etiket));
      sar.append(l);
      girdiler.push(g);
    }
    kutu.append(sar);
    kok.append(kutu);
    return () => girdiler.filter(g => g.checked).map(g => g.value);
  };
  kok.append(bilgiKutu);
  const duzeyler = secimKutusu('Hangi sınıflar katılabilir', 'Seçilen düzeylerin programında bu gün ve saatte “Kulüp” dersi olmalı (Kulüp saatleri sekmesi).',
    veri.duzeyler.map(d => [d, `${d}. sınıf`]), k?.seviyeler || []);
  const hocalar = secimKutusu('Kulüp öğretmenleri', '', veri.ogretmenler.map(o => [o.uyelikId, o.ad]), (k?.ogretmenler || []).map(o => String(o.uyelikId)));

  if (k) {
    // Üye çıkarma, pasife alma ve silme yalnızca düzenleme ekranında
    const uyeler = el('div', undefined, 'adim');
    const uUst = el('div', undefined, 'adim-ust');
    uUst.append(el('h3', 'Üyeler'));
    uyeler.append(uUst);
    if (!uyeListesi.length) uyeler.append(el('p', 'Henüz üye yok.', 'kl-not'));
    for (const u of uyeListesi) {
      const s = el('div', undefined, 'kl-uye');
      s.append(el('span', u.ad), el('small', u.sinif || ''));
      const c = el('button', 'Çıkar', 'kl-mini');
      c.type = 'button';
      c.addEventListener('click', async () => {
        if (!confirm(`${u.ad} kulüpten çıkarılsın mı?`)) return;
        const x = await api('/api/kulup/cikar', { ogrenciId: u.uyelikId });
        if (!x.ok) return mesaj(x.veri.hata || 'Çıkarılamadı', 'hata');
        s.remove();
        mesaj(`${u.ad} kulüpten çıkarıldı`, 'tamam');
      });
      s.append(c);
      uyeler.append(s);
    }

    const diger = el('div', undefined, 'adim');
    const dUst = el('div', undefined, 'adim-ust');
    dUst.append(el('h3', 'Diğer işlemler'));
    const dugmeler = el('div', undefined, 'kl-dugmeler');
    const dugme = (m, f, sinif) => { const d = el('button', m, 'ikincil kucuk ' + (sinif || '')); d.type = 'button'; d.addEventListener('click', f); dugmeler.append(d); };
    dugme(k.aktif ? 'Pasife al' : 'Aktif et', async () => {
      const r = await api('/api/kulup/durum', { id: k.id, aktif: !k.aktif });
      if (!r.ok) return mesaj(r.veri.hata || 'Güncellenemedi', 'hata');
      await yeniden(k.aktif ? 'Kulüp pasife alındı' : 'Kulüp aktif');
    });
    dugme('Kulübü sil', async () => {
      if (!confirm(`${k.ad} silinsin mi?`)) return;
      const r = await api('/api/kulup/sil', { id: k.id });
      if (!r.ok) return mesaj(r.veri.hata || 'Silinemedi', 'hata');
      await yeniden('Kulüp silindi');
    }, 'tehlike');
    diger.append(dUst, dugmeler);
    kok.append(uyeler, diger);
  }

  const vazgec = el('button', 'Vazgeç', 'ikincil');
  vazgec.type = 'button';
  vazgec.addEventListener('click', async () => {
    if (!k) return ana('kulupler');
    await yukle();
    kulupDetay(k.id);
  });
  const kaydet = el('button', k ? 'Değişiklikleri kaydet' : 'Kulübü aç', 'birincil');
  kaydet.type = 'button';
  const cubuk = el('div', undefined, 'kaydet-cubuk');
  cubuk.append(vazgec, kaydet);
  kok.append(cubuk);

  kaydet.addEventListener('click', async () => {
    kaydet.disabled = true;
    const r = await api('/api/kulup/kaydet', {
      id: k?.id, ad: ad.value, tema: tema.value, aciklama: aciklama.value, kontenjan: Number(kontenjan.value),
      gun: gun.value, dersSaati: Number(saat.value), seviyeler: duzeyler(), ogretmenler: hocalar().map(Number),
    });
    kaydet.disabled = false;
    if (!r.ok) { mesaj(r.veri.hata || 'Kaydedilemedi', 'hata'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    await yukle();
    if (!k) return yeniden('Kulüp açıldı');
    await kulupDetay(k.id);
    mesaj('Kulüp güncellendi', 'tamam');
  });
  ad.focus({ preventScroll: true });
}

// ---------- Talepler ----------
async function talepler(alan) {
  const r = await api('/api/kulup/talepler');
  if (!r.ok) return mesaj(r.veri.hata || 'Talepler alınamadı', 'hata');
  const ogrenciler = r.veri.ogrenciler;
  const bekleyen = ogrenciler.filter(o => !o.uye).length;
  alan.append(el('p', ogrenciler.length ? `${bekleyen} öğrenci yerleştirme bekliyor · ${ogrenciler.length - bekleyen} öğrenci yerleştirildi` : 'Henüz kulüp talebi gelmedi.', 'kl-not'));
  const liste = el('div', undefined, 'kl-liste');
  alan.append(liste);
  for (const o of ogrenciler) {
    const kart = el('article', undefined, 'kl-kart');
    const baslik = el('div', undefined, 'kl-baslik');
    const b = el('div');
    b.append(el('h3', o.ad), el('p', [o.sinif, o.okulNo && 'No ' + o.okulNo].filter(Boolean).join(' · '), 'kl-not'));
    baslik.append(b);
    if (o.uye) baslik.append(chip(o.uye.ad, 'tamam'));
    kart.append(baslik);
    for (const t of o.talepler) {
      const s = el('div', undefined, 'kl-talep');
      s.append(el('b', `${t.sira}.`), el('span', t.kulup));
      if (t.durum === 'red') s.append(chip('Yerleşmedi'));
      else if (t.durum === 'kabul') s.append(chip('Yerleşti', 'tamam'));
      else {
        const y = el('button', 'Yerleştir', 'kl-mini');
        y.type = 'button';
        y.addEventListener('click', async () => {
          y.disabled = true;
          const x = await api('/api/kulup/yerlestir', { ogrenciId: o.uyelikId, kulupId: t.kulupId });
          if (!x.ok) { y.disabled = false; return mesaj(x.veri.hata || 'Yerleştirilemedi', 'hata'); }
          await yukle();
          sekmeAc('talepler');
          mesaj(`${o.ad} → ${t.kulup}`, 'tamam');
        });
        const red = el('button', 'Reddet', 'kl-mini');
        red.type = 'button';
        red.addEventListener('click', async () => {
          const x = await api('/api/kulup/red', { talepId: t.id });
          if (!x.ok) return mesaj(x.veri.hata || 'Güncellenemedi', 'hata');
          sekmeAc('talepler');
        });
        s.append(y, red);
      }
      kart.append(s);
    }
    if (o.uye) {
      const c = el('button', 'Kulüpten çıkar', 'kl-mini');
      c.type = 'button';
      c.addEventListener('click', async () => {
        const x = await api('/api/kulup/cikar', { ogrenciId: o.uyelikId });
        if (!x.ok) return mesaj(x.veri.hata || 'Çıkarılamadı', 'hata');
        await yukle();
        sekmeAc('talepler');
      });
      kart.append(c);
    }
    liste.append(kart);
  }
}

// ---------- Kulüp saatleri ----------
function saatler(alan) {
  alan.append(el('p', 'Kulüp, sınıfların haftalık programında “Kulüp” dersi olarak yer alır. Bir düzeydeki tüm sınıflara aynı gün ve saati verin; sonra o saati kulüplere atayın.', 'kl-not'));
  const f = el('form', undefined, 'kl-form');
  const dz = el('select'), gun = el('select'), saat = el('select');
  secenekler(dz, veri.duzeyler.map(d => [d, `${d}. sınıflar (${veri.sinifSayisi[d]} şube)`]), 'Düzey');
  secenekler(gun, veri.gunler.map(g => [g.gun, g.ad]), 'Gün');
  secenekler(saat, veri.zamanlar.map((z, i) => [i + 1, `${i + 1}. ders · ${z}`]), 'Ders saati');
  const sira = el('div', undefined, 'kl-uc');
  sira.append(alan_('Düzey', dz), alan_('Gün', gun), alan_('Ders saati', saat));
  const ekle = el('button', 'Programa ekle', 'birincil kucuk');
  ekle.type = 'submit';
  f.append(sira, ekle);
  alan.append(f);
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (!dz.value || !gun.value || !saat.value) return mesaj('Düzey, gün ve ders saatini seçin', 'hata');
    const r = await api('/api/kulup/saat', { duzey: dz.value, gun: Number(gun.value), saat: Number(saat.value) });
    if (!r.ok) return mesaj(r.veri.hata || 'Eklenemedi', 'hata');
    await yukle();
    sekmeAc('saatler');
    const atlanan = r.veri.atlanan;
    mesaj(`${r.veri.yerlesen} sınıfın programına eklendi` + (atlanan.length ? `; ${atlanan.map(a => `${a.sinif} (${a.ders})`).join(', ')} sınıfında o saat dolu olduğu için atlandı` : ''), atlanan.length ? 'hata' : 'tamam');
  });

  const liste = el('div', undefined, 'kl-liste');
  alan.append(liste);
  if (!veri.kulupSaatleri.length) liste.append(el('p', 'Henüz kulüp saati tanımlanmadı.', 'bos-not'));
  for (const s of veri.kulupSaatleri) {
    const kart = el('article', undefined, 'kl-kart kl-satir');
    const b = el('div');
    b.append(el('h3', `${s.duzey}. sınıflar`), el('p', `${s.gunAd} · ${s.saat}. ders ${s.aralik} · ${s.sinif} şube`, 'kl-not'));
    const kaldir = el('button', 'Kaldır', 'kl-mini');
    kaldir.type = 'button';
    kaldir.addEventListener('click', async () => {
      if (!confirm(`${s.duzey}. sınıfların ${s.gunAd} ${s.saat}. ders kulüp saati kaldırılsın mı?`)) return;
      const r = await api('/api/kulup/saat', { duzey: s.duzey, gun: s.gun, saat: s.saat, kaldir: true });
      if (!r.ok) return mesaj(r.veri.hata || 'Kaldırılamadı', 'hata');
      await yukle();
      sekmeAc('saatler');
      mesaj('Kulüp saati kaldırıldı', 'tamam');
    });
    kart.append(b, kaldir);
    liste.append(kart);
  }
}
function alan_(etiket, girdi) { return alan(etiket, girdi); }
