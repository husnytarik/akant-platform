// Ders kısaltması/rengi (sunucudan gelir) ve haftalık tablo satırları: derslerim ve program sayfalarında ortak.
function dersChip(kisa, renk) {
  const c = document.createElement('span');
  c.className = 'ders-chip';
  c.textContent = kisa;
  c.style.setProperty('--ders', renk || '#475569');
  return c;
}

// Etüt başlangıç saatinin düştüğü ders saati (1..n); hiçbirine düşmezse null
function etutDersSaati(zamanlar, saat) {
  for (let i = 0; i < zamanlar.length; i++) {
    const [b, s] = zamanlar[i].split('–');
    if (saat >= b && saat < s) return i + 1;
  }
  return null;
}

function etutAnahtar(zamanlar, saat) {
  const p = etutDersSaati(zamanlar, saat);
  return p ? 'p' + p : 'e' + saat;
}

// Haftalık tablo satırları: dersi/etütü olan ders saatleri + ders saatine oturmayan etütler için ek satır
function saatSatirlari(zamanlar, gunler) {
  const harita = new Map();
  const ekle = (key, etiket, alt) => { if (!harita.has(key)) harita.set(key, { key, etiket, alt }); };
  for (const g of gunler) {
    for (const d of g.dersler) ekle('p' + d.dersSaati, String(d.dersSaati), zamanlar[d.dersSaati - 1].split('–')[0]);
    for (const e of g.etutler || []) {
      const p = etutDersSaati(zamanlar, e.saat);
      if (p) ekle('p' + p, String(p), zamanlar[p - 1].split('–')[0]);
      else ekle('e' + e.saat, 'E', e.saat);
    }
  }
  return [...harita.values()].sort((a, b) => (a.alt < b.alt ? -1 : 1));
}

// Bir günün bu satırdaki ders(ler)i ve etütleri
function hucreIcerik(zamanlar, g, satir) {
  return {
    dersler: g.dersler.filter(d => 'p' + d.dersSaati === satir.key),
    etutler: (g.etutler || []).filter(e => etutAnahtar(zamanlar, e.saat) === satir.key),
  };
}
