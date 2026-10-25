// Sınav sıralaması (sınıf / okul / tüm okullar) ve önceki sınava göre değişim: sonuç ekranları ortak kullanır
function siraKur(etiket, metin, sinif) {
  const e = document.createElement(etiket);
  if (metin !== undefined) e.textContent = metin;
  if (sinif) e.className = sinif;
  return e;
}
const siraSayi = n => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 1 });

// Puan farkı: ok, işaretli sayı ve renk sınıfı
function farkBilgi(fark) {
  if (fark > 0) return { ok: '▲', yazi: '+' + siraSayi(fark), sinif: 'art' };
  if (fark < 0) return { ok: '▼', yazi: '−' + siraSayi(-fark), sinif: 'dus' };
  return { ok: '=', yazi: '0', sinif: 'esit' };
}

// Bir dersin önceki sınava göre puan farkı küçük etiket olarak (önceki yoksa null)
function dersFarki(onceki, puan) {
  if (onceki === null || onceki === undefined) return null;
  const f = farkBilgi(Math.round((Number(puan) - Number(onceki)) * 10) / 10);
  return siraKur('em', `${f.ok} ${f.yazi}`, 'fark ' + f.sinif);
}

function siraSerit(siralama, degisim) {
  const kap = siraKur('div', undefined, 'sira-serit');
  if (siralama) {
    const hucreler = siraKur('div', undefined, 'sira-hucreler');
    for (const [ad, x] of [['Sınıfta', siralama.sinif], ['Okulda', siralama.okul], ['Tüm okullarda', siralama.genel]]) {
      if (!x) continue;
      const h = siraKur('div');
      h.append(siraKur('strong', `${x.sira}.`), siraKur('span', `${ad} · ${x.sayi} öğrenci`));
      hucreler.append(h);
    }
    kap.append(hucreler);
  }
  if (degisim) {
    const f = farkBilgi(degisim.fark);
    const satir = siraKur('div', undefined, 'sira-degisim ' + f.sinif);
    const oran = degisim.oran === null ? '' : ` · %${siraSayi(Math.abs(degisim.oran))} ${degisim.fark > 0 ? 'artış' : degisim.fark < 0 ? 'düşüş' : ''}`.trimEnd();
    satir.append(siraKur('b', `${f.ok} ${f.yazi} puan${degisim.fark === 0 ? ' (değişmedi)' : oran}`),
      siraKur('small', `Önceki sınav: ${degisim.ad} · ${siraSayi(degisim.ortalama)}`));
    kap.append(satir);
  } else if (siralama) kap.append(siraKur('small', 'Önceki sınav olmadığı için değişim gösterilmiyor.', 'sira-not'));
  return kap;
}
