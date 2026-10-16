import { db } from './db.js';
import { DERS_ZAMANLARI } from './etut.js';

const tamSayi = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const bugun = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const tarihGecerli = t => /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t));
const gunNo = t => new Date(t + 'T00:00:00Z').getUTCDay(); // 1=Pazartesi ... 5=Cuma
const DURUMLAR = ['geldi', 'gelmedi', 'gec', 'izinli'];

function islem(fn) {
  db.exec('BEGIN');
  try { const s = fn(); db.exec('COMMIT'); return s; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// Öğretmenin o gün, o sınıfta, o ders saatinde gerçekten dersi var mı?
function dersBul(ogretmenUyelikId, sinifId, tarih, dersSaati) {
  const gun = gunNo(tarih);
  if (gun < 1 || gun > 5) return null;
  return db.prepare(`
    SELECT a.id AS atamaId, a.class_id AS sinifId, c.name AS sinif, co.name AS ders, s.period AS dersSaati
    FROM schedule s JOIN assignments a ON a.id = s.assignment_id
    JOIN classes c ON c.id = a.class_id JOIN courses co ON co.id = a.course_id
    WHERE s.day = ? AND s.class_id = ? AND s.period = ? AND a.teacher_membership_id = ?`)
    .get(gun, sinifId, dersSaati, ogretmenUyelikId) || null;
}

const sinifOgrencileri = sinifId => db.prepare(`
  SELECT m.id AS ogrenciId, u.full_name AS ad
  FROM class_students cs JOIN memberships m ON m.id = cs.student_membership_id JOIN users u ON u.id = m.user_id
  WHERE cs.class_id = ? AND m.status = 'aktif' ORDER BY u.full_name`).all(sinifId);

// Yoklama modülü: öğretmen kendi dersleri için devamsızlık girer.
export async function yoklamaApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  if (!yol.startsWith('/api/yoklama/')) return false;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };

  // Öğrenci kendi, veli bağlı çocuklarının ders devamını görür
  if (req.method === 'GET' && yol === '/api/yoklama/devam') {
    let cocuklar;
    if (o.role === 'ogrenci') {
      cocuklar = db.prepare(`SELECT m.id, u.full_name AS ad FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.id = ?`).all(o.membership_id);
    } else if (o.role === 'veli') {
      cocuklar = db.prepare(`SELECT m.id, u.full_name AS ad FROM guardians g
        JOIN memberships m ON m.id = g.student_membership_id JOIN users u ON u.id = m.user_id
        WHERE g.parent_membership_id = ? ORDER BY u.full_name`).all(o.membership_id);
    } else return hata(403, 'Bu işlem için yetkiniz yok');
    const kayit = db.prepare(`
      SELECT y.date AS tarih, y.period AS dersSaati, co.name AS ders, k.status AS durum
      FROM yoklama_kayit k JOIN yoklama y ON y.id = k.yoklama_id
      JOIN assignments a ON a.id = y.assignment_id JOIN courses co ON co.id = a.course_id
      WHERE k.student_membership_id = ? ORDER BY y.date DESC, y.period DESC`);
    json(res, 200, {
      cocuklar: cocuklar.map(c => {
        const tum = kayit.all(c.id);
        const say = { geldi: 0, gelmedi: 0, gec: 0, izinli: 0 };
        for (const r of tum) say[r.durum]++;
        return { ad: c.ad, say, toplam: tum.length, kayitlar: tum.filter(r => r.durum !== 'geldi').slice(0, 60) };
      }),
    });
    return true;
  }

  if (o.role !== 'ogretmen') return hata(403, 'Bu işlem için yetkiniz yok');

  // Seçilen günde öğretmenin dersleri (ders programından)
  if (req.method === 'GET' && yol === '/api/yoklama/dersler') {
    const tarih = url.searchParams.get('tarih') || bugun();
    if (!tarihGecerli(tarih)) return hata(400, 'Tarih geçersiz');
    if (tarih > bugun()) return hata(400, 'Gelecek tarih için yoklama alınamaz');
    const gun = gunNo(tarih);
    if (gun < 1 || gun > 5) return json(res, 200, { dersler: [], hafta_sonu: true }), true;
    const satirlar = db.prepare(`
      SELECT s.period AS dersSaati, a.class_id AS sinifId, c.name AS sinif, co.name AS ders,
             y.id AS yoklamaId, y.completed_at AS tamamlandi,
             (SELECT COUNT(*) FROM yoklama_kayit k WHERE k.yoklama_id = y.id AND k.status = 'gelmedi') AS gelmedi,
             (SELECT COUNT(*) FROM yoklama_kayit k WHERE k.yoklama_id = y.id) AS toplam
      FROM schedule s JOIN assignments a ON a.id = s.assignment_id
      JOIN classes c ON c.id = a.class_id JOIN courses co ON co.id = a.course_id
      LEFT JOIN yoklama y ON y.class_id = s.class_id AND y.date = ? AND y.period = s.period
      WHERE s.day = ? AND a.teacher_membership_id = ? ORDER BY s.period`).all(tarih, gun, o.membership_id);
    json(res, 200, {
      tarih,
      dersler: satirlar.map(r => ({
        sinifId: r.sinifId, sinif: r.sinif, ders: r.ders, dersSaati: r.dersSaati,
        aralik: DERS_ZAMANLARI[r.dersSaati - 1]?.join('–') || '',
        alindi: !!r.yoklamaId, tamam: !!r.tamamlandi, gelmedi: r.gelmedi, toplam: r.toplam,
      })),
    });
    return true;
  }

  // Bir dersin öğrenci listesi ve varsa mevcut yoklama
  if (req.method === 'GET' && yol === '/api/yoklama/ogrenciler') {
    const tarih = url.searchParams.get('tarih') || '';
    const sinifId = tamSayi(url.searchParams.get('sinifId'), 1, 1e9);
    const dersSaati = tamSayi(url.searchParams.get('dersSaati'), 1, 20);
    if (!tarihGecerli(tarih) || !sinifId || !dersSaati) return hata(400, 'Geçersiz istek');
    if (tarih > bugun()) return hata(400, 'Gelecek tarih için yoklama alınamaz');
    const ders = dersBul(o.membership_id, sinifId, tarih, dersSaati);
    if (!ders) return hata(404, 'Bu tarihte bu ders size ait değil');
    const y = db.prepare('SELECT id, topic, kazanim, completed_at FROM yoklama WHERE class_id = ? AND date = ? AND period = ?').get(sinifId, tarih, dersSaati);
    const mevcut = new Map(y ? db.prepare('SELECT student_membership_id AS id, status FROM yoklama_kayit WHERE yoklama_id = ?')
      .all(y.id).map(r => [r.id, r.status]) : []);
    json(res, 200, {
      ders: ders.ders, sinif: ders.sinif, alindi: !!y, tamam: !!y?.completed_at,
      konu: y?.topic || '', kazanim: y?.kazanim || '',
      ogrenciler: sinifOgrencileri(sinifId).map(s => ({ ...s, durum: mevcut.get(s.ogrenciId) || 'geldi' })),
    });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/yoklama/kaydet') {
    const b = await govde(req);
    const tarih = String(b.tarih || '');
    const sinifId = tamSayi(b.sinifId, 1, 1e9);
    const dersSaati = tamSayi(b.dersSaati, 1, 20);
    if (!tarihGecerli(tarih) || !sinifId || !dersSaati || !Array.isArray(b.kayitlar)) return hata(400, 'Geçersiz istek');
    if (tarih > bugun()) return hata(400, 'Gelecek tarih için yoklama alınamaz');
    const ders = dersBul(o.membership_id, sinifId, tarih, dersSaati);
    if (!ders) return hata(404, 'Bu tarihte bu ders size ait değil');
    const konu = String(b.konu || '').trim();
    const kazanim = String(b.kazanim || '').trim().slice(0, 300);
    if (konu.length < 2 || konu.length > 120) return hata(400, 'İşlenen konu 2-120 karakter olmalı');

    const ogrenciler = sinifOgrencileri(sinifId);
    const durum = new Map();
    for (const k of b.kayitlar) {
      const id = tamSayi(k?.ogrenciId, 1, 1e9);
      if (!id || !DURUMLAR.includes(k.durum)) return hata(400, 'Yoklama bilgisi geçersiz');
      if (!ogrenciler.some(s => s.ogrenciId === id)) return hata(400, 'Öğrenci bu sınıfta değil');
      durum.set(id, k.durum);
    }
    const simdi = Date.now();
    const yid = islem(() => {
      const var_ = db.prepare('SELECT id FROM yoklama WHERE class_id = ? AND date = ? AND period = ?').get(sinifId, tarih, dersSaati);
      let id = var_?.id;
      if (id) {
        db.prepare('UPDATE yoklama SET teacher_membership_id = ?, assignment_id = ?, updated_at = ?, topic = ?, kazanim = ?, completed_at = ? WHERE id = ?')
          .run(o.membership_id, ders.atamaId, simdi, konu, kazanim || null, simdi, id);
        db.prepare('DELETE FROM yoklama_kayit WHERE yoklama_id = ?').run(id);
      } else {
        id = Number(db.prepare(`INSERT INTO yoklama (class_id, date, period, assignment_id, teacher_membership_id, created_at, updated_at, topic, kazanim, completed_at)
                                VALUES (?,?,?,?,?,?,?,?,?,?)`).run(sinifId, tarih, dersSaati, ders.atamaId, o.membership_id, simdi, simdi, konu, kazanim || null, simdi).lastInsertRowid);
      }
      // Konu, Derslerim > Konular listesinde de görünsün
      db.prepare('DELETE FROM konular WHERE yoklama_id = ?').run(id);
      db.prepare('INSERT INTO konular (assignment_id, date, title, note, created_at, yoklama_id) VALUES (?,?,?,?,?,?)')
        .run(ders.atamaId, tarih, konu, kazanim ? 'Kazanım: ' + kazanim : null, simdi, id);
      const ekle = db.prepare('INSERT INTO yoklama_kayit (yoklama_id, student_membership_id, status) VALUES (?,?,?)');
      // Gönderilmeyen öğrenci "geldi" sayılır
      for (const s of ogrenciler) ekle.run(id, s.ogrenciId, durum.get(s.ogrenciId) || 'geldi');
      return id;
    });
    const say = { geldi: 0, gelmedi: 0, gec: 0, izinli: 0 };
    for (const s of ogrenciler) say[durum.get(s.ogrenciId) || 'geldi']++;
    denetle(o.user_id, 'ders-bitir', { yoklamaId: yid, sinifId, tarih, dersSaati, ...say });
    json(res, 200, { tamam: true, ...say });
    return true;
  }

  return hata(404, 'Bulunamadı');
}
