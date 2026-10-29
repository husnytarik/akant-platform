import { db, FOTO_SQL, tcGecerliMi } from './db.js';
import { islem, kisiKaydet } from './kurulum.js';
import { yetkiVar } from './yetki.js';
import { teslimGecmisi } from './teslim.js';
import { devamOzeti, ogrenciDosyasi } from './ogrencilerim.js';

// Öğrenci kaydı ve öğrenci dosyası: kayıt sırasında alınan bilgiler (kimlik, doğum, yemek, özel durumlar, aile) ve
// öğrencinin o anki tüm durumunun (devam, sınav, gelişim, ödev) tek raporu. Yazma yalnızca yönetime açıktır.
db.exec(`
CREATE TABLE IF NOT EXISTS ogrenci_kayit (
  student_membership_id INTEGER PRIMARY KEY REFERENCES memberships(id),
  dogum_tarihi TEXT NOT NULL DEFAULT '',
  dogum_yeri   TEXT NOT NULL DEFAULT '',
  cinsiyet     TEXT NOT NULL DEFAULT '',
  kan_grubu    TEXT NOT NULL DEFAULT '',
  onceki_okul  TEXT NOT NULL DEFAULT '',
  kayit_tarihi TEXT NOT NULL DEFAULT '',
  kayit_turu   TEXT NOT NULL DEFAULT 'yeni',
  yemek        TEXT NOT NULL DEFAULT 'alacak',
  guncelleme   INTEGER NOT NULL
);
-- Sağlık / alerji / özel eğitim gibi istenirse eklenen özel durum notları (öğrenci başına istenen sayıda)
CREATE TABLE IF NOT EXISTS ogrenci_ozel_durum (
  id                    INTEGER PRIMARY KEY,
  student_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  tur                   TEXT NOT NULL,
  baslik                TEXT NOT NULL,
  aciklama              TEXT NOT NULL DEFAULT '',
  created_at            INTEGER NOT NULL
);
-- Veli ile öğrenci arasındaki bağın ayrıntısı (yakınlık, meslek); bağın kendisi guardians tablosundadır
CREATE TABLE IF NOT EXISTS aile_bilgi (
  student_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  parent_membership_id  INTEGER NOT NULL REFERENCES memberships(id),
  yakinlik              TEXT NOT NULL DEFAULT '',
  meslek                TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (student_membership_id, parent_membership_id)
);
`);

const YAKINLIK = ['Anne', 'Baba', 'Vasi', 'Kardeş', 'Dede', 'Nine', 'Amca / Dayı', 'Teyze / Hala', 'Diğer'];
const KAN = ['0 Rh+', '0 Rh-', 'A Rh+', 'A Rh-', 'B Rh+', 'B Rh-', 'AB Rh+', 'AB Rh-'];
const OZEL_TUR = { saglik: 'Sağlık', alerji: 'Alerji', 'ozel-egitim': 'Özel eğitim', aile: 'Aile durumu', diger: 'Diğer' };
const KAYIT_TURU = { yeni: 'Yeni kayıt', yenileme: 'Kayıt yenileme', nakil: 'Nakil' };

class Hata extends Error { constructor(kod, mesaj) { super(mesaj); this.kod = kod; } }
const tamSayi = v => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const telNormalize = t => String(t || '').replace(/\D/g, '').slice(-10);
const metin = (v, azami) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, azami);
const uzunMetin = (v, azami) => String(v ?? '').replace(/[ \t]+/g, ' ').trim().slice(0, azami);
const epostaGecerli = v => /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(v);
const maske = k => (k && k.length === 11 ? k.slice(0, 3) + '******' + k.slice(-2) : k || '');
const bugunTarih = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });

function tarihAl(v, ad, gelecekOlmaz) {
  const t = String(v ?? '').trim();
  if (!t) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || isNaN(new Date(t + 'T00:00:00Z')) || new Date(t + 'T00:00:00Z').toISOString().slice(0, 10) !== t || t < '1950-01-01') throw new Hata(400, `${ad} geçerli değil`);
  if (gelecekOlmaz && t > bugunTarih()) throw new Hata(400, `${ad} ileri bir tarih olamaz`);
  return t;
}
function telAl(v, ad, zorunlu) {
  if (!String(v ?? '').trim()) { if (zorunlu) throw new Hata(400, `${ad} gerekli`); return ''; }
  const t = telNormalize(v);
  if (!/^[1-9]\d{9}$/.test(t)) throw new Hata(400, `${ad} geçerli değil (10 haneli, örn. 532 123 45 67)`);
  return t;
}

// Kişinin iletişim satırını günceller: yalnızca verilen alanlar değişir
function profilYaz(userId, ek) {
  const m = db.prepare('SELECT * FROM profil_bilgi WHERE user_id = ?').get(userId) || {};
  const a = { email: '', telefon2: '', il: '', ilce: '', adres: '', yakin_ad: '', yakin_yakinlik: '', yakin_telefon: '', ...m, ...ek };
  db.prepare(`INSERT INTO profil_bilgi (user_id, email, telefon2, il, ilce, adres, yakin_ad, yakin_yakinlik, yakin_telefon, guncelleme) VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT (user_id) DO UPDATE SET email = excluded.email, telefon2 = excluded.telefon2, il = excluded.il, ilce = excluded.ilce, adres = excluded.adres,
      yakin_ad = excluded.yakin_ad, yakin_yakinlik = excluded.yakin_yakinlik, yakin_telefon = excluded.yakin_telefon, guncelleme = excluded.guncelleme`)
    .run(userId, a.email, a.telefon2, a.il, a.ilce, a.adres, a.yakin_ad, a.yakin_yakinlik, a.yakin_telefon, Date.now());
}

// Yönetimin görebildiği öğrenci ya da öğretmenin ders verdiği / mentoru olduğu sınıftaki öğrenci
export function ogrenciErisimi(o, id) {
  if (!tamSayi(id)) return null;
  const temel = `SELECT m.id, m.user_id AS userId, m.branch_id AS subeId, cs.class_id AS sinifId, c.name AS sinif
    FROM memberships m LEFT JOIN class_students cs ON cs.student_membership_id = m.id LEFT JOIN classes c ON c.id = cs.class_id
    WHERE m.id = ? AND m.role = 'ogrenci'`;
  if (o.role === 'yonetim') return db.prepare(temel).get(id) || null;
  if (o.role !== 'ogretmen') return null;
  return db.prepare(temel + ` AND (c.homeroom_membership_id = ? OR EXISTS (SELECT 1 FROM assignments a WHERE a.class_id = c.id AND a.teacher_membership_id = ?))`)
    .get(id, o.membership_id, o.membership_id) || null;
}

function veliBagla(ogr, v, aktor, denetle) {
  const ad = String(v.ad || '').trim();
  const kimlik = String(v.kimlik || '').trim().toUpperCase();
  const yakinlik = metin(v.yakinlik, 30);
  const etiket = yakinlik || 'Veli';
  if (ad.length < 3 || ad.length > 80) throw new Hata(400, `${etiket} adı soyadı geçersiz`);
  const tcMi = /^\d{11}$/.test(kimlik);
  if (tcMi ? !tcGecerliMi(kimlik) : !/^[A-Z0-9]{5,20}$/.test(kimlik)) throw new Hata(400, `${etiket} kimlik / pasaport numarası geçersiz`);
  const tel = telAl(v.telefon, `${etiket} telefonu`, true);
  if (yakinlik && !YAKINLIK.includes(yakinlik)) throw new Hata(400, 'Yakınlık listeden seçilmeli');
  const eposta = metin(v.email, 120);
  if (eposta && !epostaGecerli(eposta)) throw new Hata(400, `${etiket} e-posta adresi geçerli değil`);

  const var_ = db.prepare('SELECT * FROM users WHERE tc_no = gz(?) OR passport_no = gz(?)').get(kimlik, kimlik);
  if (var_ && var_.phone !== tel) throw new Hata(409, `${etiket}: bu kimlik numarası başka bir telefonla kayıtlı`);
  const userId = var_?.id ?? Number(db.prepare('INSERT INTO users (tc_no, passport_no, phone, full_name, created_at) VALUES (?,?,?,?,?)')
    .run(tcMi ? kimlik : null, tcMi ? null : kimlik, tel, ad, Date.now()).lastInsertRowid);
  let uyelik = db.prepare("SELECT id FROM memberships WHERE user_id = ? AND branch_id = ? AND role = 'veli'").get(userId, ogr.subeId);
  const uyelikId = uyelik?.id ?? Number(db.prepare("INSERT INTO memberships (user_id, branch_id, role) VALUES (?,?, 'veli')").run(userId, ogr.subeId).lastInsertRowid);
  db.prepare('INSERT OR IGNORE INTO guardians (parent_membership_id, student_membership_id) VALUES (?,?)').run(uyelikId, ogr.id);
  db.prepare('INSERT OR REPLACE INTO aile_bilgi (student_membership_id, parent_membership_id, yakinlik, meslek) VALUES (?,?,?,?)')
    .run(ogr.id, uyelikId, yakinlik, metin(v.meslek, 60));
  if (eposta) profilYaz(userId, { email: eposta });
  denetle(aktor, 'veli-bagla', { veliId: uyelikId, ogrId: ogr.id, mevcutHesap: !!var_ });
  return uyelikId;
}

function ozelDurumAl(d) {
  const baslik = metin(d.baslik, 80);
  const aciklama = uzunMetin(d.aciklama, 500);
  if (!OZEL_TUR[d.tur]) throw new Hata(400, 'Özel durum türü geçersiz');
  if (!baslik) throw new Hata(400, 'Özel durum için kısa bir başlık yazın');
  return { tur: d.tur, baslik, aciklama };
}

// Kayıt formundaki alanlar (ortak doğrulama); geçersizse Hata fırlatır
function kayitAlanlari(b) {
  const cinsiyet = String(b.cinsiyet || '');
  if (!['', 'kiz', 'erkek'].includes(cinsiyet)) throw new Hata(400, 'Cinsiyet geçersiz');
  const kan = String(b.kanGrubu || '');
  if (kan && !KAN.includes(kan)) throw new Hata(400, 'Kan grubu geçersiz');
  const turu = String(b.kayitTuru || 'yeni');
  if (!KAYIT_TURU[turu]) throw new Hata(400, 'Kayıt türü geçersiz');
  const yemek = String(b.yemek || '');
  if (!['alacak', 'almayacak'].includes(yemek)) throw new Hata(400, 'Yemek tercihi seçilmeli (yemek alacak / almayacak)');
  const eposta = metin(b.email, 120);
  if (eposta && !epostaGecerli(eposta)) throw new Hata(400, 'E-posta adresi geçerli değil');
  const yakinAd = metin(b.yakinAd, 80), yakinYakinlik = metin(b.yakinYakinlik, 30);
  if (yakinYakinlik && !YAKINLIK.includes(yakinYakinlik)) throw new Hata(400, 'Acil durum yakınlığı listeden seçilmeli');
  const yakinTelefon = telAl(b.yakinTelefon, 'Acil durum telefonu', false);
  if ((yakinAd || yakinYakinlik) && !yakinTelefon) throw new Hata(400, 'Acil durum kişisi için telefon numarası gerekli');
  return {
    kayit: {
      dogum_tarihi: tarihAl(b.dogumTarihi, 'Doğum tarihi', true), dogum_yeri: metin(b.dogumYeri, 60), cinsiyet, kan_grubu: kan,
      onceki_okul: metin(b.oncekiOkul, 100), kayit_tarihi: tarihAl(b.kayitTarihi, 'Kayıt tarihi', false), kayit_turu: turu, yemek,
    },
    iletisim: { email: eposta, il: metin(b.il, 40), ilce: metin(b.ilce, 40), adres: uzunMetin(b.adres, 250), yakin_ad: yakinAd, yakin_yakinlik: yakinYakinlik, yakin_telefon: yakinTelefon },
  };
}

function kayitYaz(id, k) {
  db.prepare(`INSERT INTO ogrenci_kayit (student_membership_id, dogum_tarihi, dogum_yeri, cinsiyet, kan_grubu, onceki_okul, kayit_tarihi, kayit_turu, yemek, guncelleme)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT (student_membership_id) DO UPDATE SET dogum_tarihi = excluded.dogum_tarihi, dogum_yeri = excluded.dogum_yeri, cinsiyet = excluded.cinsiyet,
      kan_grubu = excluded.kan_grubu, onceki_okul = excluded.onceki_okul, kayit_tarihi = excluded.kayit_tarihi, kayit_turu = excluded.kayit_turu,
      yemek = excluded.yemek, guncelleme = excluded.guncelleme`)
    .run(id, k.dogum_tarihi, k.dogum_yeri, k.cinsiyet, k.kan_grubu, k.onceki_okul, k.kayit_tarihi, k.kayit_turu, k.yemek, Date.now());
}

export async function ogrenciApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  if (!yol.startsWith('/api/ogrenci/')) return false;
  const hata = (kod, m) => (json(res, kod, { hata: m }), true);
  const yon = o.role === 'yonetim';
  if (!yon && o.role !== 'ogretmen') return hata(403, 'Bu işlem için yetkiniz yok');

  // ---- Okuma ----
  if (req.method === 'GET' && yol === '/api/ogrenci/liste') {
    if (!yon) return hata(403, 'Bu işlem için yetkiniz yok');
    const ogrenciler = db.prepare(`
      SELECT m.id, u.full_name AS ad, ${FOTO_SQL} AS foto, m.okul_no AS okulNo, m.branch_id AS subeId, b.name AS sube, m.status AS durum,
             cs.class_id AS sinifId, c.name AS sinif, COALESCE(k.yemek, '') AS yemek,
             (SELECT COUNT(*) FROM ogrenci_ozel_durum d WHERE d.student_membership_id = m.id) AS ozelSayisi
      FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN branches b ON b.id = m.branch_id
      LEFT JOIN class_students cs ON cs.student_membership_id = m.id LEFT JOIN classes c ON c.id = cs.class_id
      LEFT JOIN ogrenci_kayit k ON k.student_membership_id = m.id
      WHERE m.role = 'ogrenci' ORDER BY u.full_name`).all();
    return json(res, 200, {
      ogrenciler,
      subeler: db.prepare('SELECT id, name AS ad FROM branches ORDER BY id').all(),
      siniflar: db.prepare('SELECT id, branch_id AS subeId, name AS ad, level AS kademe FROM classes ORDER BY branch_id, level, name').all(),
    }), true;
  }

  if (req.method === 'GET' && yol === '/api/ogrenci/kayit') {
    const kayitId = tamSayi(url.searchParams.get('id'));
    // Boş id: yeni kayıt formu için seçenekler
    if (!kayitId) {
      if (!yon) return hata(403, 'Bu işlem için yetkiniz yok');
      return json(res, 200, seceneklerVer()), true;
    }
    const e = ogrenciErisimi(o, kayitId);
    if (!e) return hata(404, 'Öğrenci bulunamadı');
    const u = db.prepare(`SELECT u.full_name AS ad, u.phone AS telefon, u.tc_no, u.passport_no, ${FOTO_SQL} AS foto, m.okul_no AS okulNo, m.status AS durum, b.name AS sube
      FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN branches b ON b.id = m.branch_id WHERE m.id = ?`).get(kayitId);
    const k = db.prepare('SELECT * FROM ogrenci_kayit WHERE student_membership_id = ?').get(kayitId) || {};
    const p = db.prepare('SELECT * FROM profil_bilgi WHERE user_id = ?').get(e.userId) || {};
    const aile = db.prepare(`SELECT pm.id AS uyelikId, pu.id AS userId, pu.full_name AS ad, pu.phone AS telefon, COALESCE(ab.yakinlik, '') AS yakinlik, COALESCE(ab.meslek, '') AS meslek,
        COALESCE(pb.email, '') AS email
      FROM guardians g JOIN memberships pm ON pm.id = g.parent_membership_id JOIN users pu ON pu.id = pm.user_id
      LEFT JOIN aile_bilgi ab ON ab.student_membership_id = g.student_membership_id AND ab.parent_membership_id = g.parent_membership_id
      LEFT JOIN profil_bilgi pb ON pb.user_id = pu.id
      WHERE g.student_membership_id = ? ORDER BY CASE ab.yakinlik WHEN 'Anne' THEN 0 WHEN 'Baba' THEN 1 ELSE 2 END, pu.full_name`).all(kayitId);
    const ozel = db.prepare('SELECT id, tur, baslik, aciklama, created_at AS tarih FROM ogrenci_ozel_durum WHERE student_membership_id = ? ORDER BY id').all(kayitId);
    return json(res, 200, {
      ogrenci: { id: kayitId, userId: e.userId, ad: u.ad, telefon: u.telefon, kimlik: maske(u.tc_no || u.passport_no), kimlikTuru: u.tc_no ? 'T.C. kimlik no' : 'Pasaport no',
        foto: u.foto, okulNo: u.okulNo, durum: u.durum, subeId: e.subeId, sube: u.sube, sinifId: e.sinifId || null, sinif: e.sinif || '' },
      kayit: { dogumTarihi: k.dogum_tarihi || '', dogumYeri: k.dogum_yeri || '', cinsiyet: k.cinsiyet || '', kanGrubu: k.kan_grubu || '', oncekiOkul: k.onceki_okul || '',
        kayitTarihi: k.kayit_tarihi || '', kayitTuru: k.kayit_turu || 'yeni', yemek: k.yemek || '' },
      iletisim: { email: p.email || '', il: p.il || '', ilce: p.ilce || '', adres: p.adres || '', yakinAd: p.yakin_ad || '', yakinYakinlik: p.yakin_yakinlik || '', yakinTelefon: p.yakin_telefon || '' },
      aile, ozelDurumlar: ozel, duzenleyebilir: yon && yetkiVar(o, 'ogrenci-kayit'), ...seceneklerVer(),
    }), true;
  }

  // Teslim kayıtları: öğrenciyi okuldan kim, ne zaman teslim aldı
  if (req.method === 'GET' && yol === '/api/ogrenci/teslim') {
    const id = tamSayi(url.searchParams.get('id'));
    if (!ogrenciErisimi(o, id)) return hata(404, 'Öğrenci bulunamadı');
    return json(res, 200, { kayitlar: teslimGecmisi(id) }), true;
  }

  // Rapor: öğrencinin o anki tüm durumu (devam, ödev, gelişim, dönem karşılaştırması); sınav sonuçları /api/sinav/ogrenci'den gelir
  if (req.method === 'GET' && yol === '/api/ogrenci/rapor') {
    const id = tamSayi(url.searchParams.get('id'));
    const e = ogrenciErisimi(o, id);
    if (!e) return hata(404, 'Öğrenci bulunamadı');
    const u = db.prepare(`SELECT u.full_name AS ad, ${FOTO_SQL} AS foto, m.okul_no AS okulNo, b.name AS sube
      FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN branches b ON b.id = m.branch_id WHERE m.id = ?`).get(id);
    const mentor = e.sinifId ? db.prepare(`SELECT ru.full_name AS ad FROM classes c JOIN memberships rm ON rm.id = c.homeroom_membership_id
      JOIN users ru ON ru.id = rm.user_id WHERE c.id = ?`).get(e.sinifId) : null;
    const dosya = ogrenciDosyasi(id, e);
    const devam = devamOzeti(id, e.sinifId);
    const bugun = bugunTarih();

    // Dönem dönem karşılaştırma: devam ve ödev tamamlama oranı (gelişim dönemlerinin tarih aralığına göre)
    const donemSatirlari = db.prepare('SELECT id, ad, baslangic, bitis FROM gelisim_donemleri WHERE branch_id = ? ORDER BY baslangic').all(e.subeId);
    const donemDevam = db.prepare(`SELECT COUNT(*) AS toplam, COALESCE(SUM(k.status = 'gelmedi'), 0) AS gelmedi, COALESCE(SUM(k.status = 'gec'), 0) AS gec
      FROM yoklama_kayit k JOIN yoklama y ON y.id = k.yoklama_id
      WHERE k.student_membership_id = ? AND y.cancelled = 0 AND y.completed_at IS NOT NULL AND y.date BETWEEN ? AND ?`);
    const donemOdev = db.prepare(`SELECT COUNT(*) AS toplam, COALESCE(SUM(d.durum IN ('yapildi','dogrulandi')), 0) AS tamam
      FROM odevler od JOIN assignments a ON a.id = od.assignment_id
      LEFT JOIN odev_durumlari d ON d.odev_id = od.id AND d.student_membership_id = ?
      WHERE a.class_id = ? AND od.due_date BETWEEN ? AND ? AND od.due_date <= ?`);
    const sayi = r => Object.fromEntries(Object.entries(r).map(([a, c]) => [a, typeof c === 'bigint' ? Number(c) : c]));
    const donemler = donemSatirlari.filter(d => d.baslangic <= bugun).map(d => {
      const dv = sayi(donemDevam.get(id, d.baslangic, d.bitis));
      const od = e.sinifId ? sayi(donemOdev.get(id, e.sinifId, d.baslangic, d.bitis, bugun)) : { toplam: 0, tamam: 0 };
      const doluDonem = dosya.donemler.find(x => x.id === d.id);
      return { id: d.id, ad: d.ad, baslangic: d.baslangic, bitis: d.bitis, acik: bugun <= d.bitis,
        devam: { ...dv, yuzde: dv.toplam ? Math.round((dv.toplam - dv.gelmedi) / dv.toplam * 100) : null },
        odev: { ...od, oran: od.toplam ? Math.round(od.tamam / od.toplam * 100) : null },
        gozlem: doluDonem?.girisler.length || 0 };
    });
    const bekleyen = e.sinifId ? sayi(db.prepare(`
      SELECT COALESCE(SUM(od.durum IS NULL OR od.durum IN ('duzeltme','yapilamadi')), 0) AS bekleyen,
             COALESCE(SUM((od.durum IS NULL OR od.durum IN ('duzeltme','yapilamadi')) AND d.due_date < ?), 0) AS geciken
      FROM odevler d JOIN assignments a ON a.id = d.assignment_id
      LEFT JOIN odev_durumlari od ON od.odev_id = d.id AND od.student_membership_id = ?
      WHERE a.class_id = ?`).get(bugun, id, e.sinifId)) : { bekleyen: 0, geciken: 0 };

    return json(res, 200, {
      ogrenci: { id, ad: u.ad, foto: u.foto, okulNo: u.okulNo, sube: u.sube, sinif: e.sinif || '', mentor: mentor?.ad || '' },
      ...devam, ...dosya, donemKarsilastirma: donemler, bekleyenOdev: bekleyen, rapor: bugun,
    }), true;
  }

  // ---- Yazma (yalnızca yönetim) ----
  if (req.method !== 'POST') return false;
  if (!yon) return hata(403, 'Bu işlem için yetkiniz yok');
  const b = await govde(req, 60_000);

  try {
    if (yol === '/api/ogrenci/kaydet') {
      const id = b.id === undefined || b.id === null || b.id === '' ? null : tamSayi(b.id);
      if (b.id !== undefined && b.id !== null && b.id !== '' && !id) return hata(400, 'Geçersiz öğrenci');
      const { kayit, iletisim } = kayitAlanlari(b);
      const sinifId = b.sinifId === undefined || b.sinifId === null || b.sinifId === '' ? null : tamSayi(b.sinifId);
      if (b.sinifId && !sinifId) return hata(400, 'Geçersiz sınıf');
      const sinif = sinifId ? db.prepare('SELECT * FROM classes WHERE id = ?').get(sinifId) : null;
      if (sinifId && !sinif) return hata(404, 'Sınıf bulunamadı');

      if (id) {
        const e = ogrenciErisimi(o, id);
        if (!e) return hata(404, 'Öğrenci bulunamadı');
        if (sinif && sinif.branch_id !== e.subeId) return hata(400, 'Sınıf öğrencinin okuluna ait değil');
        const ad = String(b.ad || '').trim();
        if (ad.length < 3 || ad.length > 80) return hata(400, 'Ad soyad geçersiz');
        const tel = telAl(b.telefon, 'Telefon', true);
        const okulNo = String(b.okulNo ?? '').trim();
        if (okulNo && !/^\d{1,10}$/.test(okulNo)) return hata(400, 'Okul numarası 1-10 haneli rakam olmalı');
        if (okulNo && db.prepare("SELECT 1 FROM memberships WHERE branch_id = ? AND role = 'ogrenci' AND okul_no = ? AND id != ?").get(e.subeId, okulNo, id)) {
          return hata(409, 'Bu okul numarası okulda başka bir öğrencide kayıtlı');
        }
        islem(() => {
          db.prepare('UPDATE users SET full_name = ?, phone = ? WHERE id = ?').run(ad, tel, e.userId);
          if (okulNo) db.prepare('UPDATE memberships SET okul_no = ? WHERE id = ?').run(okulNo, id);
          if (sinifId) db.prepare(`INSERT INTO class_students (class_id, student_membership_id) VALUES (?,?)
            ON CONFLICT (student_membership_id) DO UPDATE SET class_id = excluded.class_id`).run(sinifId, id);
          else db.prepare('DELETE FROM class_students WHERE student_membership_id = ?').run(id);
          kayitYaz(id, kayit);
          profilYaz(e.userId, iletisim);
        });
        denetle(o.user_id, 'ogrenci-guncelle', { uyelikId: id });
        return json(res, 200, { tamam: true, id }), true;
      }

      // Yeni kayıt: öğrenci + sınıf + kayıt bilgileri + aile + özel durumlar tek işlemde
      const aile = (Array.isArray(b.aile) ? b.aile : []).filter(v => v && [v.ad, v.kimlik, v.telefon].some(x => String(x ?? '').trim()));
      if (aile.length > 4) return hata(400, 'En çok 4 aile kişisi eklenebilir');
      const ozel = (Array.isArray(b.ozelDurumlar) ? b.ozelDurumlar : []).filter(d => d && (String(d.baslik ?? '').trim() || String(d.aciklama ?? '').trim())).map(ozelDurumAl);
      if (ozel.length > 10) return hata(400, 'En çok 10 özel durum eklenebilir');
      if (sinif && sinif.branch_id !== tamSayi(b.subeId)) return hata(400, 'Sınıf seçilen okula ait değil');
      const sonuc = islem(() => {
        const k = kisiKaydet(b, 'ogrenci', o.user_id, denetle);
        if (k.kod !== 201) throw new Hata(k.kod, k.hata);
        if (sinifId) db.prepare('INSERT INTO class_students (class_id, student_membership_id) VALUES (?,?)').run(sinifId, k.uyelikId);
        kayitYaz(k.uyelikId, { ...kayit, kayit_tarihi: kayit.kayit_tarihi || bugunTarih() });
        profilYaz(k.userId, iletisim);
        for (const v of aile) veliBagla({ id: k.uyelikId, subeId: k.subeId }, v, o.user_id, denetle);
        for (const d of ozel) db.prepare('INSERT INTO ogrenci_ozel_durum (student_membership_id, tur, baslik, aciklama, created_at) VALUES (?,?,?,?,?)').run(k.uyelikId, d.tur, d.baslik, d.aciklama, Date.now());
        return k;
      });
      return json(res, 201, { tamam: true, id: sonuc.uyelikId, userId: sonuc.userId }), true;
    }

    const e = ogrenciErisimi(o, tamSayi(b.ogrenciId));
    if (!e) return hata(404, 'Öğrenci bulunamadı');

    if (yol === '/api/ogrenci/veli-ekle') {
      const mevcut = db.prepare('SELECT COUNT(*) AS n FROM guardians WHERE student_membership_id = ?').get(e.id).n;
      if (mevcut >= 6) return hata(400, 'Bir öğrenciye en çok 6 veli / yakın bağlanabilir');
      islem(() => veliBagla({ id: e.id, subeId: e.subeId }, b, o.user_id, denetle));
      return json(res, 201, { tamam: true }), true;
    }
    if (yol === '/api/ogrenci/veli-guncelle') {
      const veliId = tamSayi(b.veliUyelikId);
      if (!veliId || !db.prepare('SELECT 1 FROM guardians WHERE parent_membership_id = ? AND student_membership_id = ?').get(veliId, e.id)) return hata(404, 'Veli bulunamadı');
      const yakinlik = metin(b.yakinlik, 30);
      if (yakinlik && !YAKINLIK.includes(yakinlik)) return hata(400, 'Yakınlık listeden seçilmeli');
      db.prepare('INSERT OR REPLACE INTO aile_bilgi (student_membership_id, parent_membership_id, yakinlik, meslek) VALUES (?,?,?,?)').run(e.id, veliId, yakinlik, metin(b.meslek, 60));
      denetle(o.user_id, 'veli-guncelle', { veliId, ogrId: e.id });
      return json(res, 200, { tamam: true }), true;
    }
    if (yol === '/api/ogrenci/veli-cikar') {
      const veliId = tamSayi(b.veliUyelikId);
      if (!veliId) return hata(400, 'Geçersiz veli');
      db.prepare('DELETE FROM guardians WHERE parent_membership_id = ? AND student_membership_id = ?').run(veliId, e.id);
      db.prepare('DELETE FROM aile_bilgi WHERE parent_membership_id = ? AND student_membership_id = ?').run(veliId, e.id);
      denetle(o.user_id, 'veli-coz', { veliId, ogrId: e.id });
      return json(res, 200, { tamam: true }), true;
    }
    if (yol === '/api/ogrenci/ozel-durum-kaydet') {
      const d = ozelDurumAl(b);
      const durumId = b.id ? tamSayi(b.id) : null;
      if (durumId) {
        if (!db.prepare('SELECT 1 FROM ogrenci_ozel_durum WHERE id = ? AND student_membership_id = ?').get(durumId, e.id)) return hata(404, 'Kayıt bulunamadı');
        db.prepare('UPDATE ogrenci_ozel_durum SET tur = ?, baslik = ?, aciklama = ? WHERE id = ?').run(d.tur, d.baslik, d.aciklama, durumId);
      } else {
        if (db.prepare('SELECT COUNT(*) AS n FROM ogrenci_ozel_durum WHERE student_membership_id = ?').get(e.id).n >= 10) return hata(400, 'En çok 10 özel durum eklenebilir');
        db.prepare('INSERT INTO ogrenci_ozel_durum (student_membership_id, tur, baslik, aciklama, created_at) VALUES (?,?,?,?,?)').run(e.id, d.tur, d.baslik, d.aciklama, Date.now());
      }
      denetle(o.user_id, 'ogrenci-ozel-durum', { ogrId: e.id, tur: d.tur });
      return json(res, 200, { tamam: true }), true;
    }
    if (yol === '/api/ogrenci/ozel-durum-sil') {
      db.prepare('DELETE FROM ogrenci_ozel_durum WHERE id = ? AND student_membership_id = ?').run(tamSayi(b.id) || 0, e.id);
      denetle(o.user_id, 'ogrenci-ozel-durum-sil', { ogrId: e.id });
      return json(res, 200, { tamam: true }), true;
    }
  } catch (x) {
    if (x instanceof Hata) return hata(x.kod, x.message);
    throw x;
  }
  return false;
}

function seceneklerVer() {
  return {
    secenekler: { yakinlik: YAKINLIK, kanGrubu: KAN, ozelTur: OZEL_TUR, kayitTuru: KAYIT_TURU },
    subeler: db.prepare('SELECT id, name AS ad FROM branches ORDER BY id').all(),
    siniflar: db.prepare('SELECT id, branch_id AS subeId, name AS ad, level AS kademe FROM classes ORDER BY branch_id, level, name').all(),
  };
}
