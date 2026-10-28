import crypto from 'node:crypto';
import { db, FOTO_SQL } from './db.js';

// Teslim yetkileri: veli, çocuğunu okuldan teslim alabilecek kişileri kendisi belirler
db.exec(`
CREATE TABLE IF NOT EXISTS teslim_yetkilileri (
  id                    INTEGER PRIMARY KEY,
  student_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  ad                    TEXT NOT NULL,
  yakinlik              TEXT NOT NULL,
  telefon               TEXT NOT NULL,
  ekleyen_user_id       INTEGER REFERENCES users(id),
  created_at            INTEGER NOT NULL
);

-- Teslim yetkilisinin hesapsız kullanabileceği, veli tarafından iptal edilebilen özel bağlantı
CREATE TABLE IF NOT EXISTS teslim_baglantilari (
  yetkili_id INTEGER PRIMARY KEY REFERENCES teslim_yetkilileri(id) ON DELETE CASCADE,
  kod        TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
-- Kısa ömürlü, tek kullanımlık teslim kodları (QR içeriği). ozne_tur: 'veli' (id = kullanıcı) ya da 'yetkili'
CREATE TABLE IF NOT EXISTS teslim_kodlari (
  id         INTEGER PRIMARY KEY,
  ozne_tur   TEXT NOT NULL,
  ozne_id    INTEGER NOT NULL,
  kod        TEXT NOT NULL UNIQUE,
  bitis      INTEGER NOT NULL,
  kullanildi INTEGER NOT NULL DEFAULT 0
);
-- Güvenliğin okuttuğu koddan doğan teslim isteği: secim > bekliyor > onaylandi / reddedildi / doldu / iptal
CREATE TABLE IF NOT EXISTS teslim_talepleri (
  id               INTEGER PRIMARY KEY,
  ozne_tur         TEXT NOT NULL,
  ozne_id          INTEGER NOT NULL,
  kisi_ad          TEXT NOT NULL,
  yakinlik         TEXT NOT NULL,
  guvenlik_user_id INTEGER NOT NULL REFERENCES users(id),
  durum            TEXT NOT NULL DEFAULT 'secim',
  olusma           INTEGER NOT NULL,
  karar            INTEGER
);
CREATE TABLE IF NOT EXISTS teslim_talep_ogrenci (
  talep_id              INTEGER NOT NULL REFERENCES teslim_talepleri(id) ON DELETE CASCADE,
  student_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  secili                INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (talep_id, student_membership_id)
);
CREATE TABLE IF NOT EXISTS teslim_kayitlari (
  id                    INTEGER PRIMARY KEY,
  talep_id              INTEGER REFERENCES teslim_talepleri(id),
  student_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  kisi_ad               TEXT NOT NULL,
  yakinlik              TEXT NOT NULL,
  guvenlik_user_id      INTEGER NOT NULL REFERENCES users(id),
  zaman                 INTEGER NOT NULL
);`);

const metinDuz = (v, en) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, en);

const KOD_OMRU = 45_000;          // QR kodu bu kadar süre geçerli; ekran daha sık yeniler
const TALEP_OMRU = 3 * 60_000;    // güvenlik okuttuktan sonra velinin karar süresi
const ALFABE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O, 1/I gibi karışanlar yok

function kodUret() {
  let k = '';
  for (const b of crypto.randomBytes(10)) k += ALFABE[b & 31];
  return k;
}
const kodTemizle = v => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-10);

// Bir kişinin (veli hesabı ya da hesapsız yetkili) teslim alabileceği öğrenciler
function ogrencilerDe(tur, id) {
  const sec = `SELECT m.id, u.full_name AS ad, ${FOTO_SQL} AS foto, c.name AS sinif, b.name AS okul, b.campus_id AS kampus
    FROM memberships m JOIN users u ON u.id = m.user_id JOIN branches b ON b.id = m.branch_id
    LEFT JOIN class_students cs ON cs.student_membership_id = m.id LEFT JOIN classes c ON c.id = cs.class_id`;
  if (tur === 'veli') {
    return db.prepare(`${sec} WHERE m.status = 'aktif' AND m.id IN (SELECT g.student_membership_id FROM guardians g
      JOIN memberships p ON p.id = g.parent_membership_id WHERE p.user_id = ? AND p.status = 'aktif') ORDER BY u.full_name`).all(id);
  }
  return db.prepare(`${sec} WHERE m.status = 'aktif' AND m.id = (SELECT student_membership_id FROM teslim_yetkilileri WHERE id = ?)`).all(id);
}

function ozneBilgi(tur, id) {
  if (tur === 'veli') {
    const u = db.prepare('SELECT full_name AS ad FROM users WHERE id = ?').get(id);
    return u && { ad: u.ad, yakinlik: 'Veli' };
  }
  return db.prepare('SELECT ad, yakinlik FROM teslim_yetkilileri WHERE id = ?').get(id);
}

function sureDolanlariKapat() {
  const simdi = Date.now();
  db.prepare("UPDATE teslim_talepleri SET durum = 'doldu', karar = ? WHERE durum IN ('secim','bekliyor') AND olusma < ?").run(simdi, simdi - TALEP_OMRU);
  db.prepare('DELETE FROM teslim_kodlari WHERE bitis < ?').run(simdi - 60_000);
}

// ---- Teslim alan kişinin tarafı (veli oturumu ya da yetkilinin özel bağlantısı) ----
function ozneIslem(tur, id, req, yol, b, { json, res, denetle }) {
  const ogr = ogrencilerDe(tur, id);
  const kisi = ozneBilgi(tur, id);
  if (!kisi) return json(res, 404, { hata: 'Kayıt bulunamadı' }), true;

  if (req.method === 'GET' && yol === 'kod') {
    sureDolanlariKapat();
    const kod = kodUret();
    db.prepare('INSERT INTO teslim_kodlari (ozne_tur, ozne_id, kod, bitis) VALUES (?,?,?,?)').run(tur, id, kod, Date.now() + KOD_OMRU);
    json(res, 200, { kod, omur: KOD_OMRU / 1000, kisi, ogrenciler: ogr.map(o => ({ ad: o.ad, sinif: o.sinif, okul: o.okul })) });
    return true;
  }

  if (req.method === 'GET' && yol === 'durum') {
    sureDolanlariKapat();
    const t = db.prepare(`SELECT * FROM teslim_talepleri WHERE ozne_tur = ? AND ozne_id = ? AND durum <> 'secim' AND durum <> 'iptal'
      AND (durum = 'bekliyor' OR karar > ?) ORDER BY id DESC LIMIT 1`).get(tur, id, Date.now() - 60_000);
    if (!t) return json(res, 200, { talep: null }), true;
    const liste = db.prepare(`SELECT u.full_name AS ad, c.name AS sinif FROM teslim_talep_ogrenci t JOIN memberships m ON m.id = t.student_membership_id
      JOIN users u ON u.id = m.user_id LEFT JOIN class_students cs ON cs.student_membership_id = m.id LEFT JOIN classes c ON c.id = cs.class_id
      WHERE t.talep_id = ? AND t.secili = 1 ORDER BY u.full_name`).all(t.id);
    json(res, 200, { talep: { id: t.id, durum: t.durum, ogrenciler: liste } });
    return true;
  }

  if (req.method === 'POST' && yol === 'karar') {
    const t = db.prepare("SELECT * FROM teslim_talepleri WHERE id = ? AND ozne_tur = ? AND ozne_id = ? AND durum = 'bekliyor'").get(Number(b.talepId), tur, id);
    if (!t) return json(res, 404, { hata: 'Bekleyen bir teslim isteği yok' }), true;
    const simdi = Date.now();
    if (!b.onay) {
      db.prepare("UPDATE teslim_talepleri SET durum = 'reddedildi', karar = ? WHERE id = ?").run(simdi, t.id);
      denetle(t.guvenlik_user_id, 'teslim-reddedildi', `talep=${t.id} kisi=${t.kisi_ad}`);
      return json(res, 200, { tamam: true }), true;
    }
    const secililer = db.prepare('SELECT student_membership_id AS id FROM teslim_talep_ogrenci WHERE talep_id = ? AND secili = 1').all(t.id);
    db.prepare("UPDATE teslim_talepleri SET durum = 'onaylandi', karar = ? WHERE id = ?").run(simdi, t.id);
    const ekle = db.prepare('INSERT INTO teslim_kayitlari (talep_id, student_membership_id, kisi_ad, yakinlik, guvenlik_user_id, zaman) VALUES (?,?,?,?,?,?)');
    for (const s of secililer) ekle.run(t.id, s.id, t.kisi_ad, t.yakinlik, t.guvenlik_user_id, simdi);
    denetle(t.guvenlik_user_id, 'teslim-edildi', `talep=${t.id} kisi=${t.kisi_ad} ogrenci=${secililer.map(s => s.id).join(',')}`);
    return json(res, 200, { tamam: true }), true;
  }
  return json(res, 404, { hata: 'Bulunamadı' }), true;
}

// Hesapsız yetkilinin özel bağlantısı: /api/teslim/k/<bağlantı kodu>/<işlem>
export async function teslimBaglantiApi({ req, res, url, json, govde, denetle }) {
  const m = url.pathname.match(/^\/api\/teslim\/k\/([0-9a-f]{48})\/(kod|durum|karar)$/);
  if (!m) return false;
  const bag = db.prepare('SELECT yetkili_id FROM teslim_baglantilari WHERE kod = ?').get(m[1]);
  if (!bag) return json(res, 404, { hata: 'Bu bağlantı geçersiz ya da iptal edildi' }), true;
  const b = req.method === 'POST' ? await govde(req) : {};
  return ozneIslem('yetkili', bag.yetkili_id, req, m[2], b, { json, res, denetle });
}

// ---- Kapıdaki güvenlik ----
const hatalar = new Map();
function cokDeneme(userId) {
  const simdi = Date.now();
  const l = (hatalar.get(userId) || []).filter(t => simdi - t < 60_000);
  hatalar.set(userId, l);
  return l.length >= 10;
}

// Güvenliğin görebileceği öğrenciler: kendi kampüsü (kurum yönetimi hepsi)
function kapiKampusu(o) {
  if (o.gorev === 'kurum') return null;
  return db.prepare('SELECT b.campus_id AS k FROM memberships m JOIN branches b ON b.id = m.branch_id WHERE m.id = ?').get(o.membership_id)?.k ?? -1;
}

function kapiIslem(o, req, yol, b, url, { json, res, denetle }) {
  if (o.role !== 'yonetim') return json(res, 403, { hata: 'Bu işlem için yetkiniz yok' }), true;
  const kampus = kapiKampusu(o);

  if (req.method === 'POST' && yol === 'oku') {
    if (cokDeneme(o.user_id)) return json(res, 429, { hata: 'Çok fazla hatalı deneme. Bir dakika bekleyin.' }), true;
    sureDolanlariKapat();
    const kod = kodTemizle(b.kod);
    const k = kod.length === 10 && db.prepare('SELECT * FROM teslim_kodlari WHERE kod = ? AND kullanildi = 0 AND bitis >= ?').get(kod, Date.now());
    if (!k) {
      hatalar.get(o.user_id).push(Date.now());
      return json(res, 404, { hata: 'Kod geçersiz ya da süresi dolmuş. Velinin ekranındaki yeni kodu okutun.' }), true;
    }
    db.prepare('UPDATE teslim_kodlari SET kullanildi = 1 WHERE id = ?').run(k.id);
    const kisi = ozneBilgi(k.ozne_tur, k.ozne_id);
    const ogr = ogrencilerDe(k.ozne_tur, k.ozne_id).filter(x => kampus === null || x.kampus === kampus);
    if (!kisi) return json(res, 404, { hata: 'Kişi kaydı bulunamadı' }), true;
    if (!ogr.length) return json(res, 404, { hata: `${kisi.ad} bu kampüste öğrenci teslim alamaz` }), true;
    const r = db.prepare('INSERT INTO teslim_talepleri (ozne_tur, ozne_id, kisi_ad, yakinlik, guvenlik_user_id, olusma) VALUES (?,?,?,?,?,?)')
      .run(k.ozne_tur, k.ozne_id, kisi.ad, kisi.yakinlik, o.user_id, Date.now());
    const ekle = db.prepare('INSERT INTO teslim_talep_ogrenci (talep_id, student_membership_id) VALUES (?,?)');
    for (const x of ogr) ekle.run(Number(r.lastInsertRowid), x.id);
    json(res, 200, { talepId: Number(r.lastInsertRowid), kisi, ogrenciler: ogr.map(x => ({ id: x.id, ad: x.ad, sinif: x.sinif, okul: x.okul, foto: x.foto })) });
    return true;
  }

  const talep = () => db.prepare('SELECT * FROM teslim_talepleri WHERE id = ? AND guvenlik_user_id = ?').get(Number(b.talepId ?? url.searchParams.get('id')), o.user_id);

  if (req.method === 'POST' && yol === 'gonder') {
    const t = talep();
    if (!t || t.durum !== 'secim') return json(res, 404, { hata: 'Teslim isteği bulunamadı ya da süresi doldu' }), true;
    const secilen = new Set((Array.isArray(b.ogrenciIds) ? b.ogrenciIds : []).map(Number));
    if (!secilen.size) return json(res, 400, { hata: 'En az bir öğrenci seçin' }), true;
    const guncelle = db.prepare('UPDATE teslim_talep_ogrenci SET secili = ? WHERE talep_id = ? AND student_membership_id = ?');
    for (const { id } of db.prepare('SELECT student_membership_id AS id FROM teslim_talep_ogrenci WHERE talep_id = ?').all(t.id)) guncelle.run(secilen.has(id) ? 1 : 0, t.id, id);
    db.prepare("UPDATE teslim_talepleri SET durum = 'bekliyor', olusma = ? WHERE id = ?").run(Date.now(), t.id);
    return json(res, 200, { tamam: true }), true;
  }

  if (req.method === 'GET' && yol === 'durum') {
    sureDolanlariKapat();
    const t = talep();
    if (!t) return json(res, 404, { hata: 'Teslim isteği bulunamadı' }), true;
    return json(res, 200, { durum: t.durum }), true;
  }

  if (req.method === 'POST' && yol === 'iptal') {
    const t = talep();
    if (t && ['secim', 'bekliyor'].includes(t.durum)) db.prepare("UPDATE teslim_talepleri SET durum = 'iptal', karar = ? WHERE id = ?").run(Date.now(), t.id);
    return json(res, 200, { tamam: true }), true;
  }

  if (req.method === 'GET' && yol === 'bugun') {
    const gun = new Date(); gun.setHours(0, 0, 0, 0);
    const satirlar = db.prepare(`SELECT k.zaman, k.kisi_ad AS kisi, k.yakinlik, u.full_name AS ogrenci, c.name AS sinif, b.campus_id AS kampus
      FROM teslim_kayitlari k JOIN memberships m ON m.id = k.student_membership_id JOIN users u ON u.id = m.user_id JOIN branches b ON b.id = m.branch_id
      LEFT JOIN class_students cs ON cs.student_membership_id = m.id LEFT JOIN classes c ON c.id = cs.class_id
      WHERE k.zaman >= ? ORDER BY k.zaman DESC LIMIT 60`).all(gun.getTime());
    return json(res, 200, { kayitlar: satirlar.filter(s => kampus === null || s.kampus === kampus) }), true;
  }
  return json(res, 404, { hata: 'Bulunamadı' }), true;
}

export async function teslimApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  if (!yol.startsWith('/api/teslim/')) return false;
  const ilk = yol.slice('/api/teslim/'.length);

  if (ilk.startsWith('kapi/')) {
    const b = req.method === 'POST' ? await govde(req) : {};
    return kapiIslem(o, req, ilk.slice(5), b, url, { json, res, denetle });
  }

  if (o.role !== 'veli') return json(res, 403, { hata: 'Bu işlem için yetkiniz yok' }), true;

  if (['kod', 'durum', 'karar'].includes(ilk)) {
    const b = req.method === 'POST' ? await govde(req) : {};
    return ozneIslem('veli', o.user_id, req, ilk, b, { json, res, denetle });
  }

  const cocukMu = id => db.prepare('SELECT 1 FROM guardians WHERE parent_membership_id = ? AND student_membership_id = ?').get(o.membership_id, id);

  if (req.method === 'GET' && yol === '/api/teslim/liste') {
    const cocuklar = db.prepare(`SELECT m.id, u.full_name AS ad, c.name AS sinif FROM guardians g
      JOIN memberships m ON m.id = g.student_membership_id JOIN users u ON u.id = m.user_id
      LEFT JOIN class_students cs ON cs.student_membership_id = m.id LEFT JOIN classes c ON c.id = cs.class_id
      WHERE g.parent_membership_id = ? ORDER BY u.full_name`).all(o.membership_id);
    const kisiler = db.prepare(`SELECT y.id, y.ad, y.yakinlik, y.telefon, b.kod AS baglanti FROM teslim_yetkilileri y
      LEFT JOIN teslim_baglantilari b ON b.yetkili_id = y.id WHERE y.student_membership_id = ? ORDER BY y.id`);
    json(res, 200, { ogrenciler: cocuklar.map(c => ({ ...c, kisiler: kisiler.all(c.id) })) });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/teslim/baglanti') {
    const b = await govde(req);
    const k = db.prepare('SELECT id, student_membership_id AS ogr, ad FROM teslim_yetkilileri WHERE id = ?').get(Number(b.id));
    if (!k || !cocukMu(k.ogr)) return json(res, 404, { hata: 'Kayıt bulunamadı' }), true;
    if (b.islem === 'iptal') {
      db.prepare('DELETE FROM teslim_baglantilari WHERE yetkili_id = ?').run(k.id);
      db.prepare("DELETE FROM teslim_kodlari WHERE ozne_tur = 'yetkili' AND ozne_id = ?").run(k.id);
      denetle(o.user_id, 'teslim-baglanti-iptal', `ogrenci=${k.ogr} kisi=${k.ad}`);
      return json(res, 200, { tamam: true }), true;
    }
    const kod = crypto.randomBytes(24).toString('hex');
    db.prepare('INSERT INTO teslim_baglantilari (yetkili_id, kod, created_at) VALUES (?,?,?) ON CONFLICT (yetkili_id) DO UPDATE SET kod = excluded.kod, created_at = excluded.created_at')
      .run(k.id, kod, Date.now());
    denetle(o.user_id, 'teslim-baglanti', `ogrenci=${k.ogr} kisi=${k.ad}`);
    return json(res, 200, { tamam: true, kod }), true;
  }

  if (req.method === 'POST' && yol === '/api/teslim/ekle') {
    const b = await govde(req);
    const id = Number(b.ogrenciId);
    const ad = metinDuz(b.ad, 80), yakinlik = metinDuz(b.yakinlik, 40), telefon = metinDuz(b.telefon, 20);
    if (!cocukMu(id)) return json(res, 403, { hata: 'Bu öğrenci için işlem yapamazsınız' }), true;
    if (!ad || !yakinlik) return json(res, 400, { hata: 'Ad soyad ve yakınlık gerekli' }), true;
    if (!/^[0-9 +()-]{7,20}$/.test(telefon)) return json(res, 400, { hata: 'Geçerli bir telefon girin' }), true;
    if (db.prepare('SELECT COUNT(*) AS n FROM teslim_yetkilileri WHERE student_membership_id = ?').get(id).n >= 10) return json(res, 400, { hata: 'En fazla 10 kişi eklenebilir' }), true;
    const r = db.prepare('INSERT INTO teslim_yetkilileri (student_membership_id, ad, yakinlik, telefon, ekleyen_user_id, created_at) VALUES (?,?,?,?,?,?)')
      .run(id, ad, yakinlik, telefon, o.user_id, Date.now());
    denetle(o.user_id, 'teslim-ekle', `ogrenci=${id} kisi=${ad}`);
    json(res, 200, { tamam: true, id: Number(r.lastInsertRowid) });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/teslim/sil') {
    const b = await govde(req);
    const k = db.prepare('SELECT id, student_membership_id AS ogr, ad FROM teslim_yetkilileri WHERE id = ?').get(Number(b.id));
    if (!k || !cocukMu(k.ogr)) return json(res, 404, { hata: 'Kayıt bulunamadı' }), true;
    db.prepare('DELETE FROM teslim_baglantilari WHERE yetkili_id = ?').run(k.id);
    db.prepare("DELETE FROM teslim_kodlari WHERE ozne_tur = 'yetkili' AND ozne_id = ?").run(k.id);
    db.prepare('DELETE FROM teslim_yetkilileri WHERE id = ?').run(k.id);
    denetle(o.user_id, 'teslim-sil', `ogrenci=${k.ogr} kisi=${k.ad}`);
    json(res, 200, { tamam: true });
    return true;
  }

  return json(res, 404, { hata: 'Bulunamadı' }), true;
}
