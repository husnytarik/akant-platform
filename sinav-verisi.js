// Örnek sınav verisi: 6-C için üç deneme (Türkçe, Matematik, Fen, Sosyal), cevaplar ve soru-kazanım eşlemesi.
// Önce ornek-veri.js çalışmış olmalı. Tekrar çalıştırılırsa bir şey eklemez.
import { db } from './db.js';
import { dersKazanimlari } from './kazanim.js';

const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const kaydir = (t, n) => {
  const d = new Date(t + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const SIKLAR = 'ABCDE';
const sec = a => a[Math.floor(Math.random() * a.length)];
const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.2;

const DENEMELER = [
  { ad: '1. Deneme Sınavı', gun: -28, yayin: 1, kat: 3 },
  { ad: '2. Deneme Sınavı', gun: -14, yayin: 1, kat: 3 },
  { ad: '3. Deneme Sınavı', gun: -3, yayin: 0, kat: 3 },
];
const DERSLER = [['Türkçe', 20], ['Matematik', 20], ['Fen Bilimleri', 20], ['Sosyal Bilgiler', 20]];

function calistir() {
  if (db.prepare('SELECT COUNT(*) AS n FROM sinavlar').get().n > 0) return console.log('Sınav verisi zaten var, atlandı.');
  const sinif = db.prepare(`SELECT id FROM classes WHERE name = '6-C'`).get();
  const ogr = db.prepare(`SELECT m.id FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.full_name = 'Ceren Husny' AND m.role = 'ogretmen'`).get();
  if (!sinif || !ogr) return console.log('Önce ornek-veri.js çalıştırılmalı.');
  const ogrenciler = db.prepare(`SELECT cs.student_membership_id AS id FROM class_students cs JOIN memberships m ON m.id = cs.student_membership_id WHERE cs.class_id = ? AND m.status = 'aktif'`).all(sinif.id).map(r => r.id);
  // Her öğrenci için başarı düzeyi ve ders eğilimi; deneme boyunca hafif yükseliş
  const yetenek = new Map(ogrenciler.map(id => [id, { genel: gauss() * 0.9, ders: Object.fromEntries(DERSLER.map(([d]) => [d, gauss() * 0.4])) }]));
  const simdi = Date.now();

  db.exec('BEGIN');
  try {
    const sEkle = db.prepare('INSERT INTO sinavlar (name, date, teacher_membership_id, yanlis_kat, created_at, yayin) VALUES (?,?,?,?,?,?)');
    const dEkle = db.prepare('INSERT INTO sinav_dersler (sinav_id, ders, soru_sayisi, anahtar, iptal) VALUES (?,?,?,?,?)');
    const cEkle = db.prepare('INSERT INTO sinav_cevaplar (sinav_ders_id, student_membership_id, cevaplar) VALUES (?,?,?)');
    const kEkle = db.prepare('INSERT INTO sinav_kazanim (sinav_ders_id, soru_no, kazanim, guncelleyen, tarih) VALUES (?,?,?,?,?)');
    let say = 0;
    DENEMELER.forEach((dn, dnNo) => {
      const sid = Number(sEkle.run(dn.ad, kaydir(bugun, dn.gun), ogr.id, dn.kat, simdi, dn.yayin).lastInsertRowid);
      db.prepare('INSERT INTO sinav_siniflar (sinav_id, class_id) VALUES (?,?)').run(sid, sinif.id);
      for (const [ders, n] of DERSLER) {
        const anahtar = Array.from({ length: n }, () => sec(SIKLAR)).join('');
        // Bir soru hatalı çıkıp iptal edilir (ikinci denemenin Matematik'inde)
        const iptal = dnNo === 1 && ders === 'Matematik' ? [17] : [];
        const dersId = Number(dEkle.run(sid, ders, n, anahtar, JSON.stringify(iptal)).lastInsertRowid);
        // Soru zorluğu: bazıları kolay, bazıları çok zor
        const zorluk = Array.from({ length: n }, () => gauss() * 0.9 + 0.2);
        for (const id of ogrenciler) {
          if (Math.random() < 0.05) continue; // sınava girmeyen
          const y = yetenek.get(id);
          const guc = y.genel + y.ders[ders] + dnNo * 0.15;
          let c = '';
          for (let i = 0; i < n; i++) {
            const p = 1 / (1 + Math.exp(-(guc - zorluk[i] + 0.3) * 1.3));
            const x = Math.random();
            if (x < p) c += anahtar[i];
            else if (x < p + (1 - p) * 0.25) c += '-';
            else c += sec(SIKLAR.replace(anahtar[i], ''));
          }
          cEkle.run(dersId, id, c);
        }
        // Soru-kazanım eşlemesi: o dersin 6. sınıf kazanımları sırayla, her kazanıma 1-2 soru
        const kaz = dersKazanimlari(ders, 6);
        if (kaz.length) {
          let k = (dnNo * 7) % kaz.length;
          for (let i = 1; i <= n; i++) {
            if (i > 1 && Math.random() < 0.35) { /* önceki soruyla aynı kazanım */ } else k = (k + 1) % kaz.length;
            const x = kaz[k], metin = x.metin.replace(/-\s+/g, '');
            kEkle.run(dersId, i, ((x.kod ? x.kod + ' – ' : '') + metin).slice(0, 300), ogr.id, simdi);
          }
        }
      }
      say++;
    });
    db.exec('COMMIT');
    console.log(`Eklendi: ${say} deneme sınavı (6-C, ${ogrenciler.length} öğrenci).`);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

calistir();
