import { db, tcGecerliMi } from './db.js';

const tamSayi = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const telNormalize = t => String(t || '').replace(/\D/g, '').slice(-10);
const bos = v => v === null || v === undefined || v === '';

function islem(fn) {
  db.exec('BEGIN');
  try { const s = fn(); db.exec('COMMIT'); return s; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// Öğrenci / öğretmen kaydı: kişi yoksa hesap açılır, varsa (telefon eşleşirse)
// yalnızca yeni üyelik eklenir. Hesap ile üyelik ayrı tutulur.
function kisiKaydet(b, rol, aktorId, denetle) {
  const ad = String(b.ad || '').trim();
  const kimlik = String(b.kimlik || '').trim().toUpperCase();
  const tel = telNormalize(b.telefon);
  const tcMi = /^\d{11}$/.test(kimlik);
  const subeId = tamSayi(b.subeId, 1, 1e9);
  if (ad.length < 3 || ad.length > 80) return { kod: 400, hata: 'Ad soyad geçersiz' };
  if (tcMi ? !tcGecerliMi(kimlik) : !/^[A-Z0-9]{5,20}$/.test(kimlik)) return { kod: 400, hata: 'Kimlik / pasaport numarası geçersiz' };
  if (!/^\d{10}$/.test(tel)) return { kod: 400, hata: 'Telefon 10 haneli olmalı' };
  if (!subeId || !db.prepare('SELECT 1 FROM branches WHERE id = ?').get(subeId)) return { kod: 400, hata: 'Geçersiz şube' };

  const var_ = db.prepare('SELECT * FROM users WHERE tc_no = ? OR passport_no = ?').get(kimlik, kimlik);
  if (var_ && var_.phone !== tel) return { kod: 409, hata: 'Bu kimlik numarası başka bir telefonla kayıtlı' };
  if (var_ && db.prepare('SELECT 1 FROM memberships WHERE user_id = ? AND branch_id = ? AND role = ?').get(var_.id, subeId, rol)) {
    return { kod: 409, hata: 'Bu kişi bu şubede zaten kayıtlı' };
  }

  let userId = var_?.id;
  if (!userId) {
    userId = Number(db.prepare('INSERT INTO users (tc_no, passport_no, phone, full_name, created_at) VALUES (?,?,?,?,?)')
      .run(tcMi ? kimlik : null, tcMi ? null : kimlik, tel, ad, Date.now()).lastInsertRowid);
  }
  const uyelikId = Number(db.prepare('INSERT INTO memberships (user_id, branch_id, role) VALUES (?,?,?)')
    .run(userId, subeId, rol).lastInsertRowid);
  denetle(aktorId, rol + '-kayit', { userId, uyelikId, subeId, mevcutHesap: !!var_ });
  return { kod: 201, uyelikId, userId, subeId };
}

export async function kurulumApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };

  if (req.method === 'GET' && yol === '/api/yonetim/kurulum') {
    const dersIdleri = db.prepare('SELECT teacher_membership_id AS u, course_id AS d FROM teacher_courses').all();
    const ogretmenler = db.prepare(`
      SELECT m.id AS uyelikId, u.id AS userId, u.full_name AS ad, m.branch_id AS subeId, b.name AS sube, m.status AS durum
      FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN branches b ON b.id = m.branch_id
      WHERE m.role = 'ogretmen' ORDER BY u.full_name`).all()
      .map(t => ({ ...t, dersIds: dersIdleri.filter(x => x.u === t.uyelikId).map(x => x.d) }));
    const ogrenciler = db.prepare(`
      SELECT m.id AS uyelikId, u.full_name AS ad, m.branch_id AS subeId, b.name AS sube, m.status AS durum,
             cs.class_id AS sinifId
      FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN branches b ON b.id = m.branch_id
      LEFT JOIN class_students cs ON cs.student_membership_id = m.id
      WHERE m.role = 'ogrenci' ORDER BY u.full_name`).all();
    json(res, 200, {
      subeler: db.prepare('SELECT id, name AS ad FROM branches ORDER BY id').all(),
      kademeler: ['Anasınıfı', 'İlkokul', 'Ortaokul', 'Lise'],
      dersler: db.prepare('SELECT id, name AS ad FROM courses ORDER BY name').all(),
      ogretmenler,
      ogrenciler,
      siniflar: db.prepare(`
        SELECT c.id, c.branch_id AS subeId, b.name AS sube, c.level AS kademe, c.name AS ad,
               c.homeroom_membership_id AS sinifOgretmenUyelikId,
               (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id) AS ogrenciSayisi
        FROM classes c JOIN branches b ON b.id = c.branch_id ORDER BY b.id, c.level, c.name`).all(),
      atamalar: db.prepare(`
        SELECT a.id, a.class_id AS sinifId, a.course_id AS dersId, co.name AS ders,
               a.teacher_membership_id AS ogretmenUyelikId, a.weekly_hours AS haftalikSaat,
               (SELECT COUNT(*) FROM schedule s WHERE s.assignment_id = a.id) AS kullanilan
        FROM assignments a JOIN courses co ON co.id = a.course_id ORDER BY co.name`).all(),
    });
    return true;
  }

  if (req.method !== 'POST') return false;
  const uclar = ['/api/yonetim/ogretmen-kayit', '/api/yonetim/ogrenci-kayit', '/api/yonetim/ogretmen-dersleri',
    '/api/yonetim/ogrenci-sinif', '/api/yonetim/sinif-ogretmeni'];
  if (!uclar.includes(yol)) return false;
  const b = await govde(req);

  if (yol === '/api/yonetim/ogretmen-kayit') {
    const dersIds = Array.isArray(b.dersIds) ? [...new Set(b.dersIds.map(Number))] : [];
    if (dersIds.some(d => !Number.isInteger(d) || !db.prepare('SELECT 1 FROM courses WHERE id = ?').get(d))) {
      return hata(400, 'Geçersiz ders seçimi');
    }
    const s = islem(() => {
      const k = kisiKaydet(b, 'ogretmen', o.user_id, denetle);
      if (k.kod === 201) {
        const ekle = db.prepare('INSERT INTO teacher_courses (teacher_membership_id, course_id) VALUES (?,?)');
        for (const d of dersIds) ekle.run(k.uyelikId, d);
      }
      return k;
    });
    return s.kod === 201 ? (json(res, 201, { tamam: true, uyelikId: s.uyelikId }), true) : hata(s.kod, s.hata);
  }

  if (yol === '/api/yonetim/ogrenci-kayit') {
    const sinifId = bos(b.sinifId) ? null : tamSayi(b.sinifId, 1, 1e9);
    if (!bos(b.sinifId) && !sinifId) return hata(400, 'Geçersiz sınıf');
    const sinif = sinifId ? db.prepare('SELECT * FROM classes WHERE id = ?').get(sinifId) : null;
    if (sinifId && !sinif) return hata(404, 'Sınıf bulunamadı');
    if (sinif && sinif.branch_id !== tamSayi(b.subeId, 1, 1e9)) return hata(400, 'Sınıf seçilen şubeye ait değil');
    const s = islem(() => {
      const k = kisiKaydet(b, 'ogrenci', o.user_id, denetle);
      if (k.kod === 201 && sinifId) {
        db.prepare('INSERT INTO class_students (class_id, student_membership_id) VALUES (?,?)').run(sinifId, k.uyelikId);
      }
      return k;
    });
    return s.kod === 201 ? (json(res, 201, { tamam: true, uyelikId: s.uyelikId }), true) : hata(s.kod, s.hata);
  }

  if (yol === '/api/yonetim/ogretmen-dersleri') {
    const uyelikId = tamSayi(b.uyelikId, 1, 1e9);
    const m = uyelikId && db.prepare("SELECT * FROM memberships WHERE id = ? AND role = 'ogretmen'").get(uyelikId);
    if (!m) return hata(404, 'Öğretmen bulunamadı');
    const dersIds = Array.isArray(b.dersIds) ? [...new Set(b.dersIds.map(Number))] : null;
    if (!dersIds || dersIds.some(d => !Number.isInteger(d) || !db.prepare('SELECT 1 FROM courses WHERE id = ?').get(d))) {
      return hata(400, 'Geçersiz ders seçimi');
    }
    // Sınıflarda zaten o dersi veren öğretmenin yetkisi kaldırılamaz.
    const kullanilan = db.prepare(`
      SELECT co.name AS ders, c.name AS sinif FROM assignments a
      JOIN courses co ON co.id = a.course_id JOIN classes c ON c.id = a.class_id
      WHERE a.teacher_membership_id = ?`).all(uyelikId).filter(x =>
      !dersIds.includes(db.prepare('SELECT id FROM courses WHERE name = ?').get(x.ders).id));
    if (kullanilan.length) {
      return hata(409, 'Önce sınıflardaki atamayı kaldırın: ' + kullanilan.map(x => `${x.sinif} ${x.ders}`).join(', '));
    }
    islem(() => {
      db.prepare('DELETE FROM teacher_courses WHERE teacher_membership_id = ?').run(uyelikId);
      const ekle = db.prepare('INSERT INTO teacher_courses (teacher_membership_id, course_id) VALUES (?,?)');
      for (const d of dersIds) ekle.run(uyelikId, d);
    });
    denetle(o.user_id, 'ogretmen-dersleri', { uyelikId, dersIds });
    json(res, 200, { tamam: true });
    return true;
  }

  if (yol === '/api/yonetim/ogrenci-sinif') {
    const uyelikId = tamSayi(b.ogrenciUyelikId, 1, 1e9);
    const ogr = uyelikId && db.prepare("SELECT * FROM memberships WHERE id = ? AND role = 'ogrenci' AND status = 'aktif'").get(uyelikId);
    if (!ogr) return hata(404, 'Aktif öğrenci bulunamadı');
    if (bos(b.sinifId)) {
      db.prepare('DELETE FROM class_students WHERE student_membership_id = ?').run(uyelikId);
      denetle(o.user_id, 'ogrenci-sinif-kaldir', { uyelikId });
      json(res, 200, { tamam: true });
      return true;
    }
    const sinifId = tamSayi(b.sinifId, 1, 1e9);
    const sinif = sinifId && db.prepare('SELECT * FROM classes WHERE id = ?').get(sinifId);
    if (!sinif) return hata(404, 'Sınıf bulunamadı');
    if (sinif.branch_id !== ogr.branch_id) return hata(400, 'Öğrenci ve sınıf farklı şubelerde');
    db.prepare(`INSERT INTO class_students (class_id, student_membership_id) VALUES (?,?)
                ON CONFLICT (student_membership_id) DO UPDATE SET class_id = excluded.class_id`).run(sinifId, uyelikId);
    denetle(o.user_id, 'ogrenci-sinif', { uyelikId, sinifId });
    json(res, 200, { tamam: true });
    return true;
  }

  // /api/yonetim/sinif-ogretmeni
  const sinifId = tamSayi(b.sinifId, 1, 1e9);
  const sinif = sinifId && db.prepare('SELECT * FROM classes WHERE id = ?').get(sinifId);
  if (!sinif) return hata(404, 'Sınıf bulunamadı');
  if (bos(b.uyelikId)) {
    db.prepare('UPDATE classes SET homeroom_membership_id = NULL WHERE id = ?').run(sinifId);
  } else {
    const uyelikId = tamSayi(b.uyelikId, 1, 1e9);
    const ogr = uyelikId && db.prepare("SELECT * FROM memberships WHERE id = ? AND role = 'ogretmen' AND status = 'aktif'").get(uyelikId);
    if (!ogr) return hata(400, 'Geçerli bir öğretmen seçiniz');
    if (ogr.branch_id !== sinif.branch_id) return hata(400, 'Öğretmen bu sınıfın şubesinde görevli değil');
    db.prepare('UPDATE classes SET homeroom_membership_id = ? WHERE id = ?').run(uyelikId, sinifId);
  }
  denetle(o.user_id, 'sinif-ogretmeni', { sinifId, uyelikId: bos(b.uyelikId) ? null : Number(b.uyelikId) });
  json(res, 200, { tamam: true });
  return true;
}
