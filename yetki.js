import { db } from './db.js';

// Yönetim rolleri ve yetkileri. Yönetim oturumunda ne yapılabileceğini kişinin rolleri belirler:
//  - Kurum yönetimi (memberships.gorev = 'kurum') her şeyi yapar; bu sanal roldür.
//  - Müdür / müdür yardımcısı, okul kurulumunda atanır (okul_yoneticileri) ve rol yetkilerini taşır.
//  - Rehber, zümre başkanı, teknik ekip ve yönetimin açtığı diğer roller kullanici_roller ile verilir.
db.exec(`
CREATE TABLE IF NOT EXISTS roller (
  id       INTEGER PRIMARY KEY,
  kod      TEXT UNIQUE,
  ad       TEXT NOT NULL UNIQUE,
  aciklama TEXT NOT NULL DEFAULT '',
  sistem   INTEGER NOT NULL DEFAULT 0,
  yetkiler TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS kullanici_roller (
  user_id INTEGER NOT NULL REFERENCES users(id),
  rol_id  INTEGER NOT NULL REFERENCES roller(id),
  PRIMARY KEY (user_id, rol_id)
);`);

// Yetki kataloğu: grup başlıklarıyla, ekranda gösterilen sırayla
export const KATALOG = [
  { grup: 'Öğrenci', yetkiler: [
    { kod: 'ogrenci-gor', ad: 'Öğrencileri ve dosyalarını görme', aciklama: 'Liste, kayıt bilgileri, gelişim, devam ve sınav durumu' },
    { kod: 'ogrenci-kayit', ad: 'Öğrenci kaydı yapma ve düzenleme', aciklama: 'Yeni kayıt, kayıt bilgileri, veli ve özel durum' },
  ] },
  { grup: 'Sınav', yetkiler: [
    { kod: 'sinav-yonet', ad: 'Sınav açma ve düzenleme', aciklama: 'Deneme, açılış ve yazılı sınavlar, kazanımlar' },
    { kod: 'sinav-optik', ad: 'Öğrenci cevaplarını girme', aciklama: 'Optik, Excel ya da elle cevap girişi' },
    { kod: 'sinav-yayin', ad: 'Sonuçları yayınlama', aciklama: 'Öğrenci ve veli sonucu bu işlemden sonra görür' },
    { kod: 'sinav-sonuc', ad: 'Sınav sonuçlarını görme', aciklama: 'Sınıf ve öğrenci sonuçları' },
  ] },
  { grup: 'Okul işleri', yetkiler: [
    { kod: 'kadro', ad: 'Sınıf, kadro ve ders programı', aciklama: 'Sınıf ve öğretmen atamaları, program, okul takvimi, tatiller, nöbet' },
    { kod: 'duyuru', ad: 'Duyuru yayınlama', aciklama: 'Okul ya da rol bazında duyuru' },
    { kod: 'kulup', ad: 'Kulüp yönetimi', aciklama: 'Kulüp açma, kontenjan ve yerleştirme' },
    { kod: 'gelisim', ad: 'Gelişim raporu yönetimi', aciklama: 'Gözlem başlıkları, dönemler ve rapor' },
    { kod: 'rapor', ad: 'Raporlar', aciklama: 'Kurum ve okul özetleri' },
    { kod: 'teslim-kapi', ad: 'Öğrenci teslim kapısı', aciklama: 'Velinin QR kodunu okutup öğrenciyi teslim etme (kampüs kapısı)' },
  ] },
  { grup: 'Kurum', yetkiler: [
    { kod: 'kurum', ad: 'Okul kurulumu', aciklama: 'Kurum, kampüs, okul, müdür ve yardımcıları (yalnızca kurum yönetimi)', kurum: true },
    { kod: 'kullanici-rol', ad: 'Kullanıcı ve rol yönetimi', aciklama: 'Hesaplar, üyelikler, roller ve yetkiler (yalnızca kurum yönetimi)', kurum: true },
  ] },
];
const TUM = KATALOG.flatMap(g => g.yetkiler);
export const YETKI_KODLARI = TUM.map(y => y.kod);
const KURUMA_OZEL = new Set(TUM.filter(y => y.kurum).map(y => y.kod));
const OKUL_YETKILERI = YETKI_KODLARI.filter(k => !KURUMA_OZEL.has(k));

// Hazır roller: yetkileri ilk kurulumda atanır, sonra kurum yönetimi değiştirebilir
const SISTEM_ROLLERI = [
  { kod: 'kurum-yonetimi', ad: 'Kurum yönetimi', aciklama: 'Her şeyi yapabilir; değiştirilemez', yetkiler: YETKI_KODLARI },
  { kod: 'mudur', ad: 'Müdür', aciklama: 'Okul kurulumunda atanır; okulun tüm işlerini yürütür', yetkiler: OKUL_YETKILERI },
  { kod: 'mudur_yrd', ad: 'Müdür yardımcısı', aciklama: 'Okul kurulumunda atanır; okulun tüm işlerini yürütür', yetkiler: OKUL_YETKILERI },
  { kod: 'rehber', ad: 'Rehber öğretmen', aciklama: 'Öğrenci dosyaları, gelişim ve sınav sonuçları', yetkiler: ['ogrenci-gor', 'gelisim', 'sinav-sonuc', 'rapor'] },
  { kod: 'zumre', ad: 'Zümre başkanı', aciklama: 'Branşının sınavlarını hazırlar, sonuçları ve programı izler', yetkiler: ['sinav-yonet', 'sinav-sonuc', 'ogrenci-gor', 'rapor'] },
  { kod: 'teknik', ad: 'Teknik ekip', aciklama: 'Optik cevap girişi ve veri düzenlemeleri', yetkiler: ['sinav-optik', 'sinav-sonuc', 'ogrenci-gor', 'ogrenci-kayit', 'kadro'] },
  { kod: 'guvenlik', ad: 'Güvenlik', aciklama: 'Kapıda veli QR kodunu okutur, öğrenciyi teslim eder', yetkiler: ['teslim-kapi'] },
];

export function sistemRolleriKur() {
  const ekle = db.prepare('INSERT OR IGNORE INTO roller (kod, ad, aciklama, sistem, yetkiler) VALUES (?,?,?,1,?)');
  for (const r of SISTEM_ROLLERI) ekle.run(r.kod, r.ad, r.aciklama, JSON.stringify(r.yetkiler));
}
sistemRolleriKur();

const satir = r => ({ id: r.id, kod: r.kod, ad: r.ad, aciklama: r.aciklama, sistem: !!r.sistem, yetkiler: JSON.parse(r.yetkiler) });

export function rolBul(kod) {
  const r = db.prepare('SELECT * FROM roller WHERE kod = ?').get(kod);
  return r ? satir(r) : null;
}

// Kişinin yönetim rolleri: açıkça verilenler + okul kurulumundaki müdür/yardımcı görevi + kurum yönetimi
export function kisiRolleri(userId, gorev) {
  const bul = kod => db.prepare('SELECT * FROM roller WHERE kod = ?').get(kod);
  const liste = db.prepare('SELECT r.* FROM kullanici_roller k JOIN roller r ON r.id = k.rol_id WHERE k.user_id = ?').all(userId);
  for (const { gorev: g } of db.prepare('SELECT DISTINCT gorev FROM okul_yoneticileri WHERE user_id = ?').all(userId)) liste.push(bul(g));
  if (gorev === 'kurum') liste.push(bul('kurum-yonetimi'));
  const gorulen = new Set();
  return liste.filter(r => r && !gorulen.has(r.id) && gorulen.add(r.id)).map(satir);
}

// Oturumdaki yönetim kullanıcısının yetki kodları; kuruma özel yetkiler yalnızca kurum yönetiminde kalır
export function etkinYetkiler(o) {
  if (o.role !== 'yonetim') return new Set();
  const kodlar = new Set(kisiRolleri(o.user_id, o.gorev).flatMap(r => r.yetkiler));
  if (o.gorev !== 'kurum') for (const k of KURUMA_OZEL) kodlar.delete(k);
  return kodlar;
}

export const yetkiVar = (o, ...kodlar) => {
  const y = etkinYetkiler(o);
  return kodlar.some(k => y.has(k));
};

// Yol → gereken yetkiler (herhangi biri yeter). Yalnızca yönetim oturumlarına uygulanır;
// burada olmayan yollar için ilgili modül kendi denetimini yapar.
const KURALLAR = [
  [/^\/api\/yonetim\/(kullanici|uyelik|rol)/, ['kullanici-rol']],
  [/^\/api\/yonetim\/(kurum|kampus-|okul-kaydet|okul-sil|yonetici-)/, ['kurum']],
  [/^\/api\/yonetim\/(ogrenci-|veli-|kurulum$)/, ['kadro', 'ogrenci-kayit']],
  [/^\/api\/yonetim\//, ['kadro']],
  [/^\/api\/tatil\//, ['kadro']],
  [/^\/api\/duyuru\//, ['duyuru']],
  [/^\/api\/rapor\//, ['rapor']],
  [/^\/api\/teslim\/kapi\//, ['teslim-kapi']],
  [/^\/api\/kulup\//, ['kulup']],
  [/^\/api\/gelisim\//, ['gelisim']],
  [/^\/api\/kazanim$/, ['sinav-yonet']],
  [/^\/api\/ogrenci\/(liste|kayit|rapor)$/, ['ogrenci-gor']],
  [/^\/api\/ogrenci\//, ['ogrenci-kayit']],
  [/^\/api\/sinav\/ogrenci$/, ['ogrenci-gor', 'sinav-sonuc', 'sinav-yonet']],
  [/^\/api\/sinav\/(liste|detay|secenekler|hazirlik|sonuc)$/, ['sinav-yonet', 'sinav-optik', 'sinav-yayin', 'sinav-sonuc']],
  [/^\/api\/sinav\/cevaplar$/, ['sinav-optik']],
  [/^\/api\/sinav\/puanlar$/, ['sinav-optik', 'sinav-yonet']],
  [/^\/api\/sinav\/yayin$/, ['sinav-yayin']],
  [/^\/api\/sinav\/(olustur|guncelle|aktif|sorular|onay|yazili-kazanim|sil)$/, ['sinav-yonet']],
];

// Yönetim oturumunun bu isteğe yetkisi var mı? Başka rollerin istekleri bu kapıdan etkilenmez.
export function yolYetkisi(o, yol) {
  if (o.role !== 'yonetim') return true;
  if (yol === '/api/yonetim/subeler') return true;
  const kural = KURALLAR.find(([re]) => re.test(yol));
  return !kural || yetkiVar(o, ...kural[1]);
}

// "Müdür · Meltem Ortaokulu" gibi başlıkta gösterilecek rol adları (kurum yönetimi ve müdür görevleri kurum.js'te)
export function ekRolAdlari(userId) {
  return db.prepare(`SELECT r.ad FROM kullanici_roller k JOIN roller r ON r.id = k.rol_id WHERE k.user_id = ? ORDER BY r.ad`).all(userId).map(r => r.ad);
}

export function roller() {
  const kisi = new Map(db.prepare('SELECT rol_id, COUNT(*) AS n FROM kullanici_roller GROUP BY rol_id').all().map(r => [r.rol_id, r.n]));
  const yon = new Map(db.prepare('SELECT gorev, COUNT(*) AS n FROM okul_yoneticileri GROUP BY gorev').all().map(r => [r.gorev, r.n]));
  const kurum = db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM memberships WHERE role = 'yonetim' AND gorev = 'kurum' AND status = 'aktif'").get().n;
  return db.prepare('SELECT * FROM roller ORDER BY sistem DESC, id').all().map(r => {
    const s = satir(r);
    const n = kisi.get(r.id) || 0;
    // Müdür ve yardımcıları okul kurulumunda atandığı için bu rollerde kişi sayısı oradan gelir
    return { ...s, kisi: s.kod === 'kurum-yonetimi' ? kurum : s.kod === 'mudur' || s.kod === 'mudur_yrd' ? yon.get(s.kod) || 0 : n,
      okulAtar: s.kod === 'mudur' || s.kod === 'mudur_yrd', kilitli: s.kod === 'kurum-yonetimi' };
  });
}

const metin = (v, azami) => String(v ?? '').trim().slice(0, azami);

// Rol ve rol atama uçları (yalnızca kullanıcı ve rol yönetimi yetkisi olan kurum yönetimi)
export async function yetkiApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };
  if (req.method === 'GET' && yol === '/api/yonetim/roller') {
    json(res, 200, { roller: roller(), katalog: KATALOG });
    return true;
  }
  if (req.method !== 'POST' || !/^\/api\/yonetim\/(rol-kaydet|rol-sil|kullanici-rol)$/.test(yol)) return false;
  const b = await govde(req);

  if (yol === '/api/yonetim/rol-kaydet') {
    const ad = metin(b.ad, 40);
    if (ad.length < 2) return hata(400, 'Rol adı en az 2 harf olmalı');
    const yetkiler = YETKI_KODLARI.filter(k => Array.isArray(b.yetkiler) && b.yetkiler.includes(k));
    const mevcut = b.id ? db.prepare('SELECT * FROM roller WHERE id = ?').get(Number(b.id)) : null;
    if (b.id && !mevcut) return hata(404, 'Rol bulunamadı');
    if (mevcut?.kod === 'kurum-yonetimi') return hata(403, 'Kurum yönetimi rolü değiştirilemez');
    if (!yetkiler.length) return hata(400, 'En az bir yetki seçin');
    const ayni = db.prepare('SELECT id FROM roller WHERE ad = ? COLLATE NOCASE AND id != ?').get(ad, mevcut?.id ?? 0);
    if (ayni) return hata(409, 'Bu adla başka bir rol var');
    if (mevcut) {
      // Hazır rolün adı sabit kalır; yetkileri ve açıklaması değişir
      db.prepare('UPDATE roller SET ad = ?, aciklama = ?, yetkiler = ? WHERE id = ?')
        .run(mevcut.sistem ? mevcut.ad : ad, metin(b.aciklama, 140), JSON.stringify(yetkiler), mevcut.id);
      denetle(o.user_id, 'rol-guncelle', { rolId: mevcut.id, yetkiler });
      json(res, 200, { tamam: true, id: mevcut.id });
      return true;
    }
    const id = Number(db.prepare('INSERT INTO roller (ad, aciklama, sistem, yetkiler) VALUES (?,?,0,?)').run(ad, metin(b.aciklama, 140), JSON.stringify(yetkiler)).lastInsertRowid);
    denetle(o.user_id, 'rol-ekle', { rolId: id, yetkiler });
    json(res, 201, { tamam: true, id });
    return true;
  }

  if (yol === '/api/yonetim/rol-sil') {
    const r = db.prepare('SELECT * FROM roller WHERE id = ?').get(Number(b.id));
    if (!r) return hata(404, 'Rol bulunamadı');
    if (r.sistem) return hata(403, 'Hazır roller silinemez');
    db.prepare('DELETE FROM kullanici_roller WHERE rol_id = ?').run(r.id);
    db.prepare('DELETE FROM roller WHERE id = ?').run(r.id);
    denetle(o.user_id, 'rol-sil', { rolId: r.id, ad: r.ad });
    json(res, 200, { tamam: true });
    return true;
  }

  // Kişiye rol ver / rolü al. Rol vermek için kişinin aktif bir yönetim üyeliği olmalı; yoksa seçilen okulda açılır.
  const r = db.prepare('SELECT * FROM roller WHERE id = ?').get(Number(b.rolId));
  if (!r) return hata(404, 'Rol bulunamadı');
  if (r.sistem && ['kurum-yonetimi', 'mudur', 'mudur_yrd'].includes(r.kod)) return hata(400, 'Bu rol Okul kurulumu ekranından verilir');
  const kisi = db.prepare('SELECT id FROM users WHERE id = ?').get(Number(b.userId));
  if (!kisi) return hata(404, 'Kullanıcı bulunamadı');
  if (!b.ver) {
    db.prepare('DELETE FROM kullanici_roller WHERE user_id = ? AND rol_id = ?').run(kisi.id, r.id);
    denetle(o.user_id, 'kullanici-rol-al', { userId: kisi.id, rolId: r.id });
    json(res, 200, { tamam: true });
    return true;
  }
  const uyelik = db.prepare("SELECT id FROM memberships WHERE user_id = ? AND role = 'yonetim' AND status = 'aktif'").get(kisi.id);
  if (!uyelik) {
    const sube = db.prepare('SELECT id FROM branches WHERE id = ?').get(Number(b.subeId));
    if (!sube) return hata(400, 'Önce okul seçin');
    db.prepare("INSERT OR IGNORE INTO memberships (user_id, branch_id, role, gorev) VALUES (?,?,'yonetim','okul')").run(kisi.id, sube.id);
    db.prepare("UPDATE memberships SET status = 'aktif' WHERE user_id = ? AND branch_id = ? AND role = 'yonetim'").run(kisi.id, sube.id);
  }
  db.prepare('INSERT OR IGNORE INTO kullanici_roller (user_id, rol_id) VALUES (?,?)').run(kisi.id, r.id);
  denetle(o.user_id, 'kullanici-rol-ver', { userId: kisi.id, rolId: r.id });
  json(res, 200, { tamam: true });
  return true;
}
