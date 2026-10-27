import { db, FOTO_SQL } from './db.js';

// Veli: bağlı çocuklarının kimlik kartı, öğretmenleri ve tek bakışta durumu (öğrenci kendi kartını da görür)
export async function ogrencimApi({ req, res, url, o, json }) {
  if (url.pathname !== '/api/ogrencim' || req.method !== 'GET') return false;
  if (o.role !== 'veli' && o.role !== 'ogrenci') return json(res, 403, { hata: 'Bu işlem için yetkiniz yok' }), true;

  const bugun = new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10);
  const sayi = r => Object.fromEntries(Object.entries(r).map(([a, b]) => [a, typeof b === 'bigint' ? Number(b) : b]));

  const cocuklar = o.role === 'ogrenci'
    ? db.prepare('SELECT ? AS id').all(o.membership_id)
    : db.prepare(`SELECT g.student_membership_id AS id FROM guardians g JOIN memberships m ON m.id = g.student_membership_id
        JOIN users u ON u.id = m.user_id WHERE g.parent_membership_id = ? ORDER BY u.full_name`).all(o.membership_id);

  const kimlik = db.prepare(`
    SELECT m.id, u.full_name AS ad, m.okul_no AS okulNo, ${FOTO_SQL} AS foto, b.name AS okul, c.id AS sinifId, c.name AS sinif,
           rm.id AS rehberId, ru.full_name AS rehber, ru.phone AS rehberTelefon
    FROM memberships m JOIN users u ON u.id = m.user_id JOIN branches b ON b.id = m.branch_id
    LEFT JOIN class_students cs ON cs.student_membership_id = m.id
    LEFT JOIN classes c ON c.id = cs.class_id
    LEFT JOIN memberships rm ON rm.id = c.homeroom_membership_id LEFT JOIN users ru ON ru.id = rm.user_id
    WHERE m.id = ?`);
  const ogretmenler = db.prepare(`
    SELECT co.name AS ders, u.full_name AS ad FROM assignments a JOIN courses co ON co.id = a.course_id
    JOIN memberships tm ON tm.id = a.teacher_membership_id JOIN users u ON u.id = tm.user_id
    WHERE a.class_id = ? ORDER BY co.name`);
  const devam = db.prepare(`
    SELECT COUNT(k.yoklama_id) AS toplam, COALESCE(SUM(k.status = 'gelmedi'), 0) AS gelmedi, COALESCE(SUM(k.status = 'gec'), 0) AS gec, COALESCE(SUM(k.status = 'izinli'), 0) AS izinli
    FROM yoklama_kayit k JOIN yoklama y ON y.id = k.yoklama_id WHERE k.student_membership_id = ? AND y.cancelled = 0 AND y.completed_at IS NOT NULL`);
  const odev = db.prepare(`
    SELECT COALESCE(SUM(od.durum IS NULL OR od.durum IN ('duzeltme','yapilamadi')), 0) AS yapilacak,
           COALESCE(SUM(od.durum = 'yapildi'), 0) AS onayda, COALESCE(SUM(od.durum IS NULL AND d.due_date < ?), 0) AS geciken
    FROM odevler d JOIN assignments a ON a.id = d.assignment_id
    JOIN class_students cs ON cs.class_id = a.class_id AND cs.student_membership_id = ?
    LEFT JOIN odev_durumlari od ON od.odev_id = d.id AND od.student_membership_id = cs.student_membership_id
    WHERE od.durum IS NULL OR od.durum != 'dogrulandi'`);
  const kulup = db.prepare('SELECT k.ad FROM kulup_uyeler ku JOIN kulupler k ON k.id = ku.kulup_id WHERE ku.student_membership_id = ?');
  const yakin = db.prepare(`SELECT u.full_name AS ad, u.phone AS telefon FROM guardians g JOIN memberships pm ON pm.id = g.parent_membership_id
    JOIN users u ON u.id = pm.user_id WHERE g.student_membership_id = ? ORDER BY u.full_name`);

  json(res, 200, {
    ogrenciler: cocuklar.map(({ id }) => {
      const k = kimlik.get(id);
      if (!k) return null;
      const dv = sayi(devam.get(id));
      const od = sayi(odev.get(bugun, id));
      return {
        id, ad: k.ad, okulNo: k.okulNo, foto: k.foto, okul: k.okul, sinif: k.sinif,
        rehber: k.rehber ? { ad: k.rehber, telefon: k.rehberTelefon || '' } : null,
        ogretmenler: k.sinifId ? ogretmenler.all(k.sinifId) : [],
        veliler: o.role === 'veli' ? yakin.all(id) : [],
        devam: { ...dv, yuzde: dv.toplam ? Math.round((dv.toplam - dv.gelmedi) / dv.toplam * 100) : 100 },
        odev: od,
        kulup: kulup.get(id)?.ad || null,
      };
    }).filter(Boolean),
  });
  return true;
}
