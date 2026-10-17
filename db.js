import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const dir = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(dir, 'data'), { recursive: true });

export const db = new DatabaseSync(path.join(dir, 'data', 'akant.db'));
db.exec('PRAGMA foreign_keys = ON');

// Hesap (users) ile okuldaki üyelik/rol (memberships) ayrı tutulur.
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY,
  tc_no       TEXT UNIQUE,
  passport_no TEXT UNIQUE,
  phone       TEXT NOT NULL,
  full_name   TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS branches (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS memberships (
  id        INTEGER PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id),
  branch_id INTEGER REFERENCES branches(id),
  role      TEXT NOT NULL CHECK (role IN ('yonetim','ogretmen','ogrenci','veli')),
  status    TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','pasif')),
  UNIQUE (user_id, branch_id, role)
);
CREATE TABLE IF NOT EXISTS otps (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  role       TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  used       INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS classes (
  id        INTEGER PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  level     TEXT NOT NULL,
  name      TEXT NOT NULL,
  UNIQUE (branch_id, name)
);
CREATE TABLE IF NOT EXISTS courses (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
-- Bir sınıfın bir dersi için sorumlu öğretmen ve haftalık ders saati
CREATE TABLE IF NOT EXISTS assignments (
  id                    INTEGER PRIMARY KEY,
  class_id              INTEGER NOT NULL REFERENCES classes(id),
  course_id             INTEGER NOT NULL REFERENCES courses(id),
  teacher_membership_id INTEGER REFERENCES memberships(id),
  weekly_hours          INTEGER NOT NULL DEFAULT 1,
  UNIQUE (class_id, course_id)
);
-- Öğretmenin verebildiği dersler
CREATE TABLE IF NOT EXISTS teacher_courses (
  teacher_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  course_id             INTEGER NOT NULL REFERENCES courses(id),
  PRIMARY KEY (teacher_membership_id, course_id)
);
-- Öğrencinin sınıfı (bir öğrenci aynı anda tek sınıfta)
CREATE TABLE IF NOT EXISTS class_students (
  class_id              INTEGER NOT NULL REFERENCES classes(id),
  student_membership_id INTEGER NOT NULL UNIQUE REFERENCES memberships(id),
  PRIMARY KEY (class_id, student_membership_id)
);
-- Haftalık ders programı: gün (1-5) ve ders saati (1-8) hücreleri
CREATE TABLE IF NOT EXISTS schedule (
  id            INTEGER PRIMARY KEY,
  class_id      INTEGER NOT NULL REFERENCES classes(id),
  day           INTEGER NOT NULL,
  period        INTEGER NOT NULL,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id),
  UNIQUE (class_id, day, period)
);
-- Veli-öğrenci ilişkisi (üyelik düzeyinde)
CREATE TABLE IF NOT EXISTS guardians (
  parent_membership_id  INTEGER NOT NULL REFERENCES memberships(id),
  student_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  PRIMARY KEY (parent_membership_id, student_membership_id)
);
-- Etüt: öğretmenin açtığı ek ders; tarih/saat yerel (okul saati) metin olarak tutulur
CREATE TABLE IF NOT EXISTS etutler (
  id                    INTEGER PRIMARY KEY,
  teacher_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  course_id             INTEGER REFERENCES courses(id),
  topic                 TEXT NOT NULL,
  date                  TEXT NOT NULL,
  start_time            TEXT NOT NULL,
  duration_min          INTEGER NOT NULL,
  place                 TEXT,
  note                  TEXT,
  status                TEXT NOT NULL DEFAULT 'planli' CHECK (status IN ('planli','iptal')),
  created_at            INTEGER NOT NULL
);
-- Etüte davet edilen öğrenciler ve velinin yanıtı
CREATE TABLE IF NOT EXISTS etut_katilimcilar (
  etut_id               INTEGER NOT NULL REFERENCES etutler(id),
  student_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  parent_response       TEXT NOT NULL DEFAULT 'bekliyor' CHECK (parent_response IN ('bekliyor','gelecek','gelmeyecek')),
  responded_at          INTEGER,
  responded_by          INTEGER REFERENCES users(id),
  PRIMARY KEY (etut_id, student_membership_id)
);
-- Ders yoklaması: bir sınıfın belirli tarih ve ders saatindeki devam kaydı
CREATE TABLE IF NOT EXISTS yoklama (
  id                    INTEGER PRIMARY KEY,
  class_id              INTEGER NOT NULL REFERENCES classes(id),
  date                  TEXT NOT NULL,
  period                INTEGER NOT NULL,
  assignment_id         INTEGER NOT NULL REFERENCES assignments(id),
  teacher_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  UNIQUE (class_id, date, period)
);
CREATE TABLE IF NOT EXISTS yoklama_kayit (
  yoklama_id            INTEGER NOT NULL REFERENCES yoklama(id),
  student_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  status                TEXT NOT NULL CHECK (status IN ('geldi','gelmedi','gec','izinli')),
  PRIMARY KEY (yoklama_id, student_membership_id)
);
-- Ders (sınıf+ders ataması) için işlenen konular ve verilen ödevler
CREATE TABLE IF NOT EXISTS konular (
  id            INTEGER PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id),
  date          TEXT NOT NULL,
  title         TEXT NOT NULL,
  note          TEXT,
  created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS odevler (
  id            INTEGER PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id),
  title         TEXT NOT NULL,
  note          TEXT,
  due_date      TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY,
  at         INTEGER NOT NULL,
  actor_id   INTEGER NOT NULL,
  action     TEXT NOT NULL,
  detail     TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  membership_id INTEGER NOT NULL REFERENCES memberships(id),
  expires_at    INTEGER NOT NULL
);
`);

// --- Şema geçişleri (eski veritabanlarını yeni şemaya taşır) ---
const sutunlar = t => db.prepare(`PRAGMA table_info(${t})`).all();
if (!sutunlar('classes').some(c => c.name === 'homeroom_membership_id')) {
  db.exec('ALTER TABLE classes ADD COLUMN homeroom_membership_id INTEGER REFERENCES memberships(id)');
}
if (!sutunlar('etut_katilimcilar').some(c => c.name === 'attendance')) {
  // Etüt yoklaması: NULL = henüz alınmadı
  db.exec("ALTER TABLE etut_katilimcilar ADD COLUMN attendance TEXT CHECK (attendance IN ('geldi','gelmedi','izinli'))");
}
if (!sutunlar('yoklama').some(c => c.name === 'completed_at')) {
  // "Dersi bitir": yoklama + işlenen konu + kazanım tek kayıtta; completed_at dolu = ders tamamlandı
  db.exec('ALTER TABLE yoklama ADD COLUMN topic TEXT');
  db.exec('ALTER TABLE yoklama ADD COLUMN kazanim TEXT');
  db.exec('ALTER TABLE yoklama ADD COLUMN completed_at INTEGER');
  db.exec('UPDATE yoklama SET completed_at = updated_at');
}
if (!sutunlar('yoklama').some(c => c.name === 'cancelled')) {
  db.exec('ALTER TABLE yoklama ADD COLUMN cancelled INTEGER NOT NULL DEFAULT 0');
}
if (!sutunlar('courses').some(c => c.name === 'kisa')) {
  db.exec('ALTER TABLE courses ADD COLUMN kisa TEXT');
  db.exec('ALTER TABLE courses ADD COLUMN renk TEXT');
}
if (!sutunlar('odevler').some(c => c.name === 'yoklama_id')) {
  db.exec('ALTER TABLE odevler ADD COLUMN yoklama_id INTEGER REFERENCES yoklama(id)');
}
if (!sutunlar('konular').some(c => c.name === 'yoklama_id')) {
  db.exec('ALTER TABLE konular ADD COLUMN yoklama_id INTEGER REFERENCES yoklama(id)');
}
if (sutunlar('assignments').find(c => c.name === 'teacher_membership_id')?.notnull === 1) {
  // Öğretmen, sınıfa ders eklendikten sonra atanabilsin: sütun NULL'a izin vermeli.
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`BEGIN;
    CREATE TABLE assignments_yeni (
      id INTEGER PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES classes(id),
      course_id INTEGER NOT NULL REFERENCES courses(id),
      teacher_membership_id INTEGER REFERENCES memberships(id),
      weekly_hours INTEGER NOT NULL DEFAULT 1,
      UNIQUE (class_id, course_id)
    );
    INSERT INTO assignments_yeni SELECT id, class_id, course_id, teacher_membership_id, weekly_hours FROM assignments;
    DROP TABLE assignments;
    ALTER TABLE assignments_yeni RENAME TO assignments;
    COMMIT;`);
  db.exec('PRAGMA foreign_keys = ON');
}

// T.C. kimlik no doğrulama algoritması
export function tcGecerliMi(tc) {
  if (!/^[1-9]\d{10}$/.test(tc)) return false;
  const d = tc.split('').map(Number);
  const d10 = (((d[0] + d[2] + d[4] + d[6] + d[8]) * 7) - (d[1] + d[3] + d[5] + d[7])) % 10;
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return d[9] === ((d10 + 10) % 10) && d[10] === d11;
}

function tcUret(ilk9) {
  const d = ilk9.split('').map(Number);
  const d10 = ((((d[0] + d[2] + d[4] + d[6] + d[8]) * 7) - (d[1] + d[3] + d[5] + d[7])) % 10 + 10) % 10;
  const d11 = (d.reduce((a, b) => a + b, 0) + d10) % 10;
  return ilk9 + d10 + d11;
}

function seed() {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return false;
  const now = Date.now();
  const sube = db.prepare('INSERT INTO branches (name) VALUES (?)');
  const kisi = db.prepare('INSERT INTO users (tc_no, phone, full_name, created_at) VALUES (?,?,?,?)');
  const uye = db.prepare('INSERT INTO memberships (user_id, branch_id, role) VALUES (?,?,?)');

  const merkez = Number(sube.run('Merkez Kampüs').lastInsertRowid);
  const ikinci = Number(sube.run('İkinci Şube').lastInsertRowid);

  // Yalnızca DEMO verisidir; gerçek kişilerle ilgisi yoktur.
  const demo = [
    ['100000001', '5550000001', 'Demo Yönetici', [[merkez, 'yonetim']]],
    ['100000002', '5550000002', 'Demo Öğretmen', [[merkez, 'ogretmen']]],
    ['100000003', '5550000003', 'Demo Öğrenci', [[merkez, 'ogrenci']]],
    ['100000004', '5550000004', 'Demo Veli', [[merkez, 'veli']]],
    // Aynı hesap, birden fazla rol/şube: hesap ≠ üyelik
    ['100000005', '5550000005', 'Demo Öğretmen-Veli', [[merkez, 'ogretmen'], [ikinci, 'veli']]],
  ];
  const cikti = [];
  for (const [ilk9, tel, ad, uyelikler] of demo) {
    const tc = tcUret(ilk9);
    const id = Number(kisi.run(tc, tel, ad, now).lastInsertRowid);
    for (const [b, r] of uyelikler) uye.run(id, b, r);
    cikti.push({ ad, tc, tel, roller: uyelikler.map(u => u[1]).join(', ') });
  }
  return cikti;
}

if (process.argv.includes('--seed')) {
  const sonuc = seed();
  if (!sonuc) console.log('Veritabanı zaten dolu, demo verisi eklenmedi.');
  else console.table(sonuc);
}

export { seed };
