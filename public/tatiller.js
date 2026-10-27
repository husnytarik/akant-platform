// Okul takvimi: tatiller ve özel günler. O günlerde ders programı, yoklama ve etüt ekranları "tatil" gösterir.
(() => {
  const kok = document.getElementById('tatil-bolum');
  const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const TURLER = { resmi: 'Resmi tatil', dini: 'Dini bayram', ara: 'Ara tatil', ozel: 'Özel gün' };
  // Her yıl aynı tarihe denk gelen resmi tatiller (dini bayramlar ve ara tatiller her yıl değiştiği için elle eklenir)
  const SABIT = [
    ['01-01', 'Yılbaşı'], ['04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'], ['05-01', 'Emek ve Dayanışma Günü'],
    ['05-19', 'Atatürk\'ü Anma, Gençlik ve Spor Bayramı'], ['07-15', 'Demokrasi ve Millî Birlik Günü'],
    ['08-30', 'Zafer Bayramı'], ['10-29', 'Cumhuriyet Bayramı'],
  ];
  let tatiller = [];

  const el = (tag, metin, sinif) => {
    const e = document.createElement(tag);
    if (metin !== undefined) e.textContent = metin;
    if (sinif) e.className = sinif;
    return e;
  };
  const mesaj = (metin, tur = '') => { const m = document.getElementById('mesaj'); m.textContent = metin; m.className = 'mesaj ' + tur; };
  const bugun = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
  const kisa = t => `${Number(t.slice(8))} ${AYLAR[Number(t.slice(5, 7)) - 1]}${t.slice(0, 4) !== bugun().slice(0, 4) ? ' ' + t.slice(0, 4) : ''}`;
  const aralik = x => x.baslangic === x.bitis ? kisa(x.baslangic) : `${kisa(x.baslangic)} – ${kisa(x.bitis)}`;

  async function api(yol, govde) {
    const r = await fetch(yol, govde === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(govde) });
    return { ok: r.ok, veri: await r.json().catch(() => ({})) };
  }

  async function ekle(govde) {
    const r = await api('/api/tatil/ekle', govde);
    if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
    mesaj(`${govde.ad} eklendi.`, 'tamam');
    yukle();
  }

  function alan(etiket, kontrol, id) {
    kontrol.id = id;
    const l = el('label', etiket); l.htmlFor = id;
    const kap = document.createElement('div');
    kap.append(l, kontrol);
    return kap;
  }

  function form() {
    const f = el('form', undefined, 'ekle-form gizli');
    const ad = el('input'); ad.maxLength = 80; ad.required = true; ad.placeholder = 'Örn. Ramazan Bayramı';
    const tur = el('select');
    for (const [d, e] of Object.entries(TURLER)) tur.append(Object.assign(el('option', e), { value: d }));
    const bas = el('input'); bas.type = 'date'; bas.required = true;
    const bit = el('input'); bit.type = 'date';
    bas.addEventListener('change', () => { if (!bit.value || bit.value < bas.value) bit.value = bas.value; });
    const satir = el('div', undefined, 'form-satir');
    satir.append(alan('Başlangıç', bas, 'tt-bas'), alan('Bitiş', bit, 'tt-bit'));
    const b = el('button', 'Ekle', 'birincil'); b.type = 'submit';
    f.append(alan('Tatilin adı', ad, 'tt-ad'), alan('Tür', tur, 'tt-tur'), satir, b);
    f.addEventListener('submit', e => { e.preventDefault(); ekle({ ad: ad.value, tur: tur.value, baslangic: bas.value, bitis: bit.value || bas.value }); });
    return f;
  }

  function oneriler() {
    const t = bugun();
    const liste = SABIT.map(([md, ad]) => {
      const yil = Number(t.slice(0, 4));
      return { tarih: `${yil}-${md}` >= t ? `${yil}-${md}` : `${yil + 1}-${md}`, ad };
    }).filter(x => !tatiller.some(y => y.baslangic === x.tarih)).sort((a, b) => a.tarih.localeCompare(b.tarih));
    if (!liste.length) return null;
    const k = el('div', undefined, 'tatil-oneri');
    k.append(el('p', 'Resmi tatil önerileri (dokununca eklenir)', 'alt'));
    const cipler = el('div', undefined, 'tatil-cipler');
    for (const x of liste) {
      const b = el('button', `${kisa(x.tarih)} · ${x.ad}`, 'tatil-cip'); b.type = 'button';
      b.addEventListener('click', () => ekle({ ad: x.ad, tur: 'resmi', baslangic: x.tarih, bitis: x.tarih }));
      cipler.append(b);
    }
    k.append(cipler);
    return k;
  }

  function satir(x) {
    const kart = el('div', undefined, 'not-kart');
    const ust = el('div', undefined, 'not-ust');
    ust.append(el('strong', x.ad), el('span', aralik(x), 'alt'));
    const s = el('button', 'Sil', 'ikincil tehlike kucuk'); s.type = 'button';
    s.addEventListener('click', async () => {
      if (!confirm(`"${x.ad}" tatili silinsin mi?`)) return;
      const r = await api('/api/tatil/sil', { id: x.id });
      if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
      mesaj('Tatil silindi.', 'tamam');
      yukle();
    });
    kart.append(ust, el('p', TURLER[x.tur]), s);
    return kart;
  }

  function ciz() {
    kok.replaceChildren();
    const f = form();
    const ust = el('div', undefined, 'ekle-ust');
    const d = el('button', '+ Tatil ekle', 'ekle-ac'); d.type = 'button';
    d.addEventListener('click', () => {
      const kapali = f.classList.toggle('gizli');
      d.textContent = kapali ? '+ Tatil ekle' : 'Vazgeç';
      d.classList.toggle('acik', !kapali);
    });
    ust.append(el('h3', 'Tatiller ve özel günler', 'baslik3'), d);
    kok.append(ust, f);
    const o = oneriler();
    if (o) kok.append(o);
    const t = bugun();
    const yaklasan = tatiller.filter(x => x.bitis >= t), gecmis = tatiller.filter(x => x.bitis < t).reverse();
    if (!tatiller.length) kok.append(el('p', 'Henüz tatil eklenmedi. Tatil günlerinde ders programı, yoklama ve etüt ekranları "tatil" gösterir.', 'alt'));
    for (const x of yaklasan) kok.append(satir(x));
    if (gecmis.length) {
      const g = el('details', undefined, 'tatil-gecmis');
      g.append(el('summary', `Geçmiş tatiller (${gecmis.length})`));
      for (const x of gecmis) g.append(satir(x));
      kok.append(g);
    }
  }

  async function yukle() {
    const r = await api('/api/tatil/liste');
    if (!r.ok) return;
    tatiller = r.veri.tatiller;
    ciz();
  }
  yukle();
})();
