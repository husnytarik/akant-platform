// Örnek (DEMO) veri: 20 öğretmen, 200 öğrenci, 4-5-6. sınıflardan 12 sınıf, atamalar ve haftalık program.
// Kullanım: npm run ornek   (veritabanı sıfırlanmaz; zaten sınıf varsa işlem yapmaz)
import { db, programCakismalariniDuzelt } from './db.js';

const GUN = 5, SAAT = 8;
const ADLAR = ['Ahmet', 'Mehmet', 'Mustafa', 'Ali', 'Emre', 'Burak', 'Can', 'Deniz', 'Efe', 'Kerem', 'Yusuf', 'Ömer',
  'Arda', 'Eren', 'Berk', 'Kaan', 'Mert', 'Onur', 'Ayşe', 'Fatma', 'Zeynep', 'Elif', 'Merve', 'Selin', 'Defne',
  'Ecrin', 'Ceren', 'Büşra', 'Naz', 'İrem', 'Yağmur', 'Esra', 'Hira', 'Melis', 'Asya', 'Duru', 'Ela', 'Su'];
const SOYADLAR = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir',
  'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özkan', 'Şimşek', 'Polat', 'Erdoğan',
  'Güneş', 'Aksoy', 'Acar', 'Tekin', 'Bulut', 'Korkmaz', 'Avcı', 'Türk'];

// Branş -> öğretmen sayısı (toplam 20)
const BRANSLAR = [
  ['Türkçe', 3], ['Matematik', 4], ['Fen Bilimleri', 2], ['Sosyal Bilgiler', 2], ['İngilizce', 4],
  ['Beden Eğitimi', 1], ['Görsel Sanatlar', 1], ['Müzik', 1], ['Din Kültürü', 1], ['Bilişim', 1],
];
// Sınıf başına haftalık ders saati (toplam 26)
const SAATLER = {
  'Türkçe': 5, 'Matematik': 5, 'Fen Bilimleri': 3, 'Sosyal Bilgiler': 3, 'İngilizce': 3,
  'Beden Eğitimi': 2, 'Görsel Sanatlar': 1, 'Müzik': 1, 'Din Kültürü': 2, 'Bilişim': 1,
};

function tcUret(ilk9) {
  const d = ilk9.split('').map(Number);
  const d10 = ((((d[0] + d[2] + d[4] + d[6] + d[8]) * 7) - (d[1] + d[3] + d[5] + d[7])) % 10 + 10) % 10;
  const d11 = (d.reduce((a, b) => a + b, 0) + d10) % 10;
  return ilk9 + d10 + d11;
}

// Tekrarlanabilir sahte rastgelelik
let tohum = 20260;
const rnd = () => (tohum = (tohum * 1664525 + 1013904223) % 4294967296) / 4294967296;
const karistir = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Her öğrenciye bir veli açar ve bağlar (yoksa); demo veli ile demo öğrenciyi de bağlar.
function veliBagla() {
  const ogrenciler = db.prepare(`
    SELECT m.id AS mid, m.branch_id AS sube, u.full_name AS ad FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.role = 'ogrenci' AND m.status = 'aktif'
      AND NOT EXISTS (SELECT 1 FROM guardians g WHERE g.student_membership_id = m.id)
      AND u.tc_no NOT IN ('10000000382')`).all();
  let eklenen = 0;
  for (const o of ogrenciler) {
    const soyad = o.ad.split(' ').slice(-1)[0];
    const ad = `${ADLAR[(o.mid * 5 + 1) % ADLAR.length]} ${soyad}`;
    const tc = tcUret('6' + String(o.mid).padStart(8, '0'));
    const tel = '551' + String(o.mid).padStart(7, '0');
    let u = db.prepare('SELECT id FROM users WHERE tc_no = ?').get(tc);
    if (!u) u = { id: Number(db.prepare('INSERT INTO users (tc_no, phone, full_name, created_at) VALUES (?,?,?,?)').run(tc, tel, ad, Date.now()).lastInsertRowid) };
    const vm = db.prepare("SELECT id FROM memberships WHERE user_id = ? AND branch_id = ? AND role = 'veli'").get(u.id, o.sube)
      || { id: Number(db.prepare("INSERT INTO memberships (user_id, branch_id, role) VALUES (?,?,'veli')").run(u.id, o.sube).lastInsertRowid) };
    db.prepare('INSERT OR IGNORE INTO guardians (parent_membership_id, student_membership_id) VALUES (?,?)').run(vm.id, o.mid);
    eklenen++;
  }
  // Demo veli <-> demo öğrenci (aynı şube), demo öğrenci bir sınıfa yerleşir
  const dm = (tc, rol) => db.prepare(`SELECT m.id, m.branch_id FROM memberships m JOIN users u ON u.id = m.user_id
                                      WHERE u.tc_no = ? AND m.role = ? AND m.status = 'aktif' ORDER BY m.id LIMIT 1`).get(tc, rol);
  const dOgr = dm('10000000382', 'ogrenci');
  const dVeli = db.prepare(`SELECT m.id FROM memberships m JOIN users u ON u.id = m.user_id
                            WHERE u.tc_no = '10000000450' AND m.role = 'veli' AND m.branch_id = ? AND m.status = 'aktif'`)
    .get(dOgr?.branch_id);
  if (dOgr && dVeli) {
    db.prepare('INSERT OR IGNORE INTO guardians (parent_membership_id, student_membership_id) VALUES (?,?)').run(dVeli.id, dOgr.id);
    const sinif = db.prepare("SELECT id FROM classes WHERE name = '4-A' AND branch_id = ?").get(dOgr.branch_id);
    if (sinif) db.prepare('INSERT OR IGNORE INTO class_students (class_id, student_membership_id) VALUES (?,?)').run(sinif.id, dOgr.id);
  }
  return eklenen;
}

// Demo Öğretmen hesabı da gerçek dersler alsın: Fen Bilimleri derslerinin öğretmeni olur.
function demoOgretmenBagla() {
  const d = db.prepare(`SELECT m.id, m.branch_id FROM memberships m JOIN users u ON u.id = m.user_id
                        WHERE u.tc_no = '10000000214' AND m.role = 'ogretmen' AND m.status = 'aktif' ORDER BY m.id LIMIT 1`).get();
  const ders = db.prepare("SELECT id FROM courses WHERE name = 'Fen Bilimleri'").get();
  if (!d || !ders) return 0;
  db.prepare('INSERT OR IGNORE INTO teacher_courses (teacher_membership_id, course_id) VALUES (?,?)').run(d.id, ders.id);
  const n = Number(db.prepare(`UPDATE assignments SET teacher_membership_id = ?
    WHERE course_id = ? AND class_id IN (SELECT id FROM classes WHERE branch_id = ?)`).run(d.id, ders.id, d.branch_id).changes);
  // Aynı öğretmen birden çok sınıfa atandığı için oluşan saat çakışmalarını çöz
  const c = programCakismalariniDuzelt(GUN, SAAT);
  if (c.tasindi || c.kalan) console.log(`Program çakışması: ${c.tasindi} ders taşındı, ${c.kalan} çözülemedi.`);
  return n;
}

if (db.prepare("SELECT COUNT(*) AS n FROM classes WHERE name = '4-A'").get().n > 0) {
  console.log(`Örnek veri zaten eklenmiş; ${veliBagla()} veli eklendi, Demo Öğretmen ${demoOgretmenBagla()} derse atandı.`);
  process.exit(0);
}

let sube = db.prepare("SELECT id FROM branches WHERE name = 'Merkez Kampüs'").get();
if (!sube) sube = { id: Number(db.prepare("INSERT INTO branches (name) VALUES ('Merkez Kampüs')").run().lastInsertRowid) };
const subeId = sube.id;

const dersId = ad => {
  const r = db.prepare('SELECT id FROM courses WHERE name = ?').get(ad);
  return r ? r.id : Number(db.prepare('INSERT INTO courses (name) VALUES (?)').run(ad).lastInsertRowid);
};

let sayac = 0;
const kullaniciEkle = (rol, tcOnek, telOnek) => {
  const n = sayac++;
  const ad = `${ADLAR[(n * 7 + 3) % ADLAR.length]} ${SOYADLAR[(n * 11 + Math.floor(n / ADLAR.length)) % SOYADLAR.length]}`;
  const tc = tcUret(tcOnek + String(n).padStart(8, '0'));
  const tel = telOnek + String(n).padStart(8, '0');
  const uid = Number(db.prepare('INSERT INTO users (tc_no, phone, full_name, created_at) VALUES (?,?,?,?)')
    .run(tc, tel, ad, Date.now()).lastInsertRowid);
  const mid = Number(db.prepare('INSERT INTO memberships (user_id, branch_id, role) VALUES (?,?,?)')
    .run(uid, subeId, rol).lastInsertRowid);
  return { uid, mid, ad };
};

db.exec('BEGIN');
try {
  // Öğretmenler
  const ogretmenler = {}; // ders adı -> [{mid, ad}]
  for (const [brans, adet] of BRANSLAR) {
    ogretmenler[brans] = [];
    for (let i = 0; i < adet; i++) {
      const o = kullaniciEkle('ogretmen', '4', '553');
      db.prepare('INSERT INTO teacher_courses (teacher_membership_id, course_id) VALUES (?,?)').run(o.mid, dersId(brans));
      ogretmenler[brans].push(o);
    }
  }

  // Sınıflar: 4-A..4-D (İlkokul), 5-A..5-D, 6-A..6-D (Ortaokul)
  const siniflar = [];
  for (const sev of [4, 5, 6]) {
    for (const sube_ of ['A', 'B', 'C', 'D']) {
      const ad = `${sev}-${sube_}`;
      const id = Number(db.prepare('INSERT INTO classes (branch_id, level, name) VALUES (?,?,?)')
        .run(subeId, sev === 4 ? 'İlkokul' : 'Ortaokul', ad).lastInsertRowid);
      siniflar.push({ id, ad, atamalar: [] });
    }
  }

  // Öğrenciler: 200 kişi, sınıflara dengeli (8 sınıf x 17 + 4 sınıf x 16)
  for (let i = 0; i < 200; i++) {
    const o = kullaniciEkle('ogrenci', '5', '552');
    db.prepare('INSERT INTO class_students (class_id, student_membership_id) VALUES (?,?)')
      .run(siniflar[i % siniflar.length].id, o.mid);
  }

  // Ders atamaları (her sınıfa 10 ders, öğretmenler dönüşümlü)
  siniflar.forEach((s, i) => {
    for (const [brans, saat] of Object.entries(SAATLER)) {
      const liste = ogretmenler[brans];
      const ogr = liste[i % liste.length];
      const id = Number(db.prepare(`INSERT INTO assignments (class_id, course_id, teacher_membership_id, weekly_hours)
                                    VALUES (?,?,?,?)`).run(s.id, dersId(brans), ogr.mid, saat).lastInsertRowid);
      s.atamalar.push({ id, brans, ogr: ogr.mid, kalan: saat });
    }
    // Sınıf öğretmeni: o sınıfın Türkçe öğretmeni
    db.prepare('UPDATE classes SET homeroom_membership_id = ? WHERE id = ?')
      .run(s.atamalar.find(a => a.brans === 'Türkçe').ogr, s.id);
  });

  // Haftalık program: çakışmasız, aynı dersi mümkünse farklı günlere dağıt
  const mesgulOgr = new Set();   // `${ogretmen}-${gun}-${saat}`
  const doluSinif = new Set();   // `${sinif}-${gun}-${saat}`
  let yerlesen = 0, yerlesemeyen = 0;
  const parcalar = [];
  for (const s of siniflar) for (const a of s.atamalar) for (let k = 0; k < a.kalan; k++) parcalar.push({ s, a });
  karistir(parcalar);
  const gunSayisi = new Map(); // `${atama}-${gun}` -> adet
  for (const { s, a } of parcalar) {
    const adaylar = [];
    for (let g = 1; g <= GUN; g++) for (let p = 1; p <= SAAT; p++) {
      if (doluSinif.has(`${s.id}-${g}-${p}`) || mesgulOgr.has(`${a.ogr}-${g}-${p}`)) continue;
      adaylar.push({ g, p, puan: (gunSayisi.get(`${a.id}-${g}`) || 0) * 100 + p });
    }
    if (!adaylar.length) { yerlesemeyen++; continue; }
    adaylar.sort((x, y) => x.puan - y.puan);
    const { g, p } = adaylar[0];
    db.prepare('INSERT INTO schedule (class_id, day, period, assignment_id) VALUES (?,?,?,?)').run(s.id, g, p, a.id);
    doluSinif.add(`${s.id}-${g}-${p}`);
    mesgulOgr.add(`${a.ogr}-${g}-${p}`);
    gunSayisi.set(`${a.id}-${g}`, (gunSayisi.get(`${a.id}-${g}`) || 0) + 1);
    yerlesen++;
  }
  const veliSayisi = veliBagla();
  demoOgretmenBagla();
  db.exec('COMMIT');
  console.log(`Veli: ${veliSayisi} (her öğrenciye bir veli bağlandı).`);
  console.log(`Eklendi: 20 öğretmen, 200 öğrenci, ${siniflar.length} sınıf, ${siniflar.length * 10} ders ataması.`);
  console.log(`Haftalık program: ${yerlesen} ders saati yerleşti, ${yerlesemeyen} yerleşemedi.`);
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}
