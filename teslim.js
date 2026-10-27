import { db } from './db.js';

// Teslim yetkileri: veli, çocuğunu okuldan teslim alabilecek kişileri kendisi belirler
db.exec(`
CREATE TABLE IF NOT EXISTS teslim_yetkilileri (
  id                    INTEGER PRIMARY KEY,
  student_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  ad                    TEXT NOT NULL,
  yakinlik              TEXT NOT NULL,
  telefon               TEXT NOT NULL,
  ekleyen_user_id       INTEGER REFERENCES users(id),
  created_at            INTEGER NOT NULL
);`);

const metinDuz = (v, en) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, en);

export async function teslimApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  if (!yol.startsWith('/api/teslim/')) return false;
  if (o.role !== 'veli') return json(res, 403, { hata: 'Bu işlem için yetkiniz yok' }), true;

  const cocukMu = id => db.prepare('SELECT 1 FROM guardians WHERE parent_membership_id = ? AND student_membership_id = ?').get(o.membership_id, id);

  if (req.method === 'GET' && yol === '/api/teslim/liste') {
    const cocuklar = db.prepare(`SELECT m.id, u.full_name AS ad, c.name AS sinif FROM guardians g
      JOIN memberships m ON m.id = g.student_membership_id JOIN users u ON u.id = m.user_id
      LEFT JOIN class_students cs ON cs.student_membership_id = m.id LEFT JOIN classes c ON c.id = cs.class_id
      WHERE g.parent_membership_id = ? ORDER BY u.full_name`).all(o.membership_id);
    const kisiler = db.prepare('SELECT id, ad, yakinlik, telefon FROM teslim_yetkilileri WHERE student_membership_id = ? ORDER BY id');
    json(res, 200, { ogrenciler: cocuklar.map(c => ({ ...c, kisiler: kisiler.all(c.id) })) });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/teslim/ekle') {
    const b = await govde(req);
    const id = Number(b.ogrenciId);
    const ad = metinDuz(b.ad, 80), yakinlik = metinDuz(b.yakinlik, 40), telefon = metinDuz(b.telefon, 20);
    if (!cocukMu(id)) return json(res, 403, { hata: 'Bu öğrenci için işlem yapamazsınız' }), true;
    if (!ad || !yakinlik) return json(res, 400, { hata: 'Ad soyad ve yakınlık gerekli' }), true;
    if (!/^[0-9 +()-]{7,20}$/.test(telefon)) return json(res, 400, { hata: 'Geçerli bir telefon girin' }), true;
    if (db.prepare('SELECT COUNT(*) AS n FROM teslim_yetkilileri WHERE student_membership_id = ?').get(id).n >= 10) return json(res, 400, { hata: 'En fazla 10 kişi eklenebilir' }), true;
    const r = db.prepare('INSERT INTO teslim_yetkilileri (student_membership_id, ad, yakinlik, telefon, ekleyen_user_id, created_at) VALUES (?,?,?,?,?,?)')
      .run(id, ad, yakinlik, telefon, o.user_id, Date.now());
    denetle(o.user_id, 'teslim-ekle', `ogrenci=${id} kisi=${ad}`);
    json(res, 200, { tamam: true, id: Number(r.lastInsertRowid) });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/teslim/sil') {
    const b = await govde(req);
    const k = db.prepare('SELECT id, student_membership_id AS ogr, ad FROM teslim_yetkilileri WHERE id = ?').get(Number(b.id));
    if (!k || !cocukMu(k.ogr)) return json(res, 404, { hata: 'Kayıt bulunamadı' }), true;
    db.prepare('DELETE FROM teslim_yetkilileri WHERE id = ?').run(k.id);
    denetle(o.user_id, 'teslim-sil', `ogrenci=${k.ogr} kisi=${k.ad}`);
    json(res, 200, { tamam: true });
    return true;
  }

  return json(res, 404, { hata: 'Bulunamadı' }), true;
}
