import { db } from './db.js';
import { dersStilleri, stilEkle } from './stil.js';
import { ogretmenMesgulNedeni } from './gorev.js';
import { DERS_ZAMANLARI, ACIK_GUNLER, gunAcik, ayarlar, ayarDogrula, ayarKaydet } from './okul-ayar.js';

export const KADEMELER = ['Anasınıfı', 'İlkokul', 'Ortaokul', 'Lise'];

// Başlangıç ders listesi (yönetim sonradan ekleyebilir).
if (db.prepare('SELECT COUNT(*) AS n FROM courses').get().n === 0) {
  const ekle = db.prepare('INSERT INTO courses (name) VALUES (?)');
  for (const d of ['Türkçe', 'Matematik', 'Fen Bilimleri', 'Sosyal Bilgiler', 'İngilizce', 'Fizik', 'Kimya',
    'Biyoloji', 'Tarih', 'Coğrafya', 'Edebiyat', 'Beden Eğitimi', 'Görsel Sanatlar', 'Müzik',
    'Din Kültürü', 'Bilişim']) ekle.run(d);
}
// Öğrenci kulüpleri programda bu adla yer alır; öğretmeni yoktur (kulüp danışmanları kulüp kaydındadır)
export const KULUP_DERSI = 'Kulüp';
db.prepare('INSERT OR IGNORE INTO courses (name) VALUES (?)').run(KULUP_DERSI);

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
// Açgözlü yerleştirme: kalan saati çok olan ders önce; bir dersi günlere yayar, öğretmen çakışmasından kaçınır.
function otomatikYerlestir(sinifId, bastan) {
  db.exec('BEGIN');
  try {
    // Kulüp saatleri okulca belirlenir; sınıf programı sıfırlanırken korunur
    if (bastan) db.prepare("DELETE FROM schedule WHERE class_id = ? AND assignment_id NOT IN (SELECT a.id FROM assignments a JOIN courses c ON c.id = a.course_id WHERE c.name = 'Kulüp')").run(sinifId);
    const atamalar = db.prepare(`
      SELECT a.id, a.weekly_hours AS saat, m.user_id AS ogr,
             (SELECT COUNT(*) FROM schedule s WHERE s.assignment_id = a.id) AS kullanilan
      FROM assignments a JOIN memberships m ON m.id = a.teacher_membership_id
      WHERE a.class_id = ?`).all(sinifId)
      .map(a => ({ ...a, kalan: a.saat - a.kullanilan })).filter(a => a.kalan > 0);
    const dolu = new Set(db.prepare('SELECT day, period FROM schedule WHERE class_id = ?').all(sinifId).map(r => r.day + ':' + r.period));
    const ogrMesgul = db.prepare(`
      SELECT 1 FROM schedule s JOIN assignments a ON a.id = s.assignment_id JOIN memberships m ON m.id = a.teacher_membership_id
      WHERE m.user_id = ? AND s.day = ? AND s.period = ?`);
    const gunYuk = new Map(ACIK_GUNLER.map(g => [g, 0]));
    for (const r of db.prepare('SELECT day FROM schedule WHERE class_id = ?').all(sinifId)) gunYuk.set(r.day, (gunYuk.get(r.day) || 0) + 1);
    const dersGun = new Map(); // `${atama}:${gun}` -> o gün bu dersten kaç saat
    for (const r of db.prepare('SELECT assignment_id AS a, day AS g FROM schedule WHERE class_id = ?').all(sinifId)) {
      dersGun.set(r.a + ':' + r.g, (dersGun.get(r.a + ':' + r.g) || 0) + 1);
    }
    const ekle = db.prepare('INSERT INTO schedule (class_id, day, period, assignment_id) VALUES (?,?,?,?)');
    let yerlesen = 0;
    const sirali = [...atamalar].sort((x, y) => y.kalan - x.kalan);
    // Her turda her dersten bir saat: saatler günlere dengeli yayılır
    for (let tur = 0; sirali.some(a => a.kalan > 0) && tur < 80; tur++) {
      for (const a of sirali) {
        if (a.kalan <= 0) continue;
        let en = null;
        for (const g of ACIK_GUNLER) {
          const ayni = dersGun.get(a.id + ':' + g) || 0;
          for (let p = 1; p <= DERS_ZAMANLARI.length; p++) {
            if (dolu.has(g + ':' + p) || ogrMesgul.get(a.ogr, g, p) || ogretmenMesgulNedeni(a.ogr, g, p)) continue;
            // Aynı gün tekrarı pahalı, dolu günler pahalı, geç saatler hafif pahalı;
            // aynı günde ikinci saat ancak bitişikse tercih edilir
            const bitisik = dolu.has(g + ':' + (p - 1)) || dolu.has(g + ':' + (p + 1));
            const bosluk = p > 1 && !dolu.has(g + ':' + (p - 1)) ? 30 : 0; // gün içinde boş ders oluşturmaktan kaçın
            const puan = ayni * 100 + (gunYuk.get(g) || 0) * 3 + p + bosluk + (ayni && !bitisik ? 40 : 0);
            if (!en || puan < en.puan) en = { g, p, puan };
          }
        }
        if (!en) { a.kalan = 0; continue; }
        ekle.run(sinifId, en.g, en.p, a.id);
        dolu.add(en.g + ':' + en.p);
        gunYuk.set(en.g, (gunYuk.get(en.g) || 0) + 1);
        dersGun.set(a.id + ':' + en.g, (dersGun.get(a.id + ':' + en.g) || 0) + 1);
        a.kalan--; yerlesen++;
      }
    }
    const eksik = db.prepare(`
      SELECT co.name AS ders, a.weekly_hours - (SELECT COUNT(*) FROM schedule s WHERE s.assignment_id = a.id) AS kalan
      FROM assignments a JOIN courses co ON co.id = a.course_id
      WHERE a.class_id = ? AND a.teacher_membership_id IS NOT NULL`).all(sinifId).filter(e => e.kalan > 0);
    db.exec('COMMIT');
    return { yerlesen, eksik };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export async function dersProgramiApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };

  if (req.method === 'GET' && yol === '/api/yonetim/sinif-yapisi') {
    json(res, 200, {
      okul: ayarlar(),
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
    const st = dersStilleri();
    json(res, 200, {
      atamalar: db.prepare(`
        SELECT a.id, a.course_id AS dersId, co.name AS ders, a.teacher_membership_id AS ogretmenUyelikId,
               u.full_name AS ogretmen, m.user_id AS ogretmenUserId, a.weekly_hours AS haftalikSaat,
               (SELECT COUNT(*) FROM schedule s WHERE s.assignment_id = a.id) AS kullanilan
        FROM assignments a
        JOIN courses co ON co.id = a.course_id
        LEFT JOIN memberships m ON m.id = a.teacher_membership_id
        LEFT JOIN users u ON u.id = m.user_id
        WHERE a.class_id = ? ORDER BY co.name`).all(sinifId).map(a => stilEkle(a, st)),
    });
    return true;
  }

  if (req.method === 'GET' && yol === '/api/yonetim/program') {
    const sinifId = tamSayi(url.searchParams.get('sinifId'), 1, 1e9);
    if (!sinifId) return hata(400, 'Sınıf seçiniz');
    const st = dersStilleri();
    json(res, 200, {
      hucreler: db.prepare(`
        SELECT s.day AS gun, s.period AS saat, s.assignment_id AS atamaId, co.name AS ders, u.full_name AS ogretmen
        FROM schedule s
        JOIN assignments a ON a.id = s.assignment_id
        JOIN courses co ON co.id = a.course_id
        LEFT JOIN memberships m ON m.id = a.teacher_membership_id
        LEFT JOIN users u ON u.id = m.user_id
        WHERE s.class_id = ?`).all(sinifId).map(h => stilEkle(h, st)),
    });
    return true;
  }

  if (req.method === 'GET' && yol === '/api/yonetim/ogretmen-programi') {
    const userId = tamSayi(url.searchParams.get('userId'), 1, 1e9);
    if (!userId) return hata(400, 'Öğretmen seçiniz');
    const st = dersStilleri();
    json(res, 200, {
      hucreler: db.prepare(`
        SELECT s.day AS gun, s.period AS saat, c.name AS sinif, co.name AS ders
        FROM schedule s
        JOIN assignments a ON a.id = s.assignment_id
        JOIN memberships m ON m.id = a.teacher_membership_id
        JOIN classes c ON c.id = s.class_id
        JOIN courses co ON co.id = a.course_id
        WHERE m.user_id = ?`).all(userId).map(h => stilEkle(h, st)),
    });
    return true;
  }

  if (req.method !== 'POST') return false;
  const yazma = ['/api/yonetim/sinif-ekle', '/api/yonetim/ders-ekle', '/api/yonetim/atama-ekle',
    '/api/yonetim/atama-ogretmen', '/api/yonetim/atama-sil', '/api/yonetim/program-hucre', '/api/yonetim/okul-ayar',
    '/api/yonetim/program-otomatik', '/api/yonetim/program-temizle', '/api/yonetim/sinif-sil'];
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

  if (yol === '/api/yonetim/sinif-sil') {
    const sinifId = tamSayi(b.sinifId, 1, 1e9);
    const sinif = sinifId && db.prepare('SELECT * FROM classes WHERE id = ?').get(sinifId);
    if (!sinif) return hata(404, 'Sınıf bulunamadı');
    const ogr = db.prepare('SELECT COUNT(*) AS n FROM class_students WHERE class_id = ?').get(sinifId).n;
    if (ogr) return hata(409, `Sınıfta ${ogr} öğrenci var; önce öğrencileri başka sınıfa taşıyın`);
    const kayit = db.prepare(`SELECT (SELECT COUNT(*) FROM yoklama WHERE class_id = ?) AS y,
                                     (SELECT COUNT(*) FROM sinav_siniflar WHERE class_id = ?) AS s`).get(sinifId, sinifId);
    if (kayit.y || kayit.s) return hata(409, 'Sınıfın yoklama ya da sınav kaydı var; silinemez');
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM schedule WHERE class_id = ?').run(sinifId);
      db.prepare('DELETE FROM odevler WHERE assignment_id IN (SELECT id FROM assignments WHERE class_id = ?)').run(sinifId);
      db.prepare('DELETE FROM assignments WHERE class_id = ?').run(sinifId);
      db.prepare('DELETE FROM classes WHERE id = ?').run(sinifId);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    denetle(o.user_id, 'sinif-sil', { sinifId, ad: sinif.name });
    json(res, 200, { tamam: true });
    return true;
  }

  if (yol === '/api/yonetim/okul-ayar') {
    const temiz = ayarDogrula(b);
    if (temiz.hata) return hata(400, temiz.hata);
    const s = ayarKaydet(temiz);
    if (s.hata) return hata(409, s.hata);
    denetle(o.user_id, 'okul-ayar', temiz);
    json(res, 200, { tamam: true, okul: ayarlar() });
    return true;
  }

  if (yol === '/api/yonetim/program-temizle') {
    const sinifId = tamSayi(b.sinifId, 1, 1e9);
    if (!sinifId || !db.prepare('SELECT 1 FROM classes WHERE id = ?').get(sinifId)) return hata(404, 'Sınıf bulunamadı');
    const n = db.prepare("DELETE FROM schedule WHERE class_id = ? AND assignment_id NOT IN (SELECT a.id FROM assignments a JOIN courses c ON c.id = a.course_id WHERE c.name = 'Kulüp')").run(sinifId).changes;
    denetle(o.user_id, 'program-temizle', { sinifId, n: Number(n) });
    json(res, 200, { tamam: true, silinen: Number(n) });
    return true;
  }

  // Sınıfın boş hücrelerini, eksik kalan ders saatlerine göre otomatik doldurur (mevcut yerleşimler korunur).
  if (yol === '/api/yonetim/program-otomatik') {
    const sinifId = tamSayi(b.sinifId, 1, 1e9);
    if (!sinifId || !db.prepare('SELECT 1 FROM classes WHERE id = ?').get(sinifId)) return hata(404, 'Sınıf bulunamadı');
    const sonuc = otomatikYerlestir(sinifId, !!b.bastan);
    denetle(o.user_id, 'program-otomatik', { sinifId, yerlesen: sonuc.yerlesen });
    json(res, 200, { tamam: true, ...sonuc });
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
    const saat = tamSayi(b.haftalikSaat, 1, DERS_ZAMANLARI.length * ACIK_GUNLER.length);
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
  const gun = b.gun !== null && b.gun !== '' && Number.isInteger(Number(b.gun)) && gunAcik(Number(b.gun)) ? Number(b.gun) : null;
  const saat = tamSayi(b.saat, 1, DERS_ZAMANLARI.length);
  if (!sinifId || gun === null || !saat) return hata(400, 'Geçersiz gün veya ders saati');
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
  const kulupMu = db.prepare('SELECT 1 FROM courses WHERE id = ? AND name = ?').get(atama.course_id, KULUP_DERSI);
  if (!atama.teacher_membership_id && !kulupMu) return hata(409, 'Önce bu ders için öğretmen atayın');

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
  const mesgulNedeni = atama.teacher_user_id && ogretmenMesgulNedeni(atama.teacher_user_id, gun, saat);
  if (mesgulNedeni) return hata(409, mesgulNedeni);

  db.prepare(`INSERT INTO schedule (class_id, day, period, assignment_id) VALUES (?,?,?,?)
              ON CONFLICT (class_id, day, period) DO UPDATE SET assignment_id = excluded.assignment_id`)
    .run(sinifId, gun, saat, atamaId);
  denetle(o.user_id, 'program-hucre', { sinifId, gun, saat, atamaId });
  json(res, 200, { tamam: true });
  return true;
}
