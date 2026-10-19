import { db } from './db.js';
import { dersStilleri, stilEkle } from './stil.js';

// Mentor (sınıf) öğretmeni: sorumlu olduğu sınıfların öğrencileri ve tek tek profilleri.
// Yalnızca classes.homeroom_membership_id kendisi olan sınıflara erişir.
export async function ogrencilerimApi({ req, res, url, o, json }) {
  const yol = url.pathname;
  if (!yol.startsWith('/api/ogrencilerim')) return false;
  if (o.role !== 'ogretmen') return json(res, 403, { hata: 'Bu işlem için yetkiniz yok' }), true;

  const DEVAM = `COUNT(k.yoklama_id) AS toplam, COALESCE(SUM(k.status = 'geldi'), 0) AS geldi, COALESCE(SUM(k.status = 'gelmedi'), 0) AS gelmedi,
                 COALESCE(SUM(k.status = 'gec'), 0) AS gec, COALESCE(SUM(k.status = 'izinli'), 0) AS izinli`;
  const sayiYap = r => Object.fromEntries(Object.entries(r).map(([a, b]) => [a, typeof b === 'bigint' ? Number(b) : b]));

  if (req.method === 'GET' && yol === '/api/ogrencilerim') {
    const siniflar = db.prepare('SELECT id, name AS ad, level AS kademe FROM classes WHERE homeroom_membership_id = ? ORDER BY name').all(o.membership_id);
    const ogr = db.prepare(`
      SELECT m.id, u.full_name AS ad, m.okul_no AS okulNo, ${DEVAM}
      FROM class_students cs JOIN memberships m ON m.id = cs.student_membership_id JOIN users u ON u.id = m.user_id
      LEFT JOIN yoklama y ON y.class_id = cs.class_id AND y.cancelled = 0 AND y.completed_at IS NOT NULL
      LEFT JOIN yoklama_kayit k ON k.yoklama_id = y.id AND k.student_membership_id = m.id
      WHERE cs.class_id = ? AND m.status = 'aktif' GROUP BY m.id ORDER BY u.full_name`);
    json(res, 200, { siniflar: siniflar.map(s => ({ ...s, ogrenciler: ogr.all(s.id).map(sayiYap) })) });
    return true;
  }

  if (req.method === 'GET' && yol === '/api/ogrencilerim/profil') {
    const id = Number(url.searchParams.get('id'));
    const o1 = db.prepare(`
      SELECT m.id, u.full_name AS ad, m.okul_no AS okulNo, c.name AS sinif, c.id AS sinifId
      FROM class_students cs JOIN classes c ON c.id = cs.class_id
      JOIN memberships m ON m.id = cs.student_membership_id JOIN users u ON u.id = m.user_id
      WHERE m.id = ? AND c.homeroom_membership_id = ?`).get(id, o.membership_id);
    if (!o1) return json(res, 404, { hata: 'Öğrenci bulunamadı' }), true;
    const veliler = db.prepare(`SELECT u.full_name AS ad, u.phone AS telefon FROM guardians g JOIN memberships pm ON pm.id = g.parent_membership_id
      JOIN users u ON u.id = pm.user_id WHERE g.student_membership_id = ? ORDER BY u.full_name`).all(id);
    const devam = sayiYap(db.prepare(`SELECT ${DEVAM} FROM yoklama_kayit k JOIN yoklama y ON y.id = k.yoklama_id
      WHERE k.student_membership_id = ? AND y.cancelled = 0 AND y.completed_at IS NOT NULL`).get(id));
    const dersler = db.prepare(`
      SELECT co.name AS ders, ${DEVAM}
      FROM assignments a JOIN courses co ON co.id = a.course_id
      LEFT JOIN yoklama y ON y.assignment_id = a.id AND y.cancelled = 0 AND y.completed_at IS NOT NULL
      LEFT JOIN yoklama_kayit k ON k.yoklama_id = y.id AND k.student_membership_id = ?
      WHERE a.class_id = ? GROUP BY a.id ORDER BY co.name`).all(id, o1.sinifId).map(sayiYap);
    const son = db.prepare(`SELECT y.date AS tarih, y.period AS dersSaati, co.name AS ders, k.status AS durum
      FROM yoklama_kayit k JOIN yoklama y ON y.id = k.yoklama_id LEFT JOIN assignments a ON a.id = y.assignment_id LEFT JOIN courses co ON co.id = a.course_id
      WHERE k.student_membership_id = ? AND k.status != 'geldi' AND y.cancelled = 0 AND y.completed_at IS NOT NULL
      ORDER BY y.date DESC, y.period DESC LIMIT 12`).all(id);
    json(res, 200, { ogrenci: { id: o1.id, ad: o1.ad, okulNo: o1.okulNo, sinif: o1.sinif }, veliler, devam, dersler: dersler.map(d => stilEkle(d, dersStilleri())), son });
    return true;
  }
  return false;
}
