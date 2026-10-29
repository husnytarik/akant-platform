import { db, tcGecerliMi, FOTO_SQL } from './db.js';
import { resimTuru, hamGovde } from './foto.js';
import { ekRolAdlari } from './yetki.js';

// Kurum profili (tek kayıt) ve okul yönetimi (müdür, müdür yardımcıları).
// Giriş yetkisi üyelikten gelir: memberships.gorev = 'kurum' (asıl yönetim) ya da 'okul' (yalnızca okul yönetimi).
// Bir kişi ikisini birden taşıyabilir: üyeliği 'kurum' kalır, okul görevleri okul_yoneticileri'nde tutulur.
db.exec(`
CREATE TABLE IF NOT EXISTS kurum (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  ad         TEXT NOT NULL,
  kisa_ad    TEXT NOT NULL DEFAULT '',
  telefon    TEXT NOT NULL DEFAULT '',
  eposta     TEXT NOT NULL DEFAULT '',
  web        TEXT NOT NULL DEFAULT '',
  adres      TEXT NOT NULL DEFAULT '',
  guncelleme INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kurum_logo (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  mime       TEXT NOT NULL,
  veri       BLOB NOT NULL,
  guncelleme INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS okul_yoneticileri (
  id         INTEGER PRIMARY KEY,
  branch_id  INTEGER NOT NULL REFERENCES branches(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  gorev      TEXT NOT NULL CHECK (gorev IN ('mudur','mudur_yrd')),
  created_at INTEGER NOT NULL,
  UNIQUE (branch_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS okul_mudur_tek ON okul_yoneticileri (branch_id) WHERE gorev = 'mudur';
INSERT OR IGNORE INTO kurum (id, ad, guncelleme) VALUES (1, 'Yeni Okul', 0);`);
if (!db.prepare('PRAGMA table_info(memberships)').all().some(c => c.name === 'gorev')) {
  db.exec("ALTER TABLE memberships ADD COLUMN gorev TEXT NOT NULL DEFAULT 'kurum'");
}

export const GOREVLER = { mudur: 'Müdür', mudur_yrd: 'Müdür yardımcısı' };
export const OKUL_TURLERI = ['Anaokulu', 'İlkokul', 'Ortaokul', 'Lise'];

// Boş veritabanında ilk okulu ve ilk yöneticiyi kurar (üyelik ile başlayan kurulum). Dolu veritabanında reddeder.
export function ilkOkulKur({ ad, tc, telefon, okul }) {
  const adSoyad = String(ad ?? '').trim().slice(0, 80);
  const tcNo = String(tc ?? '').replace(/\D/g, '');
  const tel = String(telefon ?? '').replace(/\D/g, '').slice(-10);
  const okulAd = String(okul ?? '').trim().slice(0, 120);
  if (adSoyad.length < 3 || !adSoyad.includes(' ')) return { hata: 'Ad ve soyadı yazın' };
  if (!tcGecerliMi(tcNo)) return { hata: 'T.C. kimlik numarası geçersiz' };
  if (!/^5\d{9}$/.test(tel)) return { hata: 'Telefon 5 ile başlayan 10 haneli olmalı' };
  if (okulAd.length < 2) return { hata: 'Okul adını yazın' };
  db.exec('BEGIN IMMEDIATE');
  try {
    if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) { db.exec('ROLLBACK'); return { hata: 'Kurulum daha önce yapılmış', durum: 403 }; }
    db.prepare("INSERT OR IGNORE INTO kampusler (name) VALUES ('Ana Kampüs')").run();
    const sube = Number(db.prepare("INSERT INTO branches (name, campus_id) VALUES (?, (SELECT MIN(id) FROM kampusler))").run(okulAd).lastInsertRowid);
    const kisi = Number(db.prepare('INSERT INTO users (tc_no, phone, full_name, created_at) VALUES (?,?,?,?)').run(tcNo, tel, adSoyad, Date.now()).lastInsertRowid);
    db.prepare("INSERT INTO memberships (user_id, branch_id, role) VALUES (?,?,'yonetim')").run(kisi, sube);
    db.prepare('UPDATE kurum SET ad = ? WHERE id = 1').run(okulAd);
    db.exec('COMMIT');
    return { kullaniciId: kisi };
  } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
}

const metin = (v, azami) => String(v ?? '').trim().slice(0, azami);
const tamSayi = (v, min, max) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : null; };
const telNormalize = t => String(t || '').replace(/\D/g, '').slice(-10);
const eposta = v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// Üyeliğin başlığı: "Kurum yönetimi · Meltem Ortaokulu müdürü"
export function yonetimUnvani(uyelikId) {
  const m = db.prepare('SELECT user_id, gorev FROM memberships WHERE id = ?').get(uyelikId);
  if (!m) return 'Yönetim';
  const gorevler = db.prepare(`SELECT y.gorev, b.name FROM okul_yoneticileri y JOIN branches b ON b.id = y.branch_id
    WHERE y.user_id = ? ORDER BY b.name`).all(m.user_id).map(r => `${r.name} ${r.gorev === 'mudur' ? 'müdürü' : 'müdür yardımcısı'}`);
  return [m.gorev === 'kurum' ? 'Kurum yönetimi' : '', ...gorevler, ...ekRolAdlari(m.user_id)].filter(Boolean).join(' · ') || 'Okul yönetimi';
}

function kurumVerisi(o) {
  const kurum = db.prepare('SELECT ad, kisa_ad AS kisaAd, telefon, eposta, web, adres FROM kurum WHERE id = 1').get();
  const logo = db.prepare("SELECT 'v' || guncelleme AS v FROM kurum_logo WHERE id = 1").get()?.v || null;
  const yoneticiler = db.prepare(`
    SELECT y.id, y.branch_id AS okulId, y.user_id AS userId, y.gorev, u.full_name AS ad, u.phone AS telefon, ${FOTO_SQL} AS foto
    FROM okul_yoneticileri y JOIN users u ON u.id = y.user_id ORDER BY y.gorev, u.full_name`).all();
  const okullar = db.prepare(`
    SELECT b.id, b.name AS ad, b.campus_id AS kampusId, b.tur, b.kurum_kodu AS kurumKodu, b.telefon, b.eposta, b.adres,
           (SELECT 'v' || l.guncelleme FROM okul_logo l WHERE l.branch_id = b.id) AS logo,
           (SELECT COUNT(*) FROM classes c WHERE c.branch_id = b.id) AS sinif,
           (SELECT COUNT(*) FROM memberships m WHERE m.branch_id = b.id AND m.role = 'ogrenci' AND m.status = 'aktif') AS ogrenci,
           (SELECT COUNT(*) FROM memberships m WHERE m.branch_id = b.id AND m.role = 'ogretmen' AND m.status = 'aktif') AS ogretmen
    FROM branches b ORDER BY b.id`).all().map(x => ({ ...x, yoneticiler: yoneticiler.filter(y => y.okulId === x.id) }));
  const kampusler = db.prepare('SELECT id, name AS ad, adres, telefon FROM kampusler ORDER BY id').all()
    .map(k => ({ ...k, okullar: okullar.filter(x => x.kampusId === k.id) }));
  const adaylar = db.prepare(`
    SELECT u.id AS userId, u.full_name AS ad, GROUP_CONCAT(DISTINCT CASE m.role WHEN 'yonetim' THEN 'Yönetim' ELSE 'Öğretmen' END) AS rol, MIN(b.name) AS okul
    FROM users u JOIN memberships m ON m.user_id = u.id AND m.status = 'aktif' AND m.role IN ('yonetim','ogretmen')
    LEFT JOIN branches b ON b.id = m.branch_id GROUP BY u.id ORDER BY u.full_name`).all();
  return { kurum, logo, kampusler, adaylar, turler: OKUL_TURLERI, gorevler: GOREVLER, kurumYonetimi: o.gorev === 'kurum' };
}

export async function kurumApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  const hata = (kod, mesaj) => (json(res, kod, { hata: mesaj }), true);
  const ok = (kod = 200, ek = {}) => (json(res, kod, { tamam: true, ...ek }), true);

  if (req.method === 'GET' && yol === '/api/yonetim/kurum') { json(res, 200, kurumVerisi(o)); return true; }
  if (req.method !== 'POST') return false;
  const yollar = ['/api/yonetim/kurum-kaydet', '/api/yonetim/kurum-logo', '/api/yonetim/kurum-logo-sil', '/api/yonetim/yonetici-ekle', '/api/yonetim/yonetici-kaldir'];
  if (!yollar.includes(yol)) return false;
  if (o.gorev !== 'kurum') return hata(403, 'Bu işlem yalnızca kurum yönetimine açıktır');

  if (yol === '/api/yonetim/kurum-logo') {
    const buf = await hamGovde(req, 1024 * 1024);
    if (!buf) return hata(413, 'Logo çok büyük (en çok 1 MB)');
    const mime = resimTuru(buf);
    if (!mime) return hata(400, 'Yalnızca JPEG, PNG veya WebP logo yüklenebilir');
    db.prepare(`INSERT INTO kurum_logo (id, mime, veri, guncelleme) VALUES (1,?,?,?)
      ON CONFLICT (id) DO UPDATE SET mime = excluded.mime, veri = excluded.veri, guncelleme = excluded.guncelleme`).run(mime, buf, Date.now());
    denetle(o.user_id, 'kurum-logo', {});
    return ok();
  }
  if (yol === '/api/yonetim/kurum-logo-sil') {
    db.prepare('DELETE FROM kurum_logo WHERE id = 1').run();
    denetle(o.user_id, 'kurum-logo-sil', {});
    return ok();
  }

  const b = await govde(req);

  if (yol === '/api/yonetim/kurum-kaydet') {
    const ad = metin(b.ad, 80);
    if (ad.length < 2) return hata(400, 'Kurum adı en az 2 karakter olmalı');
    const ep = metin(b.eposta, 80);
    if (!eposta(ep)) return hata(400, 'E-posta adresi geçersiz');
    db.prepare('UPDATE kurum SET ad = ?, kisa_ad = ?, telefon = ?, eposta = ?, web = ?, adres = ?, guncelleme = ? WHERE id = 1')
      .run(ad, metin(b.kisaAd, 30), metin(b.telefon, 30), ep, metin(b.web, 100), metin(b.adres, 200), Date.now());
    denetle(o.user_id, 'kurum-kaydet', { ad });
    return ok();
  }

  if (yol === '/api/yonetim/yonetici-ekle') {
    const okulId = tamSayi(b.okulId, 1, 1e9);
    if (!okulId || !db.prepare('SELECT 1 FROM branches WHERE id = ?').get(okulId)) return hata(404, 'Okul bulunamadı');
    if (!GOREVLER[b.gorev]) return hata(400, 'Görev seçin (müdür ya da müdür yardımcısı)');

    // Kişi: listeden seçilir ya da yeni hesap açılır (kimlik zaten kayıtlıysa telefon eşleşmelidir)
    let kisi = null;
    if (!bos(b.userId)) {
      kisi = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(tamSayi(b.userId, 1, 1e9));
      if (!kisi) return hata(404, 'Kişi bulunamadı');
    } else {
      const ad = metin(b.ad, 80), kimlik = String(b.kimlik || '').trim().toUpperCase(), tel = telNormalize(b.telefon);
      const tcMi = /^\d{11}$/.test(kimlik);
      if (ad.length < 3) return hata(400, 'Ad soyad en az 3 karakter olmalı');
      if (tcMi ? !tcGecerliMi(kimlik) : !/^[A-Z0-9]{5,20}$/.test(kimlik)) return hata(400, 'Kimlik / pasaport numarası geçersiz');
      if (!/^\d{10}$/.test(tel)) return hata(400, 'Telefon 10 haneli olmalı');
      kisi = db.prepare('SELECT id, full_name, phone FROM users WHERE tc_no = gz(?) OR passport_no = gz(?)').get(kimlik, kimlik);
      if (kisi && kisi.phone !== tel) return hata(409, 'Bu kimlik numarası başka bir telefonla kayıtlı');
      if (!kisi) {
        const id = Number(db.prepare('INSERT INTO users (tc_no, passport_no, phone, full_name, created_at) VALUES (?,?,?,?,?)')
          .run(tcMi ? kimlik : null, tcMi ? null : kimlik, tel, ad, Date.now()).lastInsertRowid);
        kisi = { id, full_name: ad };
      }
    }

    if (db.prepare('SELECT 1 FROM okul_yoneticileri WHERE branch_id = ? AND user_id = ?').get(okulId, kisi.id)) return hata(409, 'Bu kişi okulun yönetiminde zaten var');
    if (b.gorev === 'mudur') {
      const var_ = db.prepare(`SELECT u.full_name AS ad FROM okul_yoneticileri y JOIN users u ON u.id = y.user_id WHERE y.branch_id = ? AND y.gorev = 'mudur'`).get(okulId);
      if (var_) return hata(409, `Okulun müdürü zaten var (${var_.ad}); önce onu kaldırın`);
    }

    db.exec('BEGIN');
    try {
      // Giriş için yönetim üyeliği: kişide hiç yoksa bu okulda 'okul' kapsamlı bir üyelik açılır
      const uye = db.prepare("SELECT id, status FROM memberships WHERE user_id = ? AND role = 'yonetim' ORDER BY (status = 'aktif') DESC, id").get(kisi.id);
      if (!uye) db.prepare("INSERT INTO memberships (user_id, branch_id, role, gorev) VALUES (?,?,'yonetim','okul')").run(kisi.id, okulId);
      else if (uye.status !== 'aktif') db.prepare("UPDATE memberships SET status = 'aktif' WHERE id = ?").run(uye.id);
      db.prepare('INSERT INTO okul_yoneticileri (branch_id, user_id, gorev, created_at) VALUES (?,?,?,?)').run(okulId, kisi.id, b.gorev, Date.now());
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    denetle(o.user_id, 'okul-yonetici-ekle', { okulId, userId: kisi.id, gorev: b.gorev });
    return ok(201);
  }

  if (yol === '/api/yonetim/yonetici-kaldir') {
    const y = db.prepare('SELECT * FROM okul_yoneticileri WHERE id = ?').get(tamSayi(b.id, 1, 1e9));
    if (!y) return hata(404, 'Kayıt bulunamadı');
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM okul_yoneticileri WHERE id = ?').run(y.id);
      // Yalnızca okul yönetimi olarak giriş yapan ve başka görevi kalmayan kişinin yönetim erişimi kapanır
      if (!db.prepare('SELECT 1 FROM okul_yoneticileri WHERE user_id = ?').get(y.user_id)) {
        db.prepare("UPDATE memberships SET status = 'pasif' WHERE user_id = ? AND role = 'yonetim' AND gorev = 'okul'").run(y.user_id);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    denetle(o.user_id, 'okul-yonetici-kaldir', { okulId: y.branch_id, userId: y.user_id, gorev: y.gorev });
    return ok();
  }
  return false;
}

const bos = v => v === null || v === undefined || v === '';

// Kurum logosu: oturumu olan herkes görür
export function kurumLogoApi({ res, json }) {
  const l = db.prepare('SELECT mime, veri FROM kurum_logo WHERE id = 1').get();
  if (!l) return json(res, 404, { hata: 'Logo yok' });
  res.writeHead(200, { 'Content-Type': l.mime, 'Content-Length': l.veri.length, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
  res.end(l.veri);
}
