import { db } from './db.js';

// Gelişim raporu: yönetim başlıkları ve dönemleri (tarih aralığı) belirler; öğretmenler dönem açıkken kendi öğrencileri için
// başlık başlık yazar; yönetim bir öğrencinin tüm öğretmen yorumlarını, veli toplantısı ve görüşme notlarını tek raporda görür.
const metin = (v, enCok) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, enCok);
const uzunMetin = (v, enCok) => String(v ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, enCok);
const bugun = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const tarihGecerli = t => /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t));
const sube = o => db.prepare('SELECT branch_id FROM memberships WHERE id = ?').get(o.membership_id)?.branch_id;
const sayi = r => Object.fromEntries(Object.entries(r).map(([a, b]) => [a, typeof b === 'bigint' ? Number(b) : b]));

// Dönem: giriş tarihleri arasında "acik"; öncesinde "yaklasan", sonrasında "kapandi" (kapanan dönem yalnızca okunur)
const donemDurumu = d => { const t = bugun(); return t < d.baslangic ? 'yaklasan' : t > d.bitis ? 'kapandi' : 'acik'; };
const donemOzeti = d => ({ id: d.id, ad: d.ad, baslangic: d.baslangic, bitis: d.bitis, toplantiTarihi: d.toplanti_tarihi || '', durum: donemDurumu(d) });
const donemleri = subeId => db.prepare('SELECT * FROM gelisim_donemleri WHERE branch_id = ? ORDER BY baslangic, id').all(subeId);
const aktifBasliklar = subeId => db.prepare('SELECT id, ad, aciklama FROM gelisim_basliklari WHERE branch_id = ? AND aktif = 1 ORDER BY sira, id').all(subeId);

// Öğretmenin öğrencileri: sınıf öğretmeni olduğu ya da bir dersini okuttuğu sınıfların öğrencileri
const SINIF_FILTRE = `(c.homeroom_membership_id = ? OR EXISTS (SELECT 1 FROM assignments a WHERE a.class_id = c.id AND a.teacher_membership_id = ?))`;
const ogretmenSiniflari = (uyelikId, subeId) => db.prepare(`SELECT c.id, c.name AS ad FROM classes c WHERE c.branch_id = ? AND ${SINIF_FILTRE} ORDER BY c.name`).all(subeId, uyelikId, uyelikId);
const ogrencileri = sinifId => db.prepare(`SELECT m.id, u.full_name AS ad, m.okul_no AS okulNo FROM class_students cs
  JOIN memberships m ON m.id = cs.student_membership_id JOIN users u ON u.id = m.user_id
  WHERE cs.class_id = ? AND m.status = 'aktif' ORDER BY u.full_name`).all(sinifId);
const ogretmenOgrencisi = (uyelikId, ogrenciId) => !!db.prepare(`SELECT 1 FROM class_students cs JOIN classes c ON c.id = cs.class_id
  JOIN memberships m ON m.id = cs.student_membership_id WHERE cs.student_membership_id = ? AND m.status = 'aktif' AND ${SINIF_FILTRE}`).get(ogrenciId, uyelikId, uyelikId);
const ogrenciKarti = (id, subeId) => db.prepare(`SELECT m.id, u.full_name AS ad, m.okul_no AS okulNo, c.name AS sinif, c.id AS sinifId
  FROM memberships m JOIN users u ON u.id = m.user_id JOIN class_students cs ON cs.student_membership_id = m.id JOIN classes c ON c.id = cs.class_id
  WHERE m.id = ? AND m.role = 'ogrenci' AND m.status = 'aktif' AND c.branch_id = ?`).get(id, subeId);

// Öğretmenin o sınıftaki dersleri ("Fen Bilimleri · Sınıf öğretmeni")
function dersEtiketi(ogretmenId, sinifId) {
  const dersler = db.prepare(`SELECT co.name FROM assignments a JOIN courses co ON co.id = a.course_id
    WHERE a.class_id = ? AND a.teacher_membership_id = ? ORDER BY co.name`).all(sinifId, ogretmenId).map(r => r.name);
  if (db.prepare('SELECT 1 FROM classes WHERE id = ? AND homeroom_membership_id = ?').get(sinifId, ogretmenId)) dersler.push('Sınıf öğretmeni');
  return dersler.join(' · ');
}

export async function gelisimApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  if (!yol.startsWith('/api/gelisim/')) return false;
  const yonetim = o.role === 'yonetim', ogretmen = o.role === 'ogretmen';
  if (!yonetim && !ogretmen) return json(res, 403, { hata: 'Bu işlem için yetkiniz yok' }), true;
  const hata = (kod, m) => (json(res, kod, { hata: m }), true);
  const subeId = sube(o);
  const yalnizYonetim = () => (yonetim ? null : hata(403, 'Bu işlem yalnızca yönetim içindir'));
  const kapsam = ogrenciId => {
    const ok = ogrenciKarti(ogrenciId, subeId);
    if (!ok) return null;
    return yonetim || ogretmenOgrencisi(o.membership_id, ogrenciId) ? ok : null;
  };

  // ---------- Yönetim: başlıklar ve dönemler ----------
  if (req.method === 'GET' && yol === '/api/gelisim/ayar') {
    if (yalnizYonetim()) return true;
    const basliklar = db.prepare(`SELECT b.id, b.ad, b.aciklama, b.sira, b.aktif, (SELECT COUNT(*) FROM gelisim_girisleri g WHERE g.baslik_id = b.id) AS girisSayisi
      FROM gelisim_basliklari b WHERE b.branch_id = ? ORDER BY b.sira, b.id`).all(subeId).map(b => ({ ...sayi(b), aktif: !!b.aktif }));
    json(res, 200, { basliklar, donemler: donemleri(subeId).map(donemOzeti), bugun: bugun() });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/gelisim/baslik-kaydet') {
    if (yalnizYonetim()) return true;
    const b = await govde(req);
    const ad = metin(b.ad, 60), aciklama = metin(b.aciklama, 200);
    if (ad.length < 2) return hata(400, 'Başlık adı en az 2 karakter olmalı');
    const ayni = db.prepare('SELECT id FROM gelisim_basliklari WHERE branch_id = ? AND ad = ? COLLATE NOCASE').get(subeId, ad);
    if (b.id) {
      const k = db.prepare('SELECT id FROM gelisim_basliklari WHERE id = ? AND branch_id = ?').get(Number(b.id), subeId);
      if (!k) return hata(404, 'Başlık bulunamadı');
      if (ayni && ayni.id !== k.id) return hata(400, 'Bu adda bir başlık zaten var');
      db.prepare('UPDATE gelisim_basliklari SET ad = ?, aciklama = ?, aktif = ? WHERE id = ?').run(ad, aciklama, b.aktif === false ? 0 : 1, k.id);
    } else {
      if (ayni) return hata(400, 'Bu adda bir başlık zaten var');
      const sira = (db.prepare('SELECT COALESCE(MAX(sira), 0) AS n FROM gelisim_basliklari WHERE branch_id = ?').get(subeId).n) + 1;
      db.prepare('INSERT INTO gelisim_basliklari (branch_id, ad, aciklama, sira, aktif) VALUES (?,?,?,?,1)').run(subeId, ad, aciklama, sira);
    }
    denetle(o.user_id, 'gelisim.baslik-kaydet', { ad });
    json(res, 200, { tamam: true });
    return true;
  }

  // Girişi olan başlık silinmez (raporlar bozulmasın); yalnızca pasife alınır
  if (req.method === 'POST' && yol === '/api/gelisim/baslik-sil') {
    if (yalnizYonetim()) return true;
    const b = await govde(req);
    const k = db.prepare('SELECT id, ad FROM gelisim_basliklari WHERE id = ? AND branch_id = ?').get(Number(b.id), subeId);
    if (!k) return hata(404, 'Başlık bulunamadı');
    if (db.prepare('SELECT 1 FROM gelisim_girisleri WHERE baslik_id = ?').get(k.id)) return hata(400, 'Bu başlığa girilmiş yorumlar var; silmek yerine pasife alın');
    db.prepare('DELETE FROM gelisim_basliklari WHERE id = ?').run(k.id);
    denetle(o.user_id, 'gelisim.baslik-sil', { ad: k.ad });
    json(res, 200, { tamam: true });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/gelisim/baslik-sira') {
    if (yalnizYonetim()) return true;
    const b = await govde(req);
    const liste = db.prepare('SELECT id FROM gelisim_basliklari WHERE branch_id = ? ORDER BY sira, id').all(subeId).map(r => r.id);
    const i = liste.indexOf(Number(b.id));
    const j = b.yon === 'yukari' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= liste.length) return hata(400, 'Taşınamaz');
    [liste[i], liste[j]] = [liste[j], liste[i]];
    liste.forEach((id, n) => db.prepare('UPDATE gelisim_basliklari SET sira = ? WHERE id = ?').run(n + 1, id));
    json(res, 200, { tamam: true });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/gelisim/donem-kaydet') {
    if (yalnizYonetim()) return true;
    const b = await govde(req);
    const ad = metin(b.ad, 60);
    const baslangic = String(b.baslangic || ''), bitis = String(b.bitis || ''), toplanti = String(b.toplantiTarihi || '');
    if (ad.length < 2) return hata(400, 'Dönem adı en az 2 karakter olmalı');
    if (!tarihGecerli(baslangic) || !tarihGecerli(bitis)) return hata(400, 'Başlangıç ve bitiş tarihi gerekli');
    if (bitis < baslangic) return hata(400, 'Bitiş tarihi başlangıçtan önce olamaz');
    if (toplanti && !tarihGecerli(toplanti)) return hata(400, 'Veli toplantısı tarihi geçersiz');
    const ayni = db.prepare('SELECT id FROM gelisim_donemleri WHERE branch_id = ? AND ad = ? COLLATE NOCASE').get(subeId, ad);
    if (b.id) {
      const k = db.prepare('SELECT id FROM gelisim_donemleri WHERE id = ? AND branch_id = ?').get(Number(b.id), subeId);
      if (!k) return hata(404, 'Dönem bulunamadı');
      if (ayni && ayni.id !== k.id) return hata(400, 'Bu adda bir dönem zaten var');
      db.prepare('UPDATE gelisim_donemleri SET ad = ?, baslangic = ?, bitis = ?, toplanti_tarihi = ? WHERE id = ?').run(ad, baslangic, bitis, toplanti || null, k.id);
    } else {
      if (ayni) return hata(400, 'Bu adda bir dönem zaten var');
      db.prepare('INSERT INTO gelisim_donemleri (branch_id, ad, baslangic, bitis, toplanti_tarihi, created_at) VALUES (?,?,?,?,?,?)').run(subeId, ad, baslangic, bitis, toplanti || null, Date.now());
    }
    denetle(o.user_id, 'gelisim.donem-kaydet', { ad, baslangic, bitis });
    json(res, 200, { tamam: true });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/gelisim/donem-sil') {
    if (yalnizYonetim()) return true;
    const b = await govde(req);
    const k = db.prepare('SELECT id, ad FROM gelisim_donemleri WHERE id = ? AND branch_id = ?').get(Number(b.id), subeId);
    if (!k) return hata(404, 'Dönem bulunamadı');
    if (db.prepare('SELECT 1 FROM gelisim_girisleri WHERE donem_id = ?').get(k.id) || db.prepare('SELECT 1 FROM gelisim_gorusmeleri WHERE donem_id = ?').get(k.id)) {
      return hata(400, 'Bu döneme girilmiş yorum ya da görüşme var; silinemez');
    }
    db.prepare('DELETE FROM gelisim_donemleri WHERE id = ?').run(k.id);
    denetle(o.user_id, 'gelisim.donem-sil', { ad: k.ad });
    json(res, 200, { tamam: true });
    return true;
  }

  // Yönetim: dönem takibi (hangi öğretmen kaç öğrencisi için tamamladı)
  if (req.method === 'GET' && yol === '/api/gelisim/takip') {
    if (yalnizYonetim()) return true;
    const d = db.prepare('SELECT * FROM gelisim_donemleri WHERE id = ? AND branch_id = ?').get(Number(url.searchParams.get('donemId')), subeId);
    if (!d) return hata(404, 'Dönem bulunamadı');
    const baslikSayisi = aktifBasliklar(subeId).length;
    const ogretmenler = db.prepare(`SELECT m.id, u.full_name AS ad FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.role = 'ogretmen' AND m.status = 'aktif' AND m.branch_id = ? ORDER BY u.full_name`).all(subeId);
    const satirlar = [];
    for (const t of ogretmenler) {
      const ogrenciler = new Set();
      const dersler = new Set();
      for (const s of ogretmenSiniflari(t.id, subeId)) {
        for (const x of ogrencileri(s.id)) ogrenciler.add(x.id);
        for (const e of dersEtiketi(t.id, s.id).split(' · ')) if (e && e !== 'Sınıf öğretmeni') dersler.add(e);
      }
      if (!ogrenciler.size) continue;
      const girilen = new Map(db.prepare(`SELECT g.student_membership_id AS s, COUNT(*) AS n FROM gelisim_girisleri g JOIN gelisim_basliklari b ON b.id = g.baslik_id
        WHERE g.donem_id = ? AND g.teacher_membership_id = ? AND b.aktif = 1 GROUP BY g.student_membership_id`).all(d.id, t.id).map(r => [r.s, Number(r.n)]));
      let tamam = 0, kismi = 0;
      for (const id of ogrenciler) {
        const n = girilen.get(id) || 0;
        if (baslikSayisi && n >= baslikSayisi) tamam++; else if (n > 0) kismi++;
      }
      satirlar.push({ id: t.id, ad: t.ad, dersler: [...dersler].join(', '), ogrenciSayisi: ogrenciler.size, tamam, kismi });
    }
    json(res, 200, { donem: donemOzeti(d), baslikSayisi, ogretmenler: satirlar });
    return true;
  }

  // Yönetim: rapor için sınıf ve öğrenci seçimi
  if (req.method === 'GET' && yol === '/api/gelisim/siniflar') {
    if (yalnizYonetim()) return true;
    const siniflar = db.prepare('SELECT id, name AS ad FROM classes WHERE branch_id = ? ORDER BY level, name').all(subeId);
    json(res, 200, { siniflar: siniflar.map(s => ({ ...s, ogrenciler: ogrencileri(s.id) })), donemler: donemleri(subeId).map(donemOzeti) });
    return true;
  }

  // ---------- Öğretmen: dönem, öğrenci listesi ve girişler ----------
  if (req.method === 'GET' && yol === '/api/gelisim/ogretmen') {
    if (!ogretmen) return hata(403, 'Bu işlem yalnızca öğretmenler içindir');
    const donemListesi = donemleri(subeId);
    let secili = donemListesi.find(d => d.id === Number(url.searchParams.get('donemId')));
    if (!secili) secili = donemListesi.find(d => donemDurumu(d) === 'acik') || [...donemListesi].reverse().find(d => donemDurumu(d) === 'kapandi') || donemListesi[0];
    const basliklar = aktifBasliklar(subeId);
    const girilen = secili ? new Map(db.prepare(`SELECT g.student_membership_id AS s, COUNT(*) AS n FROM gelisim_girisleri g JOIN gelisim_basliklari b ON b.id = g.baslik_id
      WHERE g.donem_id = ? AND g.teacher_membership_id = ? AND b.aktif = 1 GROUP BY g.student_membership_id`).all(secili.id, o.membership_id).map(r => [r.s, Number(r.n)])) : new Map();
    const siniflar = ogretmenSiniflari(o.membership_id, subeId).map(s => ({
      ...s, dersler: dersEtiketi(o.membership_id, s.id), ogrenciler: ogrencileri(s.id).map(x => ({ ...x, girilen: girilen.get(x.id) || 0 })),
    }));
    json(res, 200, { bugun: bugun(), donemler: donemListesi.map(donemOzeti), donemId: secili?.id || null, basliklar, siniflar });
    return true;
  }

  // Bir öğrencinin raporu: yönetim tüm öğretmenlerin yorumlarını, öğretmen yalnızca kendi yazdıklarını görür
  if (req.method === 'GET' && yol === '/api/gelisim/rapor') {
    const ogr = kapsam(Number(url.searchParams.get('ogrenciId')));
    if (!ogr) return hata(404, 'Öğrenci bulunamadı');
    const girisler = db.prepare(`SELECT g.donem_id, g.baslik_id, g.teacher_membership_id AS ogretmenId, u.full_name AS ogretmen, g.metin, g.guncelleme
      FROM gelisim_girisleri g JOIN memberships m ON m.id = g.teacher_membership_id JOIN users u ON u.id = m.user_id
      WHERE g.student_membership_id = ?${ogretmen ? ' AND g.teacher_membership_id = ?' : ''} ORDER BY u.full_name`)
      .all(...(ogretmen ? [ogr.id, o.membership_id] : [ogr.id]));
    const kullanilan = new Set(girisler.map(g => g.baslik_id));
    const basliklar = db.prepare('SELECT id, ad, aciklama, aktif FROM gelisim_basliklari WHERE branch_id = ? ORDER BY sira, id').all(subeId)
      .filter(b => b.aktif || kullanilan.has(b.id)).map(b => ({ id: b.id, ad: b.ad, aciklama: b.aciklama }));
    const gorusmeler = db.prepare(`SELECT g.id, g.donem_id, g.tur, g.tarih, g.notu, g.yazan_membership_id AS yazanId, u.full_name AS yazan
      FROM gelisim_gorusmeleri g JOIN memberships m ON m.id = g.yazan_membership_id JOIN users u ON u.id = m.user_id
      WHERE g.student_membership_id = ? ORDER BY g.tarih, g.id`).all(ogr.id).map(g => ({
      id: g.id, donemId: g.donem_id, tur: g.tur, tarih: g.tarih, notu: g.notu, yazan: g.yazan, benim: g.yazanId === o.membership_id, duzenlenebilir: yonetim || g.yazanId === o.membership_id,
    }));
    const dersler = new Map();
    const dersiOgren = id => { if (!dersler.has(id)) dersler.set(id, dersEtiketi(id, ogr.sinifId)); return dersler.get(id); };
    const donemListesi = donemleri(subeId).map(d => ({
      ...donemOzeti(d),
      girisler: girisler.filter(g => g.donem_id === d.id).map(g => ({ baslikId: g.baslik_id, ogretmenId: g.ogretmenId, ogretmen: g.ogretmen, ders: dersiOgren(g.ogretmenId), metin: g.metin })),
      gorusmeler: gorusmeler.filter(g => g.donemId === d.id),
    }));
    json(res, 200, {
      ogrenci: { id: ogr.id, ad: ogr.ad, okulNo: ogr.okulNo, sinif: ogr.sinif }, basliklar, donemler: donemListesi,
      donemsizGorusmeler: gorusmeler.filter(g => !g.donemId), tumu: yonetim, bugun: bugun(),
      aktifBasliklar: aktifBasliklar(subeId).map(b => b.id),
    });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/gelisim/giris-kaydet') {
    if (!ogretmen) return hata(403, 'Bu işlem yalnızca öğretmenler içindir');
    const b = await govde(req);
    const d = db.prepare('SELECT * FROM gelisim_donemleri WHERE id = ? AND branch_id = ?').get(Number(b.donemId), subeId);
    if (!d) return hata(404, 'Dönem bulunamadı');
    if (donemDurumu(d) !== 'acik') return hata(400, 'Bu dönem şu an yorum girişine açık değil');
    const ogr = kapsam(Number(b.ogrenciId));
    if (!ogr) return hata(404, 'Öğrenci bulunamadı');
    const girisler = b.girisler && typeof b.girisler === 'object' ? b.girisler : {};
    const gecerli = new Set(aktifBasliklar(subeId).map(x => x.id));
    const simdi = Date.now();
    let dolu = 0;
    for (const [id, yazi] of Object.entries(girisler)) {
      const baslikId = Number(id);
      if (!gecerli.has(baslikId)) continue;
      const m = uzunMetin(yazi, 1000);
      if (m) {
        db.prepare(`INSERT INTO gelisim_girisleri (donem_id, baslik_id, student_membership_id, teacher_membership_id, metin, guncelleme) VALUES (?,?,?,?,?,?)
          ON CONFLICT (donem_id, baslik_id, student_membership_id, teacher_membership_id) DO UPDATE SET metin = excluded.metin, guncelleme = excluded.guncelleme`)
          .run(d.id, baslikId, ogr.id, o.membership_id, m, simdi);
        dolu++;
      } else {
        db.prepare('DELETE FROM gelisim_girisleri WHERE donem_id = ? AND baslik_id = ? AND student_membership_id = ? AND teacher_membership_id = ?').run(d.id, baslikId, ogr.id, o.membership_id);
      }
    }
    denetle(o.user_id, 'gelisim.giris-kaydet', { donemId: d.id, ogrenciId: ogr.id, dolu });
    json(res, 200, { tamam: true, dolu });
    return true;
  }

  // Veli toplantısı sonucu / veli görüşmesi (öğretmen kendi öğrencileri için, yönetim herkes için)
  if (req.method === 'POST' && yol === '/api/gelisim/gorusme-kaydet') {
    const b = await govde(req);
    const tur = b.tur === 'toplanti' ? 'toplanti' : 'gorusme';
    const tarih = String(b.tarih || '');
    const notu = uzunMetin(b.notu, 2000);
    if (!tarihGecerli(tarih)) return hata(400, 'Tarih gerekli');
    if (notu.length < 3) return hata(400, 'Not en az 3 karakter olmalı');
    let donemId = b.donemId ? Number(b.donemId) : null;
    if (donemId && !db.prepare('SELECT 1 FROM gelisim_donemleri WHERE id = ? AND branch_id = ?').get(donemId, subeId)) return hata(400, 'Dönem bulunamadı');
    if (b.id) {
      const g = db.prepare('SELECT * FROM gelisim_gorusmeleri WHERE id = ?').get(Number(b.id));
      if (!g || !kapsam(g.student_membership_id)) return hata(404, 'Kayıt bulunamadı');
      if (!yonetim && g.yazan_membership_id !== o.membership_id) return hata(403, 'Yalnızca kendi yazdığınız notu düzenleyebilirsiniz');
      db.prepare('UPDATE gelisim_gorusmeleri SET donem_id = ?, tur = ?, tarih = ?, notu = ? WHERE id = ?').run(donemId, tur, tarih, notu, g.id);
    } else {
      const ogr = kapsam(Number(b.ogrenciId));
      if (!ogr) return hata(404, 'Öğrenci bulunamadı');
      db.prepare('INSERT INTO gelisim_gorusmeleri (student_membership_id, donem_id, tur, tarih, notu, yazan_membership_id, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(ogr.id, donemId, tur, tarih, notu, o.membership_id, Date.now());
    }
    denetle(o.user_id, 'gelisim.gorusme-kaydet', { ogrenciId: b.ogrenciId || null, tur });
    json(res, 200, { tamam: true });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/gelisim/gorusme-sil') {
    const b = await govde(req);
    const g = db.prepare('SELECT * FROM gelisim_gorusmeleri WHERE id = ?').get(Number(b.id));
    if (!g || !kapsam(g.student_membership_id)) return hata(404, 'Kayıt bulunamadı');
    if (!yonetim && g.yazan_membership_id !== o.membership_id) return hata(403, 'Yalnızca kendi yazdığınız notu silebilirsiniz');
    db.prepare('DELETE FROM gelisim_gorusmeleri WHERE id = ?').run(g.id);
    denetle(o.user_id, 'gelisim.gorusme-sil', { id: g.id });
    json(res, 200, { tamam: true });
    return true;
  }

  return false;
}
