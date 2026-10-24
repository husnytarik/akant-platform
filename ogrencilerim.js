import { db, FOTO_SQL } from './db.js';
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
      SELECT m.id, u.full_name AS ad, m.okul_no AS okulNo, ${FOTO_SQL} AS foto, ${DEVAM}
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
      SELECT m.id, u.full_name AS ad, m.okul_no AS okulNo, ${FOTO_SQL} AS foto, c.name AS sinif, c.id AS sinifId
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
    json(res, 200, { ogrenci: { id: o1.id, ad: o1.ad, okulNo: o1.okulNo, foto: o1.foto, sinif: o1.sinif }, veliler, devam, dersler: dersler.map(d => stilEkle(d, dersStilleri())), son });
    return true;
  }

  // Veli geldiğinde tek bakışta: iletişim, gelişim gözlemleri (tüm öğretmenler), görüşme notları, ödev, kulüp ve etüt
  if (req.method === 'GET' && yol === '/api/ogrencilerim/dosya') {
    const id = Number(url.searchParams.get('id'));
    const o1 = db.prepare(`SELECT m.id, m.user_id AS userId, m.branch_id AS subeId, c.id AS sinifId, c.name AS sinif
      FROM class_students cs JOIN classes c ON c.id = cs.class_id JOIN memberships m ON m.id = cs.student_membership_id
      WHERE m.id = ? AND c.homeroom_membership_id = ?`).get(id, o.membership_id);
    if (!o1) return json(res, 404, { hata: 'Öğrenci bulunamadı' }), true;
    const bilgi = db.prepare('SELECT email, telefon2, il, ilce, adres, yakin_ad AS yakinAd, yakin_yakinlik AS yakinYakinlik, yakin_telefon AS yakinTelefon FROM profil_bilgi WHERE user_id = ?').get(o1.userId) || {};
    const ogrTel = db.prepare('SELECT phone FROM users WHERE id = ?').get(o1.userId)?.phone || '';

    // Gelişim: dönem dönem, başlık başlık; yorumu yazan öğretmen ve dersiyle
    const basliklar = db.prepare('SELECT id, ad FROM gelisim_basliklari WHERE branch_id = ?').all(o1.subeId);
    const baslikAd = new Map(basliklar.map(b => [b.id, b.ad]));
    const baslikSira = new Map(db.prepare('SELECT id, sira FROM gelisim_basliklari WHERE branch_id = ?').all(o1.subeId).map(b => [b.id, b.sira]));
    const dersEtiket = new Map();
    const dersiOgren = mid => {
      if (!dersEtiket.has(mid)) {
        const dl = db.prepare(`SELECT DISTINCT co.name FROM assignments a JOIN courses co ON co.id = a.course_id WHERE a.class_id = ? AND a.teacher_membership_id = ? ORDER BY co.name`).all(o1.sinifId, mid).map(r => r.name);
        if (db.prepare('SELECT 1 FROM classes WHERE id = ? AND homeroom_membership_id = ?').get(o1.sinifId, mid)) dl.push('Sınıf öğretmeni');
        dersEtiket.set(mid, dl.join(', '));
      }
      return dersEtiket.get(mid);
    };
    const girisler = db.prepare(`SELECT g.donem_id AS donemId, g.baslik_id AS baslikId, g.teacher_membership_id AS ogretmenId, u.full_name AS ogretmen, g.metin
      FROM gelisim_girisleri g JOIN memberships m ON m.id = g.teacher_membership_id JOIN users u ON u.id = m.user_id
      WHERE g.student_membership_id = ? ORDER BY u.full_name`).all(id);
    const gorusmeler = db.prepare(`SELECT g.id, g.donem_id AS donemId, g.tur, g.tarih, g.notu, u.full_name AS yazan
      FROM gelisim_gorusmeleri g JOIN memberships m ON m.id = g.yazan_membership_id JOIN users u ON u.id = m.user_id
      WHERE g.student_membership_id = ? ORDER BY g.tarih DESC, g.id DESC`).all(id);
    const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
    const donemler = db.prepare('SELECT id, ad, baslangic, bitis, toplanti_tarihi AS toplanti FROM gelisim_donemleri WHERE branch_id = ? ORDER BY baslangic DESC').all(o1.subeId)
      .map(d => ({
        id: d.id, ad: d.ad, baslangic: d.baslangic, bitis: d.bitis, toplanti: d.toplanti || '', durum: bugun < d.baslangic ? 'yaklasan' : bugun > d.bitis ? 'kapandi' : 'acik',
        girisler: girisler.filter(g => g.donemId === d.id)
          .sort((a, b) => (baslikSira.get(a.baslikId) ?? 0) - (baslikSira.get(b.baslikId) ?? 0))
          .map(g => ({ baslik: baslikAd.get(g.baslikId) || '—', ogretmen: g.ogretmen, ders: dersiOgren(g.ogretmenId), metin: g.metin })),
        gorusmeler: gorusmeler.filter(g => g.donemId === d.id),
      }));

    // Ödev: son ödevler ve öğrencinin durumu (satır yoksa "verildi")
    const odevler = db.prepare(`SELECT od.id, od.title AS baslik, od.due_date AS son, co.name AS ders, d.durum, d.ogretmen_notu AS ogretmenNotu
      FROM odevler od JOIN assignments a ON a.id = od.assignment_id JOIN courses co ON co.id = a.course_id
      LEFT JOIN odev_durumlari d ON d.odev_id = od.id AND d.student_membership_id = ?
      WHERE a.class_id = ? ORDER BY od.due_date DESC, od.id DESC LIMIT 15`).all(id, o1.sinifId).map(x => ({ ...x, durum: x.durum || 'verildi' }));

    const kulup = db.prepare(`SELECT k.ad, k.tema,
        (SELECT COUNT(*) FROM kulup_katilim kk JOIN kulup_calismalar cc ON cc.id = kk.calisma_id WHERE cc.kulup_id = k.id AND kk.student_membership_id = ? AND kk.durum = 'geldi') AS geldi,
        (SELECT COUNT(*) FROM kulup_katilim kk JOIN kulup_calismalar cc ON cc.id = kk.calisma_id WHERE cc.kulup_id = k.id AND kk.student_membership_id = ?) AS toplam
      FROM kulup_uyeler ku JOIN kulupler k ON k.id = ku.kulup_id WHERE ku.student_membership_id = ?`).all(id, id, id).map(sayiYap)[0] || null;

    const etutler = db.prepare(`SELECT e.topic AS konu, e.date AS tarih, e.status AS durum, ek.parent_response AS yanit, ek.attendance AS devam, co.name AS ders
      FROM etut_katilimcilar ek JOIN etutler e ON e.id = ek.etut_id LEFT JOIN courses co ON co.id = e.course_id
      WHERE ek.student_membership_id = ? ORDER BY e.date DESC LIMIT 8`).all(id);

    json(res, 200, { bilgi: { ...bilgi, ogrenciTelefon: ogrTel }, donemler, donemsizGorusmeler: gorusmeler.filter(g => !g.donemId), odevler, kulup, etutler });
    return true;
  }
  return false;
}
