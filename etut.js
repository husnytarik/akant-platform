import { db } from './db.js';

const tamSayi = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const dk = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const bugun = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const SURELER = [30, 40, 45, 60, 80, 90, 120];

// Ders saatlerinin gün içindeki saatleri (varsayım; okulun gerçek zil saatlerine göre güncellenmeli)
const DERS_ZAMANLARI = [
  ['08:30', '09:10'], ['09:20', '10:00'], ['10:10', '10:50'], ['11:00', '11:40'],
  ['12:30', '13:10'], ['13:20', '14:00'], ['14:10', '14:50'], ['15:00', '15:40'],
];
const GUN_ADLARI = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];

// Etüt aralığıyla çakışan dersleri bulur: davetli öğrencilerin sınıf dersleri ve öğretmenin kendi dersleri.
function programCakismalari(ogretmenUyelikId, tarih, bas, bit, ogrenciler) {
  const gun = new Date(tarih + 'T00:00:00Z').getUTCDay(); // 1=Pazartesi ... 5=Cuma
  const bos = { ogrenci: [], ogretmen: [] };
  if (gun < 1 || gun > 5) return bos;
  const cakisan = DERS_ZAMANLARI.map((z, i) => ({ ders: i + 1, bas: dk(z[0]), bit: dk(z[1]), z }))
    .filter(p => p.bas < bit && bas < p.bit);
  if (!cakisan.length) return bos;
  const saatler = cakisan.map(p => p.ders);
  const yer = saatler.map(() => '?').join(',');

  // Sınıf bazında kaç davetli öğrenci etkileniyor
  const sinifOgr = new Map();
  for (const mid of ogrenciler) {
    const r = db.prepare('SELECT class_id FROM class_students WHERE student_membership_id = ?').get(mid);
    if (r) sinifOgr.set(r.class_id, (sinifOgr.get(r.class_id) || 0) + 1);
  }
  const satirlar = db.prepare(`
    SELECT s.period, a.class_id, a.teacher_membership_id AS ogr, c.name AS sinif, co.name AS ders
    FROM schedule s JOIN assignments a ON a.id = s.assignment_id
    JOIN classes c ON c.id = s.class_id JOIN courses co ON co.id = a.course_id
    WHERE s.day = ? AND s.period IN (${yer})
    ORDER BY s.period, c.name`).all(gun, ...saatler);
  const aralik = p => DERS_ZAMANLARI[p - 1].join('–');
  const sonuc = { ogrenci: [], ogretmen: [] };
  for (const r of satirlar) {
    if (sinifOgr.has(r.class_id)) {
      sonuc.ogrenci.push({ sinif: r.sinif, ders: r.ders, gun: GUN_ADLARI[gun], dersSaati: r.period, aralik: aralik(r.period), ogrenciSayisi: sinifOgr.get(r.class_id) });
    }
    if (r.ogr === ogretmenUyelikId) {
      sonuc.ogretmen.push({ sinif: r.sinif, ders: r.ders, gun: GUN_ADLARI[gun], dersSaati: r.period, aralik: aralik(r.period) });
    }
  }
  return sonuc;
}

function islem(fn) {
  db.exec('BEGIN');
  try { const s = fn(); db.exec('COMMIT'); return s; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

function etutSatiri(e) {
  return {
    id: e.id, ders: e.ders, konu: e.topic, tarih: e.date, saat: e.start_time, sureDk: e.duration_min,
    yer: e.place, not: e.note, durum: e.status, ogretmen: e.ogretmen,
  };
}

const ETUT_SELECT = `
  SELECT e.*, co.name AS ders, u.full_name AS ogretmen
  FROM etutler e
  JOIN memberships tm ON tm.id = e.teacher_membership_id
  JOIN users u ON u.id = tm.user_id
  LEFT JOIN courses co ON co.id = e.course_id`;

// Etüt modülü: öğretmen oluşturur, veli "gelecek / gelmeyecek" işaretler, öğrenci görür.
export async function etutApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };
  if (!yol.startsWith('/api/etut/')) return false;
  if (!o) return hata(401, 'Oturum yok');

  // ---- Öğretmen: seçenekler (kendi şubesinin sınıf ve öğrencileri) ----
  if (req.method === 'GET' && yol === '/api/etut/secenek') {
    if (o.role !== 'ogretmen') return hata(403, 'Bu işlem için yetkiniz yok');
    const sube = db.prepare('SELECT branch_id FROM memberships WHERE id = ?').get(o.membership_id).branch_id;
    json(res, 200, {
      siniflar: db.prepare('SELECT id, name AS ad, level AS kademe FROM classes WHERE branch_id = ? ORDER BY level, name').all(sube),
      ogrenciler: db.prepare(`
        SELECT m.id, u.full_name AS ad, cs.class_id AS sinifId
        FROM memberships m JOIN users u ON u.id = m.user_id
        LEFT JOIN class_students cs ON cs.student_membership_id = m.id
        WHERE m.role = 'ogrenci' AND m.status = 'aktif' AND m.branch_id = ? ORDER BY u.full_name`).all(sube),
      dersler: db.prepare(`SELECT co.id, co.name AS ad FROM courses co
                           WHERE co.id IN (SELECT course_id FROM teacher_courses WHERE teacher_membership_id = ?)
                           ORDER BY co.name`).all(o.membership_id),
      sureler: SURELER,
    });
    return true;
  }

  // ---- Listeler (role göre) ----
  if (req.method === 'GET' && yol === '/api/etut/liste') {
    if (o.role === 'ogretmen') {
      const etutler = db.prepare(`${ETUT_SELECT} WHERE e.teacher_membership_id = ? ORDER BY e.date DESC, e.start_time DESC`)
        .all(o.membership_id);
      const kat = db.prepare(`
        SELECT k.etut_id, k.student_membership_id AS ogrenciId, u.full_name AS ad, k.parent_response AS yanit
        FROM etut_katilimcilar k JOIN memberships m ON m.id = k.student_membership_id JOIN users u ON u.id = m.user_id
        WHERE k.etut_id IN (SELECT id FROM etutler WHERE teacher_membership_id = ?) ORDER BY u.full_name`).all(o.membership_id);
      json(res, 200, {
        etutler: etutler.map(e => ({ ...etutSatiri(e), katilimcilar: kat.filter(k => k.etut_id === e.id)
          .map(({ ogrenciId, ad, yanit }) => ({ ogrenciId, ad, yanit })) })),
      });
      return true;
    }
    if (o.role === 'veli') {
      const cocuklar = db.prepare(`
        SELECT m.id AS ogrenciId, u.full_name AS ad FROM guardians g
        JOIN memberships m ON m.id = g.student_membership_id JOIN users u ON u.id = m.user_id
        WHERE g.parent_membership_id = ? ORDER BY u.full_name`).all(o.membership_id);
      const kayitlar = db.prepare(`
        SELECT e.id, e.topic, e.date, e.start_time, e.duration_min, e.place, e.note, e.status,
               co.name AS ders, tu.full_name AS ogretmen,
               k.student_membership_id AS ogrenciId, k.parent_response AS yanit
        FROM etut_katilimcilar k
        JOIN guardians g ON g.student_membership_id = k.student_membership_id AND g.parent_membership_id = ?
        JOIN etutler e ON e.id = k.etut_id
        JOIN memberships tm ON tm.id = e.teacher_membership_id JOIN users tu ON tu.id = tm.user_id
        LEFT JOIN courses co ON co.id = e.course_id
        ORDER BY e.date DESC, e.start_time DESC`).all(o.membership_id);
      const ad = new Map(cocuklar.map(c => [c.ogrenciId, c.ad]));
      json(res, 200, {
        cocuklar,
        etutler: kayitlar.map(r => ({
          id: r.id, ders: r.ders, konu: r.topic, tarih: r.date, saat: r.start_time, sureDk: r.duration_min,
          yer: r.place, not: r.note, durum: r.status, ogretmen: r.ogretmen,
          ogrenciId: r.ogrenciId, ogrenci: ad.get(r.ogrenciId), yanit: r.yanit,
        })),
      });
      return true;
    }
    if (o.role === 'ogrenci') {
      const kayitlar = db.prepare(`
        SELECT e.id, e.topic, e.date, e.start_time, e.duration_min, e.place, e.note, e.status,
               co.name AS ders, tu.full_name AS ogretmen, k.parent_response AS yanit
        FROM etut_katilimcilar k
        JOIN etutler e ON e.id = k.etut_id
        JOIN memberships tm ON tm.id = e.teacher_membership_id JOIN users tu ON tu.id = tm.user_id
        LEFT JOIN courses co ON co.id = e.course_id
        WHERE k.student_membership_id = ? ORDER BY e.date DESC, e.start_time DESC`).all(o.membership_id);
      json(res, 200, {
        etutler: kayitlar.map(r => ({
          id: r.id, ders: r.ders, konu: r.topic, tarih: r.date, saat: r.start_time, sureDk: r.duration_min,
          yer: r.place, not: r.note, durum: r.status, ogretmen: r.ogretmen, yanit: r.yanit,
        })),
      });
      return true;
    }
    return hata(403, 'Bu işlem için yetkiniz yok');
  }

  if (req.method !== 'POST') return hata(404, 'Bulunamadı');
  const b = await govde(req);

  // ---- Öğretmen: etüt oluştur ----
  if (yol === '/api/etut/ekle') {
    if (o.role !== 'ogretmen') return hata(403, 'Bu işlem için yetkiniz yok');
    const konu = String(b.konu || '').trim();
    const yer = String(b.yer || '').trim().slice(0, 60);
    const not = String(b.not || '').trim().slice(0, 300);
    const tarih = String(b.tarih || '');
    const saat = String(b.saat || '');
    const sure = tamSayi(b.sureDk, 15, 240);
    if (konu.length < 2 || konu.length > 80) return hata(400, 'Konu 2-80 karakter olmalı');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih) || Number.isNaN(Date.parse(tarih))) return hata(400, 'Tarih geçersiz');
    if (tarih < bugun()) return hata(400, 'Geçmiş bir tarihe etüt açılamaz');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(saat)) return hata(400, 'Saat geçersiz');
    if (!sure) return hata(400, 'Süre 15-240 dakika olmalı');

    const sube = db.prepare('SELECT branch_id FROM memberships WHERE id = ?').get(o.membership_id).branch_id;
    let dersId = null;
    if (b.dersId !== null && b.dersId !== undefined && b.dersId !== '') {
      dersId = tamSayi(b.dersId, 1, 1e9);
      if (!dersId || !db.prepare('SELECT 1 FROM courses WHERE id = ?').get(dersId)) return hata(400, 'Ders geçersiz');
    }

    // Öğrenci kümesi: seçilen sınıfların öğrencileri + tek tek seçilen öğrenciler
    const ogrenciler = new Set();
    const siniflar = Array.isArray(b.sinifIds) ? b.sinifIds : [];
    for (const s of siniflar) {
      const sid = tamSayi(s, 1, 1e9);
      const sinif = sid && db.prepare('SELECT branch_id FROM classes WHERE id = ?').get(sid);
      if (!sinif || sinif.branch_id !== sube) return hata(400, 'Sınıf geçersiz');
      for (const r of db.prepare(`SELECT cs.student_membership_id AS id FROM class_students cs
                                  JOIN memberships m ON m.id = cs.student_membership_id
                                  WHERE cs.class_id = ? AND m.status = 'aktif'`).all(sid)) ogrenciler.add(r.id);
    }
    for (const s of Array.isArray(b.ogrenciIds) ? b.ogrenciIds : []) {
      const mid = tamSayi(s, 1, 1e9);
      const m = mid && db.prepare("SELECT branch_id, role, status FROM memberships WHERE id = ?").get(mid);
      if (!m || m.role !== 'ogrenci' || m.status !== 'aktif' || m.branch_id !== sube) return hata(400, 'Öğrenci geçersiz');
      ogrenciler.add(mid);
    }
    if (!ogrenciler.size) return hata(400, 'En az bir sınıf veya öğrenci seçin');
    if (ogrenciler.size > 300) return hata(400, 'Çok fazla öğrenci seçildi');

    // Öğretmenin aynı gün çakışan başka etütü olamaz
    const bas = dk(saat), bit = bas + sure;
    const cakisan = db.prepare("SELECT start_time, duration_min FROM etutler WHERE teacher_membership_id = ? AND date = ? AND status = 'planli'")
      .all(o.membership_id, tarih).find(x => dk(x.start_time) < bit && bas < dk(x.start_time) + x.duration_min);
    if (cakisan) return hata(409, `Bu saatte başka bir etütünüz var (${cakisan.start_time}, ${cakisan.duration_min} dk)`);

    // Ders programı çakışması: uyarı verilir, öğretmen onaylarsa etüt yine de açılır.
    if (b.cakismayiOnayla !== true) {
      const c = programCakismalari(o.membership_id, tarih, bas, bit, ogrenciler);
      if (c.ogrenci.length || c.ogretmen.length) {
        json(res, 409, { hata: 'Seçilen saat ders programıyla çakışıyor', cakisma: true, ogrenci: c.ogrenci, ogretmen: c.ogretmen });
        return true;
      }
    }

    const id = islem(() => {
      const eid = Number(db.prepare(`INSERT INTO etutler (teacher_membership_id, course_id, topic, date, start_time, duration_min, place, note, created_at)
                                     VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(o.membership_id, dersId, konu, tarih, saat, sure, yer || null, not || null, Date.now()).lastInsertRowid);
      const ekle = db.prepare('INSERT INTO etut_katilimcilar (etut_id, student_membership_id) VALUES (?,?)');
      for (const m of ogrenciler) ekle.run(eid, m);
      return eid;
    });
    denetle(o.user_id, 'etut-ekle', { etutId: id, ogrenciSayisi: ogrenciler.size, tarih, saat, sure });
    json(res, 201, { tamam: true, id, ogrenciSayisi: ogrenciler.size });
    return true;
  }

  // ---- Öğretmen: etüt iptali ----
  if (yol === '/api/etut/iptal') {
    if (o.role !== 'ogretmen') return hata(403, 'Bu işlem için yetkiniz yok');
    const id = tamSayi(b.etutId, 1, 1e9);
    const e = id && db.prepare('SELECT id, teacher_membership_id FROM etutler WHERE id = ?').get(id);
    if (!e || e.teacher_membership_id !== o.membership_id) return hata(404, 'Etüt bulunamadı');
    db.prepare("UPDATE etutler SET status = 'iptal' WHERE id = ?").run(id);
    denetle(o.user_id, 'etut-iptal', { etutId: id });
    json(res, 200, { tamam: true });
    return true;
  }

  // ---- Veli: çocuğunun etüte katılım durumunu işaretle ----
  if (yol === '/api/etut/yanit') {
    if (o.role !== 'veli') return hata(403, 'Bu işlem için yetkiniz yok');
    if (!['gelecek', 'gelmeyecek'].includes(b.yanit)) return hata(400, 'Yanıt geçersiz');
    const etutId = tamSayi(b.etutId, 1, 1e9);
    const ogrenciId = tamSayi(b.ogrenciId, 1, 1e9);
    if (!etutId || !ogrenciId) return hata(400, 'Geçersiz istek');
    // Yalnızca kendi çocuğu için ve çocuğun davetli olduğu etüt için
    const baglanti = db.prepare('SELECT 1 FROM guardians WHERE parent_membership_id = ? AND student_membership_id = ?')
      .get(o.membership_id, ogrenciId);
    const kat = db.prepare(`SELECT e.status, e.date FROM etut_katilimcilar k JOIN etutler e ON e.id = k.etut_id
                            WHERE k.etut_id = ? AND k.student_membership_id = ?`).get(etutId, ogrenciId);
    if (!baglanti || !kat) return hata(404, 'Etüt bulunamadı');
    if (kat.status !== 'planli') return hata(409, 'Bu etüt iptal edilmiş');
    if (kat.date < bugun()) return hata(409, 'Geçmiş etüt için yanıt verilemez');
    db.prepare(`UPDATE etut_katilimcilar SET parent_response = ?, responded_at = ?, responded_by = ?
                WHERE etut_id = ? AND student_membership_id = ?`).run(b.yanit, Date.now(), o.user_id, etutId, ogrenciId);
    denetle(o.user_id, 'etut-yanit', { etutId, ogrenciId, yanit: b.yanit });
    json(res, 200, { tamam: true });
    return true;
  }

  return hata(404, 'Bulunamadı');
}
