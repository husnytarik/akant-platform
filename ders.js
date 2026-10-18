import { db } from './db.js';
import { DERS_ZAMANLARI } from './etut.js';
import { dersStilleri, stilEkle } from './stil.js';

const tamSayi = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const bugun = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const tarihGecerli = t => /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t));
const gunNo = t => new Date(t + 'T00:00:00Z').getUTCDay();
const simdiSaat = () => new Date().toLocaleTimeString('sv-SE', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
const kaydir = (t, n) => {
  const d = new Date(t + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Dersin durumu: tamam | bekliyor (henüz bitmedi/gelecek) | gecikti (süresi geçti, tamamlanmadı)
function dersDurumu(tarih, dersSaati, tamamlandi, iptal = false) {
  if (iptal) return 'iptal';
  if (tamamlandi) return 'tamam';
  const t = bugun();
  if (tarih > t) return 'bekliyor';
  if (tarih < t) return 'gecikti';
  const bitis = DERS_ZAMANLARI[dersSaati - 1]?.[1];
  return bitis && simdiSaat() > bitis ? 'gecikti' : 'bekliyor';
}

// Ders merkezi: öğretmen kendi sınıf+ders atamaları için öğrenci, konu ve ödev işlemlerini yapar.
export async function dersApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  if (!yol.startsWith('/api/ders/')) return false;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };
  const st = dersStilleri();

  // Öğrenci/veli: ödevleri görür
  if (req.method === 'GET' && yol === '/api/ders/odevlerim') {
    let ogrenciler;
    if (o.role === 'ogrenci') ogrenciler = [o.membership_id];
    else if (o.role === 'veli') ogrenciler = db.prepare('SELECT student_membership_id AS id FROM guardians WHERE parent_membership_id = ?').all(o.membership_id).map(r => r.id);
    else return hata(403, 'Bu işlem için yetkiniz yok');
    const sonuc = ogrenciler.map(id => {
      const ad = db.prepare('SELECT u.full_name AS ad FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.id = ?').get(id).ad;
      const odevler = db.prepare(`
        SELECT od.id, od.title AS baslik, od.note AS aciklama, od.due_date AS sonTarih, co.name AS ders, u.full_name AS ogretmen
        FROM class_students cs JOIN assignments a ON a.class_id = cs.class_id
        JOIN odevler od ON od.assignment_id = a.id JOIN courses co ON co.id = a.course_id
        LEFT JOIN memberships tm ON tm.id = a.teacher_membership_id LEFT JOIN users u ON u.id = tm.user_id
        WHERE cs.student_membership_id = ? AND (od.visible_from IS NULL OR od.visible_from <= ?) ORDER BY od.due_date DESC, od.id DESC LIMIT 60`).all(id, bugun());
      return { ad, odevler };
    });
    json(res, 200, { bugun: bugun(), ogrenciler: sonuc });
    return true;
  }

  // Öğrenci/veli: derslere göre devamsızlık özeti (pasta grafik için)
  if (req.method === 'GET' && yol === '/api/ders/devamsizlik') {
    let cocuklar;
    if (o.role === 'ogrenci') cocuklar = [o.membership_id];
    else if (o.role === 'veli') cocuklar = db.prepare('SELECT student_membership_id AS id FROM guardians WHERE parent_membership_id = ?').all(o.membership_id).map(r => r.id);
    else return hata(403, 'Bu işlem için yetkiniz yok');
    const id = cocuklar.find(c => c === tamSayi(url.searchParams.get('cocuk'), 1, 1e9)) || cocuklar[0];
    if (!id) return json(res, 200, { dersler: [] }), true;
    const dersler = db.prepare(`
      SELECT co.name AS ders,
             (SELECT COUNT(*) FROM schedule s WHERE s.assignment_id = a.id) AS haftalik,
             COUNT(k.yoklama_id) AS islenen,
             COALESCE(SUM(k.status = 'gelmedi'), 0) AS gelmedi
      FROM class_students cs JOIN assignments a ON a.class_id = cs.class_id JOIN courses co ON co.id = a.course_id
      LEFT JOIN yoklama y ON y.assignment_id = a.id AND y.cancelled = 0 AND y.completed_at IS NOT NULL
      LEFT JOIN yoklama_kayit k ON k.yoklama_id = y.id AND k.student_membership_id = cs.student_membership_id
      WHERE cs.student_membership_id = ? GROUP BY a.id ORDER BY co.name`).all(id);
    json(res, 200, { dersler: dersler.map(d => stilEkle({ ...d, haftalik: Number(d.haftalik), islenen: Number(d.islenen), gelmedi: Number(d.gelmedi) }, st)) });
    return true;
  }

  // Öğrenci/veli: sınıfın haftalık ders programı (7 gün), işlenen konu ve devam durumuyla
  if (req.method === 'GET' && yol === '/api/ders/program') {
    let cocuklar;
    if (o.role === 'ogrenci') cocuklar = db.prepare('SELECT m.id, u.full_name AS ad FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.id = ?').all(o.membership_id);
    else if (o.role === 'veli') cocuklar = db.prepare(`SELECT m.id, u.full_name AS ad FROM guardians g JOIN memberships m ON m.id = g.student_membership_id
      JOIN users u ON u.id = m.user_id WHERE g.parent_membership_id = ? ORDER BY u.full_name`).all(o.membership_id);
    else return hata(403, 'Bu işlem için yetkiniz yok');
    const tarih = url.searchParams.get('tarih') || bugun();
    if (!tarihGecerli(tarih)) return hata(400, 'Tarih geçersiz');
    const istenen = tamSayi(url.searchParams.get('cocuk'), 1, 1e9);
    const cocuk = cocuklar.find(c => c.id === istenen) || cocuklar[0];
    const pazartesi = kaydir(tarih, -((gunNo(tarih) + 6) % 7));
    if (!cocuk) return json(res, 200, { bugun: bugun(), pazartesi, cocuklar: [], gunler: [], zamanlar: DERS_ZAMANLARI.map(z => z.join('–')) }), true;
    const sinif = db.prepare('SELECT c.id, c.name FROM class_students cs JOIN classes c ON c.id = cs.class_id WHERE cs.student_membership_id = ?').get(cocuk.id);
    const satir = db.prepare(`
      SELECT s.period AS dersSaati, a.id AS atamaId, co.name AS ders, u.full_name AS ogretmen,
             y.completed_at AS tamamlandi, y.cancelled AS iptal, COALESCE(y.topic, (SELECT title FROM konular WHERE yoklama_id = y.id LIMIT 1)) AS konu,
             (SELECT k.status FROM yoklama_kayit k WHERE k.yoklama_id = y.id AND k.student_membership_id = ?) AS devam
      FROM schedule s JOIN assignments a ON a.id = s.assignment_id JOIN courses co ON co.id = a.course_id
      LEFT JOIN memberships tm ON tm.id = a.teacher_membership_id LEFT JOIN users u ON u.id = tm.user_id
      LEFT JOIN yoklama y ON y.class_id = s.class_id AND y.date = ? AND y.period = s.period
      WHERE s.class_id = ? AND s.day = ? ORDER BY s.period`);
    const odev = db.prepare('SELECT title AS baslik, due_date AS sonTarih FROM odevler WHERE assignment_id = ? AND due_date >= ? AND (visible_from IS NULL OR visible_from <= date(\'now\', \'localtime\')) ORDER BY due_date LIMIT 3');
    const etutOgr = db.prepare(`
      SELECT e.id, e.topic AS konu, e.start_time AS saat, e.duration_min AS sure, e.place AS yer, co.name AS ders,
             u.full_name AS ogretmen, k.parent_response AS yanit, k.attendance AS devam
      FROM etut_katilimcilar k JOIN etutler e ON e.id = k.etut_id LEFT JOIN courses co ON co.id = e.course_id
      LEFT JOIN memberships tm ON tm.id = e.teacher_membership_id LEFT JOIN users u ON u.id = tm.user_id
      WHERE k.student_membership_id = ? AND e.date = ? AND e.status = 'planli' ORDER BY e.start_time`);
    const gunler = [];
    for (let i = 1; i <= 7; i++) {
      const g = i % 7;
      const t = kaydir(pazartesi, i - 1);
      gunler.push({
        tarih: t, gun: g,
        dersler: sinif ? satir.all(cocuk.id, t, sinif.id, g).map(r => stilEkle({
          dersSaati: r.dersSaati, ders: r.ders, ogretmen: r.ogretmen, aralik: DERS_ZAMANLARI[r.dersSaati - 1]?.join('–') || '',
          iptal: !!r.iptal, islendi: !!r.tamamlandi && !r.iptal, konu: r.tamamlandi && !r.iptal ? r.konu : null, devam: r.tamamlandi && !r.iptal ? r.devam : null,
          odevler: odev.all(r.atamaId, t < bugun() ? bugun() : t),
        }, st)) : [],
        etutler: etutOgr.all(cocuk.id, t).map(e => stilEkle(e, st)),
      });
    }
    json(res, 200, { bugun: bugun(), pazartesi, cocuklar, cocuk: cocuk.id, sinif: sinif?.name || '', gunler, zamanlar: DERS_ZAMANLARI.map(z => z.join('–')) });
    return true;
  }

  if (o.role !== 'ogretmen') return hata(403, 'Bu işlem için yetkiniz yok');

  const atamaGetir = id => {
    const n = tamSayi(id, 1, 1e9);
    return n ? db.prepare(`SELECT a.id, a.class_id AS sinifId, c.name AS sinif, co.name AS ders
      FROM assignments a JOIN classes c ON c.id = a.class_id JOIN courses co ON co.id = a.course_id
      WHERE a.id = ? AND a.teacher_membership_id = ?`).get(n, o.membership_id) : null;
  };

  // Seçilen günün programı ve tüm derslerim
  if (req.method === 'GET' && yol === '/api/ders/liste') {
    const tarih = url.searchParams.get('tarih') || bugun();
    if (!tarihGecerli(tarih)) return hata(400, 'Tarih geçersiz');
    const gun = gunNo(tarih);
    const gunluk = gun >= 1 && gun <= 5 ? db.prepare(`
      SELECT s.period AS dersSaati, a.id AS atamaId, a.class_id AS sinifId, c.name AS sinif, co.name AS ders,
             y.id AS yoklamaId, y.completed_at AS tamamlandi, y.cancelled AS iptal,
             (SELECT COUNT(*) FROM yoklama_kayit k WHERE k.yoklama_id = y.id AND k.status = 'gelmedi') AS gelmedi
      FROM schedule s JOIN assignments a ON a.id = s.assignment_id
      JOIN classes c ON c.id = a.class_id JOIN courses co ON co.id = a.course_id
      LEFT JOIN yoklama y ON y.class_id = s.class_id AND y.date = ? AND y.period = s.period
      WHERE s.day = ? AND a.teacher_membership_id = ? ORDER BY s.period`).all(tarih, gun, o.membership_id) : [];
    const atamalar = db.prepare(`
      SELECT a.id AS atamaId, a.class_id AS sinifId, c.name AS sinif, co.name AS ders,
             (SELECT COUNT(*) FROM class_students cs JOIN memberships m ON m.id = cs.student_membership_id
              WHERE cs.class_id = a.class_id AND m.status = 'aktif') AS ogrenciSayisi
      FROM assignments a JOIN classes c ON c.id = a.class_id JOIN courses co ON co.id = a.course_id
      WHERE a.teacher_membership_id = ? ORDER BY c.level, c.name, co.name`).all(o.membership_id);
    json(res, 200, {
      tarih, bugun: bugun(), hafta_sonu: gun < 1 || gun > 5,
      gunluk: gunluk.map(r => stilEkle({
        dersSaati: r.dersSaati, atamaId: r.atamaId, sinifId: r.sinifId, sinif: r.sinif, ders: r.ders,
        aralik: DERS_ZAMANLARI[r.dersSaati - 1]?.join('–') || '', alindi: !!r.yoklamaId, gelmedi: r.gelmedi,
        durum: dersDurumu(tarih, r.dersSaati, !!r.tamamlandi, !!r.iptal),
      }, st)),
      atamalar: atamalar.map(a => stilEkle(a, st)),
      etutler: db.prepare(`
        SELECT e.id, e.topic AS konu, e.start_time AS saat, e.duration_min AS sure, e.place AS yer, co.name AS ders,
               (SELECT COUNT(*) FROM etut_katilimcilar k WHERE k.etut_id = e.id) AS kisi
        FROM etutler e LEFT JOIN courses co ON co.id = e.course_id
        WHERE e.date = ? AND e.teacher_membership_id = ? AND e.status = 'planli' ORDER BY e.start_time`)
        .all(tarih, o.membership_id).map(e => stilEkle(e, st)),
    });
    return true;
  }

  // Haftalık program: seçilen tarihin haftası (Pzt-Cum), her hücrede dersin tamamlanma durumu
  if (req.method === 'GET' && yol === '/api/ders/hafta') {
    const tarih = url.searchParams.get('tarih') || bugun();
    if (!tarihGecerli(tarih)) return hata(400, 'Tarih geçersiz');
    const pazartesi = kaydir(tarih, -((gunNo(tarih) + 6) % 7));
    const satir = db.prepare(`
      SELECT s.period AS dersSaati, a.id AS atamaId, a.class_id AS sinifId, c.name AS sinif, co.name AS ders,
             y.completed_at AS tamamlandi, y.cancelled AS iptal,
             (SELECT COUNT(*) FROM yoklama_kayit k WHERE k.yoklama_id = y.id AND k.status = 'gelmedi') AS gelmedi
      FROM schedule s JOIN assignments a ON a.id = s.assignment_id
      JOIN classes c ON c.id = a.class_id JOIN courses co ON co.id = a.course_id
      LEFT JOIN yoklama y ON y.class_id = s.class_id AND y.date = ? AND y.period = s.period
      WHERE s.day = ? AND a.teacher_membership_id = ? ORDER BY s.period`);
    const etutSatir = db.prepare(`
      SELECT e.id, e.topic AS konu, e.start_time AS saat, e.duration_min AS sure, e.place AS yer, co.name AS ders,
             (SELECT COUNT(*) FROM etut_katilimcilar k WHERE k.etut_id = e.id) AS kisi
      FROM etutler e LEFT JOIN courses co ON co.id = e.course_id
      WHERE e.date = ? AND e.teacher_membership_id = ? AND e.status = 'planli' ORDER BY e.start_time`);
    const gunler = [];
    for (let i = 1; i <= 7; i++) {
      const g = i % 7; // 1=Pzt .. 6=Cmt, 0=Paz
      const t = kaydir(pazartesi, i - 1);
      gunler.push({
        tarih: t, gun: g,
        etutler: etutSatir.all(t, o.membership_id).map(e => stilEkle(e, st)),
        dersler: satir.all(t, g, o.membership_id).map(r => stilEkle({
          dersSaati: r.dersSaati, atamaId: r.atamaId, sinifId: r.sinifId, sinif: r.sinif, ders: r.ders,
          aralik: DERS_ZAMANLARI[r.dersSaati - 1]?.join('–') || '', gelmedi: r.gelmedi,
          durum: dersDurumu(t, r.dersSaati, !!r.tamamlandi, !!r.iptal),
        }, st)),
      });
    }
    json(res, 200, { bugun: bugun(), pazartesi, gunler, zamanlar: DERS_ZAMANLARI.map(z => z.join('–')) });
    return true;
  }

  // Süresi geçip tamamlanmamış dersler (son 14 gün) — ileride hatırlatma bildirimi bu listeden üretilecek
  if (req.method === 'GET' && yol === '/api/ders/gecikenler') {
    const satir = db.prepare(`
      SELECT a.id AS atamaId, a.class_id AS sinifId, c.name AS sinif, co.name AS ders, s.period AS dersSaati,
             y.completed_at AS tamamlandi
      FROM schedule s JOIN assignments a ON a.id = s.assignment_id
      JOIN classes c ON c.id = a.class_id JOIN courses co ON co.id = a.course_id
      LEFT JOIN yoklama y ON y.class_id = s.class_id AND y.date = ? AND y.period = s.period
      WHERE s.day = ? AND a.teacher_membership_id = ? ORDER BY s.period`);
    const liste = [];
    for (let n = 0; n <= 14; n++) {
      const t = kaydir(bugun(), -n);
      const gun = gunNo(t);
      if (gun < 1 || gun > 5) continue;
      for (const r of satir.all(t, gun, o.membership_id)) {
        if (dersDurumu(t, r.dersSaati, !!r.tamamlandi) !== 'gecikti') continue;
        liste.push({ tarih: t, dersSaati: r.dersSaati, atamaId: r.atamaId, sinifId: r.sinifId, sinif: r.sinif, ders: r.ders,
          aralik: DERS_ZAMANLARI[r.dersSaati - 1]?.join('–') || '' });
      }
    }
    json(res, 200, { sayi: liste.length, dersler: liste });
    return true;
  }

  if (req.method === 'GET' && yol === '/api/ders/ogrenciler') {
    const a = atamaGetir(url.searchParams.get('atamaId'));
    if (!a) return hata(404, 'Ders bulunamadı');
    const ogr = db.prepare(`
      SELECT m.id AS ogrenciId, u.full_name AS ad,
        (SELECT COUNT(*) FROM yoklama_kayit k JOIN yoklama y ON y.id = k.yoklama_id
          WHERE k.student_membership_id = m.id AND y.assignment_id = ? AND k.status = 'gelmedi') AS devamsiz
      FROM class_students cs JOIN memberships m ON m.id = cs.student_membership_id JOIN users u ON u.id = m.user_id
      WHERE cs.class_id = ? AND m.status = 'aktif' ORDER BY u.full_name`).all(a.id, a.sinifId);
    // Seçili ders saatinin yoklaması (varsa): öğrenci başına geldi/gelmedi/gec/izinli
    const saat = tamSayi(url.searchParams.get('dersSaati'), 1, 20);
    const tarih = url.searchParams.get('tarih') || '';
    let alindi = false;
    if (saat && /^\d{4}-\d{2}-\d{2}$/.test(tarih)) {
      const y = db.prepare('SELECT id FROM yoklama WHERE class_id = ? AND date = ? AND period = ?').get(a.sinifId, tarih, saat);
      if (y) {
        alindi = true;
        const durum = new Map(db.prepare('SELECT student_membership_id AS id, status FROM yoklama_kayit WHERE yoklama_id = ?').all(y.id).map(r => [r.id, r.status]));
        for (const o2 of ogr) o2.durum = durum.get(o2.ogrenciId) || null;
      }
    }
    json(res, 200, { sinif: a.sinif, ders: a.ders, yoklamaAlindi: alindi, ogrenciler: ogr });
    return true;
  }

  if (req.method === 'GET' && yol === '/api/ders/konular') {
    const a = atamaGetir(url.searchParams.get('atamaId'));
    if (!a) return hata(404, 'Ders bulunamadı');
    json(res, 200, { konular: db.prepare('SELECT id, date AS tarih, title AS baslik, note AS aciklama, kazanim FROM konular WHERE assignment_id = ? ORDER BY date DESC, id DESC LIMIT 100').all(a.id) });
    return true;
  }

  if (req.method === 'GET' && yol === '/api/ders/odevler') {
    const a = atamaGetir(url.searchParams.get('atamaId'));
    if (!a) return hata(404, 'Ders bulunamadı');
    json(res, 200, { odevler: db.prepare('SELECT id, title AS baslik, note AS aciklama, due_date AS sonTarih, visible_from AS gorunur FROM odevler WHERE assignment_id = ? ORDER BY due_date DESC, id DESC LIMIT 100').all(a.id) });
    return true;
  }

  if (req.method === 'POST' && (yol === '/api/ders/konu-ekle' || yol === '/api/ders/odev-ekle')) {
    const b = await govde(req);
    const a = atamaGetir(b.atamaId);
    if (!a) return hata(404, 'Ders bulunamadı');
    const baslik = String(b.baslik || '').trim();
    const aciklama = String(b.aciklama || '').trim().slice(0, 500);
    const tarih = String(b.tarih || '');
    const kazanim = String(b.kazanim || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (baslik.length < 2 || baslik.length > 120) return hata(400, 'Başlık 2-120 karakter olmalı');
    if (!tarihGecerli(tarih)) return hata(400, 'Tarih geçersiz');
    const simdi = Date.now();
    if (yol === '/api/ders/konu-ekle') {
      if (tarih > bugun()) return hata(400, 'Gelecek tarihli konu girilemez');
      const id = Number(db.prepare('INSERT INTO konular (assignment_id, date, title, note, kazanim, created_at) VALUES (?,?,?,?,?,?)').run(a.id, tarih, baslik, aciklama || null, kazanim || null, simdi).lastInsertRowid);
      denetle(o.user_id, 'konu-ekle', { id, atamaId: a.id });
    } else {
      if (tarih < bugun()) return hata(400, 'Son tarih geçmişte olamaz');
      const gorunur = String(b.gorunur || '') || bugun();
      if (!tarihGecerli(gorunur) || gorunur < bugun()) return hata(400, 'Yayın tarihi geçersiz (bugün veya sonrası olmalı)');
      if (gorunur > tarih) return hata(400, 'Yayın tarihi son teslim tarihinden sonra olamaz');
      const id = Number(db.prepare('INSERT INTO odevler (assignment_id, title, note, due_date, created_at, visible_from) VALUES (?,?,?,?,?,?)').run(a.id, baslik, aciklama || null, tarih, simdi, gorunur > bugun() ? gorunur : null).lastInsertRowid);
      denetle(o.user_id, 'odev-ekle', { id, atamaId: a.id });
    }
    json(res, 200, { tamam: true });
    return true;
  }

  if (req.method === 'POST' && (yol === '/api/ders/konu-sil' || yol === '/api/ders/odev-sil')) {
    const b = await govde(req);
    const id = tamSayi(b.id, 1, 1e9);
    const tablo = yol === '/api/ders/konu-sil' ? 'konular' : 'odevler';
    const r = id && db.prepare(`DELETE FROM ${tablo} WHERE id = ? AND assignment_id IN (SELECT id FROM assignments WHERE teacher_membership_id = ?)`).run(id, o.membership_id);
    if (!r || !r.changes) return hata(404, 'Kayıt bulunamadı');
    denetle(o.user_id, tablo + '-sil', { id });
    json(res, 200, { tamam: true });
    return true;
  }

  return hata(404, 'Bulunamadı');
}
