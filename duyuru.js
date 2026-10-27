import { db } from './db.js';

// Duyurular (yönetim → okul / rol) ve veli mesajları (öğretmen → sınıfın ya da bir öğrencinin velileri)
db.exec(`
CREATE TABLE IF NOT EXISTS iletiler (
  id                     INTEGER PRIMARY KEY,
  tur                    TEXT NOT NULL CHECK (tur IN ('duyuru','mesaj')),
  baslik                 TEXT NOT NULL,
  metin                  TEXT NOT NULL,
  gonderen_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  branch_id              INTEGER REFERENCES branches(id),
  rol                    TEXT,
  class_id               INTEGER REFERENCES classes(id),
  student_membership_id  INTEGER REFERENCES memberships(id),
  created_at             INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ileti_okundu (
  ileti_id INTEGER NOT NULL REFERENCES iletiler(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (ileti_id, user_id)
);`);

const ROLLER = { hepsi: 'Herkes', ogretmen: 'Öğretmenler', ogrenci: 'Öğrenciler', veli: 'Veliler' };
const metinDuz = (v, en) => String(v ?? '').trim().slice(0, en);

export async function duyuruApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  if (!yol.startsWith('/api/duyuru/')) return false;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };
  if (!o) return hata(401, 'Oturum yok');
  const uye = db.prepare('SELECT branch_id AS sube FROM memberships WHERE id = ?').get(o.membership_id);

  // ---- Seçenekler ----
  if (req.method === 'GET' && yol === '/api/duyuru/secenek') {
    if (o.role === 'yonetim') {
      return json(res, 200, { okullar: db.prepare('SELECT id, name AS ad FROM branches ORDER BY name').all(), roller: ROLLER }), true;
    }
    if (o.role === 'ogretmen') {
      // Dersine girdiği ya da sınıf öğretmeni olduğu sınıflar
      const siniflar = db.prepare(`SELECT DISTINCT c.id, c.name AS ad FROM classes c
        WHERE c.homeroom_membership_id = ? OR c.id IN (SELECT class_id FROM assignments WHERE teacher_membership_id = ?)
        ORDER BY c.level, c.name`).all(o.membership_id, o.membership_id);
      const ogrenciler = db.prepare(`SELECT m.id, u.full_name AS ad, cs.class_id AS sinifId
        FROM class_students cs JOIN memberships m ON m.id = cs.student_membership_id JOIN users u ON u.id = m.user_id
        WHERE m.status = 'aktif' AND cs.class_id IN (${siniflar.map(() => '?').join(',') || 'NULL'}) ORDER BY u.full_name`).all(...siniflar.map(s => s.id));
      return json(res, 200, { siniflar, ogrenciler }), true;
    }
    return hata(403, 'Bu işlem için yetkiniz yok');
  }

  // ---- Liste ----
  if (req.method === 'GET' && yol === '/api/duyuru/liste') {
    const tarihli = r => ({ id: r.id, baslik: r.baslik, metin: r.metin, tarih: r.created_at, yazan: r.yazan });
    if (o.role === 'yonetim') {
      const satirlar = db.prepare(`SELECT i.*, u.full_name AS yazan, b.name AS okul,
          (SELECT COUNT(*) FROM ileti_okundu k WHERE k.ileti_id = i.id) AS okunan
        FROM iletiler i JOIN memberships m ON m.id = i.gonderen_membership_id JOIN users u ON u.id = m.user_id
        LEFT JOIN branches b ON b.id = i.branch_id WHERE i.tur = 'duyuru' ORDER BY i.created_at DESC, i.id DESC`).all();
      const alici = (rol, sube) => db.prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM memberships
        WHERE status = 'aktif' AND role IN (${rol === 'hepsi' ? "'ogretmen','ogrenci','veli'" : '?'}) AND (? IS NULL OR branch_id = ?)`)
        .get(...(rol === 'hepsi' ? [] : [rol]), sube, sube).n;
      return json(res, 200, { duyurular: satirlar.map(r => ({ ...tarihli(r), hedef: (r.okul || 'Tüm okullar') + ' · ' + ROLLER[r.rol], alici: alici(r.rol, r.branch_id), okunan: r.okunan })) }), true;
    }

    // Öğretmen / öğrenci / veli: kendi okuluna ve rolüne gelen duyurular
    const duyurular = db.prepare(`SELECT i.*, u.full_name AS yazan, EXISTS (SELECT 1 FROM ileti_okundu k WHERE k.ileti_id = i.id AND k.user_id = ?) AS okundu
      FROM iletiler i JOIN memberships m ON m.id = i.gonderen_membership_id JOIN users u ON u.id = m.user_id
      WHERE i.tur = 'duyuru' AND (i.branch_id IS NULL OR i.branch_id = ?) AND i.rol IN ('hepsi', ?)
      ORDER BY i.created_at DESC, i.id DESC`).all(o.user_id, uye.sube, o.role).map(r => ({ ...tarihli(r), yeni: !r.okundu }));
    let mesajlar = [];
    if (o.role === 'veli') {
      mesajlar = db.prepare(`SELECT i.*, u.full_name AS yazan, c.name AS sinif, su.full_name AS ogrenci,
          EXISTS (SELECT 1 FROM ileti_okundu k WHERE k.ileti_id = i.id AND k.user_id = ?) AS okundu
        FROM iletiler i JOIN memberships m ON m.id = i.gonderen_membership_id JOIN users u ON u.id = m.user_id
        LEFT JOIN classes c ON c.id = i.class_id
        LEFT JOIN memberships sm ON sm.id = i.student_membership_id LEFT JOIN users su ON su.id = sm.user_id
        WHERE i.tur = 'mesaj' AND (
          i.student_membership_id IN (SELECT student_membership_id FROM guardians WHERE parent_membership_id = ?)
          OR (i.student_membership_id IS NULL AND i.class_id IN (SELECT cs.class_id FROM guardians g JOIN class_students cs ON cs.student_membership_id = g.student_membership_id WHERE g.parent_membership_id = ?)))
        ORDER BY i.created_at DESC, i.id DESC`).all(o.user_id, o.membership_id, o.membership_id)
        .map(r => ({ ...tarihli(r), yeni: !r.okundu, hedef: r.ogrenci ? r.ogrenci + ' için' : r.sinif + ' velilerine' }));
    } else if (o.role === 'ogretmen') {
      mesajlar = db.prepare(`SELECT i.*, c.name AS sinif, su.full_name AS ogrenci
        FROM iletiler i LEFT JOIN classes c ON c.id = i.class_id
        LEFT JOIN memberships sm ON sm.id = i.student_membership_id LEFT JOIN users su ON su.id = sm.user_id
        WHERE i.tur = 'mesaj' AND i.gonderen_membership_id = ? ORDER BY i.created_at DESC, i.id DESC`).all(o.membership_id)
        .map(r => ({ id: r.id, baslik: r.baslik, metin: r.metin, tarih: r.created_at, hedef: r.ogrenci ? r.ogrenci + ' velisi' : r.sinif + ' velileri',
          okunan: db.prepare('SELECT COUNT(*) AS n FROM ileti_okundu WHERE ileti_id = ?').get(r.id).n }));
    }
    // Yeni olanlar bu istekte işaretlenir; istemci "yeni" bilgisini bu yanıttan alır
    const isaretle = db.prepare('INSERT OR IGNORE INTO ileti_okundu (ileti_id, user_id) VALUES (?, ?)');
    for (const x of [...duyurular, ...(o.role === 'veli' ? mesajlar : [])]) if (x.yeni) isaretle.run(x.id, o.user_id);
    return json(res, 200, { duyurular, mesajlar }), true;
  }

  // ---- Yönetim: duyuru yayınla ----
  if (req.method === 'POST' && yol === '/api/duyuru/ekle') {
    if (o.role !== 'yonetim') return hata(403, 'Bu işlem için yetkiniz yok');
    const b = await govde(req, 6000);
    const baslik = metinDuz(b.baslik, 100), metin = metinDuz(b.metin, 2000);
    if (!baslik) return hata(400, 'Başlık yazın');
    if (!metin) return hata(400, 'Duyuru metnini yazın');
    const rol = b.rol in ROLLER ? b.rol : 'hepsi';
    const sube = b.sube ? Number(b.sube) : null;
    if (sube && !db.prepare('SELECT 1 FROM branches WHERE id = ?').get(sube)) return hata(400, 'Okul bulunamadı');
    const r = db.prepare('INSERT INTO iletiler (tur, baslik, metin, gonderen_membership_id, branch_id, rol, created_at) VALUES (?,?,?,?,?,?,?)')
      .run('duyuru', baslik, metin, o.membership_id, sube, rol, Date.now());
    denetle(o.user_id, 'duyuru-ekle', { id: Number(r.lastInsertRowid), baslik, rol, sube });
    return json(res, 200, { tamam: true, id: Number(r.lastInsertRowid) }), true;
  }

  // ---- Öğretmen: veli mesajı ----
  if (req.method === 'POST' && yol === '/api/duyuru/mesaj') {
    if (o.role !== 'ogretmen') return hata(403, 'Bu işlem için yetkiniz yok');
    const b = await govde(req, 6000);
    const baslik = metinDuz(b.baslik, 100), metin = metinDuz(b.metin, 2000);
    if (!baslik) return hata(400, 'Başlık yazın');
    if (!metin) return hata(400, 'Mesajı yazın');
    const sinifId = Number(b.sinifId);
    const yetkili = db.prepare(`SELECT 1 FROM classes c WHERE c.id = ? AND (c.homeroom_membership_id = ?
      OR c.id IN (SELECT class_id FROM assignments WHERE teacher_membership_id = ?))`).get(sinifId, o.membership_id, o.membership_id);
    if (!yetkili) return hata(403, 'Bu sınıfa mesaj gönderemezsiniz');
    let ogrenciId = null;
    if (b.ogrenciId) {
      ogrenciId = Number(b.ogrenciId);
      if (!db.prepare('SELECT 1 FROM class_students WHERE class_id = ? AND student_membership_id = ?').get(sinifId, ogrenciId)) return hata(400, 'Öğrenci bu sınıfta değil');
    }
    const veli = ogrenciId
      ? db.prepare('SELECT COUNT(*) AS n FROM guardians WHERE student_membership_id = ?').get(ogrenciId).n
      : db.prepare('SELECT COUNT(DISTINCT g.parent_membership_id) AS n FROM guardians g JOIN class_students cs ON cs.student_membership_id = g.student_membership_id WHERE cs.class_id = ?').get(sinifId).n;
    if (!veli) return hata(400, 'Mesajın gideceği veli kaydı yok');
    const r = db.prepare('INSERT INTO iletiler (tur, baslik, metin, gonderen_membership_id, class_id, student_membership_id, created_at) VALUES (?,?,?,?,?,?,?)')
      .run('mesaj', baslik, metin, o.membership_id, sinifId, ogrenciId, Date.now());
    return json(res, 200, { tamam: true, id: Number(r.lastInsertRowid), veli }), true;
  }

  // ---- Sil: yönetim kendi duyurusunu, öğretmen kendi mesajını ----
  if (req.method === 'POST' && yol === '/api/duyuru/sil') {
    const b = await govde(req);
    const i = db.prepare('SELECT * FROM iletiler WHERE id = ?').get(Number(b.id));
    if (!i) return hata(404, 'Kayıt bulunamadı');
    const izin = (o.role === 'yonetim' && i.tur === 'duyuru') || (o.role === 'ogretmen' && i.tur === 'mesaj' && i.gonderen_membership_id === o.membership_id);
    if (!izin) return hata(403, 'Bu işlem için yetkiniz yok');
    db.prepare('DELETE FROM ileti_okundu WHERE ileti_id = ?').run(i.id);
    db.prepare('DELETE FROM iletiler WHERE id = ?').run(i.id);
    if (i.tur === 'duyuru') denetle(o.user_id, 'duyuru-sil', { id: i.id, baslik: i.baslik });
    return json(res, 200, { tamam: true }), true;
  }

  return false;
}
