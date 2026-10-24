// Örnek sınav verisi: 6. sınıf (tüm şubeler) için üç yayın/hazır deneme, hazırlığı sürmekte olan bir deneme, bir açılış sınavı ve Fen yazılısı.
// Sınavları yönetim açar; soru kazanımını ve cevap anahtarını ders öğretmenleri girer (burada hazır ve onaylı). Önce ornek-veri.js çalışmış olmalı. Tekrar çalıştırılırsa bir şey eklemez.
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
  { ad: '1. Deneme Sınavı', gun: -28, yayin: 1, kat: 3, cevapli: true },
  { ad: '2. Deneme Sınavı', gun: -14, yayin: 1, kat: 3, cevapli: true },
  { ad: '3. Deneme Sınavı', gun: -3, yayin: 0, kat: 3, cevapli: true },
  { ad: '4. Deneme Sınavı', gun: 6, yayin: 0, kat: 3, cevapli: false, hazirlik: true },
  { ad: 'Açılış Sınavı', gun: -40, yayin: 0, kat: 0, cevapli: true, amac: 'acilis' },
];
const DERSLER = [['Türkçe', 20], ['Matematik', 20], ['Fen Bilimleri', 20], ['Sosyal Bilgiler', 20]];

function calistir() {
  if (db.prepare('SELECT COUNT(*) AS n FROM sinavlar').get().n > 0) return console.log('Sınav verisi zaten var, atlandı.');
  const siniflar = db.prepare(`SELECT id FROM classes WHERE name LIKE '6-%' ORDER BY name`).all();
  const yon = db.prepare(`SELECT id FROM memberships WHERE role = 'yonetim' ORDER BY id`).get();
  const ogr = db.prepare(`SELECT m.id FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.full_name = 'Ceren Husny' AND m.role = 'ogretmen'`).get();
  if (!siniflar.length || !yon || !ogr) return console.log('Önce ornek-veri.js çalıştırılmalı.');
  const ogrenciler = db.prepare(`SELECT DISTINCT cs.student_membership_id AS id FROM class_students cs JOIN memberships m ON m.id = cs.student_membership_id
    WHERE cs.class_id IN (${siniflar.map(() => '?').join(',')}) AND m.status = 'aktif'`).all(...siniflar.map(s => s.id)).map(r => r.id);
  // Her öğrenci için başarı düzeyi ve ders eğilimi; deneme boyunca hafif yükseliş
  const yetenek = new Map(ogrenciler.map(id => [id, { genel: gauss() * 0.9, ders: Object.fromEntries(DERSLER.map(([d]) => [d, gauss() * 0.4])) }]));
  const simdi = Date.now();

  db.exec('BEGIN');
  try {
    const sEkle = db.prepare("INSERT INTO sinavlar (name, date, teacher_membership_id, yanlis_kat, created_at, yayin, duzey, durum, amac) VALUES (?,?,?,?,?,?,6,'aktif',?)");
    const dEkle = db.prepare('INSERT INTO sinav_dersler (sinav_id, ders, soru_sayisi, anahtar, iptal, onay, onaylayan, onay_tarih) VALUES (?,?,?,?,?,?,?,?)');
    const cEkle = db.prepare('INSERT INTO sinav_cevaplar (sinav_ders_id, student_membership_id, cevaplar) VALUES (?,?,?)');
    const kEkle = db.prepare('INSERT INTO sinav_kazanim (sinav_ders_id, soru_no, kazanim, guncelleyen, tarih) VALUES (?,?,?,?,?)');
    let say = 0;
    DENEMELER.forEach((dn, dnNo) => {
      const sid = Number(sEkle.run(dn.ad, kaydir(bugun, dn.gun), yon.id, dn.kat, simdi, dn.yayin, dn.amac || 'deneme').lastInsertRowid);
      for (const s of siniflar) db.prepare('INSERT INTO sinav_siniflar (sinav_id, class_id) VALUES (?,?)').run(sid, s.id);
      DERSLER.forEach(([ders, n], dersNo) => {
        // Hazırlığı süren sınavda: Türkçe tamam ve onaylı, Matematik yarım, diğerleri boş
        const tamam = !dn.hazirlik || dersNo === 0;
        const matYarim = dn.hazirlik && dersNo === 1;
        const tam = Array.from({ length: n }, () => sec(SIKLAR)).join('');
        const anahtar = tamam ? tam : matYarim ? tam.slice(0, 12).padEnd(n, '?') : '?'.repeat(n);
        // Bir soru hatalı çıkıp iptal edilir (ikinci denemenin Matematik'inde)
        const iptal = dnNo === 1 && ders === 'Matematik' ? [17] : [];
        const dersId = Number(dEkle.run(sid, ders, n, anahtar, JSON.stringify(iptal), tamam ? 1 : 0, tamam ? ogr.id : null, tamam ? simdi : null).lastInsertRowid);
        // Soru zorluğu: bazıları kolay, bazıları çok zor
        const zorluk = Array.from({ length: n }, () => gauss() * 0.9 + 0.2);
        if (dn.cevapli) for (const id of ogrenciler) {
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
        const girilecek = tamam ? n : matYarim ? 9 : 0;
        if (kaz.length) {
          let k = (dnNo * 7) % kaz.length;
          for (let i = 1; i <= girilecek; i++) {
            if (i > 1 && Math.random() < 0.35) { /* önceki soruyla aynı kazanım */ } else k = (k + 1) % kaz.length;
            const x = kaz[k], metin = x.metin.replace(/-\s+/g, '');
            kEkle.run(dersId, i, ((x.kod ? x.kod + ' – ' : '') + metin).slice(0, 300), ogr.id, simdi);
          }
        }
      });
      say++;
    });

    // Fen Bilimleri yazılısı: soru ve anahtar yok, puanları dersin öğretmeni girer; kazanım isteğe bağlı
    const yid = Number(db.prepare("INSERT INTO sinavlar (name, date, teacher_membership_id, yanlis_kat, created_at, yayin, tur, duzey, durum, amac) VALUES (?,?,?,0,?,0,'yazili',6,'aktif','deneme')")
      .run('1. Dönem 1. Fen Yazılısı', kaydir(bugun, -9), yon.id, simdi).lastInsertRowid);
    for (const s of siniflar) db.prepare('INSERT INTO sinav_siniflar (sinav_id, class_id) VALUES (?,?)').run(yid, s.id);
    const ydId = Number(db.prepare("INSERT INTO sinav_dersler (sinav_id, ders, soru_sayisi, anahtar, iptal, onay) VALUES (?,'Fen Bilimleri',0,'','[]',1)").run(yid).lastInsertRowid);
    for (const [i, x] of dersKazanimlari('Fen Bilimleri', 6).slice(0, 3).entries()) {
      db.prepare('INSERT INTO sinav_genel_kazanim (sinav_id, sira, kazanim) VALUES (?,?,?)').run(yid, i + 1, ((x.kod ? x.kod + ' – ' : '') + x.metin.replace(/-\s+/g, '')).slice(0, 300));
    }
    // Fen dersini veren öğretmenin sınıflarındaki öğrencilere puan girilmiş
    const fenOgr = db.prepare(`SELECT DISTINCT cs.student_membership_id AS id FROM assignments a JOIN courses co ON co.id = a.course_id AND co.name = 'Fen Bilimleri'
      JOIN class_students cs ON cs.class_id = a.class_id JOIN classes c ON c.id = a.class_id WHERE c.name LIKE '6-%'`).all().map(r => r.id);
    for (const id of fenOgr) {
      if (Math.random() < 0.06) continue;
      const p = Math.max(5, Math.min(100, Math.round(62 + (yetenek.get(id)?.genel ?? 0) * 14 + gauss() * 6)));
      db.prepare('INSERT INTO sinav_puanlar (sinav_ders_id, student_membership_id, puan) VALUES (?,?,?)').run(ydId, id, p);
    }
    db.exec('COMMIT');
    console.log(`Eklendi: ${say} test sınavı + 1 yazılı (6. sınıf, ${siniflar.length} şube, ${ogrenciler.length} öğrenci).`);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

calistir();
