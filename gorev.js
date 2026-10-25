import { db } from './db.js';
import { DERS_ZAMANLARI, GUN_ADLARI, gunAcik } from './okul-ayar.js';

// Öğretmenin çalışma saatleri (müsait olmadığı saatler, haftalık ders yükü) ve nöbet / görevlendirmeler.
// Görev haftalık tekrar eder (gün + saatler) ya da belirli bir tarihe özeldir.
db.exec(`
CREATE TABLE IF NOT EXISTS ogretmen_kapali (
  user_id INTEGER NOT NULL REFERENCES users(id),
  day     INTEGER NOT NULL,
  period  INTEGER NOT NULL,
  PRIMARY KEY (user_id, day, period)
);
CREATE TABLE IF NOT EXISTS ogretmen_ayar (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id),
  haftalik_azami INTEGER
);
CREATE TABLE IF NOT EXISTS gorevler (
  id      INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  tur     TEXT NOT NULL CHECK (tur IN ('nobet','gorev')),
  ad      TEXT NOT NULL,
  yer     TEXT NOT NULL DEFAULT '',
  tekrar  TEXT NOT NULL CHECK (tekrar IN ('haftalik','tek')),
  day     INTEGER,
  tarih   TEXT,
  saatler TEXT NOT NULL
)`);

const tamSayi = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const TARIH = /^\d{4}-\d{2}-\d{2}$/;
const gunNo = tarih => new Date(tarih + 'T00:00:00Z').getUTCDay();
const saatListesi = g => { try { return JSON.parse(g.saatler); } catch { return []; } };

// Öğretmen bu gün/saatte derse konamaz mı? Neden varsa metin, yoksa null
export function ogretmenMesgulNedeni(userId, gun, saat) {
  if (db.prepare('SELECT 1 FROM ogretmen_kapali WHERE user_id = ? AND day = ? AND period = ?').get(userId, gun, saat)) {
    return 'Öğretmen bu saatte müsait değil';
  }
  const g = db.prepare("SELECT * FROM gorevler WHERE user_id = ? AND tekrar = 'haftalik' AND day = ?").all(userId, gun)
    .find(x => saatListesi(x).includes(saat));
  return g ? `Öğretmenin bu saatte ${g.tur === 'nobet' ? 'nöbeti' : 'görevi'} var (${g.ad})` : null;
}

// Haftalık düzende bu öğretmenin derse atanmış gün/saatleri
const dersSaatleri = userId => db.prepare(`
  SELECT s.day, s.period, c.name AS sinif FROM schedule s
  JOIN assignments a ON a.id = s.assignment_id
  JOIN memberships m ON m.id = a.teacher_membership_id
  JOIN classes c ON c.id = s.class_id
  WHERE m.user_id = ?`).all(userId);

const gorevSatiri = g => ({
  id: g.id, userId: g.user_id, tur: g.tur, ad: g.ad, yer: g.yer, tekrar: g.tekrar,
  gun: g.day, tarih: g.tarih, saatler: saatListesi(g),
});

export async function gorevApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };
  const ogretmenMi = id => !!id && !!db.prepare("SELECT 1 FROM memberships WHERE user_id = ? AND role = 'ogretmen' AND status = 'aktif'").get(id);

  if (req.method === 'GET' && yol === '/api/yonetim/ogretmen-durum') {
    const userId = tamSayi(url.searchParams.get('userId'), 1, 1e9);
    if (!userId) return hata(400, 'Öğretmen seçiniz');
    json(res, 200, {
      kapali: db.prepare('SELECT day AS gun, period AS saat FROM ogretmen_kapali WHERE user_id = ?').all(userId),
      azami: db.prepare('SELECT haftalik_azami AS azami FROM ogretmen_ayar WHERE user_id = ?').get(userId)?.azami ?? null,
      gorevler: db.prepare('SELECT * FROM gorevler WHERE user_id = ? ORDER BY tekrar, day, tarih').all(userId).map(gorevSatiri),
    });
    return true;
  }

  if (req.method === 'GET' && yol === '/api/yonetim/gorevler') {
    json(res, 200, {
      gorevler: db.prepare(`SELECT g.*, u.full_name AS ogretmen FROM gorevler g JOIN users u ON u.id = g.user_id
                            ORDER BY g.tur, g.tekrar, g.day, g.tarih, u.full_name`).all()
        .map(g => ({ ...gorevSatiri(g), ogretmen: g.ogretmen })),
    });
    return true;
  }

  if (req.method !== 'POST' || !['/api/yonetim/ogretmen-musait', '/api/yonetim/gorev-kaydet', '/api/yonetim/gorev-sil'].includes(yol)) return false;
  const b = await govde(req);

  // Müsait olunmayan saatler + haftalık ders yükü (tümü birden kaydedilir)
  if (yol === '/api/yonetim/ogretmen-musait') {
    const userId = tamSayi(b.userId, 1, 1e9);
    if (!ogretmenMi(userId)) return hata(404, 'Öğretmen bulunamadı');
    const kapali = [];
    for (const k of Array.isArray(b.kapali) ? b.kapali : []) {
      const gun = Number(k?.gun), saat = tamSayi(k?.saat, 1, DERS_ZAMANLARI.length);
      if (!Number.isInteger(gun) || !gunAcik(gun) || !saat) return hata(400, 'Geçersiz gün veya ders saati');
      if (!kapali.some(x => x.gun === gun && x.saat === saat)) kapali.push({ gun, saat });
    }
    const azami = b.azami === null || b.azami === '' || b.azami === undefined ? null : tamSayi(b.azami, 1, 80);
    if (b.azami !== null && b.azami !== '' && b.azami !== undefined && azami === null) return hata(400, 'Haftalık ders yükü 1-80 olmalı');
    const dolu = dersSaatleri(userId).find(d => kapali.some(k => k.gun === d.day && k.saat === d.period));
    if (dolu) return hata(409, `${GUN_ADLARI[dolu.day]} ${dolu.period}. saatte ${dolu.sinif} dersi var; önce programdan çıkarın`);
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM ogretmen_kapali WHERE user_id = ?').run(userId);
      const ekle = db.prepare('INSERT INTO ogretmen_kapali (user_id, day, period) VALUES (?,?,?)');
      for (const k of kapali) ekle.run(userId, k.gun, k.saat);
      db.prepare(`INSERT INTO ogretmen_ayar (user_id, haftalik_azami) VALUES (?, ?)
                  ON CONFLICT (user_id) DO UPDATE SET haftalik_azami = excluded.haftalik_azami`).run(userId, azami);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    denetle(o.user_id, 'ogretmen-musait', { userId, kapali: kapali.length, azami });
    json(res, 200, { tamam: true });
    return true;
  }

  if (yol === '/api/yonetim/gorev-sil') {
    const id = tamSayi(b.id, 1, 1e9);
    if (!id || !db.prepare('SELECT 1 FROM gorevler WHERE id = ?').get(id)) return hata(404, 'Görev bulunamadı');
    db.prepare('DELETE FROM gorevler WHERE id = ?').run(id);
    denetle(o.user_id, 'gorev-sil', { id });
    json(res, 200, { tamam: true });
    return true;
  }

  // Nöbet / görevlendirme ekle ya da düzenle
  const userId = tamSayi(b.userId, 1, 1e9);
  if (!ogretmenMi(userId)) return hata(404, 'Öğretmen bulunamadı');
  if (!['nobet', 'gorev'].includes(b.tur)) return hata(400, 'Tür seçiniz');
  const ad = String(b.ad || '').trim();
  const yer = String(b.yer || '').trim();
  if (ad.length < 2 || ad.length > 60) return hata(400, 'Görev adı 2-60 karakter olmalı');
  if (yer.length > 60) return hata(400, 'Yer en çok 60 karakter olabilir');
  const saatler = [...new Set((Array.isArray(b.saatler) ? b.saatler : []).map(Number))].sort((x, y) => x - y);
  if (!saatler.length || saatler.some(s => !Number.isInteger(s) || s < 1 || s > DERS_ZAMANLARI.length)) return hata(400, 'En az bir ders saati seçiniz');
  let gun, tarih = null;
  if (b.tekrar === 'haftalik') {
    gun = Number(b.gun);
    if (!Number.isInteger(gun) || !gunAcik(gun)) return hata(400, 'Okul günlerinden birini seçiniz');
  } else if (b.tekrar === 'tek') {
    tarih = String(b.tarih || '');
    if (!TARIH.test(tarih) || Number.isNaN(Date.parse(tarih))) return hata(400, 'Geçerli bir tarih giriniz');
    gun = gunNo(tarih);
    if (!gunAcik(gun)) return hata(400, 'Seçilen tarih okul günü değil');
  } else return hata(400, 'Tekrar türünü seçiniz');

  const id = b.id ? tamSayi(b.id, 1, 1e9) : null;
  if (b.id && (!id || !db.prepare('SELECT 1 FROM gorevler WHERE id = ?').get(id))) return hata(404, 'Görev bulunamadı');

  // Çakışma: ders programı, müsait olmadığı saat ve aynı gün/saatteki başka görev
  for (const s of saatler) {
    if (db.prepare('SELECT 1 FROM ogretmen_kapali WHERE user_id = ? AND day = ? AND period = ?').get(userId, gun, s)) {
      return hata(409, `${GUN_ADLARI[gun]} ${s}. saatte öğretmen müsait değil`);
    }
    const ders = dersSaatleri(userId).find(d => d.day === gun && d.period === s);
    if (ders) return hata(409, `${GUN_ADLARI[gun]} ${s}. saatte ${ders.sinif} dersi var`);
  }
  const digerleri = db.prepare('SELECT * FROM gorevler WHERE user_id = ? AND day = ? AND id IS NOT ?').all(userId, gun, id)
    .filter(g => g.tekrar === 'haftalik' || b.tekrar === 'haftalik' || g.tarih === tarih);
  const cakisan = digerleri.find(g => saatListesi(g).some(s => saatler.includes(s)));
  if (cakisan) return hata(409, `Aynı saatte başka bir görev var (${cakisan.ad})`);

  const alanlar = [userId, b.tur, ad, yer, b.tekrar, gun, tarih, JSON.stringify(saatler)];
  let yeni = id;
  if (id) {
    db.prepare('UPDATE gorevler SET user_id=?, tur=?, ad=?, yer=?, tekrar=?, day=?, tarih=?, saatler=? WHERE id=?').run(...alanlar, id);
  } else {
    yeni = Number(db.prepare('INSERT INTO gorevler (user_id, tur, ad, yer, tekrar, day, tarih, saatler) VALUES (?,?,?,?,?,?,?,?)').run(...alanlar).lastInsertRowid);
  }
  denetle(o.user_id, id ? 'gorev-duzenle' : 'gorev-ekle', { id: yeni, userId, tur: b.tur, ad, tekrar: b.tekrar });
  json(res, id ? 200 : 201, { tamam: true, id: yeni });
  return true;
}
