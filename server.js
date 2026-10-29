import http from 'node:http';
import fs from 'node:fs';
import { gzipSync } from 'node:zlib';
import { ortam } from './ortam.js';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, tcGecerliMi, seed, okulNoDoldur, FOTO_SQL } from './db.js';
import { fotoApi } from './foto.js';
import { dersProgramiApi } from './ders-programi.js';
import { gorevApi } from './gorev.js';
import { kurulumApi, okulLogoApi } from './kurulum.js';
import { ayarlar as okulAyarlari } from './okul-ayar.js';
import { etutApi } from './etut.js';
import { zumremApi } from './zumrem.js';
import { duyuruApi } from './duyuru.js';
import { teslimApi, teslimBaglantiApi } from './teslim.js';
import { raporApi } from './rapor.js';
import { tatilApi } from './tatil.js';
import { kurumApi, kurumLogoApi, yonetimUnvani, ilkOkulKur } from './kurum.js';
import { yoklamaApi } from './yoklama.js';
import { dersApi } from './ders.js';
import { kazanimApi } from './kazanim.js';
import { sinavApi } from './sinav.js';
import { mufredatApi } from './mufredat.js';
import { ogrencilerimApi } from './ogrencilerim.js';
import { ogrenciApi } from './ogrenci.js';
import { karneApi } from './karne.js';
import { ogrencimApi } from './ogrencim.js';
import { profilApi } from './profil.js';
import { kulupApi } from './kulup.js';
import { gelisimApi } from './gelisim.js';
import { yetkiApi, etkinYetkiler, yolYetkisi, ekRolAdlari } from './yetki.js';
import { odevApi } from './odev.js';
import { yedekZamanla, yedekAl } from './yedek.js';

okulNoDoldur(); // örnek veri sunucudan önce yüklenmiş olabilir

const PORT = Number(process.env.PORT || 3000);
// Gerçek SMS entegrasyonu yokken kod ekranda gösterilir. Canlıda DEV_KOD=0 olmalı.
const DEV_KOD = !ortam.uretim && process.env.DEV_KOD !== '0';
const DEMO_HESAPLAR = {
  yonetim: ['10000000146', '5550000001'],
  ogretmen: ['10000000214', '5550000002'],
  ogrenci: ['10000000382', '5550000003'],
  veli: ['10000000450', '5550000004'],
  rehber: ['10000000696', '5550000006'],
  teknik: ['10000000764', '5550000007'],
  zumre: ['10000000832', '5550000008'],
  guvenlik: ['10000000900', '5550000009'],
};
const ROLLER = ['yonetim', 'ogretmen', 'ogrenci', 'veli'];
const KOD_SURESI = 5 * 60 * 1000;
const OTURUM_SURESI = 8 * 60 * 60 * 1000;
const MAKS_DENEME = 5;

// Modül kayıt defteri: her modül hangi rollere görünür olduğunu burada bildirir.
// Yeni modül eklemek = buraya bir kayıt eklemek (kullanıcı/yetki yapısı ortaktır).
const MODULLER = [
  { id: 'kurum', ad: 'Okul kurulumu', aciklama: 'Kurum profili, kampüsler, okullar, müdür ve müdür yardımcıları', roller: ['yonetim'], yetki: ['kurum'], yol: '/kurum' },
  { id: 'kullanici-rol', ad: 'Kullanıcı ve rol yönetimi', aciklama: 'Hesaplar, üyelikler, roller ve yetkiler', roller: ['yonetim'], yetki: ['kullanici-rol'], yol: '/kullanicilar', kapsam: 'kurum' },
  { id: 'ogrenci-yonetim', ad: 'Öğrenciler', aciklama: 'Öğrenci kaydı, kayıt bilgileri ve her öğrencinin güncel durum dosyası', roller: ['yonetim'], yetki: ['ogrenci-gor'], yol: '/ogrenciler' },
  { id: 'okul-kurulum', ad: 'Sınıf ve kadro', aciklama: 'Ders, öğretmen, öğrenci ve sınıf kayıtları ile atamalar', roller: ['yonetim'], yetki: ['kadro'], yol: '/kurulum' },
  { id: 'okul-takvimi', ad: 'Okul takvimi', aciklama: 'Ders günleri ve ders saatleri (zil saatleri)', roller: ['yonetim'], yetki: ['kadro'], yol: '/okul-takvimi' },
  { id: 'ders-programi-yonetimi', ad: 'Haftalık ders programı', aciklama: 'Sınıf programlarını hazırla, öğretmen programlarını gör', roller: ['yonetim'], yetki: ['kadro'], yol: '/ders-programi' },
  { id: 'duyuru', ad: 'Duyurular', aciklama: 'Okul ya da rol bazında duyuru yayınla, okunma durumunu gör', roller: ['yonetim'], yetki: ['duyuru'], yol: '/duyurular' },
  { id: 'rapor', ad: 'Raporlar', aciklama: 'Kurum ve şube bazlı özetler', roller: ['yonetim'], yetki: ['rapor'], yol: '/raporlar' },
  { id: 'kulup-yonetimi', ad: 'Öğrenci kulüpleri', aciklama: 'Kulüpleri aç, öğretmen ve kontenjan belirle, talepleri yerleştir', roller: ['yonetim'], yetki: ['kulup'], yol: '/kulupler' },
  { id: 'kulup-ogretmen', ad: 'Kulüplerim', aciklama: 'Danışmanı olduğum kulüpler, üyeler ve haftalık çalışmalar', roller: ['ogretmen'], yol: '/kulupler' },
  { id: 'kulup-ogrenci', ad: 'Kulüp', aciklama: 'Kulüp tercihleri ve kulübüm', roller: ['ogrenci', 'veli'], yol: '/kulupler' },
  { id: 'gelisim-yonetim', ad: 'Gelişim raporu', aciklama: 'Gözlem başlıkları ve dönemleri belirle, öğrenci raporunu yazdır', roller: ['yonetim'], yetki: ['gelisim'], yol: '/gelisim' },
  { id: 'gelisim-ogretmen', ad: 'Gelişim gözlemleri', aciklama: 'Dönem geldiğinde öğrencilerim için gözlem gir, önceki girişleri takip et', roller: ['ogretmen'], yol: '/gelisim' },
  { id: 'etut', ad: 'Etüt', aciklama: 'Etüt aç, veli katılım onayını takip et', roller: ['ogretmen'], yol: '/etut' },
  { id: 'zumrem', ad: 'Zümrem', aciklama: 'Zümre öğretmenleri, rutin toplantılar ve zümre yazışmaları', roller: ['ogretmen'], yol: '/zumrem' },
  { id: 'etut-ogrenci', ad: 'Etütlerim', aciklama: 'Davet edildiğim etütler', roller: ['ogrenci'], yol: '/etut' },
  { id: 'etut-veli', ad: 'Etüt onayları', aciklama: 'Çocuğumun etütlerine gelecek / gelmeyecek bildir', roller: ['veli'], yol: '/etut' },
  { id: 'ogrencilerim', ad: 'Öğrencilerim', aciklama: 'Mentor olduğum sınıfın öğrencileri ve profilleri', roller: ['ogretmen'], yol: '/ogrencilerim' },
  { id: 'derslerim', ad: 'Derslerim', aciklama: 'Günlük program; devamsızlık, konu ve ödev işlemleri', roller: ['ogretmen'], yol: '/derslerim' },
  { id: 'odev-takip', ad: 'Ödevler', aciklama: 'Verilen ödevler ve son tarihleri', roller: ['ogrenci', 'veli'], yol: '/odevler' },
  { id: 'odev-takip-ogretmen', ad: 'Ödev takibi', aciklama: 'Ödevleri kimin yaptığını gör, doğrula, öğrenci sorularını yanıtla', roller: ['ogretmen'], yol: '/odev-takip' },
  { id: 'not-girisi', ad: 'Sınavlar', aciklama: 'Dersinizin sınavlarında cevap anahtarı ve kazanımları hazırla, yazılı puanlarını gir, sonuçları incele', roller: ['ogretmen'], yol: '/sinav' },
  { id: 'sinav-yonetim', ad: 'Sınavlar', aciklama: 'Deneme, açılış ve yazılı sınavları oluştur, öğrenci cevaplarını gir, sonuçları yayınla', roller: ['yonetim'], yetki: ['sinav-yonet', 'sinav-optik', 'sinav-yayin', 'sinav-sonuc'], yol: '/sinav' },
  { id: 'veli-bilgilendirme', ad: 'Veli bilgilendirme', aciklama: 'Sınıfın ya da bir öğrencinin velisine mesaj gönder', roller: ['ogretmen'], yol: '/duyurular?sekme=mesaj' },
  { id: 'duyurular-ogretmen', ad: 'Duyurular', aciklama: 'Okuldan gelen duyurular', roller: ['ogretmen'], yol: '/duyurular' },
  { id: 'ders-programi', ad: 'Ders programı', aciklama: 'Haftalık ders çizelgesi, işlenen konular ve ödevler', roller: ['ogrenci', 'veli'], yol: '/program' },
  { id: 'notlarim', ad: 'Sınav sonuçlarım', aciklama: 'Yayınlanan sınav sonuçları', roller: ['ogrenci', 'veli'], yol: '/notlarim' },
  { id: 'duyurular', ad: 'Duyurular', aciklama: 'Okuldan gelen duyurular ve öğretmen mesajları', roller: ['ogrenci', 'veli'], yol: '/duyurular' },
  { id: 'ogrencim', ad: 'Öğrencim', aciklama: 'Çocuğumun bilgileri ve durumu', roller: ['veli'], yol: '/ogrencim' },
  { id: 'devamsizlik-veli', ad: 'Devamsızlık', aciklama: 'Çocuğumun ders devamsızlıkları', roller: ['veli'], yol: '/devamsizlik' },
  { id: 'devamsizlik-ogrenci', ad: 'Devamsızlığım', aciklama: 'Ders devam durumum', roller: ['ogrenci'], yol: '/devamsizlik' },
  { id: 'teslim', ad: 'Teslim yetkileri', aciklama: 'Öğrenciyi teslim alabilecek kişiler', roller: ['veli'], yol: '/teslim' },
  { id: 'teslim-kodu', ad: 'Teslim kodu', aciklama: 'Çocuğumu almak için güvenliğe gösterilecek QR kod', roller: ['veli'], yol: '/teslim-kodu' },
  { id: 'teslim-kapi', ad: 'Teslim kapısı', aciklama: 'Veli QR kodunu okut, öğrenciyi teslim et', roller: ['yonetim'], yetki: ['teslim-kapi'], yol: '/teslim-kapi' },
];

const dir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(dir, 'public');

const ilkSeed = seed();
if (ilkSeed) {
  console.log('Demo kullanıcılar oluşturuldu (kimlik no / telefon):');
  console.table(ilkSeed);
}

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const telNormalize = t => String(t || '').replace(/\D/g, '').slice(-10);

// Basit hız sınırı: IP başına dakikada 20 istek (giriş uçları için)
const hizSayac = new Map();
// Hatalı giriş koruması: aynı kimlik + aynı IP'den 5, aynı kimlikten (tüm IP'ler) 30 hatalı denemede 15 dk kilit
const HATALI = new Map();
const KILIT_SURESI = 15 * 60 * 1000;
function hataKaydet(anahtar) {
  const simdi = Date.now(), k = HATALI.get(anahtar);
  if (!k || simdi - k.ilk > KILIT_SURESI) HATALI.set(anahtar, { n: 1, ilk: simdi });
  else k.n++;
  if (HATALI.size > 20000) for (const [a, v] of HATALI) { if (simdi - v.ilk > KILIT_SURESI) HATALI.delete(a); }
}
function kilitliMi(kimlik, ip) {
  const simdi = Date.now();
  const sinir = (a, n) => { const k = HATALI.get(a); return k && simdi - k.ilk <= KILIT_SURESI && k.n >= n; };
  return sinir(`${kimlik}|${ip}`, 5) || sinir(kimlik, 30);
}

function hizAsildi(ip) {
  const simdi = Date.now();
  const k = hizSayac.get(ip) || [];
  const taze = k.filter(t => simdi - t < 60_000);
  taze.push(simdi);
  hizSayac.set(ip, taze);
  return taze.length > 20;
}

function json(res, kod, veri, basliklar = {}) {
  res.writeHead(kod, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...basliklar });
  res.end(JSON.stringify(veri));
}

function govde(req, sinir = 10_000) {
  return new Promise((resolve, reject) => {
    let ham = '';
    req.on('data', c => { ham += c; if (ham.length > sinir) { reject(new Error('buyuk')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(ham || '{}')); } catch { reject(new Error('json')); } });
  });
}

function cerezler(req) {
  const c = {};
  for (const p of (req.headers.cookie || '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0) c[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  }
  return c;
}

function oturum(req) {
  const sid = cerezler(req).sid;
  if (!sid) return null;
  const o = db.prepare(`
    SELECT s.id, s.expires_at, u.id AS user_id, u.full_name, m.id AS membership_id, m.role, m.gorev, b.name AS branch
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN memberships m ON m.id = s.membership_id AND m.status = 'aktif'
    LEFT JOIN branches b ON b.id = m.branch_id
    WHERE s.id = ?`).get(sha(sid));
  if (!o || o.expires_at < Date.now()) return null;
  return o;
}

// Bir üyeliğin (profilin) görünen başlığı ve rengi
function profilBilgisi(m) {
  let unvan = { yonetim: 'Okul yönetimi', veli: 'Veli', ogretmen: 'Öğretmen', ogrenci: 'Öğrenci' }[m.role] || '';
  let renk = null;
  if (m.role === 'yonetim') unvan = yonetimUnvani(m.id);
  else if (m.role === 'ogretmen') {
    // Asıl branş: en çok sınıfa girilen ders; yoksa verebildiği dersler
    let d = db.prepare(`SELECT c.name, c.renk FROM assignments a JOIN courses c ON c.id = a.course_id
      WHERE a.teacher_membership_id = ? GROUP BY c.id ORDER BY COUNT(*) DESC, c.name`).all(m.id);
    if (!d.length) d = db.prepare(`SELECT c.name, c.renk FROM teacher_courses t JOIN courses c ON c.id = t.course_id
      WHERE t.teacher_membership_id = ? ORDER BY c.name`).all(m.id);
    if (d.length) { unvan = d[0].name + ' öğretmeni'; renk = d[0].renk || null; }
    // Zümre başkanı ayrı profil değildir; öğretmen ekranında unvana eklenir
    const uid = db.prepare('SELECT user_id FROM memberships WHERE id = ?').get(m.id)?.user_id;
    if (uid && ekRolAdlari(uid).includes('Zümre başkanı')) unvan += ' · Zümre başkanı';
  } else if (m.role === 'ogrenci') {
    const c = db.prepare('SELECT c.name FROM class_students cs JOIN classes c ON c.id = cs.class_id WHERE cs.student_membership_id = ?').get(m.id);
    if (c) unvan = c.name + ' sınıfı öğrencisi';
  } else if (m.role === 'veli') {
    const cocuklar = db.prepare(`SELECT u.full_name FROM guardians g JOIN memberships sm ON sm.id = g.student_membership_id
      JOIN users u ON u.id = sm.user_id WHERE g.parent_membership_id = ? ORDER BY u.full_name`).all(m.id).map(r => r.full_name);
    if (cocuklar.length) unvan = cocuklar.join(', ') + ' velisi';
  }
  return { unvan, renk };
}

// Bir kullanıcının tüm aktif profilleri (yönetim, öğretmen, veli, öğrenci)
function profilListesi(userId) {
  const satirlar = db.prepare(`SELECT m.id, m.role, b.name AS sube FROM memberships m LEFT JOIN branches b ON b.id = m.branch_id
    WHERE m.user_id = ? AND m.status = 'aktif'
    ORDER BY CASE m.role WHEN 'yonetim' THEN 0 WHEN 'ogretmen' THEN 1 WHEN 'veli' THEN 2 ELSE 3 END, m.id`).all(userId);
  return satirlar.map(m => ({ id: m.id, rol: m.role, sube: m.sube, ...profilBilgisi(m) }));
}

function kullaniciBul(kimlik) {
  const k = String(kimlik || '').trim().toUpperCase();
  if (/^\d{11}$/.test(k)) {
    if (!tcGecerliMi(k)) return null;
    return db.prepare('SELECT * FROM users WHERE tc_no = gz(?)').get(k);
  }
  if (/^[A-Z0-9]{5,20}$/.test(k)) return db.prepare('SELECT * FROM users WHERE passport_no = gz(?)').get(k);
  return null;
}

// Kullanıcı + telefon + rol üçlüsünü doğrular; uygun üyelikleri döndürür.
function yetkiliUyelikler(kullanici, telefon, rol) {
  if (!kullanici || kullanici.phone !== telNormalize(telefon)) return [];
  return db.prepare("SELECT id FROM memberships WHERE user_id = ? AND role = ? AND status = 'aktif'")
    .all(kullanici.id, rol);
}

// Tünel/ters vekil yerel adresten bağlanır; yalnızca o durumda vekilin bildirdiği gerçek istemci IP'sine güvenilir
function istemciIp(req) {
  const adr = req.socket.remoteAddress || '?';
  if (/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(adr)) {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf) return cf.trim();
  }
  return adr;
}

// HTTPS üzerinden gelen isteklerde çerez yalnızca şifreli bağlantıda gönderilir
function cerezSid(req, sid) {
  const guvenli = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `sid=${sid}; Path=/; HttpOnly; SameSite=Strict${guvenli}; Max-Age=${OTURUM_SURESI / 1000}`;
}

async function api(req, res, url) {
  const ip = istemciIp(req);

  // Hesapsız teslim yetkilisinin özel bağlantısı (veli iptal edene kadar geçerli)
  if (url.pathname.startsWith('/api/teslim/k/') && await teslimBaglantiApi({ req, res, url, json, govde, denetle })) return;

  // Yönetim oturumları yalnızca rollerinin yetkisi olan uçlara girebilir
  if (cerezler(req).sid) {
    const oo = oturum(req);
    if (oo && !yolYetkisi(oo, url.pathname)) return json(res, 403, { hata: 'Bu işlem için yetkiniz yok' });
  }

  if (req.method === 'GET' && url.pathname === '/api/ben') {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    const { unvan, renk } = profilBilgisi({ id: o.membership_id, role: o.role });
    const coklu = profilListesi(o.user_id).length > 1;
    const foto = db.prepare(`SELECT ${FOTO_SQL} AS foto FROM users u WHERE u.id = ?`).get(o.user_id)?.foto || null;
    const kurum = db.prepare('SELECT ad, EXISTS (SELECT 1 FROM kurum_logo WHERE id = 1) AS logo FROM kurum WHERE id = 1').get();
    return json(res, 200, { ad: o.full_name, rol: o.role, sube: o.branch, unvan, renk, coklu, foto, yetkiler: [...etkinYetkiler(o)], kurum: { ad: kurum?.ad || '', logo: !!kurum?.logo } });
  }

  // Okul takvimi (ders günleri ve saatleri): her rol okuyabilir, yalnızca yönetim değiştirir
  if (req.method === 'GET' && url.pathname === '/api/okul/ayar') {
    if (!oturum(req)) return json(res, 401, { hata: 'Oturum yok' });
    return json(res, 200, okulAyarlari());
  }

  if (req.method === 'GET' && url.pathname === '/api/moduller') {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    // Filtreleme sunucuda yapılır; istemci rol bildiremez.
    const yetkiler = etkinYetkiler(o);
    const liste = MODULLER.filter(m => m.roller.includes(o.role) && (!m.kapsam || m.kapsam === o.gorev) && (!m.yetki || o.role !== 'yonetim' || m.yetki.some(k => yetkiler.has(k))))
      .map(({ id, ad, aciklama, yol }) => ({ id, ad, aciklama, yol, durum: yol ? 'hazir' : 'yakinda' }));
    return json(res, 200, { rol: o.role, moduller: liste });
  }

  if (req.method === 'POST' && url.pathname === '/api/cikis') {
    const sid = cerezler(req).sid;
    if (sid) db.prepare('DELETE FROM sessions WHERE id = ?').run(sha(sid));
    return json(res, 200, { tamam: true }, { 'Set-Cookie': 'sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
  }

  // Giriş ekranı ayarı: demo kısayolları yalnızca test aşamasında görünür
  if (req.method === 'GET' && url.pathname === '/api/giris/ayar') return json(res, 200, { demo: !!DEV_KOD, kodsuz: ortam.kodsuzGiris, kurulumGerek: db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0 });

  // Yalnızca test aşaması (DEV_KOD açıkken): demo hesapla doğrudan giriş.
  // rol: yonetim/ogretmen/ogrenci/veli veya 'coklu' (birden çok profili olan hesap)
  if (req.method === 'POST' && url.pathname === '/api/giris/demo') {
    if (!DEV_KOD) return json(res, 404, { hata: 'Bulunamadı' });
    const b = await govde(req);
    let kullanici, uyelikler;
    if (b.rol === 'coklu') {
      kullanici = db.prepare('SELECT * FROM users WHERE phone = gz(?) AND full_name = ?').get(telNormalize('5550000005'), 'Demo Öğretmen-Veli');
      uyelikler = kullanici ? profilListesi(kullanici.id) : [];
    } else {
      const demo = DEMO_HESAPLAR[b.rol];
      if (!demo) return json(res, 400, { hata: 'Geçersiz giriş türü' });
      kullanici = kullaniciBul(demo[0]);
      uyelikler = yetkiliUyelikler(kullanici, demo[1], ['rehber', 'teknik', 'guvenlik'].includes(b.rol) ? 'yonetim' : b.rol === 'zumre' ? 'ogretmen' : b.rol);
    }
    if (!uyelikler.length) return json(res, 404, { hata: 'Demo hesap bulunamadı' });
    const sid = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (id, user_id, membership_id, expires_at) VALUES (?,?,?,?)')
      .run(sha(sid), kullanici.id, uyelikler[0].id, Date.now() + OTURUM_SURESI);
    return json(res, 200, { tamam: true, coklu: uyelikler.length > 1 }, {
      'Set-Cookie': cerezSid(req, sid),
    });
  }

  // Boş sistemde ilk üyelik: okulu ve ilk yöneticiyi kurar, sonra bu uç kapanır
  if (req.method === 'POST' && url.pathname === '/api/giris/ilk-kurulum') {
    if (hizAsildi(ip)) return json(res, 429, { hata: 'Çok fazla deneme. Lütfen biraz bekleyin.' });
    const b = await govde(req);
    const s = ilkOkulKur({ ad: b.ad, tc: b.tc, telefon: b.telefon, okul: b.okul });
    if (s.hata) return json(res, s.durum || 400, { hata: s.hata });
    const uye = db.prepare("SELECT id FROM memberships WHERE user_id = ? AND role = 'yonetim'").get(s.kullaniciId);
    denetle(s.kullaniciId, 'ilk-kurulum', { ip });
    const sid = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (id, user_id, membership_id, expires_at) VALUES (?,?,?,?)')
      .run(sha(sid), s.kullaniciId, uye.id, Date.now() + OTURUM_SURESI);
    return json(res, 200, { tamam: true, coklu: false }, { 'Set-Cookie': cerezSid(req, sid) });
  }

  if (req.method === 'POST' && (url.pathname === '/api/giris/kod' || url.pathname === '/api/giris/dogrula')) {
    if (hizAsildi(ip)) return json(res, 429, { hata: 'Çok fazla deneme. Lütfen biraz bekleyin.' });
    const b = await govde(req);
    const kullanici = kullaniciBul(b.kimlik);
    const dogru = kullanici && kullanici.phone === telNormalize(b.telefon);
    const uyelikler = dogru ? profilListesi(kullanici.id) : [];

    if (url.pathname === '/api/giris/kod') {
      // Kullanıcı var/yok bilgisi sızdırılmaz: yanıt her durumda aynıdır.
      const yanit = { mesaj: 'Bilgiler doğruysa telefonunuza doğrulama kodu gönderildi.' };
      if (uyelikler.length) {
        const kod = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
        db.prepare('UPDATE otps SET used = 1 WHERE user_id = ?').run(kullanici.id);
        db.prepare('INSERT INTO otps (user_id, role, code_hash, expires_at) VALUES (?,?,?,?)')
          .run(kullanici.id, '*', sha(kod), Date.now() + KOD_SURESI);
        console.log(`[DOĞRULAMA KODU] ${kullanici.full_name}: ${kod}`);
        if (DEV_KOD) yanit.gelistiriciKodu = kod;
      }
      return json(res, 200, yanit);
    }

    // /api/giris/dogrula
    const hata = { hata: ortam.kodsuzGiris ? 'Bilgiler hatalı' : 'Bilgiler veya kod hatalı' };
    const kimlikAnahtar = String(b.kimlik || '').trim().toUpperCase().slice(0, 20);
    if (kilitliMi(kimlikAnahtar, ip)) return json(res, 429, { hata: 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.' });
    const basarisiz = () => { hataKaydet(`${kimlikAnahtar}|${ip}`); hataKaydet(kimlikAnahtar); return json(res, 401, hata); };
    if (!uyelikler.length) return basarisiz();
    if (!ortam.kodsuzGiris) {
      const otp = db.prepare('SELECT * FROM otps WHERE user_id = ? AND used = 0 ORDER BY id DESC LIMIT 1').get(kullanici.id);
      if (!otp || otp.expires_at < Date.now() || otp.attempts >= MAKS_DENEME) return basarisiz();
      db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE id = ?').run(otp.id);
      const gelen = Buffer.from(sha(String(b.kod || '')));
      const beklenen = Buffer.from(otp.code_hash);
      if (!crypto.timingSafeEqual(gelen, beklenen)) return basarisiz();
      db.prepare('UPDATE otps SET used = 1 WHERE id = ?').run(otp.id);
    }
    HATALI.delete(`${kimlikAnahtar}|${ip}`);
    denetle(kullanici.id, 'giris', { ip, yontem: ortam.kodsuzGiris ? 'kimlik+telefon' : 'sms' });
    const sid = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (id, user_id, membership_id, expires_at) VALUES (?,?,?,?)')
      .run(sha(sid), kullanici.id, uyelikler[0].id, Date.now() + OTURUM_SURESI);
    return json(res, 200, { tamam: true, coklu: uyelikler.length > 1 }, {
      'Set-Cookie': cerezSid(req, sid),
    });
  }

  // Aynı hesabın birden fazla profili varsa listele ve seçtir
  if (req.method === 'GET' && url.pathname === '/api/profiller') {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    return json(res, 200, { aktif: o.membership_id, profiller: profilListesi(o.user_id) });
  }
  if (req.method === 'POST' && url.pathname === '/api/profil/sec') {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    const b = await govde(req);
    const p = profilListesi(o.user_id).find(x => x.id === Number(b.id));
    if (!p) return json(res, 404, { hata: 'Profil bulunamadı' });
    db.prepare('UPDATE sessions SET membership_id = ? WHERE id = ?').run(p.id, o.id);
    return json(res, 200, { tamam: true });
  }

  if (url.pathname === '/api/profil/bilgi' || url.pathname === '/api/profil/kaydet' || url.pathname === '/api/profil/ad') {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await profilApi({ req, res, url, o, json, govde, denetle })) return;
  }

  if (url.pathname.startsWith('/api/kulup/')) {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await kulupApi({ req, res, url, o, json, govde, denetle })) return;
  }

  if (url.pathname.startsWith('/api/gelisim/')) {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await gelisimApi({ req, res, url, o, json, govde, denetle })) return;
  }

  if (url.pathname === '/api/foto' || url.pathname === '/api/foto-sil') {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await fotoApi({ req, res, url, o, json, denetle })) return;
  }

  if (req.method === 'GET' && url.pathname === '/api/kurum-logo') {
    if (!oturum(req)) return json(res, 401, { hata: 'Oturum yok' });
    return kurumLogoApi({ res, json });
  }

  if (url.pathname === '/api/okul-logo' || url.pathname === '/api/okul-logo-sil') {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await okulLogoApi({ req, res, url, o, json, denetle })) return;
  }

  if (url.pathname.startsWith('/api/odev/')) {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await odevApi({ req, res, url, o, json, govde, denetle })) return;
  }

  if (url.pathname.startsWith('/api/yonetim/')) return await yonetimApi(req, res, url);

  if (url.pathname.startsWith('/api/tatil/')) {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await tatilApi({ req, res, url, o, json, govde, denetle })) return;
  }

  if (url.pathname.startsWith('/api/rapor/')) {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await raporApi({ req, res, url, o, json })) return;
  }

  if (url.pathname.startsWith('/api/teslim/')) {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await teslimApi({ req, res, url, o, json, govde, denetle })) return;
  }

  if (url.pathname.startsWith('/api/duyuru/')) {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await duyuruApi({ req, res, url, o, json, govde, denetle })) return;
  }

  if (url.pathname.startsWith('/api/zumre/')) {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await zumremApi({ req, res, url, o, json, govde, denetle })) return;
  }

  if (url.pathname.startsWith('/api/etut/')) {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await etutApi({ req, res, url, o, json, govde, denetle })) return;
  }

  if (url.pathname.startsWith('/api/yoklama/')) {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await yoklamaApi({ req, res, url, o, json, govde, denetle })) return;
  }

  if (url.pathname === '/api/kazanim') {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (o.role !== 'ogretmen' && o.role !== 'yonetim') return json(res, 403, { hata: 'Yetkiniz yok' });
    if (await kazanimApi({ req, res, url, o, json })) return;
  }

  if (url.pathname.startsWith('/api/sinav/')) {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await sinavApi({ req, res, url, o, json, govde: r => govde(r, 1_000_000), denetle })) return;
  }

  if (url.pathname.startsWith('/api/mufredat/')) {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await mufredatApi({ req, res, url, o, json, govde: r => govde(r, 100_000) })) return;
  }

  if (url.pathname === '/api/ogrencim') {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await ogrencimApi({ req, res, url, o, json })) return;
  }

  if (url.pathname.startsWith('/api/ogrenci/')) {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await ogrenciApi({ req, res, url, o, json, govde, denetle })) return;
  }

  if (url.pathname === '/api/karne') {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await karneApi({ req, res, url, o, json })) return;
  }

  if (url.pathname.startsWith('/api/ogrencilerim')) {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await ogrencilerimApi({ req, res, url, o, json })) return;
  }

  if (url.pathname.startsWith('/api/ders/')) {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    if (await dersApi({ req, res, url, o, json, govde, denetle })) return;
  }

  json(res, 404, { hata: 'Bulunamadı' });
}

// ---- Yönetim: kullanıcı ve üyelik işlemleri (yalnızca "yonetim" rolü) ----
function denetle(aktor, islem, detay) {
  db.prepare('INSERT INTO audit_log (at, actor_id, action, detail) VALUES (?,?,?,?)')
    .run(Date.now(), aktor, islem, JSON.stringify(detay));
}

async function yonetimApi(req, res, url) {
  const o = oturum(req);
  if (!o) return json(res, 401, { hata: 'Oturum yok' });
  if (o.role !== 'yonetim') return json(res, 403, { hata: 'Bu işlem için yetkiniz yok' });
  const yol = url.pathname;

  // Hesap, üyelik ve kampüs/okul tanımı yalnızca kurum yönetimine açıktır; okul yönetimi kendi okulunun işlerini yürütür
  if (o.gorev !== 'kurum' && req.method === 'POST' && yol.startsWith('/api/yonetim/') && /^(kullanici-|uyelik-|rol-|kampus-|okul-kaydet|okul-sil)/.test(yol.slice(13))) {
    return json(res, 403, { hata: 'Bu işlem yalnızca kurum yönetimine açıktır' });
  }

  const ortak = { req, res, url, o, json, govde, denetle };
  if (await yetkiApi(ortak)) return;
  if (await kurumApi(ortak)) return;
  if (await kurulumApi(ortak)) return;
  if (await dersProgramiApi(ortak)) return;
  if (await gorevApi(ortak)) return;

  // Okulun kendi bilgisayarına indirebileceği yedek: sıkıştırılmış tam veritabanı (kişisel alanlar şifreli, oturumlar çıkarılmış)
  if (req.method === 'GET' && yol === '/api/yonetim/yedek-indir') {
    if (o.gorev !== 'kurum') return json(res, 403, { hata: 'Bu işlem yalnızca kurum yönetimine açıktır' });
    const y = yedekAl();
    denetle(o.user_id, 'yedek-indir', { dosya: path.basename(y.dosya) });
    const veri = gzipSync(fs.readFileSync(y.dosya));
    res.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="${path.basename(y.dosya)}.gz"`, 'Content-Length': veri.length, 'Cache-Control': 'no-store' });
    return res.end(veri);
  }

  if (req.method === 'GET' && yol === '/api/yonetim/subeler') {
    return json(res, 200, {
      subeler: db.prepare('SELECT id, name AS ad, campus_id AS kampusId FROM branches ORDER BY id').all(),
      kampusler: db.prepare('SELECT id, name AS ad FROM kampusler ORDER BY id').all(),
    });
  }

  if (req.method === 'GET' && yol === '/api/yonetim/kullanicilar') {
    const kullanicilar = db.prepare(`SELECT u.id, u.tc_no, u.passport_no, u.phone, u.full_name, ${FOTO_SQL} AS foto FROM users u ORDER BY u.full_name`).all();
    const uyelikler = db.prepare(`SELECT m.id, m.user_id, m.role, m.status, m.gorev, m.branch_id, b.name AS branch
                                  FROM memberships m LEFT JOIN branches b ON b.id = m.branch_id`).all();
    const atananlar = db.prepare('SELECT user_id, rol_id FROM kullanici_roller').all();
    const mudurler = db.prepare('SELECT y.user_id, y.gorev, b.name AS okul FROM okul_yoneticileri y JOIN branches b ON b.id = y.branch_id').all();
    const maske = (s, bas, son) => s ? s.slice(0, bas) + '•'.repeat(Math.max(s.length - bas - son, 0)) + s.slice(-son) : '';
    return json(res, 200, {
      kullanicilar: kullanicilar.map(u => ({
        id: u.id,
        ad: u.full_name,
        foto: u.foto,
        kimlik: maske(u.tc_no || u.passport_no, 3, 2),
        kimlikTuru: u.tc_no ? 'T.C.' : 'Pasaport',
        telefon: maske(u.phone, 3, 2),
        uyelikler: uyelikler.filter(m => m.user_id === u.id)
          .map(m => ({ id: m.id, rol: m.role, durum: m.status, gorev: m.gorev, subeId: m.branch_id, sube: m.branch })),
        roller: atananlar.filter(r => r.user_id === u.id).map(r => r.rol_id),
        okulGorevleri: mudurler.filter(r => r.user_id === u.id).map(r => ({ gorev: r.gorev, okul: r.okul })),
      })),
    });
  }

  if (req.method !== 'POST') return json(res, 404, { hata: 'Bulunamadı' });
  const b = await govde(req);
  const subeVar = id => db.prepare('SELECT 1 FROM branches WHERE id = ?').get(Number(id));

  if (yol === '/api/yonetim/kullanici-ekle') {
    const ad = String(b.ad || '').trim();
    const kimlik = String(b.kimlik || '').trim().toUpperCase();
    const tel = telNormalize(b.telefon);
    const tcMi = /^\d{11}$/.test(kimlik);
    if (ad.length < 3 || ad.length > 80) return json(res, 400, { hata: 'Ad soyad geçersiz' });
    if (tcMi ? !tcGecerliMi(kimlik) : !/^[A-Z0-9]{5,20}$/.test(kimlik)) return json(res, 400, { hata: 'Kimlik / pasaport numarası geçersiz' });
    if (!/^\d{10}$/.test(tel)) return json(res, 400, { hata: 'Telefon 10 haneli olmalı' });
    if (!ROLLER.includes(b.rol)) return json(res, 400, { hata: 'Geçersiz rol' });
    if (!subeVar(b.subeId)) return json(res, 400, { hata: 'Geçersiz şube' });
    const var_ = db.prepare('SELECT 1 FROM users WHERE tc_no = gz(?) OR passport_no = gz(?)').get(kimlik, kimlik);
    if (var_) return json(res, 409, { hata: 'Bu kimlik numarası ile kayıtlı hesap zaten var' });
    const id = Number(db.prepare('INSERT INTO users (tc_no, passport_no, phone, full_name, created_at) VALUES (?,?,?,?,?)')
      .run(tcMi ? kimlik : null, tcMi ? null : kimlik, tel, ad, Date.now()).lastInsertRowid);
    db.prepare("INSERT INTO memberships (user_id, branch_id, role, gorev) VALUES (?,?,?,'okul')").run(id, Number(b.subeId), b.rol);
    const rol = b.rol === 'yonetim' && b.rolId ? db.prepare('SELECT id, kod FROM roller WHERE id = ?').get(Number(b.rolId)) : null;
    if (rol && !['kurum-yonetimi', 'mudur', 'mudur_yrd'].includes(rol.kod)) db.prepare('INSERT OR IGNORE INTO kullanici_roller (user_id, rol_id) VALUES (?,?)').run(id, rol.id);
    denetle(o.user_id, 'kullanici-ekle', { userId: id, rol: b.rol, subeId: Number(b.subeId) });
    return json(res, 201, { tamam: true, id });
  }

  if (yol === '/api/yonetim/kullanici-ad') {
    const ad = String(b.ad || '').replace(/\s+/g, ' ').trim();
    if (ad.length < 3 || ad.length > 80 || !ad.includes(' ')) return json(res, 400, { hata: 'Ad ve soyadı birlikte yazın' });
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(Number(b.userId))) return json(res, 404, { hata: 'Kullanıcı bulunamadı' });
    db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(ad, Number(b.userId));
    denetle(o.user_id, 'kullanici-ad', { userId: Number(b.userId) });
    return json(res, 200, { tamam: true });
  }

  if (yol === '/api/yonetim/uyelik-ekle') {
    if (!ROLLER.includes(b.rol)) return json(res, 400, { hata: 'Geçersiz rol' });
    if (!subeVar(b.subeId)) return json(res, 400, { hata: 'Geçersiz şube' });
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(Number(b.userId))) return json(res, 400, { hata: 'Kullanıcı bulunamadı' });
    const mevcut = db.prepare('SELECT id FROM memberships WHERE user_id = ? AND branch_id = ? AND role = ?')
      .get(Number(b.userId), Number(b.subeId), b.rol);
    if (mevcut) return json(res, 409, { hata: 'Bu üyelik zaten var' });
    db.prepare("INSERT INTO memberships (user_id, branch_id, role, gorev) VALUES (?,?,?,'okul')").run(Number(b.userId), Number(b.subeId), b.rol);
    denetle(o.user_id, 'uyelik-ekle', { userId: Number(b.userId), rol: b.rol, subeId: Number(b.subeId) });
    return json(res, 201, { tamam: true });
  }

  if (yol === '/api/yonetim/uyelik-durum') {
    if (!['aktif', 'pasif'].includes(b.durum)) return json(res, 400, { hata: 'Geçersiz durum' });
    const m = db.prepare('SELECT id, user_id, role, gorev FROM memberships WHERE id = ?').get(Number(b.uyelikId));
    if (!m) return json(res, 404, { hata: 'Üyelik bulunamadı' });
    // Kilitlenmeyi önle: kurumda en az bir aktif yönetim üyeliği kalmalı.
    if (b.durum === 'pasif' && m.role === 'yonetim' && m.gorev === 'kurum') {
      const kalan = db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE role = 'yonetim' AND gorev = 'kurum' AND status = 'aktif' AND id != ?").get(m.id).n;
      if (kalan === 0) return json(res, 409, { hata: 'Son aktif kurum yönetimi üyeliği pasifleştirilemez' });
    }
    db.prepare('UPDATE memberships SET status = ? WHERE id = ?').run(b.durum, m.id);
    if (b.durum === 'pasif') db.prepare('DELETE FROM sessions WHERE membership_id = ?').run(m.id);
    denetle(o.user_id, 'uyelik-durum', { uyelikId: m.id, durum: b.durum });
    return json(res, 200, { tamam: true });
  }

  json(res, 404, { hata: 'Bulunamadı' });
}

const turler = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png' };

function statik(req, res, url) {
  let ad = url.pathname === '/' ? '/index.html' : url.pathname;
  if (ad === '/panel') ad = '/panel.html';
  if (ad === '/kullanicilar') ad = '/kullanicilar.html';
  if (ad === '/ders-programi') ad = '/ders-programi.html';
  if (ad === '/kurulum') ad = '/kurulum.html';
  if (ad === '/kurum') ad = '/kurum.html';
  if (ad === '/okul-takvimi') ad = '/okul-takvimi.html';
  if (ad === '/etut') ad = '/etut.html';
  if (ad === '/zumrem') ad = '/zumrem.html';
  if (ad === '/duyurular') ad = '/duyurular.html';
  if (ad === '/kulupler') ad = '/kulupler.html';
  if (ad === '/gelisim') ad = '/gelisim.html';
  if (ad === '/yoklama') { res.writeHead(302, { Location: '/derslerim' + url.search }); res.end(); return; }
  if (ad === '/devamsizlik') ad = '/devamsizlik.html';
  if (ad === '/derslerim') ad = '/derslerim.html';
  if (ad === '/program') ad = '/program.html';
  if (ad === '/odevler') ad = '/odevler.html';
  if (ad === '/odev-takip') ad = '/odev-takip.html';
  if (ad === '/ogrencilerim') ad = '/ogrencilerim.html';
  if (ad === '/ogrenciler') ad = '/ogrenciler.html';
  if (ad === '/ogrenci-kayit') ad = '/ogrenci-kayit.html';
  if (ad === '/ogrenci-dosyasi') ad = '/ogrenci-dosyasi.html';
  if (ad === '/ogrencim') ad = '/ogrencim.html';
  if (ad === '/karne') ad = '/karne.html';
  if (ad === '/teslim') ad = '/teslim.html';
  if (ad === '/teslim-kodu') ad = '/teslim-kodu.html';
  if (ad === '/teslim-kapi') ad = '/teslim-kapi.html';
  if (/^\/t\/[0-9a-f]{48}$/.test(ad)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'" });
    return fs.createReadStream(path.join(publicDir, 'teslim-baglanti.html')).pipe(res);
  }
  if (ad === '/raporlar') ad = '/raporlar.html';
  if (ad === '/profil') ad = '/profil.html';
  if (ad === '/sinav') ad = '/sinav.html';
  if (ad === '/notlarim') ad = '/notlarim.html';
  const tam = path.normalize(path.join(publicDir, ad));
  if (!tam.startsWith(publicDir) || !fs.existsSync(tam) || !fs.statSync(tam).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bulunamadı');
  }
  res.writeHead(200, {
    'Content-Type': turler[path.extname(tam)] || 'application/octet-stream',
    // Sayfa/stil/betik değişince hemen görünsün (tünel ve CDN eski kopyayı tutmasın); görseller kısa süre saklanır
    'Cache-Control': /\.(jpg|png)$/.test(tam) ? 'public, max-age=3600' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'",
  });
  fs.createReadStream(tam).pipe(res);
}

const sunucu = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/saglik') {
      try { db.prepare('SELECT 1').get(); res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); return res.end('ok'); }
      catch { res.writeHead(503); return res.end('db'); }
    }
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    statik(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 400, { hata: 'Geçersiz istek' });
  }
});
sunucu.listen(PORT, () => console.log(`neademy: http://localhost:${PORT}`));

// Kapanırken (yeniden dağıtım, plan değişikliği) bekleyen yazmaları diske işle ve temiz bir yedek al
yedekZamanla();
let kapaniyor = false;
const kapat = () => {
  if (kapaniyor) return; kapaniyor = true;
  console.log('Kapanıyor...');
  sunucu.close(() => {
    try { db.exec('PRAGMA optimize'); db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close(); } catch {}
    process.exit(0);
  });
  sunucu.closeIdleConnections?.();
  setTimeout(() => process.exit(0), 8000).unref();
};
process.on('SIGTERM', kapat);
process.on('SIGINT', kapat);
