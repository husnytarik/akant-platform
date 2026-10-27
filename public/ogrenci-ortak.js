// Öğrenci durumunu gösteren ortak bölümler: mentor profili (Öğrencilerim) ve öğrenci dosyası aynı çizimi kullanır.
// Gerekir: grafik.js (gEl, halkaGrafik, gosterge, yiginCubuk) ve sinav-sira.js (siraSerit).
const OgrOrtak = (() => {
  const el = gEl;
  const RENK = { geldi: '#2e9e5b', gelmedi: '#d64545', gec: '#e0a100', izinli: '#8a867d' };
  const DURUM_AD = { gelmedi: 'Gelmedi', gec: 'Geç', izinli: 'İzinli' };
  const ODEV_AD = { verildi: 'Verildi', yapildi: 'Yaptı · onay bekliyor', yapilamadi: 'Yapamadı', dogrulandi: 'Doğrulandı', duzeltme: 'Düzeltme istendi' };
  const ODEV_SINIF = { verildi: 'bekle', yapildi: 'bekle', yapilamadi: 'eksik', dogrulandi: 'onay', duzeltme: 'eksik' };
  const ETUT_DEVAM = { geldi: 'Geldi', gelmedi: 'Gelmedi', izinli: 'İzinli' };
  const kisaTarih = t => t.split('-').reverse().slice(0, 2).join('.');
  const tarihYaz = t => t.split('-').reverse().join('.');
  const yuzde = d => d.toplam ? Math.round((d.toplam - d.gelmedi) / d.toplam * 100) : 100;

  const satir = (ad, deger) => { const s = el('div', undefined, 'profil-satir'); s.append(el('span', ad), el('strong', deger)); return s; };
  const aramaLink = (ad, tel, rozet) => {
    const a = el('a', undefined, 'veli-kart');
    a.href = 'tel:' + tel.replace(/\s/g, '');
    a.append(el('strong', ad), el('span', rozet ? `${rozet} · ${tel}` : tel));
    return a;
  };

  function gorusmeKarti(g) {
    const kart = el('div', undefined, 'ogd-not');
    kart.append(el('small', `${tarihYaz(g.tarih)} · ${g.tur === 'toplanti' ? 'Veli toplantısı' : 'Veli görüşmesi'} · ${g.yazan}`), el('p', g.notu));
    return kart;
  }

  // Gelişim: dönem dönem, başlık başlık tüm öğretmenlerin gözlemleri ve görüşme notları
  function gelisim(k, dosya) {
    const dolu = dosya.donemler.filter(d => d.girisler.length || d.gorusmeler.length);
    if (!dolu.length && !dosya.donemsizGorusmeler.length) return k.appendChild(el('p', 'Gelişim gözlemi veya görüşme notu yok.', 'bos-not'));
    dolu.forEach((d, i) => {
      const det = el('details', undefined, 'ogd-donem');
      det.open = i === 0;
      const ust = el('summary');
      ust.append(el('strong', d.ad), el('small', `${d.girisler.length} gözlem${d.gorusmeler.length ? ` · ${d.gorusmeler.length} görüşme` : ''}`));
      det.append(ust);
      const baslikGrup = new Map();
      for (const g of d.girisler) { if (!baslikGrup.has(g.baslik)) baslikGrup.set(g.baslik, []); baslikGrup.get(g.baslik).push(g); }
      for (const [baslik, liste] of baslikGrup) {
        const blok = el('div', undefined, 'ogd-baslik');
        blok.append(el('h4', baslik));
        for (const g of liste) {
          const y = el('div', undefined, 'ogd-not');
          y.append(el('small', `${g.ogretmen}${g.ders ? ' · ' + g.ders : ''}`), el('p', g.metin));
          blok.append(y);
        }
        det.append(blok);
      }
      if (d.gorusmeler.length) {
        const blok = el('div', undefined, 'ogd-baslik');
        blok.append(el('h4', 'Veli görüşmeleri'));
        for (const g of d.gorusmeler) blok.append(gorusmeKarti(g));
        det.append(blok);
      }
      k.appendChild(det);
    });
    if (dosya.donemsizGorusmeler.length) {
      k.appendChild(el('h3', 'Diğer veli görüşmeleri', 'baslik3'));
      for (const g of dosya.donemsizGorusmeler) k.appendChild(gorusmeKarti(g));
    }
  }

  function odev(k, dosya) {
    k.append(el('h3', 'Son ödevler', 'baslik3'));
    if (!dosya.odevler.length) k.appendChild(el('p', 'Ödev kaydı yok.', 'alt'));
    for (const x of dosya.odevler) {
      const s = el('div', undefined, 'ogd-satir');
      const sol = el('div');
      sol.append(el('strong', x.baslik), el('small', `${x.ders} · son ${tarihYaz(x.son)}`));
      if (x.ogretmenNotu) sol.append(el('small', 'Öğretmen notu: ' + x.ogretmenNotu));
      s.append(sol, el('span', ODEV_AD[x.durum], 'hz-durum ' + ODEV_SINIF[x.durum]));
      k.appendChild(s);
    }
    k.append(el('h3', 'Kulüp', 'baslik3'));
    if (!dosya.kulup) k.appendChild(el('p', 'Bir kulübe üye değil.', 'alt'));
    else {
      const s = el('div', undefined, 'ogd-satir');
      const sol = el('div');
      sol.append(el('strong', dosya.kulup.ad), el('small', dosya.kulup.tema || 'Kulüp'));
      s.append(sol, el('span', dosya.kulup.toplam ? `${dosya.kulup.geldi}/${dosya.kulup.toplam} çalışma` : 'Çalışma yok', 'ogd-sayi'));
      k.appendChild(s);
    }
    k.append(el('h3', 'Etütler', 'baslik3'));
    if (!dosya.etutler.length) k.appendChild(el('p', 'Etüt kaydı yok.', 'alt'));
    for (const x of dosya.etutler) {
      const s = el('div', undefined, 'ogd-satir');
      const sol = el('div');
      sol.append(el('strong', x.konu), el('small', `${tarihYaz(x.tarih)}${x.ders ? ' · ' + x.ders : ''}`));
      const rozet = x.durum === 'iptal' ? 'İptal' : x.devam ? ETUT_DEVAM[x.devam] : ({ bekliyor: 'Yanıt bekliyor', gelecek: 'Gelecek', gelmeyecek: 'Gelmeyecek' })[x.yanit];
      s.append(sol, el('span', rozet, 'ogd-sayi'));
      k.appendChild(s);
    }
  }

  // d: { devam, dersler, son }
  function devam(k, d) {
    const AD = { geldi: 'Geldi', gec: 'Geç', izinli: 'İzinli', gelmedi: 'Gelmedi' };
    const dilimler = ['geldi', 'gec', 'izinli', 'gelmedi'].map(x => ({ deger: d.devam[x], renk: RENK[x], etiket: AD[x] }));
    const ozet = el('div', undefined, 'devam-ozet');
    const sag = el('div', undefined, 'devam-sag');
    sag.append(gosterge(dilimler), el('p', `${d.devam.toplam} yoklamada`, 'alt'));
    ozet.append(halkaGrafik(dilimler, `%${yuzde(d.devam)}`, 'devam', 120), sag);
    k.append(ozet, el('h3', 'Derslere göre', 'baslik3'));
    for (const x of d.dersler) {
      const s = el('div', undefined, 'ders-devam');
      s.append(el('span', x.ders), yiginCubuk([{ deger: x.toplam - x.gelmedi, renk: RENK.geldi, etiket: 'Geldi' }, { deger: x.gelmedi, renk: RENK.gelmedi, etiket: 'Gelmedi' }]), el('strong', `%${yuzde(x)}`));
      k.appendChild(s);
    }
    k.appendChild(el('h3', 'Son devamsızlıklar', 'baslik3'));
    if (!d.son.length) k.appendChild(el('p', 'Kayıtlı devamsızlık yok.', 'alt'));
    for (const x of d.son) {
      const s = satir(`${kisaTarih(x.tarih)} · ${x.dersSaati}. ders · ${x.ders || ''}`, DURUM_AD[x.durum]);
      s.lastChild.style.color = RENK[x.durum];
      k.appendChild(s);
    }
  }

  // Yayınlanmış sınavlar: kart açılınca derslere göre doğru/yanlış/boş ve eksik kazanımlar aynı yerde görünür
  function sinav(k, sinavlar) {
    if (!sinavlar.length) return k.appendChild(el('p', 'Yayınlanmış sınav sonucu yok.', 'bos-not'));
    for (const s of sinavlar) {
      const kart = el('details', undefined, 'ogs-kart');
      const ust = el('summary', undefined, 'ogs-ust');
      const kim = el('div', undefined, 'ogs-kim');
      kim.append(el('strong', s.ad), el('small', kisaTarih(s.tarih)));
      const puan = el('div', undefined, 'ogs-puan');
      puan.append(el('b', String(s.ortalama)));
      if (!s.yazili) puan.append(el('small', `ortalama · ${s.sira}. sıra (${s.giren} öğrenci)`));
      ust.append(kim, puan);
      kart.append(ust, siraSerit(s.siralama, s.degisim, s.yazili));
      for (const d of s.dersler) {
        const h = el('div', undefined, 'ogs-ayr');
        // Yazılı tek dersten oluşur: ders ve puan başlıkta zaten var, satır tekrarlanmaz
        if (!s.yazili) {
          const baslik = el('div', undefined, 'ogs-ayr-ust');
          const sayilar = d.dogru === null ? '' : `${d.dogru} D · ${d.yanlis} Y · ${d.bos} B`;
          baslik.append(el('strong', d.ders), el('small', sayilar), el('b', String(d.net ?? d.puan)));
          h.append(baslik);
        }
        const eksik = (d.kazanimlar || []).filter(x => x.durum !== 'Edinildi');
        if (s.yazili && !eksik.length) continue;
        if (eksik.length) {
          const l = el('ul', undefined, 'ogs-kaz');
          for (const x of eksik) l.append(el('li', `${x.kazanim} — ${x.durum}`));
          h.append(el('small', 'Geliştirilecek kazanımlar', 'ogs-kaz-baslik'), l);
        }
        kart.append(h);
      }
      k.appendChild(kart);
    }
  }

  return { RENK, yuzde, kisaTarih, tarihYaz, satir, aramaLink, gorusmeKarti, gelisim, odev, devam, sinav };
})();
