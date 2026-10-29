import { db } from './db.js';
import { tarihAcik } from './tatil.js';

// Raporlar (yönetim): okul ya da tüm kurum için devam, eksik ders, ödev ve kulüp özetleri
const bugun = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const kaydir = (t, n) => {
  const d = new Date(t + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const sayi = r => Object.fromEntries(Object.entries(r).map(([a, b]) => [a, typeof b === 'bigint' ? Number(b) : b]));
const yuzde = (a, b) => b ? Math.round(a / b * 100) : 0;

export async function raporApi({ req, res, url, o, json }) {
  if (url.pathname !== '/api/rapor/ozet' || req.method !== 'GET') return false;
  if (o.role !== 'yonetim') return json(res, 403, { hata: 'Bu işlem için yetkiniz yok' }), true;

  const okullar = db.prepare('SELECT id, name AS ad FROM branches ORDER BY name').all();
  const okul = okullar.find(x => x.id === Number(url.searchParams.get('okul')))?.id ?? null;
  const f = (kolon) => okul ? ` AND ${kolon} = ${okul}` : '';

  const ozet = sayi(db.prepare(`SELECT
    (SELECT COUNT(*) FROM memberships m WHERE m.role = 'ogrenci' AND m.status = 'aktif'${f('m.branch_id')}) AS ogrenci,
    (SELECT COUNT(*) FROM memberships m WHERE m.role = 'ogretmen' AND m.status = 'aktif'${f('m.branch_id')}) AS ogretmen,
    (SELECT COUNT(*) FROM classes c WHERE 1 = 1${f('c.branch_id')}) AS sinif`).get());

  // Devam: tamamlanmış yoklamalardan, sınıf başına gelmedi oranı
  const siniflar = db.prepare(`
    SELECT c.name AS ad, COUNT(k.yoklama_id) AS toplam, COALESCE(SUM(k.status = 'gelmedi'), 0) AS gelmedi
    FROM classes c JOIN yoklama y ON y.class_id = c.id AND y.cancelled = 0 AND y.completed_at IS NOT NULL
    JOIN yoklama_kayit k ON k.yoklama_id = y.id WHERE 1 = 1${f('c.branch_id')} GROUP BY c.id`).all().map(sayi)
    .map(s => ({ ad: s.ad, gelmedi: s.gelmedi, toplam: s.toplam, oran: yuzde(s.gelmedi, s.toplam) }));
  const toplam = siniflar.reduce((t, s) => t + s.toplam, 0), gelmedi = siniflar.reduce((t, s) => t + s.gelmedi, 0);
  const devam = { yuzde: toplam ? 100 - yuzde(gelmedi, toplam) : 100, gelmedi, toplam, siniflar: siniflar.sort((a, b) => b.oran - a.oran).slice(0, 6) };

  const devamsizlar = db.prepare(`
    SELECT u.full_name AS ad, c.name AS sinif, COUNT(*) AS gelmedi
    FROM yoklama_kayit k JOIN yoklama y ON y.id = k.yoklama_id AND y.cancelled = 0 AND y.completed_at IS NOT NULL
    JOIN memberships m ON m.id = k.student_membership_id JOIN users u ON u.id = m.user_id JOIN classes c ON c.id = y.class_id
    WHERE k.status = 'gelmedi'${f('c.branch_id')} GROUP BY m.id ORDER BY gelmedi DESC, u.full_name LIMIT 6`).all().map(sayi);

  // Eksik dersler: son 14 günde ders programında olup yoklaması tamamlanmayan (iptal edilmemiş) dersler, öğretmen başına
  const program = db.prepare(`
    SELECT s.class_id AS sinifId, s.period AS saat, a.teacher_membership_id AS ogretmen
    FROM schedule s JOIN assignments a ON a.id = s.assignment_id JOIN classes c ON c.id = s.class_id
    WHERE s.day = ?${f('c.branch_id')}`);
  const tamamSet = new Set(db.prepare('SELECT class_id, date, period FROM yoklama WHERE date >= ? AND (completed_at IS NOT NULL OR cancelled = 1)')
    .all(kaydir(bugun(), -14)).map(r => `${r.class_id}|${r.date}|${r.period}`));
  const eksik = new Map();
  let eksikToplam = 0, programToplam = 0;
  for (let n = 1; n <= 14; n++) {
    const t = kaydir(bugun(), -n);
    const gun = new Date(t + 'T00:00:00Z').getUTCDay();
    if (!tarihAcik(t)) continue;
    for (const r of program.all(gun)) {
      programToplam++;
      if (tamamSet.has(`${r.sinifId}|${t}|${r.saat}`)) continue;
      eksik.set(r.ogretmen, (eksik.get(r.ogretmen) || 0) + 1);
      eksikToplam++;
    }
  }
  const ad = db.prepare('SELECT u.full_name AS ad FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.id = ?');
  const eksikDersler = {
    toplam: eksikToplam, oran: yuzde(eksikToplam, programToplam),
    ogretmenler: [...eksik].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => ({ ad: ad.get(id)?.ad || 'Öğretmeni atanmamış', sayi: n })),
  };

  // Ödev: son tarihi geçmiş ödevlerde öğrencinin yaptım / doğrulandı işaretleme oranı, sınıf başına
  const odevSinif = db.prepare(`
    SELECT c.name AS ad, COUNT(*) AS toplam, COALESCE(SUM(od.durum IN ('yapildi','dogrulandi')), 0) AS tamam
    FROM odevler d JOIN assignments a ON a.id = d.assignment_id JOIN classes c ON c.id = a.class_id
    JOIN class_students cs ON cs.class_id = c.id
    LEFT JOIN odev_durumlari od ON od.odev_id = d.id AND od.student_membership_id = cs.student_membership_id
    WHERE d.due_date < ?${f('c.branch_id')} GROUP BY c.id`).all(bugun()).map(sayi)
    .map(s => ({ ad: s.ad, oran: yuzde(s.tamam, s.toplam), toplam: s.toplam }));
  const odevT = odevSinif.reduce((t, s) => t + s.toplam, 0);
  const odevTamam = odevSinif.reduce((t, s) => t + Math.round(s.oran * s.toplam / 100), 0);
  const odev = { yuzde: yuzde(odevTamam, odevT), siniflar: odevSinif.sort((a, b) => a.oran - b.oran).slice(0, 6) };

  const kulupler = db.prepare(`
    SELECT k.ad, (SELECT name FROM branches b WHERE b.id = k.branch_id) AS okul, k.kontenjan, (SELECT COUNT(*) FROM kulup_uyeler ku WHERE ku.kulup_id = k.id) AS uye,
           (SELECT COUNT(*) FROM kulup_talepleri t WHERE t.kulup_id = k.id AND t.durum = 'bekliyor') AS bekleyen
    FROM kulupler k WHERE k.aktif = 1${f('k.branch_id')} ORDER BY k.ad, k.branch_id`).all().map(sayi);

  json(res, 200, { okullar, okul, ozet, devam, devamsizlar, eksikDersler, odev, kulupler });
  return true;
}
