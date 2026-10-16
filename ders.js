import { db } from './db.js';
import { DERS_ZAMANLARI } from './etut.js';

const tamSayi = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const bugun = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const tarihGecerli = t => /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t));
const gunNo = t => new Date(t + 'T00:00:00Z').getUTCDay();

// Ders merkezi: öğretmen kendi sınıf+ders atamaları için öğrenci, konu ve ödev işlemlerini yapar.
export async function dersApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  if (!yol.startsWith('/api/ders/')) return false;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };

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
        WHERE cs.student_membership_id = ? ORDER BY od.due_date DESC, od.id DESC LIMIT 60`).all(id);
      return { ad, odevler };
    });
    json(res, 200, { bugun: bugun(), ogrenciler: sonuc });
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
             y.id AS yoklamaId,
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
      gunluk: gunluk.map(r => ({
        dersSaati: r.dersSaati, atamaId: r.atamaId, sinifId: r.sinifId, sinif: r.sinif, ders: r.ders,
        aralik: DERS_ZAMANLARI[r.dersSaati - 1]?.join('–') || '', alindi: !!r.yoklamaId, gelmedi: r.gelmedi,
      })),
      atamalar,
    });
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
    json(res, 200, { sinif: a.sinif, ders: a.ders, ogrenciler: ogr });
    return true;
  }

  if (req.method === 'GET' && yol === '/api/ders/konular') {
    const a = atamaGetir(url.searchParams.get('atamaId'));
    if (!a) return hata(404, 'Ders bulunamadı');
    json(res, 200, { konular: db.prepare('SELECT id, date AS tarih, title AS baslik, note AS aciklama FROM konular WHERE assignment_id = ? ORDER BY date DESC, id DESC LIMIT 100').all(a.id) });
    return true;
  }

  if (req.method === 'GET' && yol === '/api/ders/odevler') {
    const a = atamaGetir(url.searchParams.get('atamaId'));
    if (!a) return hata(404, 'Ders bulunamadı');
    json(res, 200, { odevler: db.prepare('SELECT id, title AS baslik, note AS aciklama, due_date AS sonTarih FROM odevler WHERE assignment_id = ? ORDER BY due_date DESC, id DESC LIMIT 100').all(a.id) });
    return true;
  }

  if (req.method === 'POST' && (yol === '/api/ders/konu-ekle' || yol === '/api/ders/odev-ekle')) {
    const b = await govde(req);
    const a = atamaGetir(b.atamaId);
    if (!a) return hata(404, 'Ders bulunamadı');
    const baslik = String(b.baslik || '').trim();
    const aciklama = String(b.aciklama || '').trim().slice(0, 500);
    const tarih = String(b.tarih || '');
    if (baslik.length < 2 || baslik.length > 120) return hata(400, 'Başlık 2-120 karakter olmalı');
    if (!tarihGecerli(tarih)) return hata(400, 'Tarih geçersiz');
    const simdi = Date.now();
    if (yol === '/api/ders/konu-ekle') {
      if (tarih > bugun()) return hata(400, 'Gelecek tarihli konu girilemez');
      const id = Number(db.prepare('INSERT INTO konular (assignment_id, date, title, note, created_at) VALUES (?,?,?,?,?)').run(a.id, tarih, baslik, aciklama || null, simdi).lastInsertRowid);
      denetle(o.user_id, 'konu-ekle', { id, atamaId: a.id });
    } else {
      if (tarih < bugun()) return hata(400, 'Son tarih geçmişte olamaz');
      const id = Number(db.prepare('INSERT INTO odevler (assignment_id, title, note, due_date, created_at) VALUES (?,?,?,?,?)').run(a.id, baslik, aciklama || null, tarih, simdi).lastInsertRowid);
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
