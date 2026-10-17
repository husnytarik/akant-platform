import { db } from './db.js';

// Her dersin kısaltması ve rengi sabittir: ilk kez görüldüğünde atanır ve courses tablosunda saklanır,
// böylece tüm kullanıcılar ve ekranlar aynı kısaltma/rengi görür.
const RENKLER = ['#1f6feb', '#2e7d32', '#c2410c', '#7c3aed', '#0e7490', '#a21caf', '#b45309', '#475569',
  '#be185d', '#4d7c0f', '#0369a1', '#9333ea', '#15803d', '#9a3412', '#0f766e', '#6d28d9'];

const buyuk = s => s.toLocaleUpperCase('tr');

// Kısaltma adayları, sırayla denenir; ilk boşta olan seçilir
function adaylar(ad) {
  const k = ad.trim().split(/\s+/).filter(Boolean);
  const harfler = k.join('');
  const ilk = k.map(x => x[0]);
  const son = harfler.slice(-1);
  const liste = k.length > 1
    ? [ilk.slice(0, 2).join(''), ilk[0] + son, k[0].slice(0, 2) + k[1][0], k[0].slice(0, 3)]
    : [ilk[0], ilk[0] + son, k[0].slice(0, 2), k[0].slice(0, 3)];
  return liste.map(buyuk);
}

export function dersStilleri() {
  const satirlar = db.prepare('SELECT id, name, kisa, renk, stil_ad FROM courses ORDER BY id').all();
  const guncelle = db.prepare('UPDATE courses SET kisa = ?, renk = ?, stil_ad = ? WHERE id = ?');
  // Ders adı değiştiyse kısaltma yeniden üretilir (renk sabit kalır); eski kayıtlar mevcut kısaltmayı korur
  const yenile = r => !r.kisa || !r.renk || (r.stil_ad && r.stil_ad !== r.name);
  const kullanilan = new Set(satirlar.filter(r => r.kisa && !yenile(r)).map(r => r.kisa));
  const harita = new Map();
  for (const r of satirlar) {
    let { kisa, renk } = r;
    if (yenile(r)) {
      kisa = adaylar(r.name).find(a => !kullanilan.has(a)) || buyuk(r.name.slice(0, 4)) + r.id;
      renk = renk || RENKLER[(r.id - 1) % RENKLER.length];
      kullanilan.add(kisa);
      guncelle.run(kisa, renk, r.name, r.id);
    } else if (!r.stil_ad) {
      guncelle.run(kisa, renk, r.name, r.id);
    }
    harita.set(r.name, { kisa, renk });
  }
  return harita;
}

// Ders adı taşıyan nesneye kisa/renk ekler
export function stilEkle(nesne, harita, alan = 'ders') {
  const s = harita.get(nesne[alan]);
  return { ...nesne, kisa: s?.kisa || '', renk: s?.renk || '#475569' };
}
