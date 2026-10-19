const $ = id => document.getElementById(id);
const DURUM = { gelmedi: 'Gelmedi', gec: 'Geç', izinli: 'İzinli' };
const GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

function el(tag, metin, sinif) {
  const e = document.createElement(tag);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}

function tarihYaz(t) {
  const [y, a, g] = t.split('-');
  return `${g}.${a}.${y} ${GUN[new Date(t + 'T00:00:00Z').getUTCDay()]}`;
}

(async () => {
  const r = await fetch('/api/yoklama/devam');
  if (r.status === 401) { location.href = '/'; return; }
  if (!r.ok) { location.href = '/panel'; return; }
  const { cocuklar } = await r.json();
  const liste = $('liste');
  if (!cocuklar.length) liste.appendChild(el('p', 'Bağlı öğrenci bulunamadı.', 'alt'));
  const RENK = { gelmedi: '#d64545', gec: '#e0a100', izinli: '#8a867d', geldi: '#2e9e5b' };
  const IKON = { gelmedi: '✗', gec: 'G', izinli: 'İ' };
  for (const c of cocuklar) {
    const kutu = el('section', undefined, 'kart-yumusak');
    kutu.appendChild(el('h2', c.ad, 'baslik2'));
    const geldi = Math.max(c.toplam - c.say.gelmedi - c.say.gec - c.say.izinli, 0);
    const dilimler = [
      { deger: geldi, renk: RENK.geldi, etiket: 'Geldi' },
      { deger: c.say.gec, renk: RENK.gec, etiket: 'Geç' },
      { deger: c.say.izinli, renk: RENK.izinli, etiket: 'İzinli' },
      { deger: c.say.gelmedi, renk: RENK.gelmedi, etiket: 'Gelmedi' },
    ];
    const ozet = el('div', undefined, 'devam-ozet');
    const yuzde = c.toplam ? Math.round((c.toplam - c.say.gelmedi) / c.toplam * 100) : 100;
    ozet.appendChild(halkaGrafik(dilimler, `%${yuzde}`, 'devam', 132));
    const sag = el('div', undefined, 'devam-sag');
    sag.append(gosterge(dilimler), el('p', `${c.toplam} yoklamada`, 'alt'));
    ozet.appendChild(sag);
    kutu.appendChild(ozet);

    // Derse göre devamsızlık: yatay çubuklar
    const dersSay = new Map();
    for (const k of c.kayitlar) if (k.durum === 'gelmedi') dersSay.set(k.ders, (dersSay.get(k.ders) || 0) + 1);
    if (dersSay.size) {
      kutu.appendChild(el('h3', 'Derse göre gelmediği', 'mini-baslik'));
      const sirali = [...dersSay].sort((x, y) => y[1] - x[1]);
      const en = sirali[0][1];
      const kap = el('div', undefined, 'yatay');
      for (const [ders, n] of sirali) {
        const s = el('div', undefined, 'yatay-satir');
        const cubuk = el('span', undefined, 'yatay-cubuk');
        cubuk.style.setProperty('--w', (n / en * 100) + '%');
        const iç = el('i'); cubuk.appendChild(iç);
        s.append(el('span', ders, 'yatay-ad'), cubuk, el('b', String(n)));
        kap.appendChild(s);
      }
      kutu.appendChild(kap);
    }

    if (!c.kayitlar.length) {
      kutu.appendChild(el('p', 'Kayıtlı devamsızlık yok.', 'bos-not'));
    } else {
      kutu.appendChild(el('h3', 'Kayıtlar', 'mini-baslik'));
      const zaman = el('div', undefined, 'zaman');
      for (const k of c.kayitlar) {
        const s = el('div', undefined, 'zaman-satir');
        s.style.setProperty('--c', RENK[k.durum]);
        s.appendChild(el('span', IKON[k.durum], 'zaman-nokta'));
        const g = el('div', undefined, 'zaman-govde');
        g.append(el('strong', `${k.dersSaati}. ders · ${k.ders}`), el('small', tarihYaz(k.tarih)));
        s.append(g, el('span', DURUM[k.durum], 'zaman-durum'));
        zaman.appendChild(s);
      }
      kutu.appendChild(zaman);
    }
    liste.appendChild(kutu);
  }
})();
