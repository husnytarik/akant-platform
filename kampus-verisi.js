// Çok kampüslü örnek (DEMO) veri: Meltem ve Meydan kampüsleri; her kampüste İlkokul ve Ortaokul, her düzeyden iki sınıf, sınıfta 5 öğrenci.
// Okul yılı başından bugüne kadar ders programı, yoklama, işlenen konu, ödev, etüt, sınav, kulüp ve gelişim kayıtları üretilir.
// Kullanım: npm run kampus           (veritabanı boşsa doldurur, doluysa hiçbir şey yapmaz)
//           npm run kampus-yenile    (önce yedek alır, sonra tüm veriyi silip baştan üretir; sunucu kapalıyken çalıştırın)
import { copyFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { deflateSync, crc32 } from 'node:zlib';
import { db, sonrakiOkulNo } from './db.js';
import './gorev.js';
import './duyuru.js';
import './teslim.js';
import './tatil.js';
import './kurum.js';
import { sistemRolleriKur } from './yetki.js';
import './ogrenci.js';
import { DERS_ZAMANLARI } from './okul-ayar.js';
import { KULUP_DERSI } from './ders-programi.js';
import { dersKazanimlari } from './kazanim.js';

const OKUL_BASI = '2026-09-14';
const TATILLER = new Set(['2026-10-29']);
const INKILAP = 'T.C. İnkılap Tarihi Ve Atatürkçülük';
const KULUP_GUN = 3; // Çarşamba: okulda ortak kulüp günü
const kulupSaati = o => (o.ilk ? 5 : 6); // ilkokulda 5., ortaokulda 6. ders

const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const kaydir = (t, n) => { const d = new Date(t + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const gunNo = t => new Date(t + 'T00:00:00Z').getUTCDay();
const haftaIci = t => { while (gunNo(t) === 0 || gunNo(t) === 6) t = kaydir(t, -1); return t; };
const zaman = (t, saat) => new Date(`${t}T${saat}:00+03:00`).getTime();

// Tekrarlanabilir sahte rastgelelik: aynı komut her seferinde aynı okulu üretir
let tohum = 20261026;
const rnd = () => (tohum = (tohum * 1664525 + 1013904223) % 4294967296) / 4294967296;
const sec = a => a[Math.floor(rnd() * a.length)];
const karistir = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.2;
const sinirla = (x, a, b) => Math.max(a, Math.min(b, x));

function tcUret(ilk9) {
  const d = ilk9.split('').map(Number);
  const d10 = ((((d[0] + d[2] + d[4] + d[6] + d[8]) * 7) - (d[1] + d[3] + d[5] + d[7])) % 10 + 10) % 10;
  const d11 = (d.reduce((a, b) => a + b, 0) + d10) % 10;
  return ilk9 + d10 + d11;
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const yenile = process.argv.includes('--yenile');
const dolu = db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0;
if (dolu) {
  if (!yenile) { console.log('Veritabanı dolu, kampüs verisi eklenmedi. Baştan kurmak için: npm run kampus-yenile'); process.exit(0); }
  const damga = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const yedek = path.join(dir, 'data', `akant.db.yedek-${damga}`);
  copyFileSync(path.join(dir, 'data', 'akant.db'), yedek);
  console.log('Yedek alındı:', yedek);
}
// Boş veritabanında da kurulumun açtığı varsayılan satırlar (ders adları gibi) temizlenir
db.exec('PRAGMA foreign_keys = OFF');
for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) db.exec(`DELETE FROM "${name}"`);
db.exec('PRAGMA foreign_keys = ON');

const hazirlar = new Map();
const hazir = sql => hazirlar.get(sql) || (hazirlar.set(sql, db.prepare(sql)), hazirlar.get(sql));
const ins = (sql, ...a) => Number(hazir(sql).run(...a).lastInsertRowid);
const calis = (sql, ...a) => hazir(sql).run(...a);
const simdi = Date.now();

// ---------- Sözlükler ----------
const ERKEK = ['Ahmet', 'Mehmet', 'Mustafa', 'Ali', 'Emre', 'Burak', 'Can', 'Deniz', 'Efe', 'Kerem', 'Yusuf', 'Ömer', 'Arda', 'Eren', 'Berk', 'Kaan', 'Mert', 'Onur',
  'Barış', 'Cem', 'Doruk', 'Ege', 'Furkan', 'Giray', 'Hakan', 'İlker', 'Kağan', 'Levent', 'Murat', 'Nihat', 'Orhan', 'Poyraz', 'Rüzgar', 'Selim', 'Tolga', 'Umut', 'Yiğit', 'Zafer', 'Atlas', 'Alp'];
const KADIN = ['Ayşe', 'Fatma', 'Zeynep', 'Elif', 'Merve', 'Selin', 'Defne', 'Ecrin', 'Ceren', 'Büşra', 'Naz', 'İrem', 'Yağmur', 'Esra', 'Hira', 'Melis', 'Asya', 'Duru',
  'Ela', 'Su', 'Aylin', 'Bahar', 'Cansu', 'Derya', 'Ebru', 'Feyza', 'Gizem', 'Hande', 'Işıl', 'Jale', 'Kübra', 'Lale', 'Mina', 'Nehir', 'Özge', 'Pelin', 'Rana', 'Sevgi', 'Tuğçe', 'Yasemin'];
const SOYAD = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt',
  'Özkan', 'Şimşek', 'Polat', 'Erdoğan', 'Güneş', 'Aksoy', 'Acar', 'Tekin', 'Bulut', 'Korkmaz', 'Avcı', 'Türk', 'Bozkurt', 'Karaca', 'Uçar', 'Sönmez', 'Taş', 'Gündüz', 'Bayram',
  'Çakır', 'Eroğlu', 'Duman', 'Ateş', 'Yavuz', 'Turan', 'Ekinci', 'Soylu', 'Tunç', 'Sezer', 'Uysal', 'Başaran', 'Önal'];
const kullanilanAd = new Set();
function isim(cins, soyad) {
  for (let i = 0; i < 500; i++) {
    const t = sec(cins === 'E' ? ERKEK : KADIN) + ' ' + (soyad || sec(SOYAD));
    if (!kullanilanAd.has(t)) { kullanilanAd.add(t); return t; }
  }
  return sec(cins === 'E' ? ERKEK : KADIN) + ' ' + (soyad || sec(SOYAD));
}

// Düzeye göre haftalık ders saatleri
const PROGRAM = {
  1: { 'Türkçe': 9, 'Matematik': 5, 'Hayat Bilgisi': 4, 'Beden Eğitimi': 3, 'Görsel Sanatlar': 2, 'Müzik': 2 },
  2: { 'Türkçe': 8, 'Matematik': 5, 'Hayat Bilgisi': 3, 'İngilizce': 2, 'Beden Eğitimi': 3, 'Görsel Sanatlar': 2, 'Müzik': 2 },
  3: { 'Türkçe': 7, 'Matematik': 5, 'Hayat Bilgisi': 3, 'Fen Bilimleri': 3, 'İngilizce': 3, 'Beden Eğitimi': 2, 'Görsel Sanatlar': 1, 'Müzik': 1 },
  4: { 'Türkçe': 6, 'Matematik': 5, 'Fen Bilimleri': 3, 'Sosyal Bilgiler': 3, 'İngilizce': 3, 'Din Kültürü': 2, 'Beden Eğitimi': 2, 'Görsel Sanatlar': 1, 'Müzik': 1 },
  5: { 'Türkçe': 6, 'Matematik': 5, 'Fen Bilimleri': 4, 'Sosyal Bilgiler': 3, 'İngilizce': 3, 'Din Kültürü': 2, 'Beden Eğitimi': 2, 'Görsel Sanatlar': 1, 'Müzik': 1, 'Bilişim': 2 },
  6: { 'Türkçe': 5, 'Matematik': 5, 'Fen Bilimleri': 4, 'Sosyal Bilgiler': 3, 'İngilizce': 3, 'Din Kültürü': 2, 'Beden Eğitimi': 2, 'Görsel Sanatlar': 1, 'Müzik': 1, 'Bilişim': 2 },
  7: { 'Türkçe': 5, 'Matematik': 5, 'Fen Bilimleri': 4, 'Sosyal Bilgiler': 3, 'İngilizce': 3, 'Din Kültürü': 2, 'Beden Eğitimi': 2, 'Görsel Sanatlar': 1, 'Müzik': 1 },
  8: { 'Türkçe': 5, 'Matematik': 5, 'Fen Bilimleri': 4, [INKILAP]: 2, 'İngilizce': 3, 'Din Kültürü': 2, 'Beden Eğitimi': 2, 'Görsel Sanatlar': 1, 'Müzik': 1 },
};

const KAMPUSLER = [
  { ad: 'Meltem Kampüsü', adres: 'Meltem Mah. Akdeniz Bul. No: 12, Antalya', telefon: '0242 000 00 10', okullar: [
    { ad: 'Meltem İlkokulu', tur: 'İlkokul', kod: '70010001', tel: '0242 000 00 11', eposta: 'meltem.ilkokul@akant.example' },
    { ad: 'Meltem Ortaokulu', tur: 'Ortaokul', kod: '70010002', tel: '0242 000 00 12', eposta: 'meltem.ortaokul@akant.example' }] },
  { ad: 'Meydan Kampüsü', adres: 'Meydan Mah. Cumhuriyet Cad. No: 48, Antalya', telefon: '0242 000 00 20', okullar: [
    { ad: 'Meydan İlkokulu', tur: 'İlkokul', kod: '70020001', tel: '0242 000 00 21', eposta: 'meydan.ilkokul@akant.example' },
    { ad: 'Meydan Ortaokulu', tur: 'Ortaokul', kod: '70020002', tel: '0242 000 00 22', eposta: 'meydan.ortaokul@akant.example' }] },
];

// Demo giriş hesapları (DEMO-HESAPLAR.txt ile aynı kimlik ve telefonlar)
const DEMO = {
  yonetim: { tc: tcUret('100000001'), tel: '5550000001', ad: 'Demo Yönetici', foto: '/foto/demo-yonetici.jpg' },
  ogretmen: { tc: tcUret('100000002'), tel: '5550000002', ad: 'Ceren Husny', foto: '/foto/ceren-husny.jpg' },
  ogrenci: { tc: tcUret('100000003'), tel: '5550000003', ad: 'Demo Öğrenci', foto: '/foto/ogrenci-lise.jpg' },
  veli: { tc: tcUret('100000004'), tel: '5550000004', ad: 'Demo Veli' },
  coklu: { tc: tcUret('100000005'), tel: '5550000005', ad: 'Demo Öğretmen-Veli' },
  rehber: { tc: tcUret('100000006'), tel: '5550000006', ad: 'Demo Rehber' },
  teknik: { tc: tcUret('100000007'), tel: '5550000007', ad: 'Demo Teknik' },
  zumre: { tc: tcUret('100000008'), tel: '5550000008', ad: 'Demo Zümre Başkanı' },
  guvenlik: { tc: tcUret('100000009'), tel: '5550000009', ad: 'Demo Güvenlik' },
};

// ---------- Kullanıcılar ----------
const sayac = {};
function kullaniciEkle(onek, telOnek, ad, ozel) {
  const n = (sayac[onek] = (sayac[onek] ?? -1) + 1);
  const tc = ozel?.tc ?? tcUret(onek + String(n).padStart(8, '0'));
  const tel = ozel?.tel ?? telOnek + String(n).padStart(7, '0');
  const uid = ins('INSERT INTO users (tc_no, phone, full_name, created_at, foto) VALUES (?,?,?,?,?)', tc, tel, ad, simdi, ozel?.foto ?? null);
  return { uid, ad, tc, tel };
}
const uyeEkle = (k, subeId, rol, okulNo = null) =>
  ({ ...k, mid: ins('INSERT INTO memberships (user_id, branch_id, role, okul_no) VALUES (?,?,?,?)', k.uid, subeId, rol, okulNo) });

const dersIdleri = new Map();
const dersId = ad => dersIdleri.get(ad) ?? (dersIdleri.set(ad, ins('INSERT INTO courses (name) VALUES (?)', ad)), dersIdleri.get(ad));

function ogretmenEkle(o, anahtar, dersler, ozel) {
  const cins = ozel ? 'K' : sec(['E', 'K']);
  const k = uyeEkle(kullaniciEkle('4', '553', ozel?.ad ?? isim(cins), ozel), o.id, 'ogretmen');
  for (const d of dersler) calis('INSERT INTO teacher_courses (teacher_membership_id, course_id) VALUES (?,?)', k.mid, dersId(d));
  k.dersler = dersler; k.anahtar = anahtar; k.yuk = 0;
  o.t[anahtar] = k;
  return k;
}

// ---------- Kampüs, okul, yönetim, öğretmen, sınıf, öğrenci ----------
const SINIF_HARFLERI = ['A', 'B'];
const okullar = [];
const profil = (uid, ek) => calis(`INSERT OR REPLACE INTO profil_bilgi (user_id, email, telefon2, il, ilce, adres, yakin_ad, yakin_yakinlik, yakin_telefon, guncelleme) VALUES (?,?,?,?,?,?,?,?,?,?)`,
  uid, ek.email ?? '', ek.telefon2 ?? '', 'Antalya', ek.ilce ?? 'Muratpaşa', ek.adres ?? '', ek.yakinAd ?? '', ek.yakinYakinlik ?? '', ek.yakinTel ?? '', simdi);

db.exec('BEGIN');
try {
  dersId(KULUP_DERSI);
  calis("INSERT OR REPLACE INTO kurum (id, ad, kisa_ad, telefon, eposta, web, adres, guncelleme) VALUES (1,'Akant Koleji','Akant','0242 000 00 00','bilgi@akant.example','www.akant.example','Meltem Mah. Akdeniz Bul. No: 12, Antalya',?)", simdi);
  calis('INSERT OR REPLACE INTO kurum_logo (id, mime, veri, guncelleme) VALUES (1, ?, ?, ?)', 'image/jpeg', readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public', 'foto', 'akant-logo.jpg')), simdi);
  for (const k of KAMPUSLER) {
    const kampusId = ins('INSERT INTO kampusler (name, adres, telefon) VALUES (?,?,?)', k.ad, k.adres, k.telefon);
    for (const s of k.okullar) {
      const id = ins('INSERT INTO branches (name, campus_id, tur, kurum_kodu, telefon, eposta, adres) VALUES (?,?,?,?,?,?,?)', s.ad, kampusId, s.tur, s.kod, s.tel, s.eposta, k.adres);
      okullar.push({ id, ad: s.ad, kampus: k.ad, kampusId, ilk: s.tur === 'İlkokul', t: {}, yon: [], siniflar: [], ogrenciler: [], mahalle: k.ad.split(' ')[0] });
    }
  }

  // Yönetim: her okulda müdür ve müdür yardımcısı (Meltem Ortaokulu müdürü demo yönetici hesabıdır)
  for (const o of okullar) {
    const demoMu = o.ad === 'Meltem Ortaokulu';
    const ilkMudur = o.ad === 'Meltem İlkokulu'; // diğer okulun müdürü: fotoğraflı demo
    o.yon.push(uyeEkle(kullaniciEkle('3', '554', demoMu ? DEMO.yonetim.ad : isim('E'), demoMu ? DEMO.yonetim : ilkMudur ? { foto: '/foto/mudur-ilkokul.jpg' } : null), o.id, 'yonetim'));
    o.yon.push(uyeEkle(kullaniciEkle('3', '554', isim('K')), o.id, 'yonetim'));
    // Müdür ve müdür yardımcısı okul yönetimidir; demo yönetici ayrıca asıl (kurum) yönetimindedir
    for (const [i, y] of o.yon.entries()) {
      if (!(demoMu && i === 0)) calis("UPDATE memberships SET gorev = 'okul' WHERE id = ?", y.mid);
      calis('INSERT INTO okul_yoneticileri (branch_id, user_id, gorev, created_at) VALUES (?,?,?,?)', o.id, y.uid, i === 0 ? 'mudur' : 'mudur_yrd', simdi);
    }
  }

  // Öğretmenler
  for (const o of okullar) {
    const demoMu = o.ad === 'Meltem Ortaokulu';
    if (o.ilk) {
      for (const [a, d] of [['ing', ['İngilizce']], ['bed', ['Beden Eğitimi']], ['din', ['Din Kültürü']], ['muz', ['Müzik']], ['gor', ['Görsel Sanatlar']]]) ogretmenEkle(o, a, d);
    } else {
      for (const [a, d] of [['tr1', ['Türkçe']], ['tr2', ['Türkçe']], ['mat1', ['Matematik']], ['mat2', ['Matematik']], ['fen1', ['Fen Bilimleri']], ['fen2', ['Fen Bilimleri']],
        ['sos', ['Sosyal Bilgiler', INKILAP]], ['ing', ['İngilizce']], ['din', ['Din Kültürü']], ['bed', ['Beden Eğitimi']], ['gor', ['Görsel Sanatlar']], ['muz', ['Müzik']], ['bil', ['Bilişim']]]) {
        const ozel = demoMu && a === 'fen1' ? DEMO.ogretmen : demoMu && a === 'ing' ? DEMO.coklu : demoMu && a === 'mat1' ? DEMO.zumre : null;
        ogretmenEkle(o, a, d, ozel);
      }
    }
  }

  // Yönetim rolleri: rehber öğretmen ve teknik ekip yeni kişilerdir; zümre başkanları ayrı profil değil, öğretmen profiline eklenen roldür
  sistemRolleriKur();
  {
    const meltem = okullar.find(x => x.ad === 'Meltem Ortaokulu');
    const rolVer = (k, kod) => calis('INSERT INTO kullanici_roller (user_id, rol_id) VALUES (?,?)', k.uid, db.prepare('SELECT id FROM roller WHERE kod = ?').get(kod).id);
    const yonetimUyeligi = k => ins("INSERT INTO memberships (user_id, branch_id, role, gorev) VALUES (?,?,'yonetim','okul')", k.uid, meltem.id);
    for (const [anahtar, kod] of [['rehber', 'rehber'], ['teknik', 'teknik'], ['guvenlik', 'guvenlik']]) {
      const k = kullaniciEkle('7', '556', DEMO[anahtar].ad, DEMO[anahtar]);
      yonetimUyeligi(k); rolVer(k, kod);
    }
    // Zümre başkanları normal öğretmendir; aynı ekranda ek olarak zümre işlerini görürler
    for (const anahtar of ['mat1', 'tr1', 'fen1', 'sos', 'ing', 'din', 'bed', 'gor', 'muz', 'bil']) rolVer(meltem.t[anahtar], 'zumre');
  }

  // Sınıflar ve öğrenciler (ilkokulda her sınıfın kendi sınıf öğretmeni vardır)
  for (const o of okullar) {
    for (const duzey of o.ilk ? [1, 2, 3, 4] : [5, 6, 7, 8]) {
      for (const harf of SINIF_HARFLERI) {
        const ad = `${duzey}-${harf}`;
        const sinifId = ins('INSERT INTO classes (branch_id, level, name) VALUES (?,?,?)', o.id, o.ilk ? 'İlkokul' : 'Ortaokul', ad);
        const s = { id: sinifId, ad, duzey, harf, o, ogrenciler: [], atama: {} };
        if (o.ilk) {
          const dersler = ['Türkçe', 'Matematik', 'Hayat Bilgisi', ...(duzey >= 3 ? ['Fen Bilimleri'] : []), ...(duzey === 4 ? ['Sosyal Bilgiler'] : [])];
          s.sinifOgretmeni = ogretmenEkle(o, 's' + ad, dersler);
        }
        const adlar = [];
        for (let i = 0; i < 5; i++) adlar.push({ cins: sec(['E', 'K']) });
        const demoSinif = o.ad === 'Meltem Ortaokulu' && ad === '6-A';
        for (const [i, x] of adlar.entries()) x.ad = demoSinif && i === 0 ? DEMO.ogrenci.ad : isim(x.cins);
        if (demoSinif) adlar[0].cins = 'K';
        adlar.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
        for (const x of adlar) {
          const demoOgr = x.ad === DEMO.ogrenci.ad;
          const k = uyeEkle(kullaniciEkle('5', '552', x.ad, demoOgr ? DEMO.ogrenci : null), o.id, 'ogrenci', sonrakiOkulNo(o.id));
          calis('INSERT INTO class_students (class_id, student_membership_id) VALUES (?,?)', s.id, k.mid);
          // Hafif bir devamsızlık eğilimi, başarı düzeyi ve ödev düzeni
          const r = rnd();
          const ogr = { ...k, cins: x.cins, sinif: s, okul: o, yet: { genel: demoOgr ? 0.7 : gauss() * 0.9, ders: {} },
            egilim: demoOgr ? 0.07 : r < 0.12 ? 0.07 : r < 0.15 ? 0.14 : 0.012, caliskan: rnd() < 0.55 ? 0.97 : rnd() < 0.65 ? 0.88 : 0.7 };
          s.ogrenciler.push(ogr); o.ogrenciler.push(ogr);
        }
        o.siniflar.push(s);
      }
    }
  }

  // Demo ilkokul öğrencisi (fotoğraflı): Meltem İlkokulu'ndaki ilk kız öğrenci
  const ilkOgrenci = okullar.find(o => o.ad === 'Meltem İlkokulu').ogrenciler.find(x => x.cins === 'K');
  if (ilkOgrenci) calis('UPDATE users SET foto = ? WHERE id = ?', '/foto/ogrenci-ilkokul.jpg', ilkOgrenci.uid);

  // Veliler: her öğrenciye bir veli; her kampüste ilkokul-ortaokul kardeş çiftleri aynı veliyi paylaşır
  const veliKaydi = (ogr, veli, yakinlik) => {
    calis('INSERT OR IGNORE INTO guardians (parent_membership_id, student_membership_id) VALUES (?,?)', veli.mid, ogr.mid);
  };
  const kardesler = new Map();
  for (const kampusId of [...new Set(okullar.map(o => o.kampusId))]) {
    const ilk = okullar.find(o => o.kampusId === kampusId && o.ilk), orta = okullar.find(o => o.kampusId === kampusId && !o.ilk);
    const ilkAdaylar = karistir(ilk.ogrenciler.filter(x => x.sinif.duzey >= 3));
    const ortaAdaylar = karistir(orta.ogrenciler.filter(x => x.sinif.duzey <= 6 && x.ad !== DEMO.ogrenci.ad));
    for (let i = 0; i < 3; i++) {
      const kucuk = ilkAdaylar[i], buyuk = ortaAdaylar[i];
      const soyad = kucuk.ad.split(' ').slice(-1)[0];
      buyuk.ad = isim(buyuk.cins, soyad);
      calis('UPDATE users SET full_name = ? WHERE id = ?', buyuk.ad, buyuk.uid);
      kardesler.set(kucuk.mid, buyuk); kardesler.set(buyuk.mid, kucuk);
    }
  }
  const veliler = new Map(); // öğrenci mid -> veli kullanıcısı
  // Kayıt bilgileri (doğum, kan grubu, yemek, özel durum) ve veli yakınlığı; rastgele sayı kullanılmaz, öğrenci numarasından türetilir
  const KAN = ['0 Rh+', 'A Rh+', 'B Rh+', 'AB Rh+', 'A Rh-', '0 Rh-', 'B Rh-', 'AB Rh-'];
  const ONCEKI = ['Güneş İlkokulu', 'Atatürk Ortaokulu', 'Bahçelievler İlkokulu', 'Deniz Koleji', 'Cumhuriyet Ortaokulu'];
  const ogrenciKaydi = (ogr, okul, demoOgr) => {
    const id = ogr.mid, duzey = ogr.sinif.duzey;
    const dogum = `${2026 - duzey - 6}-${String(1 + (id * 7) % 12).padStart(2, '0')}-${String(1 + (id * 11) % 28).padStart(2, '0')}`;
    const nakil = id % 7 === 0 && duzey > 1;
    const tur = nakil ? 'nakil' : duzey === 1 || id % 11 === 0 ? 'yeni' : 'yenileme';
    const oncekiOkul = nakil || tur === 'yeni' && duzey > 1 ? ONCEKI[id % ONCEKI.length] : '';
    calis('INSERT INTO ogrenci_kayit (student_membership_id, dogum_tarihi, dogum_yeri, cinsiyet, kan_grubu, onceki_okul, kayit_tarihi, kayit_turu, yemek, guncelleme) VALUES (?,?,?,?,?,?,?,?,?,?)',
      id, dogum, 'Antalya', ogr.cins === 'E' ? 'erkek' : 'kiz', KAN[id % KAN.length], oncekiOkul, tur === 'yenileme' ? '2026-06-15' : '2026-08-25', tur, id % 5 === 0 ? 'almayacak' : 'alacak', simdi);
    const ozel = demoOgr ? [['alerji', 'Fındık alerjisi', 'Fındık içeren yiyecek verilmemeli; belirti görülürse ailesi aranır.']]
      : id % 9 === 0 ? [['alerji', 'Fıstık alerjisi', 'Okul yemeklerinde ve kulüp ikramlarında fıstık olmamalı.']]
      : id % 13 === 0 ? [['saglik', 'Astım', 'Spor derslerinde ilacı yanında bulunur; nefes darlığında aile bilgilendirilir.']] : [];
    for (const [tur2, baslik, aciklama] of ozel) calis('INSERT INTO ogrenci_ozel_durum (student_membership_id, tur, baslik, aciklama, created_at) VALUES (?,?,?,?,?)', id, tur2, baslik, aciklama, simdi);
  };
  const aileBilgi = (ogr, veliUyelik, yakinlik) => calis('INSERT OR REPLACE INTO aile_bilgi (student_membership_id, parent_membership_id, yakinlik, meslek) VALUES (?,?,?,?)',
    ogr.mid, veliUyelik.mid ?? veliUyelik.id, yakinlik, ['Mühendis', 'Öğretmen', 'Esnaf', 'Doktor', 'Memur', 'Serbest meslek', 'Avukat'][ogr.mid % 7]);
  for (const o of okullar) {
    for (const ogr of o.ogrenciler) {
      if (veliler.has(ogr.mid) && !(o.ad === 'Meltem Ortaokulu' && false)) continue;
      const soyad = ogr.ad.split(' ').slice(-1)[0];
      const anne = rnd() < 0.55;
      const demoOgr = ogr.ad === DEMO.ogrenci.ad;
      const veliAd = demoOgr ? DEMO.veli.ad : `${sec(anne ? KADIN : ERKEK)} ${soyad}`;
      const kisi = kullaniciEkle('6', '551', veliAd, demoOgr ? DEMO.veli : null);
      const yakin = `${sec(anne ? ERKEK : KADIN)} ${soyad}`;
      const adres = `${o.mahalle} Mah. ${100 + Math.floor(rnd() * 800)}. Sk. No: ${1 + Math.floor(rnd() * 60)}`;
      const v = uyeEkle(kisi, o.id, 'veli');
      veliKaydi(ogr, v); veliler.set(ogr.mid, kisi);
      const kardes = kardesler.get(ogr.mid);
      if (kardes && !veliler.has(kardes.mid)) {
        const v2 = uyeEkle(kisi, kardes.okul.id, 'veli');
        veliKaydi(kardes, v2); veliler.set(kardes.mid, kisi);
      }
      const iletisim = { email: kisi.ad.toLocaleLowerCase('tr').replace(/[^a-zçğıöşü ]/g, '').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/\s+/g, '.') + '@ornek.example',
        telefon2: '5' + String(30 + Math.floor(rnd() * 10)) + String(1000000 + Math.floor(rnd() * 8999999)), adres, yakinAd: yakin, yakinYakinlik: anne ? 'Baba' : 'Anne', yakinTel: '5' + String(30 + Math.floor(rnd() * 10)) + String(1000000 + Math.floor(rnd() * 8999999)) };
      profil(kisi.uid, iletisim);
      profil(ogr.uid, { adres, yakinAd: kisi.ad, yakinYakinlik: anne ? 'Anne' : 'Baba', yakinTel: kisi.tel });
      aileBilgi(ogr, v, anne ? 'Anne' : 'Baba');
      const kardesOgr = kardesler.get(ogr.mid);
      if (kardesOgr && !kardesOgr.aileli) { kardesOgr.aileli = true; aileBilgi(kardesOgr, db.prepare("SELECT id FROM memberships WHERE user_id = ? AND branch_id = ? AND role = 'veli'").get(kisi.uid, kardesOgr.okul.id), anne ? 'Anne' : 'Baba'); }
    }
  }
  for (const o of okullar) for (const ogr of o.ogrenciler) ogrenciKaydi(ogr, o, ogr.ad === DEMO.ogrenci.ad);
  // Demo Öğretmen-Veli: Meydan Ortaokulu'nda 6-A'daki bir öğrencinin velisi de (aynı hesap, öğretmen + veli)
  {
    const meydan = okullar.find(o => o.ad === 'Meydan Ortaokulu');
    const hedef = meydan.siniflar.find(s => s.ad === '6-A').ogrenciler[0];
    const coklu = okullar.find(o => o.ad === 'Meltem Ortaokulu').t.ing;
    const v = uyeEkle({ uid: coklu.uid, ad: coklu.ad }, meydan.id, 'veli');
    veliKaydi(hedef, v);
    hedef.cokluVeli = true;
  }

  // ---------- Ders atamaları ----------
  const kimVerir = (s, ders) => {
    const t = s.o.t;
    if (s.o.ilk) return ['Türkçe', 'Matematik', 'Hayat Bilgisi', 'Fen Bilimleri', 'Sosyal Bilgiler'].includes(ders) ? s.sinifOgretmeni
      : ders === 'İngilizce' ? t.ing : ders === 'Beden Eğitimi' ? t.bed : ders === 'Din Kültürü' ? t.din : ders === 'Müzik' ? t.muz : t.gor;
    const alt = s.duzey <= 6;
    return { 'Türkçe': alt ? t.tr1 : t.tr2, 'Matematik': alt ? t.mat1 : t.mat2, 'Fen Bilimleri': alt ? t.fen1 : t.fen2, 'Sosyal Bilgiler': t.sos, [INKILAP]: t.sos,
      'İngilizce': t.ing, 'Din Kültürü': t.din, 'Beden Eğitimi': t.bed, 'Görsel Sanatlar': t.gor, 'Müzik': t.muz, 'Bilişim': t.bil }[ders];
  };
  for (const o of okullar) {
    for (const s of o.siniflar) {
      for (const [ders, saat] of Object.entries(PROGRAM[s.duzey])) {
        const ogr = kimVerir(s, ders);
        const id = ins('INSERT INTO assignments (class_id, course_id, teacher_membership_id, weekly_hours) VALUES (?,?,?,?)', s.id, dersId(ders), ogr.mid, saat);
        s.atama[ders] = { id, ders, ogr, saat, sinif: s };
        ogr.yuk += saat;
      }
      s.kulupAtama = ins('INSERT INTO assignments (class_id, course_id, teacher_membership_id, weekly_hours) VALUES (?,?,NULL,1)', s.id, dersId(KULUP_DERSI));
    }
    // Sınıf öğretmeni (ilkokul) ya da rehber öğretmen (ortaokul)
    const rehber = ['tr1', 'mat1', 'fen1', 'sos', 'tr2', 'mat2', 'fen2', 'ing'];
    o.siniflar.forEach((s, i) => {
      s.rehber = o.ilk ? s.sinifOgretmeni : o.t[rehber[i]];
      calis('UPDATE classes SET homeroom_membership_id = ? WHERE id = ?', s.rehber.mid, s.id);
    });
  }

  // ---------- Öğretmen müsaitliği, nöbet ve görevlendirme ----------
  const busy = new Set(); // `${kullanıcı}-${gün}-${saat}`
  const gorevEkle = (t, tur, ad, yer, tekrar, gun, tarih, saatler) => {
    calis('INSERT INTO gorevler (user_id, tur, ad, yer, tekrar, day, tarih, saatler) VALUES (?,?,?,?,?,?,?,?)', t.uid, tur, ad, yer, tekrar, gun, tarih, JSON.stringify(saatler));
    if (tekrar === 'haftalik') for (const p of saatler) busy.add(`${t.uid}-${gun}-${p}`);
  };
  const kapat = (t, gun) => { for (let p = 1; p <= 8; p++) { calis('INSERT INTO ogretmen_kapali (user_id, day, period) VALUES (?,?,?)', t.uid, gun, p); busy.add(`${t.uid}-${gun}-${p}`); } };
  const gelecekGun = n => { let t = kaydir(bugun, n); while (gunNo(t) === 0 || gunNo(t) === 6) t = kaydir(t, 1); return t; };
  for (const o of okullar) {
    kapat(o.t.muz, 5);   // müzik öğretmeni Cuma günleri gelmez
    kapat(o.t.gor, 1);   // görsel sanatlar öğretmeni Pazartesi gelmez
    if (o.ilk) {
      ['ing', 'bed', 'din', 'muz', 'gor'].forEach((a, i) => gorevEkle(o.t[a], 'nobet', 'Bahçe nöbeti', 'Okul bahçesi', 'haftalik', i + 1, null, [2]));
      gorevEkle(o.t.ing, 'gorev', 'Kütüphane sorumlusu', 'Kütüphane', 'haftalik', 2, null, [5]);
      gorevEkle(o.t['s4-A'], 'gorev', 'Cumhuriyet Bayramı töreni hazırlığı', 'Konferans salonu', 'tek', null, gelecekGun(2), [3, 4]);
    } else {
      const sira = ['tr1', 'mat2', 'fen1', 'bed', 'din', 'sos', 'bil', 'tr2', 'fen2', 'mat1'];
      for (let g = 1; g <= 5; g++) {
        gorevEkle(o.t[sira[(g - 1) * 2]], 'nobet', 'Bahçe nöbeti', 'Okul bahçesi', 'haftalik', g, null, [2]);
        gorevEkle(o.t[sira[(g - 1) * 2 + 1]], 'nobet', 'Yemekhane nöbeti', 'Yemekhane', 'haftalik', g, null, [5]);
      }
      gorevEkle(o.t.tr1, 'gorev', 'Kütüphane sorumlusu', 'Kütüphane', 'haftalik', 2, null, [6]);
      gorevEkle(o.t.mat1, 'gorev', 'Cumhuriyet Bayramı töreni hazırlığı', 'Konferans salonu', 'tek', null, gelecekGun(2), [3, 4]);
      gorevEkle(o.t.ing, 'gorev', 'Yabancı dil yarışması koordinasyonu', 'Toplantı odası', 'tek', null, gelecekGun(9), [7, 8]);
    }
  }

  // ---------- Haftalık ders programı ----------
  const sinifDolu = new Set(), sinifGunYuku = new Map(), atamaGun = new Map();
  const yuk = (s, g) => sinifGunYuku.get(`${s.id}-${g}`) || 0;
  for (const o of okullar) for (const s of o.siniflar) {
    calis('INSERT INTO schedule (class_id, day, period, assignment_id) VALUES (?,?,?,?)', s.id, KULUP_GUN, kulupSaati(o), s.kulupAtama);
    sinifDolu.add(`${s.id}-${KULUP_GUN}-${kulupSaati(o)}`);
    sinifGunYuku.set(`${s.id}-${KULUP_GUN}`, 1);
  }
  const programSatirlari = []; // { sinif, gun, saat, atama }
  let yerlesemeyen = 0;
  const parcalar = [];
  for (const o of okullar) for (const s of o.siniflar) for (const a of Object.values(s.atama)) for (let i = 0; i < a.saat; i++) parcalar.push(a);
  const AGIR = new Set(['Türkçe', 'Matematik', 'Fen Bilimleri', 'Hayat Bilgisi']);
  for (const a of karistir(parcalar)) {
    const s = a.sinif, enSon = s.o.ilk ? 7 : 8;
    let en = null;
    for (let g = 1; g <= 5; g++) for (let p = 1; p <= enSon; p++) {
      if (sinifDolu.has(`${s.id}-${g}-${p}`) || busy.has(`${a.ogr.uid}-${g}-${p}`)) continue;
      const ayniGun = atamaGun.get(`${a.id}-${g}`) || 0;
      const puan = ayniGun * 100 + yuk(s, g) * 9 + p + (AGIR.has(a.ders) ? 0 : p > 4 ? -2 : 3);
      if (!en || puan < en.puan) en = { g, p, puan };
    }
    if (!en) { yerlesemeyen++; continue; }
    calis('INSERT INTO schedule (class_id, day, period, assignment_id) VALUES (?,?,?,?)', s.id, en.g, en.p, a.id);
    sinifDolu.add(`${s.id}-${en.g}-${en.p}`); busy.add(`${a.ogr.uid}-${en.g}-${en.p}`);
    sinifGunYuku.set(`${s.id}-${en.g}`, yuk(s, en.g) + 1);
    atamaGun.set(`${a.id}-${en.g}`, (atamaGun.get(`${a.id}-${en.g}`) || 0) + 1);
    programSatirlari.push({ sinif: s, gun: en.g, saat: en.p, atama: a });
  }
  // Boşlukları kapat: gün sonundaki dersi, öğretmeni boşsa ilk boş saate çek
  for (let tur = 0; tur < 6; tur++) {
    let tasindi = 0;
    for (const r of [...programSatirlari].sort((x, y) => y.saat - x.saat)) {
      const s = r.sinif;
      for (let p = 1; p < r.saat; p++) {
        if (sinifDolu.has(`${s.id}-${r.gun}-${p}`) || busy.has(`${r.atama.ogr.uid}-${r.gun}-${p}`)) continue;
        calis('UPDATE schedule SET period = ? WHERE class_id = ? AND day = ? AND period = ?', p, s.id, r.gun, r.saat);
        sinifDolu.delete(`${s.id}-${r.gun}-${r.saat}`); busy.delete(`${r.atama.ogr.uid}-${r.gun}-${r.saat}`);
        sinifDolu.add(`${s.id}-${r.gun}-${p}`); busy.add(`${r.atama.ogr.uid}-${r.gun}-${p}`);
        r.saat = p; tasindi++;
        break;
      }
    }
    if (!tasindi) break;
  }
  // Kalan boşluklar: gün sonundaki dersi başka günün boşluğuna taşı (öğretmen boşsa ve aynı ders günde ikiyi geçmiyorsa)
  const enGec = (s, g) => { let m = 0; for (let p = 1; p <= 9; p++) if (sinifDolu.has(`${s.id}-${g}-${p}`)) m = p; return m; };
  for (let tur = 0; tur < 10; tur++) {
    let tasindi = 0;
    for (const r of [...programSatirlari].sort((x, y) => y.saat - x.saat)) {
      const s = r.sinif;
      let bosVar = false;
      for (let p = 1; p < r.saat; p++) if (!sinifDolu.has(`${s.id}-${r.gun}-${p}`)) bosVar = true;
      if (!bosVar) continue; // ders zaten boşluksuz bir günün sonunda ya da ortasında
      let hedef = null;
      for (let g = 1; g <= 5 && !hedef; g++) {
        if (g === r.gun || (atamaGun.get(`${r.atama.id}-${g}`) || 0) >= 3) continue;
        for (let p = 1; p < enGec(s, g); p++) if (!sinifDolu.has(`${s.id}-${g}-${p}`) && !busy.has(`${r.atama.ogr.uid}-${g}-${p}`)) { hedef = { g, p }; break; }
      }
      if (!hedef) continue;
      calis('UPDATE schedule SET day = ?, period = ? WHERE class_id = ? AND day = ? AND period = ?', hedef.g, hedef.p, s.id, r.gun, r.saat);
      sinifDolu.delete(`${s.id}-${r.gun}-${r.saat}`); busy.delete(`${r.atama.ogr.uid}-${r.gun}-${r.saat}`);
      sinifDolu.add(`${s.id}-${hedef.g}-${hedef.p}`); busy.add(`${r.atama.ogr.uid}-${hedef.g}-${hedef.p}`);
      atamaGun.set(`${r.atama.id}-${r.gun}`, (atamaGun.get(`${r.atama.id}-${r.gun}`) || 0) - 1);
      atamaGun.set(`${r.atama.id}-${hedef.g}`, (atamaGun.get(`${r.atama.id}-${hedef.g}`) || 0) + 1);
      r.gun = hedef.g; r.saat = hedef.p; tasindi++;
    }
    if (!tasindi) break;
  }
  // Ders yükü sınırı (kapalı/dolu günlere göre makul bir üst sınır)
  for (const o of okullar) for (const t of Object.values(o.t)) calis('INSERT OR REPLACE INTO ogretmen_ayar (user_id, haftalik_azami) VALUES (?,?)', t.uid, Math.max(24, t.yuk + 2));
  let bosluk = 0;
  for (const o of okullar) for (const s of o.siniflar) for (let g = 1; g <= 5; g++) {
    const saatler = [...Array(9).keys()].map(i => i + 1).filter(p => sinifDolu.has(`${s.id}-${g}-${p}`));
    if (saatler.length) bosluk += saatler[saatler.length - 1] - saatler[0] + 1 - saatler.length;
  }

  // ---------- Okul günleri: yoklama, işlenen konu, ödev ----------
  const gunler = [];
  for (let t = OKUL_BASI; t < bugun; t = kaydir(t, 1)) if (gunNo(t) >= 1 && gunNo(t) <= 5 && !TATILLER.has(t)) gunler.push(t);
  const KONULAR = ['Konu tekrarı', 'Yeni konu anlatımı', 'Alıştırmalar', 'Uygulama çalışması', 'Soru çözümü', 'Değerlendirme', 'Grup çalışması'];
  const kazIlerleme = new Map();
  const kazMetni = x => ((x.kod ? x.kod + ' – ' : '') + x.metin.replace(/-\s+/g, '')).slice(0, 300);
  const kisalt = (m, n = 110) => (m.length > n ? m.slice(0, n - 3).replace(/\s+\S*$/, '') + '…' : m);
  const sonrakiKonu = a => {
    if (!kazIlerleme.has(a.id)) kazIlerleme.set(a.id, { liste: dersKazanimlari(a.ders, a.sinif.duzey), n: 0 });
    const k = kazIlerleme.get(a.id), sira = k.n++;
    if (!k.liste.length) return { konu: KONULAR[sira % KONULAR.length], kazanim: null };
    const j = Math.floor(sira / 2); // her kazanım iki derste işlenir: anlatım ve pekiştirme
    const x = k.liste[(j + Math.floor(j / 8)) % k.liste.length]; // her dokuzuncu kazanım hiç girilmez (müfredat takibi örneği)
    const metin = x.metin.replace(/-\s+/g, '');
    return { konu: (sira % 2 ? 'Pekiştirme: ' : '') + kisalt(metin, sira % 2 ? 96 : 110), kazanim: kazMetni(x) };
  };

  const dersler = new Map(); // atama id -> [{ tarih, yid, bitti, kazanim }]
  let yoklamaSayisi = 0;
  const programGunu = new Map();
  for (const r of programSatirlari) { if (!programGunu.has(r.gun)) programGunu.set(r.gun, []); programGunu.get(r.gun).push(r); }
  for (const g of programGunu.values()) g.sort((x, y) => x.saat - y.saat || x.sinif.id - y.sinif.id);
  const gunDurumu = new Map(); // `${öğrenci}-${tarih}` -> { durum, bastan }
  for (const t of gunler) {
    const sonGun = t >= kaydir(bugun, -4);
    for (const r of programGunu.get(gunNo(t)) || []) {
      const [bas, bit] = DERS_ZAMANLARI[r.saat - 1];
      const iptal = rnd() < 0.015;
      const bitti = !iptal && !(sonGun && rnd() < 0.07);
      const kv = bitti ? sonrakiKonu(r.atama) : null;
      const bitis = zaman(t, bit);
      const yid = ins(`INSERT INTO yoklama (class_id, date, period, assignment_id, teacher_membership_id, created_at, updated_at, topic, kazanim, completed_at, cancelled)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?)`, r.sinif.id, t, r.saat, r.atama.id, r.atama.ogr.mid, zaman(t, bas) + 3 * 60000, bitis, kv?.konu ?? null, kv?.kazanim ?? null,
        bitti ? bitis + 2 * 60000 : iptal ? bitis : null, iptal ? 1 : 0);
      if (kv) calis('INSERT INTO konular (assignment_id, date, title, note, created_at, yoklama_id, kazanim) VALUES (?,?,?,?,?,?,?)', r.atama.id, t, kv.konu, kv.kazanim ? 'Kazanım: ' + kv.kazanim : null, bitis, yid, kv.kazanim);
      if (!dersler.has(r.atama.id)) dersler.set(r.atama.id, []);
      dersler.get(r.atama.id).push({ tarih: t, yid, bitti, kazanim: kv?.kazanim ?? null, zaman: bitis });
      yoklamaSayisi++;
      if (iptal) continue;
      for (const ogr of r.sinif.ogrenciler) {
        const anahtar = `${ogr.mid}-${t}`;
        if (!gunDurumu.has(anahtar)) {
          const x = rnd();
          gunDurumu.set(anahtar, x < ogr.egilim ? { durum: 'gelmedi', ogleden: rnd() < 0.2 } : x < ogr.egilim + 0.012 ? { durum: 'gec' } : x < ogr.egilim + 0.03 ? { durum: 'izinli' } : { durum: 'geldi' });
        }
        const d = gunDurumu.get(anahtar);
        const durum = d.durum === 'gec' ? (r.saat === Math.min(...programGunu.get(gunNo(t)).filter(z => z.sinif === r.sinif).map(z => z.saat)) ? 'gec' : 'geldi')
          : d.ogleden && r.saat <= 3 ? 'geldi' : d.durum;
        calis('INSERT INTO yoklama_kayit (yoklama_id, student_membership_id, status) VALUES (?,?,?)', yid, ogr.mid, durum);
      }
    }
  }

  // Ödevler: derslerin her birinde yaklaşık dört-beş derste bir ödev verilir, bir sonraki derse kadar süre tanınır
  const ODEVLER = {
    'Türkçe': [['Okuma günlüğü: bir bölüm özeti', 'Okuduğun kitabın bu haftaki bölümünü 5-6 cümleyle özetle. Bölümde geçen yeni 5 kelimeyi anlamlarıyla birlikte defterine yaz.'],
      ['Paragraf soruları', 'Çalışma kitabındaki paragraf sorularını çöz. Her sorunun yanına ana fikri bulduğun cümleyi yaz.'],
      ['Kısa yazı: Hayalimdeki okul', 'Hayalindeki okulu anlatan 8-10 cümlelik bir yazı yaz. En az üç sıfat ve iki bağlaç kullan, noktalama işaretlerine dikkat et.'],
      ['Yazım kuralları alıştırması', 'Çalışma kâğıdındaki yazım ve noktalama alıştırmalarını tamamla; yanlış yazdığın sözcükleri üçer kez defterine yaz.']],
    'Matematik': [['Problem seti', 'Çalışma kâğıdındaki 10 problemi defterine çöz. İşlem basamaklarını yaz, sonucu cümleyle belirt.'],
      ['Ders kitabı alıştırmaları', 'Ders kitabındaki alıştırmaları çöz. Çözemediğin soruların numarasını işaretle, derste birlikte bakacağız.'],
      ['Günlük hayattan matematik', 'Evde ya da markette gördüğün üç durumu matematik problemine dönüştür ve çözümünü yaz.'],
      ['Tekrar testi', 'Test kitabındaki konu tekrarı sayfasını zaman tutarak çöz. Süreni ve yanlış sorularını not et.']],
    'Hayat Bilgisi': [['Ailemle bir gün', 'Ailenle yaptığın bir etkinliği anlatan resim çiz ve altına iki cümle yaz.'], ['Mahallemizdeki meslekler', 'Mahallende gördüğün üç meslek sahibini ve ne iş yaptıklarını defterine yaz.'],
      ['Doğayı koruyoruz', 'Evde geri dönüşüme gönderebileceğin üç atığı bul ve neden geri dönüştürülmesi gerektiğini anlat.']],
    'Fen Bilimleri': [['Deney raporu', 'Derste yaptığımız deneyi evde sadeleştirerek tekrar et. Gözlemlerini tabloya yaz ve bir sonuç cümlesi ekle.'],
      ['Konu özeti ve kavram haritası', 'Bu haftaki üniteyi bir sayfada kavram haritası olarak özetle; en az 8 kavram ve bağlantı sözcüğü kullan.'],
      ['Test çözümü', 'Çalışma kitabındaki testi zaman tutarak çöz. Süreni ve yanlış yaptığın soruların numaralarını yaz.'],
      ['Günlük hayatta fen', 'Evde bulduğun üç araç gerecin hangi fen konusuyla ilgili olduğunu açıkla.']],
    'Sosyal Bilgiler': [['Aile tarihi röportajı', 'Büyüklerinden biriyle çocukluğundaki bir okul günü hakkında konuş. Öğrendiklerini 6-8 cümleyle yaz.'],
      ['Harita çalışması', 'Atlasından konuyla ilgili haritayı çiz; komşu ülkeleri ve çevre denizleri etiketle.'], ['Ders kitabı soruları', '"Değerlendirelim" sorularını tam cümleyle yanıtla.']],
    [INKILAP]: [['Kronoloji çalışması', 'Derste işlediğimiz olayları tarih sırasına göre bir zaman çizelgesinde göster.'], ['Önemli kişiler kartı', 'Konuyla ilgili üç önemli kişi için kısa tanıtım kartı hazırla.'],
      ['Kaynak okuma', 'Verilen metni oku, olayın nedenlerini ve sonuçlarını iki sütunlu tabloya yaz.']],
    'İngilizce': [['Vocabulary practice', 'Learn the new words of the unit. Write each word in a sentence of your own and be ready for a short quiz.'],
      ['Workbook pages', 'Complete the workbook exercises for this unit and read the dialogue aloud twice at home.'],
      ['My daily routine', 'Write 8 sentences about your daily routine using "first, then, after that".']],
    'Görsel Sanatlar': [['Sonbahar teması resim', 'Sonbaharı anlatan bir resim yap. Sulu boya veya pastel kullanabilirsin; bir sonraki derse A4 kâğıtta getir.'], ['Malzeme hazırlığı', 'Gelecek haftaki kolaj çalışması için eski dergi kesikleri, makas ve yapıştırıcı getir.']],
    'Müzik': [['Şarkı sözü ezberi', 'Derste öğrendiğimiz şarkının ilk iki kıtasını ezberle. Gelecek derste tek tek söyleyeceğiz.'], ['Dinleme çalışması', 'Sevdiğin bir parçayı dinle; hangi çalgıları duyduğunu ve sende bıraktığı duyguyu 3-4 cümleyle yaz.']],
    'Bilişim': [['Güvenli internet kuralları', 'Güvenli internet kullanımı için kendi 5 maddelik kural listeni hazırla.'], ['Klavye alıştırması', 'Haftada üç gün, günde 10 dakika on parmak klavye alıştırması yap; ilerlemeni not et.']],
    'Beden Eğitimi': [['Haftalık hareket takvimi', 'Bu hafta her gün en az 30 dakika hareket et. Ne yaptığını ve süresini tabloya işle.'], ['Spor kıyafeti hatırlatması', 'Gelecek ders için spor kıyafetini ve yedek çorabını unutma.']],
    'Din Kültürü': [['Değerler çalışması', 'Dürüstlük ve yardımlaşma konusunda yaşadığın ya da tanık olduğun bir örneği 5-6 cümleyle yaz.'], ['Ders kitabı etkinlikleri', 'Ders kitabındaki etkinlikleri tamamla; boş bıraktığın etkinlik olmasın.']],
  };
  const sonrakiDers = (a, t) => {
    const gunleri = new Set(programSatirlari.filter(r => r.atama === a).map(r => r.gun));
    for (let i = 1; i <= 14; i++) { const x = kaydir(t, i); if (gunleri.has(gunNo(x)) && !TATILLER.has(x)) return x; }
    return kaydir(t, 7);
  };
  const odevler = [];
  const odevSayaci = new Map();
  for (const a of [...dersler.keys()]) {
    const liste = dersler.get(a), at = programSatirlari.find(r => r.atama.id === a).atama;
    const olasilik = at.saat >= 4 ? 0.26 : at.saat === 3 ? 0.3 : 0.28;
    liste.forEach((d, i) => {
      if (!d.bitti || rnd() > olasilik) return;
      const son = liste[i + 1] ? liste[i + 1].tarih : sonrakiDers(at, d.tarih);
      const havuz = ODEVLER[at.ders];
      const k = odevSayaci.get(a) || 0; odevSayaci.set(a, k + 1);
      const [baslik, not] = havuz[k % havuz.length];
      const id = ins('INSERT INTO odevler (assignment_id, title, note, due_date, created_at, kazanim, yoklama_id) VALUES (?,?,?,?,?,?,?)', a, baslik, not, son, d.zaman + 5 * 60000, d.kazanim, d.yid);
      odevler.push({ id, at, son, zaman: d.zaman });
    });
  }

  // Ödev takibi: öğrenci işareti, öğretmen doğrulaması, birkaç fotoğraf ve soru-cevap
  const png = (w, h, r, g, b) => {
    const satir = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) { const o = y * (w * 3 + 1); for (let x = 0; x < w; x++) { const t = (x + y) / (w + h); satir[o + 1 + x * 3] = Math.round(r + (255 - r) * t * 0.6); satir[o + 2 + x * 3] = Math.round(g + (255 - g) * t * 0.6); satir[o + 3 + x * 3] = Math.round(b + (255 - b) * t * 0.6); } }
    const parca = (tur, veri) => { const u = Buffer.alloc(4); u.writeUInt32BE(veri.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([Buffer.from(tur), veri])) >>> 0); return Buffer.concat([u, Buffer.from(tur), veri, c]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), parca('IHDR', ihdr), parca('IDAT', deflateSync(satir)), parca('IEND', Buffer.alloc(0))]);
  };
  const resimler = [[90, 140, 200], [200, 150, 90], [110, 170, 120], [180, 120, 160]].map(c => png(120, 90, ...c));
  const OGRENCI_NOTLARI = ['Son soruyu çözemedim.', 'Defterime yazdım.', 'Bir kısmını tamamlayamadım, yardım alabilir miyim?', 'Dün hastaydım, yarın teslim ederim.'];
  const OGRETMEN_NOTLARI = ['Düzenli, tebrikler.', 'Güzel bir çalışma olmuş.', 'Emeğin görülüyor, böyle devam.'];
  const DUZELTME_NOTLARI = ['Üçüncü soruda işlem basamaklarını yazmayı unutmuşsun, düzeltip tekrar işaretle.', 'Cümlelerin sonuna noktalama işareti koymayı unutma, düzelt.', 'Tablodaki bir sütun eksik, tamamlayıp tekrar işaretle.'];
  let durumSayisi = 0;
  const soruCevap = [];
  for (const od of odevler) {
    for (const ogr of od.at.sinif.ogrenciler) {
      const eski = od.son < kaydir(bugun, -6), yakin = od.son < kaydir(bugun, -1), gelecek = od.son >= bugun;
      const x = rnd();
      let durum = null;
      if (gelecek) { if (x < 0.2 * ogr.caliskan) durum = 'yapildi'; }
      else if (x < ogr.caliskan * 0.94) durum = eski ? (rnd() < 0.93 ? 'dogrulandi' : 'duzeltme') : yakin ? (rnd() < 0.55 ? 'dogrulandi' : 'yapildi') : 'yapildi';
      else if (x < ogr.caliskan * 0.94 + 0.06) durum = 'yapilamadi';
      if (!durum) continue;
      const isaret = zaman(od.son, '20:00') - Math.floor(rnd() * 20) * 36e5 - (gelecek ? 24 * 36e5 : 0);
      const isaretZ = Math.min(isaret, simdi - 36e5);
      const yapildi = durum === 'dogrulandi' || durum === 'yapildi' || durum === 'duzeltme';
      calis('INSERT INTO odev_durumlari (odev_id, student_membership_id, durum, ogrenci_notu, ogretmen_notu, isaret_zamani, dogrulama_zamani, guncelleme) VALUES (?,?,?,?,?,?,?,?)',
        od.id, ogr.mid, durum,
        durum === 'yapilamadi' ? sec(OGRENCI_NOTLARI) : durum === 'yapildi' && rnd() < 0.2 ? 'Defterime yazdım.' : null,
        durum === 'duzeltme' ? sec(DUZELTME_NOTLARI) : durum === 'dogrulandi' && rnd() < 0.3 ? sec(OGRETMEN_NOTLARI) : null,
        isaretZ, durum === 'dogrulandi' ? Math.min(zaman(kaydir(od.son, 1), '10:30') + Math.floor(rnd() * 4) * 36e5, simdi - 36e5) : null, isaretZ);
      durumSayisi++;
      if (yapildi && rnd() < 0.22) {
        const p = sec(resimler);
        calis("INSERT INTO odev_dosyalari (odev_id, student_membership_id, mesaj_id, amac, mime, boyut, veri, created_at) VALUES (?,?,NULL,'teslim','image/png',?,?,?)", od.id, ogr.mid, p.length, p, isaretZ);
      }
      if (!eski && rnd() < 0.07) soruCevap.push({ od, ogr });
    }
  }
  const SORULAR = ['Hocam ikinci soruda sonucu nasıl yazmalıyım?', 'Bu ödevde kaynak kitaptan mı çözeceğiz, çalışma kâğıdından mı?', 'Hocam örnek bir çözüm gösterebilir misiniz?', 'Teslim için fotoğraf yeterli mi?'];
  const CEVAPLAR = ['Sonucu hem sayı hem birim olarak yaz; örnek çözüm derste yapıldı, defterine bakabilirsin.', 'Kaynak kitaptan çözün, çalışma kâğıdı bir sonraki derste dağıtılacak.', 'Yarın derste ilk beş dakikada örnek bir çözüm göstereceğim.', 'Evet, okunaklı bir fotoğraf yeterli.'];
  for (const { od, ogr } of soruCevap) {
    const sor = ins('INSERT INTO odev_mesajlari (odev_id, student_membership_id, yazan_membership_id, yazan_rol, metin, okundu, created_at) VALUES (?,?,?,?,?,?,?)', od.id, ogr.mid, ogr.mid, 'ogrenci', sec(SORULAR), 1, od.zaman + 24 * 36e5);
    if (rnd() < 0.7) calis('INSERT INTO odev_mesajlari (odev_id, student_membership_id, yazan_membership_id, yazan_rol, metin, okundu, created_at) VALUES (?,?,?,?,?,?,?)', od.id, ogr.mid, od.at.ogr.mid, 'ogretmen', sec(CEVAPLAR), rnd() < 0.5 ? 1 : 0, od.zaman + 30 * 36e5);
    if (rnd() < 0.4) { const p = sec(resimler); calis("INSERT INTO odev_dosyalari (odev_id, student_membership_id, mesaj_id, amac, mime, boyut, veri, created_at) VALUES (?,?,?,'soru','image/png',?,?,?)", od.id, ogr.mid, sor, p.length, p, od.zaman + 24 * 36e5); }
  }

  // ---------- Etütler ----------
  const ETUT_KONULARI = ['Soru çözümü', 'Konu tekrarı', 'Eksik konular', 'Sınav hazırlık', 'Problemler', 'Kazanım pekiştirme'];
  let etutSayisi = 0;
  for (const o of okullar) {
    const anahtarlar = o.ilk ? ['s3-A', 's3-B', 's4-A', 's4-B', 's2-A', 'ing'] : ['tr1', 'tr2', 'mat1', 'mat2', 'fen1', 'fen2', 'ing', 'sos'];
    for (const an of anahtarlar) {
      const t = o.t[an];
      const atamalar = Object.values(o.siniflar.flatMap(s => Object.values(s.atama))).filter(a => a.ogr === t);
      const ders = t.dersler[0];
      const planlar = [-20, -13, -7, 5].map(n => ({ n, gecmis: n < 0 }));
      for (const pl of planlar) {
        let tarih = kaydir(bugun, pl.n + Math.floor(rnd() * 5) - 2);
        while (gunNo(tarih) === 0 || gunNo(tarih) === 6 || (pl.gecmis ? tarih >= bugun : tarih <= bugun)) tarih = kaydir(tarih, pl.gecmis ? -1 : 1);
        if (tarih < OKUL_BASI) continue;
        const iptal = !pl.gecmis && an === 'tr1';
        const id = ins(`INSERT INTO etutler (teacher_membership_id, course_id, topic, date, start_time, duration_min, place, note, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          t.mid, dersId(ders), sec(ETUT_KONULARI), tarih, sec(o.ilk ? ['14:40', '15:30'] : ['15:30', '16:20']), 40, sec(['Sınıfta', 'Kütüphane', 'Etüt odası']), null, iptal ? 'iptal' : 'planli', zaman(kaydir(tarih, -4), '10:00'));
        const sinifOgrenciler = sec(atamalar).sinif.ogrenciler;
        for (const ogr of karistir(sinifOgrenciler).slice(0, 3 + Math.floor(rnd() * 3))) {
          const yanit = pl.gecmis ? (rnd() < 0.85 ? 'gelecek' : 'gelmeyecek') : sec(['gelecek', 'gelecek', 'bekliyor', 'gelmeyecek']);
          const devam = pl.gecmis ? (yanit === 'gelecek' ? (rnd() < 0.9 ? 'geldi' : 'gelmedi') : sec(['gelmedi', 'izinli'])) : null;
          calis('INSERT INTO etut_katilimcilar (etut_id, student_membership_id, parent_response, responded_at, attendance) VALUES (?,?,?,?,?)', id, ogr.mid, yanit,
            yanit === 'bekliyor' ? null : zaman(kaydir(tarih, -2), '19:00'), devam);
        }
        etutSayisi++;
      }
    }
  }

  // ---------- Sınavlar ----------
  const SINAV_DERSLERI = {
    3: [['Türkçe', 10], ['Matematik', 10], ['Hayat Bilgisi', 10]],
    4: [['Türkçe', 15], ['Matematik', 15], ['Fen Bilimleri', 10], ['Sosyal Bilgiler', 10]],
    5: [['Türkçe', 15], ['Matematik', 15], ['Fen Bilimleri', 15], ['Sosyal Bilgiler', 10], ['İngilizce', 10]],
    6: [['Türkçe', 15], ['Matematik', 15], ['Fen Bilimleri', 15], ['Sosyal Bilgiler', 10], ['İngilizce', 10]],
    7: [['Türkçe', 15], ['Matematik', 15], ['Fen Bilimleri', 15], ['Sosyal Bilgiler', 10], ['İngilizce', 10]],
    8: [['Türkçe', 20], ['Matematik', 20], ['Fen Bilimleri', 20], [INKILAP, 10], ['Din Kültürü', 10], ['İngilizce', 10]],
  };
  // Aynı ad, tarih ve düzeydeki sınavlar okullar arasında karşılaştırılır; bu yüzden tarih/ad/anahtar/kazanım tüm okullarda aynıdır
  const DENEMELER = [
    { ad: 'Açılış Sınavı', tarih: haftaIci(kaydir(OKUL_BASI, 7)), yayin: 0, kat: 0, amac: 'acilis', cevapli: true },
    { ad: '1. Deneme Sınavı', tarih: haftaIci(kaydir(bugun, -24)), yayin: 1, kat: 3, cevapli: true },
    { ad: '2. Deneme Sınavı', tarih: haftaIci(kaydir(bugun, -14)), yayin: 1, kat: 3, cevapli: true },
    { ad: '3. Deneme Sınavı', tarih: haftaIci(kaydir(bugun, -4)), yayin: 0, kat: 3, cevapli: true },
    { ad: '4. Deneme Sınavı', tarih: haftaIci(kaydir(bugun, 7)), yayin: 0, kat: 3, cevapli: false, hazirlik: true },
  ];
  const SIKLAR = 'ABCDE';
  const yetenekDers = (ogr, ders) => (ogr.yet.ders[ders] ??= gauss() * 0.4);
  const ortakSinav = new Map();
  const ortak = duzey => {
    if (ortakSinav.has(duzey)) return ortakSinav.get(duzey);
    const sonuc = DENEMELER.map((dn, dnNo) => SINAV_DERSLERI[duzey].map(([ders, n], dersNo) => {
      const tam = Array.from({ length: n }, () => sec(SIKLAR)).join('');
      const kaz = dersKazanimlari(ders, duzey);
      const kazanimlar = [];
      if (kaz.length) { let k = (dnNo * 7) % kaz.length; for (let i = 1; i <= n; i++) { if (!(i > 1 && rnd() < 0.35)) k = (k + 1) % kaz.length; kazanimlar.push(kazMetni(kaz[k])); } }
      return { ders, n, tam, zorluk: Array.from({ length: n }, () => gauss() * 0.9 + 0.2), kazanimlar, iptal: dnNo === 1 && ders === 'Matematik' ? [Math.min(17, n)] : [] };
    }));
    ortakSinav.set(duzey, sonuc);
    return sonuc;
  };
  const dersOgretmeni = (o, duzey, ders) => o.siniflar.find(s => s.duzey === duzey).atama[ders].ogr;
  let sinavSayisi = 0;
  for (const o of okullar) {
    const yon = o.yon[0];
    for (const duzey of o.ilk ? [3, 4] : [5, 6, 7, 8]) {
      const siniflar = o.siniflar.filter(s => s.duzey === duzey);
      const ogrenciler = siniflar.flatMap(s => s.ogrenciler);
      const ort = ortak(duzey);
      DENEMELER.forEach((dn, dnNo) => {
        const sid = ins(`INSERT INTO sinavlar (name, date, teacher_membership_id, yanlis_kat, created_at, yayin, tur, duzey, durum, amac) VALUES (?,?,?,?,?,?,'test',?,'aktif',?)`,
          dn.ad, dn.tarih, yon.mid, dn.kat, zaman(kaydir(dn.tarih, -12), '10:00'), dn.yayin, duzey, dn.amac || 'deneme');
        for (const s of siniflar) calis('INSERT INTO sinav_siniflar (sinav_id, class_id) VALUES (?,?)', sid, s.id);
        sinavSayisi++;
        SINAV_DERSLERI[duzey].forEach(([ders, n], dersNo) => {
          const c = ort[dnNo][dersNo];
          // Hazırlığı süren sınavda: ilk ders tamam ve onaylı, ikincisi yarım, diğerleri boş
          const tamam = !dn.hazirlik || dersNo === 0, yarim = dn.hazirlik && dersNo === 1;
          const anahtar = tamam ? c.tam : yarim ? c.tam.slice(0, Math.ceil(n * 0.6)).padEnd(n, '?') : '?'.repeat(n);
          const hoca = dersOgretmeni(o, duzey, ders);
          const dId = ins('INSERT INTO sinav_dersler (sinav_id, ders, soru_sayisi, anahtar, iptal, onay, onaylayan, onay_tarih) VALUES (?,?,?,?,?,?,?,?)',
            sid, ders, n, anahtar, JSON.stringify(c.iptal), tamam ? 1 : 0, tamam ? hoca.mid : null, tamam ? zaman(kaydir(dn.tarih, -3), '16:00') : null);
          if (dn.cevapli) for (const ogr of ogrenciler) {
            if (rnd() < 0.04) continue; // sınava girmeyen
            const guc = ogr.yet.genel + yetenekDers(ogr, ders) + dnNo * 0.15;
            let cv = '';
            for (let i = 0; i < n; i++) {
              const p = 1 / (1 + Math.exp(-(guc - c.zorluk[i] + 0.9) * 1.3));
              const x = rnd();
              cv += x < p ? c.tam[i] : x < p + (1 - p) * 0.25 ? '-' : sec(SIKLAR.replace(c.tam[i], '').split(''));
            }
            calis('INSERT INTO sinav_cevaplar (sinav_ders_id, student_membership_id, cevaplar) VALUES (?,?,?)', dId, ogr.mid, cv);
          }
          const girilecek = tamam ? n : yarim ? Math.ceil(n * 0.45) : 0;
          for (let i = 1; i <= Math.min(girilecek, c.kazanimlar.length); i++) calis('INSERT INTO sinav_kazanim (sinav_ders_id, soru_no, kazanim, guncelleyen, tarih) VALUES (?,?,?,?,?)', dId, i, c.kazanimlar[i - 1], hoca.mid, zaman(kaydir(dn.tarih, -5), '15:00'));
        });
      });
    }
    // Yazılı sınavlar: tüm düzeylerde, puanları dersin öğretmeni girer
    const YAZILI_DERS = [['Türkçe', 'Türkçe', -20], ['Matematik', 'Matematik', -18], ['Hayat Bilgisi', 'Hayat Bilgisi', -13], ['Fen Bilimleri', 'Fen Bilimleri', -13],
      ['Sosyal Bilgiler', 'Sosyal Bilgiler', -11], [INKILAP, 'İnkılap Tarihi', -11], ['İngilizce', 'İngilizce', -6], ['Din Kültürü', 'Din Kültürü', -5]];
    for (const duzey of o.ilk ? [1, 2, 3, 4] : [5, 6, 7, 8]) {
      const siniflar = o.siniflar.filter(s => s.duzey === duzey);
      const ogrenciler = siniflar.flatMap(s => s.ogrenciler);
      YAZILI_DERS.filter(([ders]) => PROGRAM[duzey][ders]).forEach(([ders, kisa, gun], yNo) => {
        const tarih = haftaIci(kaydir(bugun, gun));
        const sid = ins(`INSERT INTO sinavlar (name, date, teacher_membership_id, yanlis_kat, created_at, yayin, tur, duzey, durum, amac) VALUES (?,?,?,0,?,?,'yazili',?,'aktif','deneme')`,
          `1. Dönem 1. ${kisa} Yazılısı`, tarih, yon.mid, zaman(kaydir(tarih, -12), '10:00'), tarih <= kaydir(bugun, -8) ? 1 : 0, duzey);
        for (const s of siniflar) calis('INSERT INTO sinav_siniflar (sinav_id, class_id) VALUES (?,?)', sid, s.id);
        const dId = ins("INSERT INTO sinav_dersler (sinav_id, ders, soru_sayisi, anahtar, iptal, onay, onaylayan, onay_tarih) VALUES (?,?,0,'','[]',1,?,?)", sid, ders, dersOgretmeni(o, duzey, ders).mid, zaman(tarih, '12:00'));
        const kaz = dersKazanimlari(ders, duzey);
        for (let i = 0; i < Math.min(3, kaz.length); i++) calis('INSERT INTO sinav_genel_kazanim (sinav_id, sira, kazanim) VALUES (?,?,?)', sid, i + 1, kazMetni(kaz[(yNo * 3 + i) % kaz.length]));
        for (const ogr of ogrenciler) {
          if (rnd() < 0.04) continue;
          const puan = Math.round(sinirla(68 + ogr.yet.genel * 14 + yetenekDers(ogr, ders) * 8 + gauss() * 6, 10, 100));
          calis('INSERT INTO sinav_puanlar (sinav_ders_id, student_membership_id, puan) VALUES (?,?,?)', dId, ogr.mid, puan);
        }
        sinavSayisi++;
      });
    }
  }

  // ---------- Kulüpler ----------
  const kulupAdi = (ad, tema, aciklama, hoca, duzeyler, kontenjan) => ({ ad, tema, aciklama, hoca, duzeyler, kontenjan });
  const KULUPLER_ILK = [
    kulupAdi('Resim ve El Sanatları', 'Sanat', 'Farklı malzemelerle her hafta bir resim ya da el işi çalışması yapıyoruz.', 'gor', [1, 2, 3, 4], 14),
    kulupAdi('Satranç ve Zeka Oyunları', 'Strateji', 'Satranç, akıl oyunları ve okul içi turnuvalar.', 's4-A', [2, 3, 4], 6),
    kulupAdi('Müzik ve Koro', 'Sanat', 'Koro çalışması ve yıl sonu konseri için repertuvar hazırlığı.', 'muz', [1, 2, 3, 4], 16),
    kulupAdi('Bilim ve Deney', 'Fen', 'Evde bulunan malzemelerle haftalık deneyler yapıp sonuçları tartışıyoruz.', 's3-B', [3, 4], 10),
  ];
  const KULUPLER_ORTA = [
    kulupAdi('Robotik ve Kodlama', 'Bilim ve teknoloji', 'Her hafta bir devre ya da robot projesi tasarlıyor, kodluyor ve deniyoruz.', 'bil', [5, 6, 7, 8], 14),
    kulupAdi('Bilim ve Deney', 'Fen', 'Evde bulunan malzemelerle haftalık deneyler yapıp sonuçları tartışıyoruz.', 'fen1', [5, 6, 7, 8], 12),
    kulupAdi('Satranç ve Zeka Oyunları', 'Strateji', 'Açılış stratejileri, bulmacalar ve okul içi turnuvalar.', 'mat2', [5, 6, 7, 8], 6),
    kulupAdi('Müzik ve Koro', 'Sanat', 'Koro çalışması ve yıl sonu konseri için repertuvar hazırlığı.', 'muz', [5, 6, 7, 8], 16),
    kulupAdi('İngilizce Drama', 'Dil ve sahne', 'İngilizce kısa oyunlar ve doğaçlama çalışmaları.', 'ing', [5, 6, 7, 8], 10),
  ];
  const CALISMALAR = {
    'Resim ve El Sanatları': [['proje', 'Sonbahar yaprakları baskısı', 'Yapraklarla baskı tekniğini denedik.'], ['proje', 'Kolaj çalışması', 'Dergi kesikleriyle hayvan kolajı yaptık.'], ['sunum', 'Sınıf sergisi', 'Çalışmalarımızı koridorda sergiledik.'], ['proje', 'Origami: kâğıttan hayvanlar', 'Kâğıt katlayarak kuş ve balık yaptık.']],
    'Satranç ve Zeka Oyunları': [['diger', 'Açılış ilkeleri', 'Merkezi ele geçirme ve taş gelişimi.'], ['diger', 'Mat kalıpları', 'Vezir ve kale ile mat kalıplarını çalıştık.'], ['diger', 'Mini turnuva', 'Kendi aramızda turnuva oynadık.'], ['diger', 'Bulmaca çözümü', 'Tek hamlede mat bulmacaları çözdük.']],
    'Müzik ve Koro': [['diger', 'Ses ısınma çalışması', 'Nefes ve ses ısınma egzersizleri.'], ['diger', 'Şarkı çalışması', 'Yeni şarkının ilk iki kıtasını öğrendik.'], ['sunum', 'Konser provası', 'İlk iki parçanın provası.'], ['diger', 'Ritim çalışması', 'Vurmalı çalgılarla ritim kalıpları çalıştık.']],
    'Bilim ve Deney': [['deney', 'Yanardağ deneyi', 'Karbonat ve sirke ile yanardağ yaptık.'], ['deney', 'Yoğunluk kuleleri', 'Farklı sıvılarla yoğunluk kulesi kurduk.'], ['deney', 'Mıknatıs ve alan', 'Demir tozuyla manyetik alan çizgilerini gözledik.'], ['sunum', 'Bilim fuarı hazırlığı', 'Standlar için proje seçimi yapıldı.']],
    'Robotik ve Kodlama': [['deney', 'Basit elektrik devresi', 'Pil, ampul ve anahtarla devre kurduk.'], ['proje', 'Engelden kaçan robot', 'Sensör bağlantısını yaptık, kodu yazmaya başladık.'], ['proje', 'Engelden kaçan robot: test', 'Robotları pistte denedik.'], ['proje', 'Blok kodlama oyunu', 'Blok tabanlı kodlamayla küçük bir oyun yazdık.']],
    'İngilizce Drama': [['sunum', 'Kısa skeç', 'Rol dağılımı yapıldı ve ilk okuma yapıldı.'], ['diger', 'Doğaçlama oyunları', 'İngilizce doğaçlama oyunlarıyla ısındık.'], ['sunum', 'Skeç provası', 'Sahne yerleşimini ve replikleri çalıştık.'], ['sunum', 'Sınıf içi gösteri', 'Skeci arkadaşlarımıza sahneledik.']],
  };
  const carsambalar = [];
  for (let t = kaydir(OKUL_BASI, 16); t < bugun; t = kaydir(t, 1)) if (gunNo(t) === KULUP_GUN && !TATILLER.has(t)) carsambalar.push(t);
  let sonrakiCarsamba = bugun; do sonrakiCarsamba = kaydir(sonrakiCarsamba, 1); while (gunNo(sonrakiCarsamba) !== KULUP_GUN);
  let kulupSayisi = 0, uyeSayisi = 0, talepSayisi = 0;
  for (const o of okullar) {
    const tanimlar = o.ilk ? KULUPLER_ILK : KULUPLER_ORTA;
    const yerlesen = new Set();
    const kayitlar = [];
    for (const k of tanimlar) {
      const hoca = o.t[k.hoca];
      const id = ins('INSERT INTO kulupler (branch_id, ad, tema, aciklama, kontenjan, gun, ders_saati, seviyeler, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        o.id, k.ad, k.tema, k.aciklama, k.kontenjan, KULUP_GUN, kulupSaati(o), k.duzeyler.join(','), zaman(kaydir(OKUL_BASI, 3), '10:00'));
      calis('INSERT INTO kulup_ogretmen (kulup_id, teacher_membership_id) VALUES (?,?)', id, hoca.mid);
      const adaylar = karistir(o.ogrenciler.filter(x => k.duzeyler.includes(x.sinif.duzey) && !yerlesen.has(x.mid)));
      const hedef = k.kontenjan <= 6 ? k.kontenjan : Math.min(k.kontenjan - 2, Math.ceil(adaylar.length * 0.4));
      const uyeler = adaylar.slice(0, hedef).filter(x => x.ad !== DEMO.ogrenci.ad); // demo öğrenci kulübe yerleşmez: talep akışı gösterilebilsin
      for (const x of uyeler) {
        calis('INSERT INTO kulup_uyeler (kulup_id, student_membership_id, tarih) VALUES (?,?,?)', id, x.mid, zaman(kaydir(OKUL_BASI, 12), '12:00'));
        calis("INSERT INTO kulup_talepleri (student_membership_id, kulup_id, sira, durum, tarih) VALUES (?,?,1,'kabul',?)", x.mid, id, zaman(kaydir(OKUL_BASI, 8), '12:00'));
        yerlesen.add(x.mid); uyeSayisi++;
      }
      const cal = CALISMALAR[k.ad];
      carsambalar.forEach((tarih, i) => {
        const [tur, baslik, aciklama] = cal[i % cal.length];
        const cid = ins('INSERT INTO kulup_calismalar (kulup_id, tarih, tur, baslik, aciklama, teacher_membership_id, created_at, tamamlandi) VALUES (?,?,?,?,?,?,?,?)', id, tarih, tur, baslik, aciklama, hoca.mid, zaman(kaydir(tarih, -6), '15:00'), zaman(tarih, '14:20'));
        uyeler.forEach((x, j) => calis('INSERT INTO kulup_katilim (calisma_id, student_membership_id, durum) VALUES (?,?,?)', cid, x.mid, (j + i) % 7 === 3 ? 'gelmedi' : (j + i) % 11 === 5 ? 'izinli' : 'geldi'));
      });
      // Önümüzdeki iki hafta için önceden yazılmış plan (üçüncü hafta henüz yazılmadı)
      for (const hafta of [0, 1]) {
        const [ptur, pbaslik, paciklama] = cal[(carsambalar.length + hafta) % cal.length];
        calis('INSERT INTO kulup_calismalar (kulup_id, tarih, tur, baslik, aciklama, teacher_membership_id, created_at) VALUES (?,?,?,?,?,?,?)', id, kaydir(sonrakiCarsamba, hafta * 7), ptur, pbaslik, paciklama, hoca.mid, simdi);
      }
      kayitlar.push({ id, k });
      kulupSayisi++;
    }
    // Yerleşmemiş öğrencilerden bir kısmı tercih listesi göndermiş (yönetim talepler ekranı dolu görünsün); dolu kulübe de talep var
    const dolu = kayitlar.find(x => x.k.kontenjan <= 6);
    let bekleyen = 0;
    for (const x of karistir(o.ogrenciler.filter(z => !yerlesen.has(z.mid)))) {
      if (bekleyen >= 8) break;
      const uygun = kayitlar.filter(c => c.k.duzeyler.includes(x.sinif.duzey));
      if (!uygun.length) continue;
      const liste = dolu && uygun.includes(dolu) && bekleyen < 3 ? [dolu, ...uygun.filter(c => c !== dolu)] : karistir(uygun);
      liste.slice(0, 1 + (bekleyen % 3 === 0 ? 0 : 1)).forEach((c, i) => { calis('INSERT INTO kulup_talepleri (student_membership_id, kulup_id, sira, tarih) VALUES (?,?,?,?)', x.mid, c.id, i + 1, zaman(kaydir(bugun, -3), '18:00')); talepSayisi++; });
      bekleyen++;
    }
  }

  // ---------- Gelişim raporu ----------
  const BASLIKLAR = [
    ['Akademik süreç', 'Derse hazırlık, kazanımlara ulaşma düzeyi, ödev ve değerlendirme sonuçları'],
    ['Dikkat ve ders içi davranış', 'Derse katılım, dikkatini sürdürme, ders akışına uyum'],
    ['Sosyal ilişkiler ve iletişim', 'Arkadaşları ve öğretmenlerle iletişimi, iş birliği'],
    ['Sorumluluk ve öz düzenleme', 'Görev bilinci, zaman yönetimi, kendini değerlendirme'],
  ];
  // Başlık başına: [güçlü, orta, destek gereken]
  const METINLER = [
    [['Derse hazırlıklı geliyor, ödevlerini düzenli teslim ediyor. Yazılı ve denemelerde kazanımların büyük bölümünde başarılı.', 'Çalışkan ve istikrarlı; öğrendiklerini farklı bağlamlarda kullanabiliyor.'],
      ['Genel olarak yeterli düzeyde; bazı konularda küçük eksikleri var, kısa tekrar çalışmalarıyla desteklenmesi iyi olur.', 'Başarısı dönem içinde istikrarlı biçimde yükseldi, ödevlerinde ara sıra aksama oluyor.'],
      ['Bazı temel kazanımlarda belirgin eksikleri var; ödevlerde ve derse hazırlıkta düzenli takip gerekiyor.', 'Sınavlarda öğrendiklerini aktarmakta zorlanıyor, birebir destek çalışması öneriyoruz.']],
    [['Derse ilgili ve merakla katılıyor, sorular soruyor; ders içi davranışları örnek niteliğinde.', 'Dikkatini uzun süre koruyabiliyor, ders akışına hızla uyum sağlıyor.'],
      ['Derse ilgili; dikkati ders ortasında zaman zaman dağılıyor, ön sıralarda oturması yardımcı oluyor.', 'Katılımı iyi, ancak sohbet etme eğilimi zaman zaman ders akışını bölüyor.'],
      ['Dikkatini sürdürmekte zorlanıyor, sık hatırlatma gerekiyor; ders içi katılımı sınırlı.', 'Derse geç hazırlanıyor ve gereç eksikliği yaşıyor; ev-okul iş birliğiyle desteklenmeli.']],
    [['Arkadaşlarıyla uyumlu, grup çalışmalarında iş birliğine açık; akran çatışmalarında arabulucu olabiliyor.', 'İletişimi saygılı ve yapıcı, sınıfta olumlu bir liderlik gösteriyor.'],
      ['Arkadaşlarıyla genel olarak uyumlu; sınıfta daha çekingen, küçük gruplarda kendini daha rahat ifade ediyor.', 'Arkadaş ilişkileri iyi; zaman zaman küçük anlaşmazlıkları kendi başına çözmekte zorlanıyor.'],
      ['Akranlarıyla iletişimde zorlanıyor; grup çalışmalarında geri planda kalıyor, rehberlik desteği planlandı.', 'Çatışma anlarında tepkisel davranabiliyor; öfke yönetimi üzerine çalışılıyor.']],
    [['Görevlerini zamanında yerine getiriyor, eşyalarına özen gösteriyor; kendi hatalarını fark edip düzeltiyor.', 'Zamanını iyi planlıyor, sorumluluklarını hatırlatma beklemeden yerine getiriyor.'],
      ['Sorumluluklarını çoğunlukla yerine getiriyor; zaman planlaması konusunda destek gerekebilir, ödev takvimi birlikte oluşturulabilir.', 'Eşyalarını zaman zaman unutuyor, hatırlatıldığında düzeltiyor.'],
      ['Görevlerini hatırlatma olmadan yerine getirmekte zorlanıyor; zaman yönetimi için evde günlük bir plan önerilir.', 'Eşya ve ödev takibinde sık eksik var; öğretmen-veli iletişimiyle desteklenecek.']],
  ];
  const BRANS_CUMLE = {
    'Türkçe': ['Okuduğunu anlama ve yazılı anlatımı güçlü.', 'Okuma akıcılığı ve yazım kuralları üzerinde çalışılmalı.'],
    'Matematik': ['İşlem hızı ve problem çözme becerisi gelişmiş durumda.', 'Temel işlemlerde ve problem kurmada destek gerekiyor.'],
    'Fen Bilimleri': ['Deney ve gözlem etkinliklerinde çok başarılı.', 'Kavramları ilişkilendirmekte zorlanıyor.'],
    'Sosyal Bilgiler': ['Harita ve zaman çizelgesi çalışmalarında başarılı.', 'Kavramları ezber yerine ilişkilendirerek öğrenmesi önerilir.'],
    'İngilizce': ['Konuşma ve dinleme etkinliklerine istekli katılıyor.', 'Kelime çalışmasını düzenli yapması gerekiyor.'],
  };
  const gorusmeToplanti = ['Veli toplantısına anne katıldı. Akademik gidişat olumlu; ödev düzeni ve ekran süresi konuşuldu. Evde belirli bir çalışma saati belirlenmesi önerildi.',
    'Veli toplantısına baba katıldı. Derse katılımı ve arkadaş ilişkileri olumlu değerlendirildi; okuma alışkanlığının artırılması istendi.',
    'Veli toplantısına anne ve baba birlikte katıldı. Matematikte destek çalışması planlandı, dönem ortasında tekrar görüşülecek.',
    'Veli toplantısına anne katıldı. Sabah derse geç kalma ve uyku düzeni konuşuldu; aile servis saatini kontrol edecek.'];
  const gorusmeTel = ['Veli telefonla arandı. Öğrencinin sabahları derse geç kalmasının nedenleri görüşüldü; servis saatinin kontrol edilmesi istendi.',
    'Veli okula davet edildi. Ödev teslimlerindeki aksamalar konuşuldu, haftalık takip çizelgesi verildi.',
    'Veli ile telefonda görüşüldü. Öğrencinin derslerdeki olumlu gelişimi paylaşıldı, aile desteği için teşekkür edildi.'];
  let girisSayisi = 0;
  for (const o of okullar) {
    const basliklar = BASLIKLAR.map(([ad, aciklama], i) => ins('INSERT INTO gelisim_basliklari (branch_id, ad, aciklama, sira) VALUES (?,?,?,?)', o.id, ad, aciklama, i + 1));
    const donem = (ad, bas, bit, top) => ins('INSERT INTO gelisim_donemleri (branch_id, ad, baslangic, bitis, toplanti_tarihi, created_at) VALUES (?,?,?,?,?,?)', o.id, ad, bas, bit, top, simdi);
    const kapali = donem('1. Dönem (Eylül – Ekim)', OKUL_BASI, kaydir(bugun, -10), kaydir(bugun, -5));
    donem('2. Dönem (Ekim – Aralık)', kaydir(bugun, -3), kaydir(bugun, 40), kaydir(bugun, 46)); // şu an açık: gözlemler henüz yazılmadı
    donem('3. Dönem (Şubat)', kaydir(bugun, 120), kaydir(bugun, 145), kaydir(bugun, 151));
    for (const s of o.siniflar) {
      const ogretmenler = [s.rehber];
      for (const a of Object.values(s.atama)) if (!ogretmenler.includes(a.ogr) && ogretmenler.length < 4) ogretmenler.push(a.ogr);
      s.ogrenciler.forEach((ogr, oi) => {
        const duzeyi = ogr.yet.genel > 0.5 ? 0 : ogr.yet.genel < -0.5 ? 2 : 1;
        ogretmenler.forEach((t, ti) => basliklar.forEach((b, bi) => {
          // Bazı öğrenciler için gözlem yazılmamış kalır (öğretmen ana sayfasındaki "yazılmamış" göstergesi görünsün)
          if ((t.ad === DEMO.ogretmen.ad ? oi % 2 === 1 : t.ad === DEMO.coklu.ad ? oi === 2 : (s.id + oi + ti) % 11 === 0)) return;
          const seviye = rnd() < 0.15 ? sinirla(duzeyi + (rnd() < 0.5 ? -1 : 1), 0, 2) : duzeyi;
          let metin = METINLER[bi][seviye][(oi + ti) % 2];
          const brans = BRANS_CUMLE[t.dersler[0]];
          if (bi === 0 && brans && !o.ilk) metin += ' ' + brans[seviye === 2 ? 1 : 0];
          calis('INSERT OR REPLACE INTO gelisim_girisleri (donem_id, baslik_id, student_membership_id, teacher_membership_id, metin, guncelleme) VALUES (?,?,?,?,?,?)', kapali, b, ogr.mid, t.mid, metin, zaman(kaydir(bugun, -11), '16:00'));
          girisSayisi++;
        }));
        if (rnd() < 0.7) calis("INSERT INTO gelisim_gorusmeleri (student_membership_id, donem_id, tur, tarih, notu, yazan_membership_id, created_at) VALUES (?,?,'toplanti',?,?,?,?)",
          ogr.mid, kapali, kaydir(bugun, -5), sec(gorusmeToplanti), s.rehber.mid, zaman(kaydir(bugun, -5), '17:00'));
        if (rnd() < 0.3) calis("INSERT INTO gelisim_gorusmeleri (student_membership_id, donem_id, tur, tarih, notu, yazan_membership_id, created_at) VALUES (?,NULL,'gorusme',?,?,?,?)",
          ogr.mid, haftaIci(kaydir(bugun, -1 - Math.floor(rnd() * 20))), sec(gorusmeTel), s.rehber.mid, simdi - 864e5);
      });
    }
  }

  // Duyurular (yönetim) ve veli mesajları (sınıf rehberi)
  const ileti = (tur, baslik, metin, gonderen, sube, rol, sinif, gun) => ins('INSERT INTO iletiler (tur, baslik, metin, gonderen_membership_id, branch_id, rol, class_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
    tur, baslik, metin, gonderen, sube, rol, sinif, zaman(kaydir(bugun, gun), '09:00'));
  for (const o of okullar) {
    ileti('duyuru', '29 Ekim Cumhuriyet Bayramı', '29 Ekim Perşembe günü okulumuz tatildir. Cumhuriyet Bayramımız kutlu olsun.', o.yon[0].mid, o.id, 'hepsi', null, -2);
    ileti('duyuru', '1. dönem veli toplantısı', "Veli toplantısı 5 Kasım Perşembe günü saat 18:00'de okulumuzda yapılacaktır. Katılımınızı bekleriz.", o.yon[0].mid, o.id, 'veli', null, -1);
    ileti('duyuru', 'Öğretmenler kurulu', 'Dönem ortası öğretmenler kurulu cuma günü son ders sonrası toplantı salonundadır.', o.yon[0].mid, o.id, 'ogretmen', null, -3);
    ileti('duyuru', 'Zümre toplantısı', 'Dönem ortası zümre toplantıları pazartesi günü 8. ders yapılacaktır. Zümre başkanlarından sınav takvimi taslağı beklenmektedir.', o.yon[0].mid, o.id, 'zumre', null, -1);
    for (const s of o.siniflar.slice(0, 2))
      ileti('mesaj', 'Gezi izin belgesi', 'Önümüzdeki hafta yapılacak müze gezisi için izin belgelerinin imzalanıp cuma gününe kadar teslim edilmesi rica olunur.', s.rehber.mid, o.id, null, s.id, -1);
  }

  // Teslim yetkilileri: öğrencilerin bir kısmı için anneanne / servis şoförü gibi kişiler
  const TESLIM = [['Nermin Aksoy', 'Anneanne'], ['Hasan Yıldız', 'Servis şoförü'], ['Selma Kaya', 'Teyze'], ['Orhan Demir', 'Dede']];
  for (const o of okullar) o.ogrenciler.forEach((ogr, i) => {
    if (i % 3) return;
    const [ad, yakinlik] = TESLIM[i % TESLIM.length];
    ins('INSERT INTO teslim_yetkilileri (student_membership_id, ad, yakinlik, telefon, created_at) VALUES (?,?,?,?,?)', ogr.mid, ad, yakinlik, '05' + String(300000000 + i * 7919 + o.id * 104729).slice(0, 9), simdi);
  });

  // Okul takvimi: resmi tatiller ve yaklaşan ara tatil
  for (const [bas, bit, ad, tur] of [['2026-10-29', '2026-10-29', 'Cumhuriyet Bayramı', 'resmi'], ['2026-11-10', '2026-11-10', "Atatürk'ü Anma Günü", 'ozel'], ['2027-01-18', '2027-01-29', 'Yarıyıl tatili', 'ara']])
    ins('INSERT INTO tatiller (baslangic, bitis, ad, tur, created_at) VALUES (?,?,?,?,?)', bas, bit, ad, tur, simdi);

  db.exec('COMMIT');
  const topla = t => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
  console.log(`Kampüs: ${topla('kampusler')}, okul: ${topla('branches')}, sınıf: ${topla('classes')}, kullanıcı: ${topla('users')}.`);
  console.log(`Öğretmen üyeliği: ${db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE role='ogretmen'").get().n}, öğrenci: ${db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE role='ogrenci'").get().n}, veli üyeliği: ${db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE role='veli'").get().n}, yönetim: ${db.prepare("SELECT COUNT(*) AS n FROM memberships WHERE role='yonetim'").get().n}.`);
  console.log(`Ders programı: ${programSatirlari.length} ders saati yerleşti, ${yerlesemeyen} yerleşemedi, ${bosluk} saat boşluk.`);
  console.log(`Yoklama: ${yoklamaSayisi} ders (${gunler.length} okul günü), konu: ${topla('konular')}, ödev: ${odevler.length} (${durumSayisi} öğrenci durumu), etüt: ${etutSayisi}.`);
  console.log(`Sınav: ${sinavSayisi}, kulüp: ${kulupSayisi} (${uyeSayisi} üye, ${talepSayisi} bekleyen talep), gelişim girişi: ${girisSayisi}.`);
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}
