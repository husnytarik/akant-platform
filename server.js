import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, tcGecerliMi, seed } from './db.js';
import { dersProgramiApi } from './ders-programi.js';
import { kurulumApi } from './kurulum.js';
import { etutApi } from './etut.js';
import { yoklamaApi } from './yoklama.js';
import { dersApi } from './ders.js';

const PORT = Number(process.env.PORT || 3000);
// Gerçek SMS entegrasyonu yokken kod ekranda gösterilir. Canlıda DEV_KOD=0 olmalı.
const DEV_KOD = process.env.DEV_KOD !== '0';
const DEMO_HESAPLAR = {
  yonetim: ['10000000146', '5550000001'],
  ogretmen: ['10000000214', '5550000002'],
  ogrenci: ['10000000382', '5550000003'],
  veli: ['10000000450', '5550000004'],
};
const ROLLER = ['yonetim', 'ogretmen', 'ogrenci', 'veli'];
const KOD_SURESI = 5 * 60 * 1000;
const OTURUM_SURESI = 8 * 60 * 60 * 1000;
const MAKS_DENEME = 5;

// Modül kayıt defteri: her modül hangi rollere görünür olduğunu burada bildirir.
// Yeni modül eklemek = buraya bir kayıt eklemek (kullanıcı/yetki yapısı ortaktır).
const MODULLER = [
  { id: 'kullanici-rol', ad: 'Kullanıcı ve rol yönetimi', aciklama: 'Hesaplar, üyelikler, roller ve yetkiler', roller: ['yonetim'], yol: '/kullanicilar' },
  { id: 'okul-kurulum', ad: 'Okul kurulumu', aciklama: 'Ders, öğretmen, öğrenci ve sınıf kayıtları ile atamalar', roller: ['yonetim'], yol: '/kurulum' },
  { id: 'ders-programi-yonetimi', ad: 'Haftalık ders programı', aciklama: 'Sınıf programlarını hazırla, öğretmen programlarını gör', roller: ['yonetim'], yol: '/ders-programi' },
  { id: 'duyuru', ad: 'Duyuru ve kampanyalar', aciklama: 'Okul adına duyuru ve bildirim yayınlama', roller: ['yonetim'] },
  { id: 'rapor', ad: 'Raporlar', aciklama: 'Kurum ve şube bazlı özetler', roller: ['yonetim'] },
  { id: 'etut', ad: 'Etüt', aciklama: 'Etüt aç, veli katılım onayını takip et', roller: ['ogretmen'], yol: '/etut' },
  { id: 'etut-ogrenci', ad: 'Etütlerim', aciklama: 'Davet edildiğim etütler', roller: ['ogrenci'], yol: '/etut' },
  { id: 'etut-veli', ad: 'Etüt onayları', aciklama: 'Çocuğumun etütlerine gelecek / gelmeyecek bildir', roller: ['veli'], yol: '/etut' },
  { id: 'siniflarim', ad: 'Sınıflarım', aciklama: 'Sorumlu olduğum sınıf ve öğrenciler', roller: ['ogretmen'] },
  { id: 'derslerim', ad: 'Derslerim', aciklama: 'Günlük program; devamsızlık, konu ve ödev işlemleri', roller: ['ogretmen'], yol: '/derslerim' },
  { id: 'odev-takip', ad: 'Ödevler', aciklama: 'Verilen ödevler ve son tarihleri', roller: ['ogrenci', 'veli'], yol: '/odevler' },
  { id: 'yoklama', ad: 'Dersi bitir', aciklama: 'Yoklama, işlenen konu ve kazanımı gir', roller: ['ogretmen'], yol: '/yoklama' },
  { id: 'not-girisi', ad: 'Not girişi', aciklama: 'Sınav ve değerlendirme notları', roller: ['ogretmen'] },
  { id: 'veli-bilgilendirme', ad: 'Veli bilgilendirme', aciklama: 'Velilere mesaj ve bildirim gönderme', roller: ['ogretmen'] },
  { id: 'ders-programi', ad: 'Ders programım', aciklama: 'Haftalık ders çizelgesi', roller: ['ogrenci'] },
  { id: 'notlarim', ad: 'Notlarım', aciklama: 'Sınav sonuçları ve gelişim', roller: ['ogrenci'] },
  { id: 'duyurular', ad: 'Duyurular', aciklama: 'Okuldan gelen duyurular', roller: ['ogrenci', 'veli'] },
  { id: 'ogrencim', ad: 'Öğrencim', aciklama: 'Çocuğumun bilgileri ve durumu', roller: ['veli'] },
  { id: 'devamsizlik-veli', ad: 'Devamsızlık', aciklama: 'Çocuğumun ders devamsızlıkları', roller: ['veli'], yol: '/devamsizlik' },
  { id: 'devamsizlik-ogrenci', ad: 'Devamsızlığım', aciklama: 'Ders devam durumum', roller: ['ogrenci'], yol: '/devamsizlik' },
  { id: 'teslim', ad: 'Teslim yetkileri', aciklama: 'Öğrenciyi teslim alabilecek kişiler', roller: ['veli'] },
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

function govde(req) {
  return new Promise((resolve, reject) => {
    let ham = '';
    req.on('data', c => { ham += c; if (ham.length > 10_000) { reject(new Error('buyuk')); req.destroy(); } });
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
    SELECT s.id, s.expires_at, u.id AS user_id, u.full_name, m.id AS membership_id, m.role, b.name AS branch
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN memberships m ON m.id = s.membership_id AND m.status = 'aktif'
    LEFT JOIN branches b ON b.id = m.branch_id
    WHERE s.id = ?`).get(sha(sid));
  if (!o || o.expires_at < Date.now()) return null;
  return o;
}

function kullaniciBul(kimlik) {
  const k = String(kimlik || '').trim().toUpperCase();
  if (/^\d{11}$/.test(k)) {
    if (!tcGecerliMi(k)) return null;
    return db.prepare('SELECT * FROM users WHERE tc_no = ?').get(k);
  }
  if (/^[A-Z0-9]{5,20}$/.test(k)) return db.prepare('SELECT * FROM users WHERE passport_no = ?').get(k);
  return null;
}

// Kullanıcı + telefon + rol üçlüsünü doğrular; uygun üyelikleri döndürür.
function yetkiliUyelikler(kullanici, telefon, rol) {
  if (!kullanici || kullanici.phone !== telNormalize(telefon)) return [];
  return db.prepare("SELECT id FROM memberships WHERE user_id = ? AND role = ? AND status = 'aktif'")
    .all(kullanici.id, rol);
}

async function api(req, res, url) {
  const ip = req.socket.remoteAddress || '?';

  if (req.method === 'GET' && url.pathname === '/api/ben') {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    return json(res, 200, { ad: o.full_name, rol: o.role, sube: o.branch });
  }

  if (req.method === 'GET' && url.pathname === '/api/moduller') {
    const o = oturum(req);
    if (!o) return json(res, 401, { hata: 'Oturum yok' });
    // Filtreleme sunucuda yapılır; istemci rol bildiremez.
    const liste = MODULLER.filter(m => m.roller.includes(o.role))
      .map(({ id, ad, aciklama, yol }) => ({ id, ad, aciklama, yol, durum: yol ? 'hazir' : 'yakinda' }));
    return json(res, 200, { rol: o.role, moduller: liste });
  }

  if (req.method === 'POST' && url.pathname === '/api/cikis') {
    const sid = cerezler(req).sid;
    if (sid) db.prepare('DELETE FROM sessions WHERE id = ?').run(sha(sid));
    return json(res, 200, { tamam: true }, { 'Set-Cookie': 'sid=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
  }

  // Yalnızca test aşaması (DEV_KOD açıkken): role göre demo hesapla doğrudan giriş.
  if (req.method === 'POST' && url.pathname === '/api/giris/demo') {
    if (!DEV_KOD) return json(res, 404, { hata: 'Bulunamadı' });
    const b = await govde(req);
    const demo = DEMO_HESAPLAR[b.rol];
    if (!demo) return json(res, 400, { hata: 'Geçersiz giriş türü' });
    const kullanici = kullaniciBul(demo[0]);
    const uyelikler = yetkiliUyelikler(kullanici, demo[1], b.rol);
    if (!uyelikler.length) return json(res, 404, { hata: 'Demo hesap bulunamadı' });
    const sid = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (id, user_id, membership_id, expires_at) VALUES (?,?,?,?)')
      .run(sha(sid), kullanici.id, uyelikler[0].id, Date.now() + OTURUM_SURESI);
    return json(res, 200, { tamam: true }, {
      'Set-Cookie': `sid=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${OTURUM_SURESI / 1000}`,
    });
  }

  if (req.method === 'POST' && (url.pathname === '/api/giris/kod' || url.pathname === '/api/giris/dogrula')) {
    if (hizAsildi(ip)) return json(res, 429, { hata: 'Çok fazla deneme. Lütfen biraz bekleyin.' });
    const b = await govde(req);
    if (!ROLLER.includes(b.rol)) return json(res, 400, { hata: 'Geçersiz giriş türü' });
    const kullanici = kullaniciBul(b.kimlik);
    const uyelikler = yetkiliUyelikler(kullanici, b.telefon, b.rol);

    if (url.pathname === '/api/giris/kod') {
      // Kullanıcı var/yok bilgisi sızdırılmaz: yanıt her durumda aynıdır.
      const yanit = { mesaj: 'Bilgiler doğruysa telefonunuza doğrulama kodu gönderildi.' };
      if (uyelikler.length) {
        const kod = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
        db.prepare('UPDATE otps SET used = 1 WHERE user_id = ? AND role = ?').run(kullanici.id, b.rol);
        db.prepare('INSERT INTO otps (user_id, role, code_hash, expires_at) VALUES (?,?,?,?)')
          .run(kullanici.id, b.rol, sha(kod), Date.now() + KOD_SURESI);
        console.log(`[DOĞRULAMA KODU] ${kullanici.full_name} (${b.rol}): ${kod}`);
        if (DEV_KOD) yanit.gelistiriciKodu = kod;
      }
      return json(res, 200, yanit);
    }

    // /api/giris/dogrula
    const hata = { hata: 'Bilgiler veya kod hatalı' };
    if (!uyelikler.length) return json(res, 401, hata);
    const otp = db.prepare(`SELECT * FROM otps WHERE user_id = ? AND role = ? AND used = 0
                            ORDER BY id DESC LIMIT 1`).get(kullanici.id, b.rol);
    if (!otp || otp.expires_at < Date.now() || otp.attempts >= MAKS_DENEME) return json(res, 401, hata);
    db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE id = ?').run(otp.id);
    const gelen = Buffer.from(sha(String(b.kod || '')));
    const beklenen = Buffer.from(otp.code_hash);
    if (!crypto.timingSafeEqual(gelen, beklenen)) return json(res, 401, hata);

    db.prepare('UPDATE otps SET used = 1 WHERE id = ?').run(otp.id);
    const sid = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (id, user_id, membership_id, expires_at) VALUES (?,?,?,?)')
      .run(sha(sid), kullanici.id, uyelikler[0].id, Date.now() + OTURUM_SURESI);
    return json(res, 200, { tamam: true }, {
      'Set-Cookie': `sid=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${OTURUM_SURESI / 1000}`,
    });
  }

  if (url.pathname.startsWith('/api/yonetim/')) return await yonetimApi(req, res, url);

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

  const ortak = { req, res, url, o, json, govde, denetle };
  if (await kurulumApi(ortak)) return;
  if (await dersProgramiApi(ortak)) return;

  if (req.method === 'GET' && yol === '/api/yonetim/subeler') {
    return json(res, 200, { subeler: db.prepare('SELECT id, name AS ad FROM branches ORDER BY id').all() });
  }

  if (req.method === 'GET' && yol === '/api/yonetim/kullanicilar') {
    const kullanicilar = db.prepare('SELECT id, tc_no, passport_no, phone, full_name FROM users ORDER BY full_name').all();
    const uyelikler = db.prepare(`SELECT m.id, m.user_id, m.role, m.status, m.branch_id, b.name AS branch
                                  FROM memberships m LEFT JOIN branches b ON b.id = m.branch_id`).all();
    const maske = (s, bas, son) => s ? s.slice(0, bas) + '•'.repeat(Math.max(s.length - bas - son, 0)) + s.slice(-son) : '';
    return json(res, 200, {
      kullanicilar: kullanicilar.map(u => ({
        id: u.id,
        ad: u.full_name,
        kimlik: maske(u.tc_no || u.passport_no, 3, 2),
        kimlikTuru: u.tc_no ? 'T.C.' : 'Pasaport',
        telefon: maske(u.phone, 3, 2),
        uyelikler: uyelikler.filter(m => m.user_id === u.id)
          .map(m => ({ id: m.id, rol: m.role, durum: m.status, subeId: m.branch_id, sube: m.branch })),
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
    const var_ = db.prepare('SELECT 1 FROM users WHERE tc_no = ? OR passport_no = ?').get(kimlik, kimlik);
    if (var_) return json(res, 409, { hata: 'Bu kimlik numarası ile kayıtlı hesap zaten var' });
    const id = Number(db.prepare('INSERT INTO users (tc_no, passport_no, phone, full_name, created_at) VALUES (?,?,?,?,?)')
      .run(tcMi ? kimlik : null, tcMi ? null : kimlik, tel, ad, Date.now()).lastInsertRowid);
    db.prepare('INSERT INTO memberships (user_id, branch_id, role) VALUES (?,?,?)').run(id, Number(b.subeId), b.rol);
    denetle(o.user_id, 'kullanici-ekle', { userId: id, rol: b.rol, subeId: Number(b.subeId) });
    return json(res, 201, { tamam: true, id });
  }

  if (yol === '/api/yonetim/uyelik-ekle') {
    if (!ROLLER.includes(b.rol)) return json(res, 400, { hata: 'Geçersiz rol' });
    if (!subeVar(b.subeId)) return json(res, 400, { hata: 'Geçersiz şube' });
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(Number(b.userId))) return json(res, 400, { hata: 'Kullanıcı bulunamadı' });
    const mevcut = db.prepare('SELECT id FROM memberships WHERE user_id = ? AND branch_id = ? AND role = ?')
      .get(Number(b.userId), Number(b.subeId), b.rol);
    if (mevcut) return json(res, 409, { hata: 'Bu üyelik zaten var' });
    db.prepare('INSERT INTO memberships (user_id, branch_id, role) VALUES (?,?,?)').run(Number(b.userId), Number(b.subeId), b.rol);
    denetle(o.user_id, 'uyelik-ekle', { userId: Number(b.userId), rol: b.rol, subeId: Number(b.subeId) });
    return json(res, 201, { tamam: true });
  }

  if (yol === '/api/yonetim/uyelik-durum') {
    if (!['aktif', 'pasif'].includes(b.durum)) return json(res, 400, { hata: 'Geçersiz durum' });
    const m = db.prepare('SELECT id, user_id, role FROM memberships WHERE id = ?').get(Number(b.uyelikId));
    if (!m) return json(res, 404, { hata: 'Üyelik bulunamadı' });
    // Kilitlenmeyi önle: kurumda en az bir aktif yönetim üyeliği kalmalı.
    if (b.durum === 'pasif' && m.role === 'yonetim') {
      const kalan = db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE role = 'yonetim' AND status = 'aktif' AND id != ?").get(m.id).n;
      if (kalan === 0) return json(res, 409, { hata: 'Son aktif yönetim üyeliği pasifleştirilemez' });
    }
    db.prepare('UPDATE memberships SET status = ? WHERE id = ?').run(b.durum, m.id);
    if (b.durum === 'pasif') db.prepare('DELETE FROM sessions WHERE membership_id = ?').run(m.id);
    denetle(o.user_id, 'uyelik-durum', { uyelikId: m.id, durum: b.durum });
    return json(res, 200, { tamam: true });
  }

  json(res, 404, { hata: 'Bulunamadı' });
}

const turler = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function statik(req, res, url) {
  let ad = url.pathname === '/' ? '/index.html' : url.pathname;
  if (ad === '/panel') ad = '/panel.html';
  if (ad === '/kullanicilar') ad = '/kullanicilar.html';
  if (ad === '/ders-programi') ad = '/ders-programi.html';
  if (ad === '/kurulum') ad = '/kurulum.html';
  if (ad === '/etut') ad = '/etut.html';
  if (ad === '/yoklama') ad = '/yoklama.html';
  if (ad === '/devamsizlik') ad = '/devamsizlik.html';
  if (ad === '/derslerim') ad = '/derslerim.html';
  if (ad === '/odevler') ad = '/odevler.html';
  const tam = path.normalize(path.join(publicDir, ad));
  if (!tam.startsWith(publicDir) || !fs.existsSync(tam) || !fs.statSync(tam).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bulunamadı');
  }
  res.writeHead(200, {
    'Content-Type': turler[path.extname(tam)] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'",
  });
  fs.createReadStream(tam).pipe(res);
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    statik(req, res, url);
  } catch (e) {
    if (!res.headersSent) json(res, 400, { hata: 'Geçersiz istek' });
  }
}).listen(PORT, () => console.log(`Akant platformu: http://localhost:${PORT}`));
