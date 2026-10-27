import { db, sonrakiOkulNo, tcGecerliMi, FOTO_SQL } from './db.js';
import { resimTuru, hamGovde } from './foto.js';

const tamSayi = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const telNormalize = t => String(t || '').replace(/\D/g, '').slice(-10);
const bos = v => v === null || v === undefined || v === '';

export function islem(fn) {
  db.exec('BEGIN');
  try { const s = fn(); db.exec('COMMIT'); return s; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// Öğrenci / öğretmen kaydı: kişi yoksa hesap açılır, varsa (telefon eşleşirse)
// yalnızca yeni üyelik eklenir. Hesap ile üyelik ayrı tutulur.
export function kisiKaydet(b, rol, aktorId, denetle) {
  const ad = String(b.ad || '').trim();
  const kimlik = String(b.kimlik || '').trim().toUpperCase();
  const tel = telNormalize(b.telefon);
  const tcMi = /^\d{11}$/.test(kimlik);
  const subeId = tamSayi(b.subeId, 1, 1e9);
  if (ad.length < 3 || ad.length > 80) return { kod: 400, hata: 'Ad soyad geçersiz' };
  if (tcMi ? !tcGecerliMi(kimlik) : !/^[A-Z0-9]{5,20}$/.test(kimlik)) return { kod: 400, hata: 'Kimlik / pasaport numarası geçersiz' };
  if (!/^\d{10}$/.test(tel)) return { kod: 400, hata: 'Telefon 10 haneli olmalı' };
  if (!subeId || !db.prepare('SELECT 1 FROM branches WHERE id = ?').get(subeId)) return { kod: 400, hata: 'Geçersiz şube' };

  // Okul numarası yalnızca öğrenciler için; boş bırakılırsa şubedeki sıradaki numara verilir
  const okulNoGirilen = String(b.okulNo ?? '').trim();
  if (rol === 'ogrenci' && okulNoGirilen && !/^\d{1,10}$/.test(okulNoGirilen)) return { kod: 400, hata: 'Okul numarası 1-10 haneli rakam olmalı' };
  if (rol === 'ogrenci' && okulNoGirilen && db.prepare("SELECT 1 FROM memberships WHERE branch_id = ? AND role = 'ogrenci' AND okul_no = ?").get(subeId, okulNoGirilen)) {
    return { kod: 409, hata: 'Bu okul numarası şubede başka bir öğrencide kayıtlı' };
  }

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
  const okulNo = rol === 'ogrenci' ? (okulNoGirilen || sonrakiOkulNo(subeId)) : null;
  const uyelikId = Number(db.prepare('INSERT INTO memberships (user_id, branch_id, role, okul_no) VALUES (?,?,?,?)')
    .run(userId, subeId, rol, okulNo).lastInsertRowid);
  denetle(aktorId, rol + '-kayit', { userId, uyelikId, subeId, mevcutHesap: !!var_ });
  return { kod: 201, uyelikId, userId, subeId };
}

export async function kurulumApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };

  if (req.method === 'GET' && yol === '/api/yonetim/kurulum') {
    const dersIdleri = db.prepare('SELECT teacher_membership_id AS u, course_id AS d FROM teacher_courses').all();
    const ogretmenler = db.prepare(`
      SELECT m.id AS uyelikId, u.id AS userId, u.full_name AS ad, ${FOTO_SQL} AS foto, m.branch_id AS subeId, b.name AS sube, m.status AS durum
      FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN branches b ON b.id = m.branch_id
      WHERE m.role = 'ogretmen' ORDER BY u.full_name`).all()
      .map(t => ({ ...t, dersIds: dersIdleri.filter(x => x.u === t.uyelikId).map(x => x.d) }));
    const ogrenciler = db.prepare(`
      SELECT m.id AS uyelikId, u.full_name AS ad, ${FOTO_SQL} AS foto, m.okul_no AS okulNo, m.branch_id AS subeId, b.name AS sube, m.status AS durum,
             cs.class_id AS sinifId
      FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN branches b ON b.id = m.branch_id
      LEFT JOIN class_students cs ON cs.student_membership_id = m.id
      WHERE m.role = 'ogrenci' ORDER BY u.full_name`).all();
    const veliler = db.prepare(`
      SELECT g.student_membership_id AS ogrenciId, u.full_name AS ad, u.phone AS telefon
      FROM guardians g JOIN memberships m ON m.id = g.parent_membership_id JOIN users u ON u.id = m.user_id
      ORDER BY u.full_name`).all();
    json(res, 200, {
      kampusler: db.prepare(`SELECT k.id, k.name AS ad, k.adres, k.telefon,
          (SELECT COUNT(*) FROM branches b WHERE b.campus_id = k.id) AS okulSayisi FROM kampusler k ORDER BY k.id`).all(),
      subeler: db.prepare(`
        SELECT b.id, b.name AS ad, b.campus_id AS kampusId, b.tur, b.kurum_kodu AS kurumKodu, b.telefon, b.eposta, b.adres,
               (SELECT 'v' || l.guncelleme FROM okul_logo l WHERE l.branch_id = b.id) AS logo,
               (SELECT COUNT(*) FROM classes c WHERE c.branch_id = b.id) AS sinifSayisi,
               (SELECT COUNT(*) FROM memberships m WHERE m.branch_id = b.id AND m.role = 'ogrenci' AND m.status = 'aktif') AS ogrenciSayisi,
               (SELECT COUNT(*) FROM memberships m WHERE m.branch_id = b.id AND m.role = 'ogretmen' AND m.status = 'aktif') AS ogretmenSayisi
        FROM branches b ORDER BY b.id`).all(),
      kademeler: ['Anasınıfı', 'İlkokul', 'Ortaokul', 'Lise'],
      dersler: db.prepare('SELECT id, name AS ad FROM courses ORDER BY name').all(),
      ogretmenler,
      ogrenciler: ogrenciler.map(x => ({ ...x, veliler: veliler.filter(v => v.ogrenciId === x.uyelikId).map(({ ad, telefon }) => ({ ad, telefon })) })),
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
    '/api/yonetim/ogrenci-sinif', '/api/yonetim/sinif-ogretmeni', '/api/yonetim/veli-bagla', '/api/yonetim/veli-coz',
    '/api/yonetim/kampus-kaydet', '/api/yonetim/kampus-sil', '/api/yonetim/okul-kaydet', '/api/yonetim/okul-sil',
    '/api/yonetim/ders-duzenle', '/api/yonetim/ders-sil'];
  if (!uclar.includes(yol)) return false;
  const b = await govde(req);

  // Veli-öğrenci ilişkisi: aynı şubede aktif veli ve öğrenci üyelikleri bağlanır.
  if (yol === '/api/yonetim/veli-bagla' || yol === '/api/yonetim/veli-coz') {
    const veliId = tamSayi(b.veliUyelikId, 1, 1e9);
    const ogrId = tamSayi(b.ogrenciUyelikId, 1, 1e9);
    const veli = veliId && db.prepare("SELECT * FROM memberships WHERE id = ? AND role = 'veli' AND status = 'aktif'").get(veliId);
    const ogr = ogrId && db.prepare("SELECT * FROM memberships WHERE id = ? AND role = 'ogrenci'").get(ogrId);
    if (!veli) return hata(404, 'Aktif veli bulunamadı');
    if (!ogr) return hata(404, 'Öğrenci bulunamadı');
    if (yol === '/api/yonetim/veli-coz') {
      db.prepare('DELETE FROM guardians WHERE parent_membership_id = ? AND student_membership_id = ?').run(veliId, ogrId);
      denetle(o.user_id, 'veli-coz', { veliId, ogrId });
      json(res, 200, { tamam: true });
      return true;
    }
    if (veli.branch_id !== ogr.branch_id) return hata(400, 'Veli ve öğrenci farklı şubelerde');
    db.prepare('INSERT OR IGNORE INTO guardians (parent_membership_id, student_membership_id) VALUES (?,?)').run(veliId, ogrId);
    denetle(o.user_id, 'veli-bagla', { veliId, ogrId });
    json(res, 201, { tamam: true });
    return true;
  }

  // Kampüs ve okul tanımı. Okul = şube kaydı; bir kampüste birden çok okul olabilir.
  const metin = (v, azami) => String(v ?? '').trim().slice(0, azami);
  if (yol === '/api/yonetim/kampus-kaydet') {
    const id = bos(b.id) ? null : tamSayi(b.id, 1, 1e9);
    const ad = metin(b.ad, 80);
    if (ad.length < 2) return hata(400, 'Kampüs adı en az 2 karakter olmalı');
    if (id && !db.prepare('SELECT 1 FROM kampusler WHERE id = ?').get(id)) return hata(404, 'Kampüs bulunamadı');
    if (db.prepare('SELECT 1 FROM kampusler WHERE name = ? COLLATE NOCASE AND id IS NOT ?').get(ad, id)) return hata(409, 'Bu adda bir kampüs var');
    const alanlar = [ad, metin(b.adres, 200), metin(b.telefon, 30)];
    let yeniId = id;
    if (id) db.prepare('UPDATE kampusler SET name = ?, adres = ?, telefon = ? WHERE id = ?').run(...alanlar, id);
    else yeniId = Number(db.prepare('INSERT INTO kampusler (name, adres, telefon) VALUES (?,?,?)').run(...alanlar).lastInsertRowid);
    denetle(o.user_id, id ? 'kampus-duzenle' : 'kampus-ekle', { kampusId: yeniId, ad });
    json(res, id ? 200 : 201, { tamam: true, id: yeniId });
    return true;
  }
  if (yol === '/api/yonetim/kampus-sil') {
    const id = tamSayi(b.id, 1, 1e9);
    if (!id || !db.prepare('SELECT 1 FROM kampusler WHERE id = ?').get(id)) return hata(404, 'Kampüs bulunamadı');
    if (db.prepare('SELECT 1 FROM branches WHERE campus_id = ?').get(id)) return hata(409, 'Kampüste okul var; önce okulları silin ya da başka kampüse taşıyın');
    db.prepare('DELETE FROM kampusler WHERE id = ?').run(id);
    denetle(o.user_id, 'kampus-sil', { kampusId: id });
    json(res, 200, { tamam: true });
    return true;
  }
  if (yol === '/api/yonetim/okul-kaydet') {
    const id = bos(b.id) ? null : tamSayi(b.id, 1, 1e9);
    const ad = metin(b.ad, 80);
    const kampusId = tamSayi(b.kampusId, 1, 1e9);
    if (ad.length < 2) return hata(400, 'Okul adı en az 2 karakter olmalı');
    if (!kampusId || !db.prepare('SELECT 1 FROM kampusler WHERE id = ?').get(kampusId)) return hata(400, 'Geçersiz kampüs');
    if (id && !db.prepare('SELECT 1 FROM branches WHERE id = ?').get(id)) return hata(404, 'Okul bulunamadı');
    if (db.prepare('SELECT 1 FROM branches WHERE name = ? COLLATE NOCASE AND id IS NOT ?').get(ad, id)) return hata(409, 'Bu adda bir okul var');
    const eposta = metin(b.eposta, 80);
    if (eposta && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eposta)) return hata(400, 'E-posta adresi geçersiz');
    const alanlar = [ad, kampusId, metin(b.tur, 30), metin(b.kurumKodu, 30), metin(b.telefon, 30), eposta, metin(b.adres, 200)];
    let yeniId = id;
    if (id) db.prepare('UPDATE branches SET name = ?, campus_id = ?, tur = ?, kurum_kodu = ?, telefon = ?, eposta = ?, adres = ? WHERE id = ?').run(...alanlar, id);
    else yeniId = Number(db.prepare('INSERT INTO branches (name, campus_id, tur, kurum_kodu, telefon, eposta, adres) VALUES (?,?,?,?,?,?,?)').run(...alanlar).lastInsertRowid);
    denetle(o.user_id, id ? 'okul-duzenle' : 'okul-ekle', { okulId: yeniId, ad, kampusId });
    json(res, id ? 200 : 201, { tamam: true, id: yeniId });
    return true;
  }
  if (yol === '/api/yonetim/okul-sil') {
    const id = tamSayi(b.id, 1, 1e9);
    if (!id || !db.prepare('SELECT 1 FROM branches WHERE id = ?').get(id)) return hata(404, 'Okul bulunamadı');
    if (db.prepare('SELECT COUNT(*) AS n FROM branches').get().n < 2) return hata(409, 'Son okul silinemez');
    if (db.prepare('SELECT 1 FROM classes WHERE branch_id = ?').get(id) || db.prepare('SELECT 1 FROM memberships WHERE branch_id = ?').get(id)) {
      return hata(409, 'Okulda sınıf ya da kayıtlı kişi var; silinemez');
    }
    try {
      islem(() => { db.prepare('DELETE FROM okul_logo WHERE branch_id = ?').run(id); db.prepare('DELETE FROM branches WHERE id = ?').run(id); });
    } catch { return hata(409, 'Okulun başka kayıtları var; silinemez'); }
    denetle(o.user_id, 'okul-sil', { okulId: id });
    json(res, 200, { tamam: true });
    return true;
  }

  // Ders adı değiştirme / silme (Kulüp dersi sistem tarafından kullanılır, dokunulmaz)
  if (yol === '/api/yonetim/ders-duzenle' || yol === '/api/yonetim/ders-sil') {
    const id = tamSayi(b.id, 1, 1e9);
    const ders = id && db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
    if (!ders) return hata(404, 'Ders bulunamadı');
    if (ders.name === 'Kulüp') return hata(409, 'Kulüp dersi sistem tarafından kullanılır; değiştirilemez');
    if (yol === '/api/yonetim/ders-duzenle') {
      const ad = metin(b.ad, 60);
      if (ad.length < 2) return hata(400, 'Ders adı 2-60 karakter olmalı');
      if (db.prepare('SELECT 1 FROM courses WHERE name = ? COLLATE NOCASE AND id != ?').get(ad, id)) return hata(409, 'Bu ders zaten var');
      db.prepare('UPDATE courses SET name = ? WHERE id = ?').run(ad, id);
      denetle(o.user_id, 'ders-duzenle', { dersId: id, eski: ders.name, ad });
      json(res, 200, { tamam: true });
      return true;
    }
    if (db.prepare('SELECT 1 FROM assignments WHERE course_id = ?').get(id)) return hata(409, 'Ders sınıflara eklenmiş; önce sınıflardan kaldırın');
    try {
      islem(() => { db.prepare('DELETE FROM teacher_courses WHERE course_id = ?').run(id); db.prepare('DELETE FROM courses WHERE id = ?').run(id); });
    } catch { return hata(409, 'Dersin başka kayıtları var; silinemez'); }
    denetle(o.user_id, 'ders-sil', { dersId: id, ad: ders.name });
    json(res, 200, { tamam: true });
    return true;
  }

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

// Okul logosu: oturumu olan herkes görür; yalnızca yönetim yükler / kaldırır
export async function okulLogoApi({ req, res, url, o, json, denetle }) {
  const hata = (kod, m) => (json(res, kod, { hata: m }), true);
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id < 1) return hata(400, 'Geçersiz istek');
  if (req.method === 'GET' && url.pathname === '/api/okul-logo') {
    const l = db.prepare('SELECT mime, veri FROM okul_logo WHERE branch_id = ?').get(id);
    if (!l) return hata(404, 'Logo yok');
    res.writeHead(200, { 'Content-Type': l.mime, 'Content-Length': l.veri.length, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
    res.end(l.veri);
    return true;
  }
  if (req.method !== 'POST') return false;
  if (o.role !== 'yonetim' || o.gorev !== 'kurum') return hata(403, 'Bu işlem için yetkiniz yok');
  if (!db.prepare('SELECT 1 FROM branches WHERE id = ?').get(id)) return hata(404, 'Okul bulunamadı');
  if (url.pathname === '/api/okul-logo-sil') {
    db.prepare('DELETE FROM okul_logo WHERE branch_id = ?').run(id);
    denetle(o.user_id, 'okul-logo-sil', { okulId: id });
    json(res, 200, { tamam: true });
    return true;
  }
  const buf = await hamGovde(req, 1024 * 1024);
  if (!buf) return hata(413, 'Logo çok büyük (en çok 1 MB)');
  const mime = resimTuru(buf);
  if (!mime) return hata(400, 'Yalnızca JPEG, PNG veya WebP logo yüklenebilir');
  db.prepare(`INSERT INTO okul_logo (branch_id, mime, veri, guncelleme) VALUES (?,?,?,?)
    ON CONFLICT (branch_id) DO UPDATE SET mime = excluded.mime, veri = excluded.veri, guncelleme = excluded.guncelleme`).run(id, mime, buf, Date.now());
  denetle(o.user_id, 'okul-logo', { okulId: id });
  json(res, 200, { tamam: true });
  return true;
}
