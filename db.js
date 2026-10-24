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
-- Sınav (optik/test): cevap anahtarı, yanlış götürme katsayısı ve öğrenci cevapları; sonuçlar cevaplardan hesaplanır
CREATE TABLE IF NOT EXISTS sinavlar (
  id                    INTEGER PRIMARY KEY,
  name                  TEXT NOT NULL,
  date                  TEXT NOT NULL,
  teacher_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  yanlis_kat            INTEGER NOT NULL DEFAULT 0,
  created_at            INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sinav_siniflar (
  sinav_id INTEGER NOT NULL REFERENCES sinavlar(id),
  class_id INTEGER NOT NULL REFERENCES classes(id),
  PRIMARY KEY (sinav_id, class_id)
);
CREATE TABLE IF NOT EXISTS sinav_dersler (
  id          INTEGER PRIMARY KEY,
  sinav_id    INTEGER NOT NULL REFERENCES sinavlar(id),
  ders        TEXT NOT NULL,
  soru_sayisi INTEGER NOT NULL,
  anahtar     TEXT NOT NULL,
  iptal       TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS sinav_cevaplar (
  sinav_ders_id         INTEGER NOT NULL REFERENCES sinav_dersler(id),
  student_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  cevaplar              TEXT NOT NULL,
  PRIMARY KEY (sinav_ders_id, student_membership_id)
);
-- Sorunun ölçtüğü kazanım: dersi veren öğretmenler ortak girer, doğru yapan öğrenci bu kazanımı edinmiş sayılır
CREATE TABLE IF NOT EXISTS sinav_kazanim (
  sinav_ders_id INTEGER NOT NULL REFERENCES sinav_dersler(id),
  soru_no       INTEGER NOT NULL,
  kazanim       TEXT NOT NULL,
  guncelleyen   INTEGER NOT NULL REFERENCES memberships(id),
  tarih         INTEGER NOT NULL,
  PRIMARY KEY (sinav_ders_id, soru_no)
);
-- Öğretmenin "bu eksik kazanımı tekrar ettim" diyerek kapattığı hatırlatmalar (hatırlatmalar sınav sonuçlarından hesaplanır)
CREATE TABLE IF NOT EXISTS kazanim_hatirlatma_kapat (
  teacher_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  sinav_id              INTEGER NOT NULL,
  class_id              INTEGER NOT NULL,
  kazanim               TEXT NOT NULL,
  tarih                 INTEGER NOT NULL,
  PRIMARY KEY (teacher_membership_id, sinav_id, class_id, kazanim)
);
-- Müfredat takibi: öğretmenin bir kazanım için "anlatıldı" ya da "atlanacak" işareti (girişler dersten, konudan ve ödevden okunur)
CREATE TABLE IF NOT EXISTS mufredat_isaret (
  teacher_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  class_id              INTEGER NOT NULL,
  ders                  TEXT NOT NULL,
  kod                   TEXT NOT NULL,
  tur                   TEXT NOT NULL CHECK (tur IN ('islendi','atla')),
  tarih                 INTEGER NOT NULL,
  PRIMARY KEY (teacher_membership_id, class_id, ders, kod)
);
-- Kişinin kendi girdiği iletişim bilgileri (giriş telefonu ve kimlik users tablosunda kalır, yalnızca yönetim değiştirir)
CREATE TABLE IF NOT EXISTS profil_bilgi (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id),
  email          TEXT NOT NULL DEFAULT '',
  telefon2       TEXT NOT NULL DEFAULT '',
  il             TEXT NOT NULL DEFAULT '',
  ilce           TEXT NOT NULL DEFAULT '',
  adres          TEXT NOT NULL DEFAULT '',
  yakin_ad       TEXT NOT NULL DEFAULT '',
  yakin_yakinlik TEXT NOT NULL DEFAULT '',
  yakin_telefon  TEXT NOT NULL DEFAULT '',
  guncelleme     INTEGER NOT NULL
);
-- Öğrenci kulüpleri: okulun açtığı, müfredatı olmayan etkinlik grupları; haftalık ders programında "Kulüp" saati vardır
CREATE TABLE IF NOT EXISTS kulupler (
  id         INTEGER PRIMARY KEY,
  branch_id  INTEGER NOT NULL REFERENCES branches(id),
  ad         TEXT NOT NULL,
  tema       TEXT NOT NULL DEFAULT '',
  aciklama   TEXT NOT NULL DEFAULT '',
  kontenjan  INTEGER NOT NULL,
  gun        INTEGER NOT NULL,
  ders_saati INTEGER NOT NULL,
  seviyeler  TEXT NOT NULL DEFAULT '',
  aktif      INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE (branch_id, ad)
);
CREATE TABLE IF NOT EXISTS kulup_ogretmen (
  kulup_id              INTEGER NOT NULL REFERENCES kulupler(id),
  teacher_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  PRIMARY KEY (kulup_id, teacher_membership_id)
);
-- Bir öğrenci aynı anda tek kulüpte (kulüp saati sınıfça ortak olduğu için)
CREATE TABLE IF NOT EXISTS kulup_uyeler (
  kulup_id              INTEGER NOT NULL REFERENCES kulupler(id),
  student_membership_id INTEGER NOT NULL UNIQUE REFERENCES memberships(id),
  tarih                 INTEGER NOT NULL,
  PRIMARY KEY (kulup_id, student_membership_id)
);
-- Öğrenci/veli "girmek istiyorum" der (en çok 3 tercih); yerleştirmeyi okul yapar
CREATE TABLE IF NOT EXISTS kulup_talepleri (
  id                    INTEGER PRIMARY KEY,
  student_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  kulup_id              INTEGER NOT NULL REFERENCES kulupler(id),
  sira                  INTEGER NOT NULL CHECK (sira BETWEEN 1 AND 3),
  durum                 TEXT NOT NULL DEFAULT 'bekliyor' CHECK (durum IN ('bekliyor','kabul','red')),
  tarih                 INTEGER NOT NULL,
  UNIQUE (student_membership_id, kulup_id),
  UNIQUE (student_membership_id, sira)
);
CREATE TABLE IF NOT EXISTS kulup_calismalar (
  id                    INTEGER PRIMARY KEY,
  kulup_id              INTEGER NOT NULL REFERENCES kulupler(id),
  tarih                 TEXT NOT NULL,
  tur                   TEXT NOT NULL CHECK (tur IN ('deney','proje','sunum','gezi','diger')),
  baslik                TEXT NOT NULL,
  aciklama              TEXT NOT NULL DEFAULT '',
  teacher_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  created_at            INTEGER NOT NULL,
  tamamlandi            INTEGER,
  iptal                 INTEGER NOT NULL DEFAULT 0,
  UNIQUE (kulup_id, tarih)
);
CREATE TABLE IF NOT EXISTS kulup_katilim (
  calisma_id            INTEGER NOT NULL REFERENCES kulup_calismalar(id),
  student_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  durum                 TEXT NOT NULL CHECK (durum IN ('geldi','gelmedi','izinli')),
  PRIMARY KEY (calisma_id, student_membership_id)
);
-- Gelişim raporu: yönetim başlıkları ve dönemleri belirler, öğretmenler dönem açıkken öğrenci başına başlık başlık yazar
CREATE TABLE IF NOT EXISTS gelisim_basliklari (
  id         INTEGER PRIMARY KEY,
  branch_id  INTEGER NOT NULL REFERENCES branches(id),
  ad         TEXT NOT NULL,
  aciklama   TEXT NOT NULL DEFAULT '',
  sira       INTEGER NOT NULL,
  aktif      INTEGER NOT NULL DEFAULT 1,
  UNIQUE (branch_id, ad)
);
CREATE TABLE IF NOT EXISTS gelisim_donemleri (
  id               INTEGER PRIMARY KEY,
  branch_id        INTEGER NOT NULL REFERENCES branches(id),
  ad               TEXT NOT NULL,
  baslangic        TEXT NOT NULL,
  bitis            TEXT NOT NULL,
  toplanti_tarihi  TEXT,
  created_at       INTEGER NOT NULL,
  UNIQUE (branch_id, ad)
);
CREATE TABLE IF NOT EXISTS gelisim_girisleri (
  donem_id              INTEGER NOT NULL REFERENCES gelisim_donemleri(id),
  baslik_id             INTEGER NOT NULL REFERENCES gelisim_basliklari(id),
  student_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  teacher_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  metin                 TEXT NOT NULL,
  guncelleme            INTEGER NOT NULL,
  PRIMARY KEY (donem_id, baslik_id, student_membership_id, teacher_membership_id)
);
-- Veli toplantısı sonucu ya da veli görüşmesi notu (isteğe bağlı olarak bir döneme bağlı)
CREATE TABLE IF NOT EXISTS gelisim_gorusmeleri (
  id                    INTEGER PRIMARY KEY,
  student_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  donem_id              INTEGER REFERENCES gelisim_donemleri(id),
  tur                   TEXT NOT NULL CHECK (tur IN ('toplanti','gorusme')),
  tarih                 TEXT NOT NULL,
  notu                  TEXT NOT NULL,
  yazan_membership_id   INTEGER NOT NULL REFERENCES memberships(id),
  created_at            INTEGER NOT NULL
);
-- Ödev takibi: öğrencinin işareti (yapıldı / yapamadı), öğretmenin doğrulaması; satır yoksa ödev "verildi" durumundadır
CREATE TABLE IF NOT EXISTS odev_durumlari (
  odev_id               INTEGER NOT NULL REFERENCES odevler(id) ON DELETE CASCADE,
  student_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  durum                 TEXT NOT NULL CHECK (durum IN ('yapildi','yapilamadi','dogrulandi','duzeltme')),
  ogrenci_notu          TEXT,
  ogretmen_notu         TEXT,
  isaret_zamani         INTEGER,
  dogrulama_zamani      INTEGER,
  guncelleme            INTEGER NOT NULL,
  PRIMARY KEY (odev_id, student_membership_id)
);
-- Öğrencinin yüklediği fotoğraflar: mesaj_id boşsa ödevin teslimi, doluysa sorunun eki
CREATE TABLE IF NOT EXISTS odev_dosyalari (
  id                    INTEGER PRIMARY KEY,
  odev_id               INTEGER NOT NULL REFERENCES odevler(id) ON DELETE CASCADE,
  student_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  mesaj_id              INTEGER,
  amac                  TEXT NOT NULL CHECK (amac IN ('teslim','soru')),
  mime                  TEXT NOT NULL,
  boyut                 INTEGER NOT NULL,
  veri                  BLOB NOT NULL,
  created_at            INTEGER NOT NULL
);
-- Ödev altındaki öğrenci-öğretmen yazışması (soru ve cevap); okundu: karşı taraf açıp gördü mü
CREATE TABLE IF NOT EXISTS odev_mesajlari (
  id                    INTEGER PRIMARY KEY,
  odev_id               INTEGER NOT NULL REFERENCES odevler(id) ON DELETE CASCADE,
  student_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  yazan_membership_id   INTEGER NOT NULL REFERENCES memberships(id),
  yazan_rol             TEXT NOT NULL CHECK (yazan_rol IN ('ogrenci','ogretmen')),
  metin                 TEXT NOT NULL,
  okundu                INTEGER NOT NULL DEFAULT 0,
  created_at            INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_odev_mesaj ON odev_mesajlari (odev_id, student_membership_id);
CREATE INDEX IF NOT EXISTS ix_odev_dosya ON odev_dosyalari (odev_id, student_membership_id);
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
if (!sutunlar('kulup_calismalar').some(c => c.name === 'tamamlandi')) {
  // Kulüp dersi: tarihi ve saati sabit, önceden planlanabilir; tamamlandi NULL = henüz işlenmedi
  db.exec('ALTER TABLE kulup_calismalar ADD COLUMN tamamlandi INTEGER');
  db.exec('ALTER TABLE kulup_calismalar ADD COLUMN iptal INTEGER NOT NULL DEFAULT 0');
  db.exec('UPDATE kulup_calismalar SET tamamlandi = created_at');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS kulup_calisma_gun ON kulup_calismalar (kulup_id, tarih)');
}
if (!sutunlar('classes').some(c => c.name === 'homeroom_membership_id')) {
  db.exec('ALTER TABLE classes ADD COLUMN homeroom_membership_id INTEGER REFERENCES memberships(id)');
}
if (!sutunlar('etut_katilimcilar').some(c => c.name === 'attendance')) {
  // Etüt yoklaması: NULL = henüz alınmadı
  db.exec("ALTER TABLE etut_katilimcilar ADD COLUMN attendance TEXT CHECK (attendance IN ('geldi','gelmedi','izinli'))");
}
if (!sutunlar('odevler').some(c => c.name === 'visible_from')) {
  // Planlı ödev: bu tarihe kadar öğrenci ve veli görmez (NULL = hemen görünür)
  db.exec('ALTER TABLE odevler ADD COLUMN visible_from TEXT');
}
if (!sutunlar('konular').some(c => c.name === 'kazanim')) {
  // Konuya bağlanan kazanım (sınavdaki kazanımla eşleştirilir)
  db.exec('ALTER TABLE konular ADD COLUMN kazanim TEXT');
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
if (!sutunlar('courses').some(c => c.name === 'stil_ad')) {
  db.exec('ALTER TABLE courses ADD COLUMN stil_ad TEXT');
}
if (!sutunlar('courses').some(c => c.name === 'kisa')) {
  db.exec('ALTER TABLE courses ADD COLUMN kisa TEXT');
  db.exec('ALTER TABLE courses ADD COLUMN renk TEXT');
}
if (!sutunlar('sinavlar').some(c => c.name === 'yayin')) {
  // Sonuçlar öğretmen "yayınla" deyince öğrenci/veliye görünür
  db.exec('ALTER TABLE sinavlar ADD COLUMN yayin INTEGER NOT NULL DEFAULT 0');
}
if (!sutunlar('memberships').some(c => c.name === 'okul_no')) {
  // Okul numarası: şube içinde öğrenciye özgü; optik okuyucu dosyalarında öğrenci eşleştirmesi bununla yapılır
  db.exec('ALTER TABLE memberships ADD COLUMN okul_no TEXT');
}
if (!sutunlar('sinavlar').some(c => c.name === 'tur')) {
  // 'test': optik/cevap anahtarlı sınav · 'yazili': öğretmenin öğrenci puanlarını tek tek girdiği yazılı sınav
  db.exec("ALTER TABLE sinavlar ADD COLUMN tur TEXT NOT NULL DEFAULT 'test'");
}
if (!sutunlar('sinavlar').some(c => c.name === 'duzey')) {
  // Sınavı yönetim açar: duzey = sınıf düzeyi (5-8, tüm şubeler), durum = taslak | aktif (aktifken ders öğretmenleri girer),
  // amac = deneme | acilis (açılış sınavı sonuçları yalnız okulda kalır)
  db.exec('ALTER TABLE sinavlar ADD COLUMN duzey INTEGER');
  db.exec("ALTER TABLE sinavlar ADD COLUMN durum TEXT NOT NULL DEFAULT 'aktif'");
  db.exec("ALTER TABLE sinavlar ADD COLUMN amac TEXT NOT NULL DEFAULT 'deneme'");
  // Dersin soru/anahtar/kazanım kısmını ders öğretmeni onaylar; eski kayıtlar onaylı sayılır
  db.exec('ALTER TABLE sinav_dersler ADD COLUMN onay INTEGER NOT NULL DEFAULT 1');
  db.exec('ALTER TABLE sinav_dersler ADD COLUMN onaylayan INTEGER REFERENCES memberships(id)');
  db.exec('ALTER TABLE sinav_dersler ADD COLUMN onay_tarih INTEGER');
  for (const s of db.prepare('SELECT s.id, MIN(c.name) AS sinif FROM sinavlar s JOIN sinav_siniflar ss ON ss.sinav_id = s.id JOIN classes c ON c.id = ss.class_id GROUP BY s.id').all()) {
    db.prepare('UPDATE sinavlar SET duzey = ? WHERE id = ?').run(parseInt(s.sinif, 10) || null, s.id);
  }
}
// Yazılı sınav: öğrencinin puanı (0-100) ve sınavın bütününün ölçtüğü kazanımlar (soru eşlemesi yok)
db.exec(`
CREATE TABLE IF NOT EXISTS sinav_puanlar (
  sinav_ders_id         INTEGER NOT NULL REFERENCES sinav_dersler(id),
  student_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  puan                  REAL NOT NULL,
  PRIMARY KEY (sinav_ders_id, student_membership_id)
);
CREATE TABLE IF NOT EXISTS sinav_genel_kazanim (
  sinav_id INTEGER NOT NULL REFERENCES sinavlar(id),
  sira     INTEGER NOT NULL,
  kazanim  TEXT NOT NULL,
  PRIMARY KEY (sinav_id, sira)
);
`);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_okul_no ON memberships (branch_id, okul_no) WHERE okul_no IS NOT NULL');

// Şubedeki sıradaki okul numarası (1001'den başlar)
export function sonrakiOkulNo(subeId) {
  const son = db.prepare("SELECT MAX(CAST(okul_no AS INTEGER)) AS n FROM memberships WHERE branch_id = ? AND role = 'ogrenci' AND okul_no GLOB '[0-9]*'").get(subeId).n;
  return String(Math.max(1000, son || 0) + 1);
}
// Numarası olmayan öğrencilere sırayla numara verir (eski kayıtlar, örnek veri); tekrar çalıştırmak güvenlidir
export function okulNoDoldur() {
  const eksik = db.prepare("SELECT id, branch_id FROM memberships WHERE role = 'ogrenci' AND okul_no IS NULL ORDER BY id").all();
  for (const m of eksik) db.prepare('UPDATE memberships SET okul_no = ? WHERE id = ?').run(sonrakiOkulNo(m.branch_id), m.id);
}
okulNoDoldur();
if (!sutunlar('odevler').some(c => c.name === 'yoklama_id')) {
  db.exec('ALTER TABLE odevler ADD COLUMN yoklama_id INTEGER REFERENCES yoklama(id)');
}
if (!sutunlar('users').some(c => c.name === 'foto')) {
  // Profil fotoğrafı: public/ altındaki yol (örn. /foto/ad.jpg)
  db.exec('ALTER TABLE users ADD COLUMN foto TEXT');
}
// Yüklenen profil fotoğrafları (users.foto yoksa bunlar kullanılır); istemci küçültüp gönderir
db.exec(`CREATE TABLE IF NOT EXISTS kullanici_foto (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mime TEXT NOT NULL, veri BLOB NOT NULL, guncelleme INTEGER NOT NULL
)`);
// Kullanıcının fotoğraf adresi: önce users.foto, sonra yüklenen fotoğraf (sürüm numarası önbelleği yeniler)
export const FOTO_SQL = `COALESCE(u.foto, (SELECT '/api/foto?id=' || u.id || '&v=' || kf.guncelleme FROM kullanici_foto kf WHERE kf.user_id = u.id))`;
if (!sutunlar('odevler').some(c => c.name === 'kazanim')) {
  db.exec('ALTER TABLE odevler ADD COLUMN kazanim TEXT');
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
    ['100000002', '5550000002', 'Ceren Husny', [[merkez, 'ogretmen']]],
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

// Aynı öğretmen aynı gün/saatte iki sınıfta ders veremez (veritabanı düzeyinde güvence).
for (const olay of ['INSERT', 'UPDATE']) {
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS schedule_ogretmen_cakisma_${olay.toLowerCase()}
    BEFORE ${olay} ON schedule
    WHEN EXISTS (
      SELECT 1 FROM schedule s
      JOIN assignments a ON a.id = s.assignment_id
      JOIN memberships m ON m.id = a.teacher_membership_id
      JOIN assignments na ON na.id = NEW.assignment_id
      JOIN memberships nm ON nm.id = na.teacher_membership_id
      WHERE m.user_id = nm.user_id AND s.day = NEW.day AND s.period = NEW.period
        AND s.class_id != NEW.class_id
    )
    BEGIN SELECT RAISE(ABORT, 'Öğretmen bu saatte başka bir sınıfta derste'); END;
  `);
}

// Mevcut çakışmaları çözer: çakışan dersi o sınıf ve öğretmen için boş başka bir saate taşır.
export function programCakismalariniDuzelt(gunSayisi = 5, saatSayisi = 8) {
  const ogretmenSatir = `SELECT s.id, s.class_id, s.day, s.period, m.user_id AS u
    FROM schedule s JOIN assignments a ON a.id = s.assignment_id
    JOIN memberships m ON m.id = a.teacher_membership_id`;
  const hepsi = db.prepare(ogretmenSatir + ' ORDER BY s.id').all();
  const ogrMesgul = new Set(hepsi.map(r => `${r.u}-${r.day}-${r.period}`));
  const sinifDolu = new Set(hepsi.map(r => `${r.class_id}-${r.day}-${r.period}`));
  const gorulen = new Set();
  const tasinacak = [];
  for (const r of hepsi) {
    const k = `${r.u}-${r.day}-${r.period}`;
    if (gorulen.has(k)) tasinacak.push(r); else gorulen.add(k);
  }
  // Taşınanların eski yuvası yalnızca kendi sınıfı için boşalır; öğretmen yuvası ilk dersle dolu kalır.
  let tasindi = 0, kalan = 0;
  const upd = db.prepare('UPDATE schedule SET day = ?, period = ? WHERE id = ?');
  for (const r of tasinacak) {
    sinifDolu.delete(`${r.class_id}-${r.day}-${r.period}`);
    let yer = null;
    for (let g = 0; g < gunSayisi && !yer; g++) {
      const gun = ((r.day - 1 + g) % gunSayisi) + 1;
      for (let p = 1; p <= saatSayisi; p++) {
        if (!sinifDolu.has(`${r.class_id}-${gun}-${p}`) && !ogrMesgul.has(`${r.u}-${gun}-${p}`)) { yer = { gun, p }; break; }
      }
    }
    if (!yer) { sinifDolu.add(`${r.class_id}-${r.day}-${r.period}`); kalan++; continue; }
    upd.run(yer.gun, yer.p, r.id);
    sinifDolu.add(`${r.class_id}-${yer.gun}-${yer.p}`);
    ogrMesgul.add(`${r.u}-${yer.gun}-${yer.p}`);
    tasindi++;
  }
  return { tasindi, kalan };
}
