import { db } from './db.js';

// Ödev takibi: ödev verildi → öğrenci "yaptım" der (fotoğraf ekleyebilir, soru sorabilir) → öğretmen doğrular.
// Ekranda görünen adlar yalnızca burada durur; mantık kodlara (verildi, yapildi, ...) bağlıdır.
export const DURUMLAR = {
  verildi: { ad: 'Verildi', aciklama: 'Henüz işaretlenmedi' },
  yapildi: { ad: 'Yapıldı', aciklama: 'Öğretmen onayı bekleniyor' },
  yapilamadi: { ad: 'Yapılamadı', aciklama: 'Öğrenci yapamadığını bildirdi' },
  dogrulandi: { ad: 'Doğrulandı', aciklama: 'Öğretmen kontrol etti' },
  duzeltme: { ad: 'Düzeltme istendi', aciklama: 'Öğretmen düzeltme istedi' },
};
const OGRENCI_SECIMLERI = ['yapildi', 'yapilamadi', 'verildi'];
const RESIM_SINIRI = 3_000_000;
const TESLIM_SAYISI = 6;
const SORU_RESMI = 3;

const bugun = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const tamSayi = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const metinAl = (v, en) => String(v || '').trim().slice(0, en);

// Dosyanın gerçekten JPEG / PNG / WebP olduğu ilk baytlardan anlaşılır; istemcinin bildirdiği tür dikkate alınmaz
function resimTuru(b) {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// Gövdeyi sınıra kadar okur; sınır aşılırsa fazlası atılır ve null döner
function hamGovde(req, sinir) {
  return new Promise((resolve, reject) => {
    const parcalar = [];
    let n = 0;
    req.on('data', c => { n += c.length; if (n <= sinir) parcalar.push(c); });
    req.on('end', () => resolve(n > sinir ? null : Buffer.concat(parcalar)));
    req.on('error', reject);
  });
}

function odevBul(odevId) {
  return db.prepare(`SELECT od.id, od.title AS baslik, od.note AS aciklama, od.kazanim, od.due_date AS sonTarih, od.visible_from AS gorunur,
      a.class_id AS sinifId, a.teacher_membership_id AS ogretmenId, co.name AS ders, c.name AS sinif, u.full_name AS ogretmen
    FROM odevler od JOIN assignments a ON a.id = od.assignment_id JOIN courses co ON co.id = a.course_id JOIN classes c ON c.id = a.class_id
    LEFT JOIN memberships tm ON tm.id = a.teacher_membership_id LEFT JOIN users u ON u.id = tm.user_id WHERE od.id = ?`).get(odevId);
}

const sinifta = (sinifId, ogrenciId) => !!db.prepare('SELECT 1 FROM class_students WHERE class_id = ? AND student_membership_id = ?').get(sinifId, ogrenciId);

// Kim hangi ödevin hangi öğrencisine erişebilir: öğrenci kendine, veli çocuğuna (salt okunur), öğretmen kendi dersinin öğrencilerine
function erisim(o, odevId, istenenOgrenci) {
  const odev = odevId && odevBul(odevId);
  if (!odev) return null;
  let ogrenciId;
  if (o.role === 'ogrenci') ogrenciId = o.membership_id;
  else if (o.role === 'veli') {
    ogrenciId = istenenOgrenci;
    if (!db.prepare('SELECT 1 FROM guardians WHERE parent_membership_id = ? AND student_membership_id = ?').get(o.membership_id, ogrenciId)) return null;
  } else if (o.role === 'ogretmen') {
    if (odev.ogretmenId !== o.membership_id) return null;
    ogrenciId = istenenOgrenci;
  } else return null;
  if (!ogrenciId || !sinifta(odev.sinifId, ogrenciId)) return null;
  if (o.role !== 'ogretmen' && odev.gorunur && odev.gorunur > bugun()) return null;
  return { odev, ogrenciId, rol: o.role };
}

const durumSatiri = (odevId, ogrenciId) => db.prepare('SELECT * FROM odev_durumlari WHERE odev_id = ? AND student_membership_id = ?').get(odevId, ogrenciId);

function detay(e) {
  const { odev, ogrenciId, rol } = e;
  const ogrenci = db.prepare('SELECT u.full_name AS ad FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.id = ?').get(ogrenciId);
  const d = durumSatiri(odev.id, ogrenciId);
  const dosyalar = db.prepare("SELECT id, boyut, created_at AS zaman FROM odev_dosyalari WHERE odev_id = ? AND student_membership_id = ? AND amac = 'teslim' ORDER BY id").all(odev.id, ogrenciId);
  const karsi = rol === 'ogretmen' ? 'ogrenci' : 'ogretmen';
  const mesajlar = db.prepare(`SELECT m.id, m.yazan_rol AS yazanRol, m.metin, m.okundu, m.created_at AS zaman, u.full_name AS yazan
    FROM odev_mesajlari m JOIN memberships mm ON mm.id = m.yazan_membership_id JOIN users u ON u.id = mm.user_id
    WHERE m.odev_id = ? AND m.student_membership_id = ? ORDER BY m.id`).all(odev.id, ogrenciId);
  const ekler = db.prepare("SELECT id, mesaj_id AS mesajId FROM odev_dosyalari WHERE odev_id = ? AND student_membership_id = ? AND amac = 'soru' AND mesaj_id IS NOT NULL ORDER BY id").all(odev.id, ogrenciId);
  const cikti = mesajlar.map(m => ({
    id: m.id, yazan: m.yazan, yazanRol: m.yazanRol, metin: m.metin, zaman: m.zaman,
    yeni: rol !== 'veli' && m.yazanRol === karsi && !m.okundu, dosyalar: ekler.filter(x => x.mesajId === m.id).map(x => x.id),
  }));
  // Konuşmayı açan taraf, karşı tarafın mesajlarını okumuş sayılır
  if (rol === 'ogrenci' || rol === 'ogretmen') {
    db.prepare('UPDATE odev_mesajlari SET okundu = 1 WHERE odev_id = ? AND student_membership_id = ? AND yazan_rol = ? AND okundu = 0').run(odev.id, ogrenciId, karsi);
  }
  return {
    durumlar: DURUMLAR, rol, salt: rol === 'veli', bugun: bugun(),
    odev: { id: odev.id, baslik: odev.baslik, aciklama: odev.aciklama, kazanim: odev.kazanim, sonTarih: odev.sonTarih, ders: odev.ders, sinif: odev.sinif, ogretmen: odev.ogretmen },
    ogrenci: { id: ogrenciId, ad: ogrenci.ad },
    durum: { kod: d?.durum || 'verildi', ogrenciNotu: d?.ogrenci_notu || '', ogretmenNotu: d?.ogretmen_notu || '', isaret: d?.isaret_zamani || null, dogrulama: d?.dogrulama_zamani || null },
    dosyalar, mesajlar: cikti,
  };
}

// Bir ödevin öğrenci bazında sayıları: durum başına ve cevap bekleyen soru
const SAYI_SORGUSU = `
  (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = a.class_id) AS toplam,
  (SELECT COUNT(*) FROM odev_durumlari d WHERE d.odev_id = od.id AND d.durum = 'yapildi') AS yapildi,
  (SELECT COUNT(*) FROM odev_durumlari d WHERE d.odev_id = od.id AND d.durum = 'yapilamadi') AS yapilamadi,
  (SELECT COUNT(*) FROM odev_durumlari d WHERE d.odev_id = od.id AND d.durum = 'dogrulandi') AS dogrulandi,
  (SELECT COUNT(*) FROM odev_durumlari d WHERE d.odev_id = od.id AND d.durum = 'duzeltme') AS duzeltme,
  (SELECT COUNT(*) FROM (SELECT MAX(id) AS son FROM odev_mesajlari WHERE odev_id = od.id GROUP BY student_membership_id) x
     JOIN odev_mesajlari mm ON mm.id = x.son WHERE mm.yazan_rol = 'ogrenci') AS soru`;
export const odevSayilari = SAYI_SORGUSU;

export async function odevApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  if (!yol.startsWith('/api/odev/')) return false;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };
  const ogretmen = o.role === 'ogretmen';
  const ogrenci = o.role === 'ogrenci';

  // Öğretmen: tüm ödevleri, bekleyen onay ve sorularla (bekleyenler üstte)
  if (req.method === 'GET' && yol === '/api/odev/ogretmen') {
    if (!ogretmen) return hata(403, 'Bu işlem yalnızca öğretmenler içindir');
    const satirlar = db.prepare(`SELECT od.id, od.title AS baslik, od.due_date AS sonTarih, od.visible_from AS gorunur, co.name AS ders, c.name AS sinif, ${SAYI_SORGUSU}
      FROM odevler od JOIN assignments a ON a.id = od.assignment_id JOIN courses co ON co.id = a.course_id JOIN classes c ON c.id = a.class_id
      WHERE a.teacher_membership_id = ? ORDER BY od.due_date DESC, od.id DESC LIMIT 200`).all(o.membership_id).map(r => ({ ...r, bekleyen: r.yapildi + r.soru }));
    json(res, 200, { bugun: bugun(), odevler: satirlar, durumlar: DURUMLAR });
    return true;
  }

  // Öğretmen: tek ödevin öğrenci listesi
  if (req.method === 'GET' && yol === '/api/odev/takip') {
    if (!ogretmen) return hata(403, 'Bu işlem yalnızca öğretmenler içindir');
    const odevId = tamSayi(url.searchParams.get('odevId'), 1, 1e9);
    const odev = odevId && odevBul(odevId);
    if (!odev || odev.ogretmenId !== o.membership_id) return hata(404, 'Ödev bulunamadı');
    const sayilar = db.prepare(`SELECT ${SAYI_SORGUSU} FROM odevler od JOIN assignments a ON a.id = od.assignment_id WHERE od.id = ?`).get(odevId);
    const ogrenciler = db.prepare(`SELECT m.id, u.full_name AS ad, m.okul_no AS okulNo, d.durum, d.ogrenci_notu AS ogrenciNotu,
        (SELECT COUNT(*) FROM odev_dosyalari f WHERE f.odev_id = ? AND f.student_membership_id = m.id AND f.amac = 'teslim') AS dosya,
        (SELECT mm.yazan_rol = 'ogrenci' FROM odev_mesajlari mm WHERE mm.odev_id = ? AND mm.student_membership_id = m.id ORDER BY mm.id DESC LIMIT 1) AS soru
      FROM class_students cs JOIN memberships m ON m.id = cs.student_membership_id JOIN users u ON u.id = m.user_id
      LEFT JOIN odev_durumlari d ON d.odev_id = ? AND d.student_membership_id = m.id
      WHERE cs.class_id = ? AND m.status = 'aktif' ORDER BY u.full_name`).all(odevId, odevId, odevId, odev.sinifId)
      .map(r => ({ id: r.id, ad: r.ad, okulNo: r.okulNo, durum: r.durum || 'verildi', ogrenciNotu: r.ogrenciNotu || '', dosya: r.dosya, soru: !!r.soru }));
    json(res, 200, {
      bugun: bugun(), durumlar: DURUMLAR, sayilar,
      odev: { id: odev.id, baslik: odev.baslik, aciklama: odev.aciklama, kazanim: odev.kazanim, sonTarih: odev.sonTarih, gorunur: odev.gorunur, ders: odev.ders, sinif: odev.sinif },
      ogrenciler,
    });
    return true;
  }

  // Öğrenci / veli / öğretmen: bir öğrencinin ödev ekranı
  if (req.method === 'GET' && yol === '/api/odev/detay') {
    const e = erisim(o, tamSayi(url.searchParams.get('odevId'), 1, 1e9), tamSayi(url.searchParams.get('ogrenciId'), 1, 1e9));
    if (!e) return hata(404, 'Ödev bulunamadı');
    json(res, 200, detay(e));
    return true;
  }

  // Öğrenci: yaptım / yapamadım / geri al
  if (req.method === 'POST' && yol === '/api/odev/isaretle') {
    if (!ogrenci) return hata(403, 'Bu işlemi yalnızca öğrenci yapabilir');
    const b = await govde(req);
    const e = erisim(o, tamSayi(b.odevId, 1, 1e9));
    if (!e) return hata(404, 'Ödev bulunamadı');
    if (!OGRENCI_SECIMLERI.includes(b.durum)) return hata(400, 'Geçersiz durum');
    const mevcut = durumSatiri(e.odev.id, o.membership_id);
    if (mevcut?.durum === 'dogrulandi') return hata(400, 'Öğretmeniniz doğruladığı için değiştirilemez');
    if (b.durum === 'verildi') {
      db.prepare('DELETE FROM odev_durumlari WHERE odev_id = ? AND student_membership_id = ?').run(e.odev.id, o.membership_id);
    } else {
      const simdi = Date.now();
      db.prepare(`INSERT INTO odev_durumlari (odev_id, student_membership_id, durum, ogrenci_notu, ogretmen_notu, isaret_zamani, dogrulama_zamani, guncelleme) VALUES (?,?,?,?,NULL,?,NULL,?)
        ON CONFLICT (odev_id, student_membership_id) DO UPDATE SET durum = excluded.durum, ogrenci_notu = excluded.ogrenci_notu, ogretmen_notu = NULL,
          isaret_zamani = excluded.isaret_zamani, dogrulama_zamani = NULL, guncelleme = excluded.guncelleme`)
        .run(e.odev.id, o.membership_id, b.durum, metinAl(b.not, 300) || null, simdi, simdi);
    }
    denetle(o.user_id, 'odev-isaretle', { odevId: e.odev.id, durum: b.durum });
    json(res, 200, { tamam: true });
    return true;
  }

  // Öğretmen: doğrula / düzeltme iste / onayı geri al
  if (req.method === 'POST' && yol === '/api/odev/dogrula') {
    if (!ogretmen) return hata(403, 'Bu işlem yalnızca öğretmenler içindir');
    const b = await govde(req);
    const e = erisim(o, tamSayi(b.odevId, 1, 1e9), tamSayi(b.ogrenciId, 1, 1e9));
    if (!e) return hata(404, 'Ödev bulunamadı');
    const mevcut = durumSatiri(e.odev.id, e.ogrenciId);
    const simdi = Date.now();
    const not = metinAl(b.not, 300);
    const yaz = (durum, ogretmenNotu, dogrulama) => db.prepare(`INSERT INTO odev_durumlari (odev_id, student_membership_id, durum, ogretmen_notu, dogrulama_zamani, guncelleme) VALUES (?,?,?,?,?,?)
      ON CONFLICT (odev_id, student_membership_id) DO UPDATE SET durum = excluded.durum, ogretmen_notu = excluded.ogretmen_notu, dogrulama_zamani = excluded.dogrulama_zamani, guncelleme = excluded.guncelleme`)
      .run(e.odev.id, e.ogrenciId, durum, ogretmenNotu, dogrulama, simdi);
    if (b.islem === 'dogrula') yaz('dogrulandi', not || null, simdi);
    else if (b.islem === 'duzeltme') {
      if (not.length < 2) return hata(400, 'Neyin düzeltileceğini yazın');
      yaz('duzeltme', not, null);
    } else if (b.islem === 'geri') {
      if (mevcut?.isaret_zamani) yaz('yapildi', null, null);
      else db.prepare('DELETE FROM odev_durumlari WHERE odev_id = ? AND student_membership_id = ?').run(e.odev.id, e.ogrenciId);
    } else return hata(400, 'Geçersiz işlem');
    denetle(o.user_id, 'odev-dogrula', { odevId: e.odev.id, ogrenciId: e.ogrenciId, islem: b.islem });
    json(res, 200, { tamam: true });
    return true;
  }

  // Öğretmen: "yaptım" diyen öğrencilerin hepsini doğrula
  if (req.method === 'POST' && yol === '/api/odev/toplu-dogrula') {
    if (!ogretmen) return hata(403, 'Bu işlem yalnızca öğretmenler içindir');
    const b = await govde(req);
    const odevId = tamSayi(b.odevId, 1, 1e9);
    const odev = odevId && odevBul(odevId);
    if (!odev || odev.ogretmenId !== o.membership_id) return hata(404, 'Ödev bulunamadı');
    const simdi = Date.now();
    const r = db.prepare("UPDATE odev_durumlari SET durum = 'dogrulandi', dogrulama_zamani = ?, guncelleme = ? WHERE odev_id = ? AND durum = 'yapildi'").run(simdi, simdi, odevId);
    denetle(o.user_id, 'odev-toplu-dogrula', { odevId, adet: Number(r.changes) });
    json(res, 200, { tamam: true, adet: Number(r.changes) });
    return true;
  }

  // Öğrenci: fotoğraf yükle (gövde ham resim; istemci küçültüp gönderir)
  if (req.method === 'POST' && yol === '/api/odev/dosya-yukle') {
    if (!ogrenci) return hata(403, 'Bu işlemi yalnızca öğrenci yapabilir');
    const e = erisim(o, tamSayi(url.searchParams.get('odevId'), 1, 1e9));
    const amac = url.searchParams.get('amac');
    const buf = await hamGovde(req, RESIM_SINIRI);
    if (!e) return hata(404, 'Ödev bulunamadı');
    if (amac !== 'teslim' && amac !== 'soru') return hata(400, 'Geçersiz istek');
    if (!buf) return hata(413, 'Fotoğraf çok büyük (en fazla 3 MB)');
    const mime = resimTuru(buf);
    if (!mime) return hata(400, 'Yalnızca JPEG, PNG veya WebP fotoğraf yüklenebilir');
    if (amac === 'teslim') {
      if (durumSatiri(e.odev.id, o.membership_id)?.durum === 'dogrulandi') return hata(400, 'Öğretmeniniz doğruladığı için fotoğraf eklenemez');
      const n = db.prepare("SELECT COUNT(*) AS n FROM odev_dosyalari WHERE odev_id = ? AND student_membership_id = ? AND amac = 'teslim'").get(e.odev.id, o.membership_id).n;
      if (n >= TESLIM_SAYISI) return hata(400, `En fazla ${TESLIM_SAYISI} fotoğraf eklenebilir`);
    } else {
      const n = db.prepare("SELECT COUNT(*) AS n FROM odev_dosyalari WHERE odev_id = ? AND student_membership_id = ? AND amac = 'soru' AND mesaj_id IS NULL").get(e.odev.id, o.membership_id).n;
      if (n >= SORU_RESMI) return hata(400, `Bir soruya en fazla ${SORU_RESMI} fotoğraf eklenebilir`);
    }
    const id = Number(db.prepare('INSERT INTO odev_dosyalari (odev_id, student_membership_id, amac, mime, boyut, veri, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(e.odev.id, o.membership_id, amac, mime, buf.length, buf, Date.now()).lastInsertRowid);
    denetle(o.user_id, 'odev-dosya-yukle', { odevId: e.odev.id, dosyaId: id, amac });
    json(res, 200, { tamam: true, id });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/odev/dosya-sil') {
    if (!ogrenci) return hata(403, 'Bu işlemi yalnızca öğrenci yapabilir');
    const b = await govde(req);
    const d = db.prepare('SELECT * FROM odev_dosyalari WHERE id = ? AND student_membership_id = ? AND mesaj_id IS NULL').get(tamSayi(b.id, 1, 1e9), o.membership_id);
    if (!d) return hata(404, 'Fotoğraf bulunamadı');
    if (d.amac === 'teslim' && durumSatiri(d.odev_id, o.membership_id)?.durum === 'dogrulandi') return hata(400, 'Öğretmeniniz doğruladığı için silinemez');
    db.prepare('DELETE FROM odev_dosyalari WHERE id = ?').run(d.id);
    json(res, 200, { tamam: true });
    return true;
  }

  // Fotoğrafı göster: yalnızca ödevin öğrencisi, velisi ve dersin öğretmeni
  if (req.method === 'GET' && yol === '/api/odev/dosya') {
    const d = db.prepare('SELECT odev_id, student_membership_id AS ogrenciId, mime, veri FROM odev_dosyalari WHERE id = ?').get(tamSayi(url.searchParams.get('id'), 1, 1e9));
    if (!d || !erisim(o, d.odev_id, d.ogrenciId)) return hata(404, 'Fotoğraf bulunamadı');
    res.writeHead(200, { 'Content-Type': d.mime, 'Content-Length': d.veri.length, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
    res.end(d.veri);
    return true;
  }

  // Soru sor (öğrenci) / cevap yaz (öğretmen)
  if (req.method === 'POST' && yol === '/api/odev/mesaj-gonder') {
    if (!ogrenci && !ogretmen) return hata(403, 'Bu işlem için yetkiniz yok');
    const b = await govde(req);
    const e = erisim(o, tamSayi(b.odevId, 1, 1e9), tamSayi(b.ogrenciId, 1, 1e9));
    if (!e) return hata(404, 'Ödev bulunamadı');
    const metin = metinAl(b.metin, 800);
    if (metin.length < 2) return hata(400, 'Mesaj en az 2 karakter olmalı');
    const ekIdleri = ogrenci && Array.isArray(b.dosyaIds) ? b.dosyaIds.map(x => tamSayi(x, 1, 1e9)).filter(Boolean).slice(0, SORU_RESMI) : [];
    const id = Number(db.prepare('INSERT INTO odev_mesajlari (odev_id, student_membership_id, yazan_membership_id, yazan_rol, metin, created_at) VALUES (?,?,?,?,?,?)')
      .run(e.odev.id, e.ogrenciId, o.membership_id, ogrenci ? 'ogrenci' : 'ogretmen', metin, Date.now()).lastInsertRowid);
    for (const f of ekIdleri) {
      db.prepare("UPDATE odev_dosyalari SET mesaj_id = ? WHERE id = ? AND odev_id = ? AND student_membership_id = ? AND amac = 'soru' AND mesaj_id IS NULL").run(id, f, e.odev.id, e.ogrenciId);
    }
    denetle(o.user_id, 'odev-mesaj', { odevId: e.odev.id, ogrenciId: e.ogrenciId });
    json(res, 200, { tamam: true, id });
    return true;
  }

  return hata(404, 'Bulunamadı');
}
