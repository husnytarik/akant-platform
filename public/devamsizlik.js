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

    // Derse göre devamsızlık: dokununca aşağıdaki kayıtlar o derse göre süzülür
    const filtre = { durum: null, ders: null };
    const kayitKutu = el('div', undefined, 'devam-kayitlar');
    const dersSay = new Map();
    for (const k of c.kayitlar) {
      const d = dersSay.get(k.ders) || { gelmedi: 0, gec: 0, izinli: 0 };
      d[k.durum]++;
      dersSay.set(k.ders, d);
    }
    let dersKap = null;
    const cizDers = () => {
      dersKap.replaceChildren();
      const sirali = [...dersSay].sort((x, y) => (y[1].gelmedi + y[1].gec + y[1].izinli) - (x[1].gelmedi + x[1].gec + x[1].izinli));
      const en = Math.max(...sirali.map(([, d]) => d.gelmedi + d.gec + d.izinli));
      for (const [ders, d] of sirali) {
        const n = d.gelmedi + d.gec + d.izinli;
        const s = el('button', undefined, 'yatay-satir devam-ders' + (filtre.ders === ders ? ' secili' : ''));
        s.type = 'button';
        const cubuk = el('span', undefined, 'yatay-cubuk');
        cubuk.style.setProperty('--w', (n / en * 100) + '%');
        cubuk.appendChild(el('i'));
        const ayrinti = [d.gelmedi && `${d.gelmedi} gelmedi`, d.gec && `${d.gec} geç`, d.izinli && `${d.izinli} izinli`].filter(Boolean).join(' · ');
        s.append(el('span', ders, 'yatay-ad'), el('b', ayrinti), cubuk);
        s.addEventListener('click', () => { filtre.ders = filtre.ders === ders ? null : ders; cizDers(); cizKayit(); });
        dersKap.appendChild(s);
      }
    };
    if (dersSay.size) {
      kutu.appendChild(el('h3', 'Derslere göre (dokununca süzülür)', 'mini-baslik'));
      dersKap = el('div', undefined, 'yatay rapor-cubuk');
      kutu.appendChild(dersKap);
      cizDers();
    }

    // Kayıtlar: duruma ve derse göre süzülür, güne göre gruplanır
    const durumlar = [['', 'Tümü', c.kayitlar.length], ['gelmedi', 'Gelmedi', c.say.gelmedi], ['gec', 'Geç', c.say.gec], ['izinli', 'İzinli', c.say.izinli]];
    const cizKayit = () => {
      kayitKutu.replaceChildren();
      const liste2 = c.kayitlar.filter(k => (!filtre.durum || k.durum === filtre.durum) && (!filtre.ders || k.ders === filtre.ders));
      if (filtre.ders) {
        const t = el('p', undefined, 'devam-filtre');
        t.append(el('span', `${filtre.ders} dersi`));
        const x = el('button', 'Süzmeyi kaldır', 'ku-baglanti'); x.type = 'button';
        x.addEventListener('click', () => { filtre.ders = null; cizDers(); cizKayit(); });
        t.append(x);
        kayitKutu.appendChild(t);
      }
      if (!liste2.length) { kayitKutu.appendChild(el('p', 'Bu süzmeye uyan kayıt yok.', 'bos-not')); return; }
      const gunler = new Map();
      for (const k of liste2) (gunler.get(k.tarih) || gunler.set(k.tarih, []).get(k.tarih)).push(k);
      for (const [tarih, kayitlar] of gunler) {
        kayitKutu.appendChild(el('p', tarihYaz(tarih), 'devam-gun'));
        const zaman = el('div', undefined, 'zaman');
        for (const k of kayitlar.sort((x, y) => x.dersSaati - y.dersSaati)) {
          const s = el('div', undefined, 'zaman-satir');
          s.style.setProperty('--c', RENK[k.durum]);
          s.appendChild(el('span', IKON[k.durum], 'zaman-nokta'));
          const g = el('div', undefined, 'zaman-govde');
          g.append(el('strong', k.ders), el('small', `${k.dersSaati}. ders`));
          s.append(g, el('span', DURUM[k.durum], 'zaman-durum'));
          zaman.appendChild(s);
        }
        kayitKutu.appendChild(zaman);
      }
    };
    if (!c.kayitlar.length) {
      kutu.appendChild(el('p', 'Kayıtlı devamsızlık yok.', 'bos-not'));
    } else {
      kutu.appendChild(el('h3', 'Kayıtlar', 'mini-baslik'));
      const cipler = el('div', undefined, 'tatil-cipler devam-cipler');
      for (const [d, ad, n] of durumlar) {
        if (d && !n) continue;
        const bt = el('button', `${ad} · ${n}`, 'tatil-cip' + (filtre.durum === (d || null) ? ' secili' : '')); bt.type = 'button';
        bt.addEventListener('click', () => {
          filtre.durum = d || null;
          for (const x of cipler.children) x.classList.toggle('secili', x === bt);
          cizKayit();
        });
        cipler.appendChild(bt);
      }
      kutu.append(cipler, kayitKutu);
      cizKayit();
    }
    liste.appendChild(kutu);
  }
})();
