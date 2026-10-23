// Gelişim raporu: ortak yardımcılar, öğrenci raporu çizimi ve role göre ekran seçimi (yonetim / ogretmen)
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
const tarihYaz = t => { const [y, a, g] = t.split('-').map(Number); return `${g} ${AYLAR[a - 1]} ${y}`; };
const kisaTarih = t => { const [, a, g] = t.split('-').map(Number); return `${g} ${AYLAR[a - 1]}`; };
const aralikYaz = d => `${kisaTarih(d.baslangic)} – ${tarihYaz(d.bitis)}`;
const DURUM = { acik: 'Açık', yaklasan: 'Yaklaşan', kapandi: 'Kapandı' };
const DURUM_SINIF = { acik: 'tamam', yaklasan: 'bekliyor', kapandi: 'iptal' };
const GOR_TUR = { toplanti: 'Veli toplantısı', gorusme: 'Veli görüşmesi' };
const durumRozeti = d => el('span', DURUM[d.durum], 'rozet ' + DURUM_SINIF[d.durum]);
const chip = (m, sinif) => el('span', m, 'kl-chip' + (sinif ? ' ' + sinif : ''));

function alan(etiket, girdi, sinif) {
  const k = el('div', undefined, 'kl-alan' + (sinif ? ' ' + sinif : ''));
  const l = el('label', etiket);
  girdi.id = girdi.id || 'gz-' + Math.random().toString(36).slice(2, 8);
  l.htmlFor = girdi.id;
  k.append(l, girdi);
  return k;
}
function secenekler(sel, liste, bos) {
  sel.replaceChildren();
  if (bos) sel.append(Object.assign(el('option', bos), { value: '' }));
  for (const [d, e] of liste) sel.append(Object.assign(el('option', e), { value: String(d) }));
}
// Hap sekmeler: ciz(ad, alan) seçilen sekmenin içeriğini çizer
function sekmeler(kap, liste, ilk, ciz) {
  const bar = el('div', undefined, 'sekmeler');
  const dugmeler = liste.map(([ad, etiket]) => {
    const b = el('button', etiket);
    b.type = 'button';
    b.addEventListener('click', () => ac(ad));
    bar.append(b);
    return [ad, b];
  });
  const kutu = el('div');
  kap.append(bar, kutu);
  function ac(ad) {
    for (const [a, b] of dugmeler) b.setAttribute('aria-pressed', String(a === ad));
    mesaj('');
    kutu.replaceChildren();
    ciz(ad, kutu);
  }
  ac(ilk);
  return ac;
}
function geriDugme(metin, f) {
  const b = el('button', '← ' + metin, 'kl-geri');
  b.type = 'button';
  b.addEventListener('click', f);
  return b;
}
function bilgi(etiket, deger) {
  const s = el('div', undefined, 'kl-bilgi');
  s.append(el('small', etiket), typeof deger === 'string' ? el('span', deger) : deger);
  return s;
}
// Ekran değişince başa dön, eski mesajı sil
function ekranAc(kok) { mesaj(''); window.scrollTo(0, 0); kok.replaceChildren(); }
function bolum(baslik, sag) {
  const k = el('div', undefined, 'adim');
  const u = el('div', undefined, 'adim-ust');
  u.append(el('h3', baslik));
  if (sag) u.append(typeof sag === 'string' ? el('span', sag, 'alt') : sag);
  k.append(u);
  return k;
}

// Veli toplantısı / görüşmesi notu ekleme ve düzenleme formu (isteğe bağlı döneme bağlanır)
function gorusmeForm({ ogrenciId, donemler, bugun, mevcut, bitince, vazgec }) {
  const kap = el('div', undefined, 'kl-form');
  kap.append(el('h3', mevcut ? 'Notu düzenle' : 'Toplantı / görüşme notu'));
  const tur = el('select');
  secenekler(tur, Object.entries(GOR_TUR));
  tur.value = mevcut?.tur || 'gorusme';
  const tarih = Object.assign(el('input'), { type: 'date', value: mevcut?.tarih || bugun });
  const donem = el('select');
  secenekler(donem, donemler.map(d => [d.id, d.ad]), 'Döneme bağlama');
  const varsayilan = mevcut ? mevcut.donemId : (donemler.find(d => d.baslangic <= bugun && bugun <= d.bitis) || [...donemler].reverse().find(d => d.bitis < bugun))?.id;
  donem.value = varsayilan ? String(varsayilan) : '';
  const notu = Object.assign(el('textarea'), { rows: 4, maxLength: 2000, value: mevcut?.notu || '', placeholder: 'Neler konuşuldu, alınan kararlar, veliye verilen öneriler' });
  const iki = el('div', undefined, 'kl-iki');
  iki.append(alan('Tür', tur), alan('Tarih', tarih));
  kap.append(iki, alan('Dönem', donem), alan('Not', notu));
  const dugmeler = el('div', undefined, 'kl-dugmeler');
  const iptal = el('button', 'Vazgeç', 'ikincil kucuk'); iptal.type = 'button';
  const kaydet = el('button', 'Kaydet', 'birincil kucuk'); kaydet.type = 'button';
  dugmeler.append(iptal, kaydet);
  kap.append(dugmeler);
  iptal.addEventListener('click', vazgec);
  kaydet.addEventListener('click', async () => {
    kaydet.disabled = true;
    const r = await api('/api/gelisim/gorusme-kaydet', { id: mevcut?.id, ogrenciId, tur: tur.value, tarih: tarih.value, donemId: donem.value || null, notu: notu.value });
    kaydet.disabled = false;
    if (!r.ok) return mesaj(r.veri.hata || 'Kaydedilemedi', 'hata');
    bitince(mevcut ? 'Not güncellendi' : 'Not eklendi');
  });
  return kap;
}

// Görüşme satırı: tür, tarih, yazan ve not; yazarsa Düzenle / Sil (yazdırmada görünmez)
function gorusmeSatiri(g, { duzenle, sil }) {
  const s = el('div', undefined, 'gz-giris');
  const ust = el('div', undefined, 'gz-giris-ust');
  ust.append(el('b', GOR_TUR[g.tur]), el('small', `${tarihYaz(g.tarih)} · ${g.yazan}`));
  s.append(ust, el('p', g.notu));
  if (g.duzenlenebilir && duzenle) {
    const arac = el('div', undefined, 'kl-dugmeler gz-arac');
    const d = el('button', 'Düzenle', 'kl-mini'); d.type = 'button'; d.addEventListener('click', () => duzenle(g));
    const x = el('button', 'Sil', 'kl-mini'); x.type = 'button';
    x.addEventListener('click', async () => {
      if (!confirm('Bu not silinsin mi?')) return;
      const r = await api('/api/gelisim/gorusme-sil', { id: g.id });
      if (!r.ok) return mesaj(r.veri.hata || 'Silinemedi', 'hata');
      sil();
    });
    arac.append(d, x);
    s.append(arac);
  }
  return s;
}

// Öğrenci raporu: seçili dönemler, her dönemde başlık başlık öğretmen yorumları, ardından veli toplantısı ve görüşmeler.
// Yönetim için tüm öğretmenler, öğretmen için yalnızca kendi girişleri gelir (sunucu böyle gönderir).
function raporCiz(kap, v, secili, { duzenle, sil } = {}) {
  kap.replaceChildren();
  const r = el('article', undefined, 'gz-rapor');
  const ust = el('div', undefined, 'gz-rapor-ust');
  ust.append(el('p', 'AKANT KOLEJİ · Öğrenci gelişim raporu', 'gz-kurum'), el('h2', v.ogrenci.ad, 'kl-buyuk'),
    el('p', `${v.ogrenci.sinif}${v.ogrenci.okulNo ? ' · No ' + v.ogrenci.okulNo : ''} · Düzenlenme: ${tarihYaz(v.bugun)}`, 'kl-not'));
  r.append(ust);

  const donemler = v.donemler.filter(d => secili.has(d.id));
  if (!donemler.length) r.append(el('p', 'Rapor için en az bir dönem seçin.', 'bos-not'));
  for (const d of donemler) {
    const b = el('section', undefined, 'gz-donem');
    const bas = el('div', undefined, 'gz-donem-ust');
    bas.append(el('h3', d.ad), el('small', `${aralikYaz(d)}${d.toplantiTarihi ? ' · Veli toplantısı: ' + tarihYaz(d.toplantiTarihi) : ''}`));
    b.append(bas);
    let dolu = false;
    for (const bl of v.basliklar) {
      const gir = d.girisler.filter(g => g.baslikId === bl.id);
      if (!gir.length) continue;
      dolu = true;
      const k = el('div', undefined, 'gz-baslik');
      k.append(el('h4', bl.ad));
      for (const g of gir) {
        const s = el('div', undefined, 'gz-giris');
        s.append(el('small', `${g.ogretmen}${g.ders ? ' · ' + g.ders : ''}`), el('p', g.metin));
        k.append(s);
      }
      b.append(k);
    }
    if (!dolu) b.append(el('p', 'Bu dönem için öğretmen girişi yok.', 'kl-not'));
    if (d.gorusmeler.length) {
      const k = el('div', undefined, 'gz-baslik');
      k.append(el('h4', 'Veli toplantısı ve görüşmeler'));
      for (const g of d.gorusmeler) k.append(gorusmeSatiri(g, { duzenle, sil }));
      b.append(k);
    }
    r.append(b);
  }
  if (v.donemsizGorusmeler.length) {
    const b = el('section', undefined, 'gz-donem');
    b.append(el('div', undefined, 'gz-donem-ust'));
    b.firstChild.append(el('h3', 'Diğer görüşmeler'));
    for (const g of v.donemsizGorusmeler) b.append(gorusmeSatiri(g, { duzenle, sil }));
    r.append(b);
  }
  kap.append(r);
}

(async () => {
  const r = await api('/api/ben');
  if (!r.ok) return;
  const rol = r.veri.rol;
  if (rol !== 'yonetim' && rol !== 'ogretmen') return mesaj('Bu sayfa rolünüze açık değil', 'hata');
  $('baslik').textContent = rol === 'yonetim' ? 'Gelişim raporu' : 'Gelişim gözlemleri';
  const s = document.createElement('script');
  s.src = `/gelisim-${rol}.js`;
  document.body.append(s);
})();
