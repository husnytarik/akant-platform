import { db } from './db.js';

export const GUN_SAYISI = 5;
export const DERS_SAATI = 9;
export const KADEMELER = ['Anasınıfı', 'İlkokul', 'Ortaokul', 'Lise'];

// Başlangıç ders listesi (yönetim sonradan ekleyebilir).
if (db.prepare('SELECT COUNT(*) AS n FROM courses').get().n === 0) {
  const ekle = db.prepare('INSERT INTO courses (name) VALUES (?)');
  for (const d of ['Türkçe', 'Matematik', 'Fen Bilimleri', 'Sosyal Bilgiler', 'İngilizce', 'Fizik', 'Kimya',
    'Biyoloji', 'Tarih', 'Coğrafya', 'Edebiyat', 'Beden Eğitimi', 'Görsel Sanatlar', 'Müzik',
    'Din Kültürü', 'Bilişim']) ekle.run(d);
}

const tamSayi = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

// Atanacak öğretmen aktif, sınıfın şubesinde görevli ve dersi verebilir olmalı.
function ogretmenHatasi(uyelikId, sinif, dersId) {
  const ogr = db.prepare("SELECT * FROM memberships WHERE id = ? AND role = 'ogretmen' AND status = 'aktif'").get(uyelikId);
  if (!ogr) return 'Geçerli bir öğretmen seçiniz';
  if (ogr.branch_id !== sinif.branch_id) return 'Öğretmen bu sınıfın şubesinde görevli değil';
  if (!db.prepare('SELECT 1 FROM teacher_courses WHERE teacher_membership_id = ? AND course_id = ?').get(uyelikId, dersId)) {
    return 'Bu öğretmenin bu dersi verme yetkisi tanımlı değil (Öğretmenler sekmesinden ders ekleyin)';
  }
  return null;
}

// Yalnızca "yonetim" rolüyle çağrılır (yetki server.js'te denetlenir).
// İşlenen uç olursa true döner.
export async function dersProgramiApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };

  if (req.method === 'GET' && yol === '/api/yonetim/sinif-yapisi') {
    json(res, 200, {
      gunSayisi: GUN_SAYISI,
      dersSaati: DERS_SAATI,
      kademeler: KADEMELER,
      siniflar: db.prepare(`SELECT c.id, c.branch_id AS subeId, b.name AS sube, c.level AS kademe, c.name AS ad
                            FROM classes c JOIN branches b ON b.id = c.branch_id
                            ORDER BY b.id, c.level, c.name`).all(),
      dersler: db.prepare('SELECT id, name AS ad FROM courses ORDER BY name').all(),
      ogretmenler: db.prepare(`SELECT m.id AS uyelikId, u.id AS userId, u.full_name AS ad,
                                      m.branch_id AS subeId, b.name AS sube
                               FROM memberships m JOIN users u ON u.id = m.user_id
                               LEFT JOIN branches b ON b.id = m.branch_id
                               WHERE m.role = 'ogretmen' AND m.status = 'aktif'
                               ORDER BY u.full_name`).all(),
    });
    return true;
  }

  if (req.method === 'GET' && yol === '/api/yonetim/atamalar') {
    const sinifId = tamSayi(url.searchParams.get('sinifId'), 1, 1e9);
    if (!sinifId) return hata(400, 'Sınıf seçiniz');
    json(res, 200, {
      atamalar: db.prepare(`
        SELECT a.id, a.course_id AS dersId, co.name AS ders, a.teacher_membership_id AS ogretmenUyelikId,
               u.full_name AS ogretmen, a.weekly_hours AS haftalikSaat,
               (SELECT COUNT(*) FROM schedule s WHERE s.assignment_id = a.id) AS kullanilan
        FROM assignments a
        JOIN courses co ON co.id = a.course_id
        LEFT JOIN memberships m ON m.id = a.teacher_membership_id
        LEFT JOIN users u ON u.id = m.user_id
        WHERE a.class_id = ? ORDER BY co.name`).all(sinifId),
    });
    return true;
  }

  if (req.method === 'GET' && yol === '/api/yonetim/program') {
    const sinifId = tamSayi(url.searchParams.get('sinifId'), 1, 1e9);
    if (!sinifId) return hata(400, 'Sınıf seçiniz');
    json(res, 200, {
      hucreler: db.prepare(`
        SELECT s.day AS gun, s.period AS saat, s.assignment_id AS atamaId, co.name AS ders, u.full_name AS ogretmen
        FROM schedule s
        JOIN assignments a ON a.id = s.assignment_id
        JOIN courses co ON co.id = a.course_id
        JOIN memberships m ON m.id = a.teacher_membership_id
        JOIN users u ON u.id = m.user_id
        WHERE s.class_id = ?`).all(sinifId),
    });
    return true;
  }

  if (req.method === 'GET' && yol === '/api/yonetim/ogretmen-programi') {
    const userId = tamSayi(url.searchParams.get('userId'), 1, 1e9);
    if (!userId) return hata(400, 'Öğretmen seçiniz');
    json(res, 200, {
      hucreler: db.prepare(`
        SELECT s.day AS gun, s.period AS saat, c.name AS sinif, co.name AS ders
        FROM schedule s
        JOIN assignments a ON a.id = s.assignment_id
        JOIN memberships m ON m.id = a.teacher_membership_id
        JOIN classes c ON c.id = s.class_id
        JOIN courses co ON co.id = a.course_id
        WHERE m.user_id = ?`).all(userId),
    });
    return true;
  }

  if (req.method !== 'POST') return false;
  const yazma = ['/api/yonetim/sinif-ekle', '/api/yonetim/ders-ekle', '/api/yonetim/atama-ekle',
    '/api/yonetim/atama-ogretmen', '/api/yonetim/atama-sil', '/api/yonetim/program-hucre'];
  if (!yazma.includes(yol)) return false;
  const b = await govde(req);

  if (yol === '/api/yonetim/sinif-ekle') {
    const subeId = tamSayi(b.subeId, 1, 1e9);
    const ad = String(b.ad || '').trim();
    if (!subeId || !db.prepare('SELECT 1 FROM branches WHERE id = ?').get(subeId)) return hata(400, 'Geçersiz şube');
    if (!KADEMELER.includes(b.kademe)) return hata(400, 'Geçersiz kademe');
    if (ad.length < 1 || ad.length > 20) return hata(400, 'Sınıf adı 1-20 karakter olmalı');
    if (db.prepare('SELECT 1 FROM classes WHERE branch_id = ? AND name = ?').get(subeId, ad)) {
      return hata(409, 'Bu şubede aynı adlı sınıf var');
    }
    const id = Number(db.prepare('INSERT INTO classes (branch_id, level, name) VALUES (?,?,?)')
      .run(subeId, b.kademe, ad).lastInsertRowid);
    denetle(o.user_id, 'sinif-ekle', { sinifId: id, subeId, kademe: b.kademe, ad });
    json(res, 201, { tamam: true, id });
    return true;
  }

  if (yol === '/api/yonetim/ders-ekle') {
    const ad = String(b.ad || '').trim();
    if (ad.length < 2 || ad.length > 60) return hata(400, 'Ders adı 2-60 karakter olmalı');
    if (db.prepare('SELECT 1 FROM courses WHERE name = ? COLLATE NOCASE').get(ad)) return hata(409, 'Bu ders zaten var');
    const id = Number(db.prepare('INSERT INTO courses (name) VALUES (?)').run(ad).lastInsertRowid);
    denetle(o.user_id, 'ders-ekle', { dersId: id, ad });
    json(res, 201, { tamam: true, id });
    return true;
  }

  if (yol === '/api/yonetim/atama-ekle') {
    const sinifId = tamSayi(b.sinifId, 1, 1e9);
    const dersId = tamSayi(b.dersId, 1, 1e9);
    const ogretmenGirildi = b.ogretmenUyelikId !== null && b.ogretmenUyelikId !== undefined && b.ogretmenUyelikId !== '';
    const uyelikId = ogretmenGirildi ? tamSayi(b.ogretmenUyelikId, 1, 1e9) : null;
    const saat = tamSayi(b.haftalikSaat, 1, DERS_SAATI * GUN_SAYISI);
    if (!sinifId || !dersId || !saat || (ogretmenGirildi && !uyelikId)) return hata(400, 'Eksik veya geçersiz bilgi');
    const sinif = db.prepare('SELECT * FROM classes WHERE id = ?').get(sinifId);
    if (!sinif) return hata(404, 'Sınıf bulunamadı');
    if (!db.prepare('SELECT 1 FROM courses WHERE id = ?').get(dersId)) return hata(404, 'Ders bulunamadı');
    if (uyelikId) {
      const h = ogretmenHatasi(uyelikId, sinif, dersId);
      if (h) return hata(400, h);
    }
    if (db.prepare('SELECT 1 FROM assignments WHERE class_id = ? AND course_id = ?').get(sinifId, dersId)) {
      return hata(409, 'Bu ders bu sınıfa zaten eklenmiş');
    }
    const id = Number(db.prepare(`INSERT INTO assignments (class_id, course_id, teacher_membership_id, weekly_hours)
                                  VALUES (?,?,?,?)`).run(sinifId, dersId, uyelikId, saat).lastInsertRowid);
    denetle(o.user_id, 'atama-ekle', { atamaId: id, sinifId, dersId, uyelikId, saat });
    json(res, 201, { tamam: true, id });
    return true;
  }

  // Sınıfa eklenmiş dersin öğretmenini değiştirir/kaldırır.
  if (yol === '/api/yonetim/atama-ogretmen') {
    const atamaId = tamSayi(b.atamaId, 1, 1e9);
    const atama = atamaId && db.prepare('SELECT * FROM assignments WHERE id = ?').get(atamaId);
    if (!atama) return hata(404, 'Ders kaydı bulunamadı');
    const ogretmenGirildi = b.ogretmenUyelikId !== null && b.ogretmenUyelikId !== undefined && b.ogretmenUyelikId !== '';
    if (!ogretmenGirildi) {
      // Öğretmen kaldırılırsa dersin program hücreleri de boşalır.
      db.prepare('DELETE FROM schedule WHERE assignment_id = ?').run(atamaId);
      db.prepare('UPDATE assignments SET teacher_membership_id = NULL WHERE id = ?').run(atamaId);
      denetle(o.user_id, 'atama-ogretmen-kaldir', { atamaId });
      json(res, 200, { tamam: true });
      return true;
    }
    const uyelikId = tamSayi(b.ogretmenUyelikId, 1, 1e9);
    if (!uyelikId) return hata(400, 'Geçersiz öğretmen');
    const sinif = db.prepare('SELECT * FROM classes WHERE id = ?').get(atama.class_id);
    const h = ogretmenHatasi(uyelikId, sinif, atama.course_id);
    if (h) return hata(400, h);
    // Yeni öğretmen, dersin mevcut program saatlerinde başka sınıfta olmamalı.
    const yeniUser = db.prepare('SELECT user_id FROM memberships WHERE id = ?').get(uyelikId).user_id;
    const cakisma = db.prepare(`
      SELECT c.name AS sinif, s.day AS gun, s.period AS saat
      FROM schedule own
      JOIN schedule s ON s.day = own.day AND s.period = own.period AND s.class_id != own.class_id
      JOIN assignments a ON a.id = s.assignment_id
      JOIN memberships m ON m.id = a.teacher_membership_id
      JOIN classes c ON c.id = s.class_id
      WHERE own.assignment_id = ? AND m.user_id = ?`).get(atamaId, yeniUser);
    if (cakisma) return hata(409, `Bu öğretmen programdaki ${cakisma.gun}. gün ${cakisma.saat}. saatte ${cakisma.sinif} sınıfında derste`);
    db.prepare('UPDATE assignments SET teacher_membership_id = ? WHERE id = ?').run(uyelikId, atamaId);
    denetle(o.user_id, 'atama-ogretmen', { atamaId, uyelikId });
    json(res, 200, { tamam: true });
    return true;
  }

  if (yol === '/api/yonetim/atama-sil') {
    const atamaId = tamSayi(b.atamaId, 1, 1e9);
    if (!atamaId || !db.prepare('SELECT 1 FROM assignments WHERE id = ?').get(atamaId)) return hata(404, 'Atama bulunamadı');
    db.prepare('DELETE FROM schedule WHERE assignment_id = ?').run(atamaId);
    db.prepare('DELETE FROM assignments WHERE id = ?').run(atamaId);
    denetle(o.user_id, 'atama-sil', { atamaId });
    json(res, 200, { tamam: true });
    return true;
  }

  // /api/yonetim/program-hucre : atamaId null ise hücre boşaltılır
  const sinifId = tamSayi(b.sinifId, 1, 1e9);
  const gun = tamSayi(b.gun, 1, GUN_SAYISI);
  const saat = tamSayi(b.saat, 1, DERS_SAATI);
  if (!sinifId || !gun || !saat) return hata(400, 'Geçersiz gün veya ders saati');
  if (!db.prepare('SELECT 1 FROM classes WHERE id = ?').get(sinifId)) return hata(404, 'Sınıf bulunamadı');

  if (b.atamaId === null || b.atamaId === '' || b.atamaId === undefined) {
    db.prepare('DELETE FROM schedule WHERE class_id = ? AND day = ? AND period = ?').run(sinifId, gun, saat);
    denetle(o.user_id, 'program-bosalt', { sinifId, gun, saat });
    json(res, 200, { tamam: true });
    return true;
  }

  const atamaId = tamSayi(b.atamaId, 1, 1e9);
  const atama = atamaId && db.prepare(`SELECT a.*, m.user_id AS teacher_user_id
                                       FROM assignments a LEFT JOIN memberships m ON m.id = a.teacher_membership_id
                                       WHERE a.id = ?`).get(atamaId);
  if (!atama || atama.class_id !== sinifId) return hata(400, 'Bu ders/öğretmen ataması bu sınıfa ait değil');
  if (!atama.teacher_membership_id) return hata(409, 'Önce bu ders için öğretmen atayın');

  const kullanilan = db.prepare(`SELECT COUNT(*) AS n FROM schedule
                                 WHERE assignment_id = ? AND NOT (class_id = ? AND day = ? AND period = ?)`)
    .get(atamaId, sinifId, gun, saat).n;
  if (kullanilan >= atama.weekly_hours) {
    return hata(409, `Bu dersin haftalık ders saati (${atama.weekly_hours}) dolu`);
  }

  const cakisma = db.prepare(`
    SELECT c.name AS sinif FROM schedule s
    JOIN assignments a ON a.id = s.assignment_id
    JOIN memberships m ON m.id = a.teacher_membership_id
    JOIN classes c ON c.id = s.class_id
    WHERE m.user_id = ? AND s.day = ? AND s.period = ? AND s.class_id != ?`)
    .get(atama.teacher_user_id, gun, saat, sinifId);
  if (cakisma) return hata(409, `Öğretmen bu saatte ${cakisma.sinif} sınıfında derste`);

  db.prepare(`INSERT INTO schedule (class_id, day, period, assignment_id) VALUES (?,?,?,?)
              ON CONFLICT (class_id, day, period) DO UPDATE SET assignment_id = excluded.assignment_id`)
    .run(sinifId, gun, saat, atamaId);
  denetle(o.user_id, 'program-hucre', { sinifId, gun, saat, atamaId });
  json(res, 200, { tamam: true });
  return true;
}
