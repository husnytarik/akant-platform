// Veritabanı yedeği: çalışırken tutarlı kopya (VACUUM INTO), eskileri temizleme ve geri yükleme.
// İki katman:
//   Tam yedek   : tüm veritabanı, birkaç saatte bir (yoklama, ödev, sınav gibi çok satırlı veri dahil)
//   Kritik yedek: yalnızca kimlik ve yapı verisi (öğrenci, veli, öğretmen, sınıf, okul ayarı...);
//                 bu tablolarda her değişiklikten kısa süre sonra alınır, değişiklik yoksa hiç alınmaz
// Komut satırı: node yedek.js                       -> şimdi tam yedek al
//               node yedek.js --kritik              -> şimdi kritik yedek al
//               node yedek.js --liste               -> yedekleri listele
//               node yedek.js --geri <dosya>        -> tam yedekten geri yükle (sunucu kapalıyken)
//               node yedek.js --kritik-geri <dosya> -> kritik yedeği canlı veriye geri yaz (sunucu kapalıyken)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { db, DB_YOLU } from './db.js';
import { ortam } from './ortam.js';
import { bulutAyarli, bulutaYukle } from './bulut-yedek.js';

const KLASOR = path.join(ortam.veriKlasoru, 'yedekler');
const KRITIK_KLASOR = path.join(KLASOR, 'kritik');
const damga = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const damgaSn = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
const sqlYol = y => y.replace(/'/g, "''");

// Kritik tablolar: kayıt eklenince, değişince ya da silinince kritik yedeği tetikler.
// Çok satırlı, yeniden üretilebilir ya da geçici veri (yoklama, ödev, sınav, oturum...) burada yoktur.
export const KRITIK_TABLOLAR = [
  'users', 'memberships', 'guardians', 'aile_bilgi', 'ogrenci_kayit', 'ogrenci_ozel_durum', 'profil_bilgi',
  'kullanici_roller', 'roller', 'kullanici_foto', 'kurum', 'kurum_logo', 'okul_logo', 'okul_ayar', 'okul_yoneticileri',
  'kampusler', 'branches', 'classes', 'class_students', 'courses', 'teacher_courses', 'assignments', 'schedule',
  'ogretmen_ayar', 'teslim_yetkilileri', 'tatiller',
];

export function yedekAl(klasor = KLASOR) {
  fs.mkdirSync(klasor, { recursive: true });
  const hedef = path.join(klasor, `akant-${damga()}.db`);
  if (fs.existsSync(hedef)) fs.rmSync(hedef);
  db.exec(`VACUUM INTO '${sqlYol(hedef)}'`);
  // Oturum ve doğrulama kodları yedeğe girmez (geri yüklenen kopyada kimse başkasının oturumunu devralamaz)
  const kopya = new DatabaseSync(hedef);
  kopya.exec('DELETE FROM sessions; DELETE FROM otps');
  const sonuc = kopya.prepare('PRAGMA integrity_check').get().integrity_check;
  kopya.close();
  if (sonuc !== 'ok') { fs.rmSync(hedef); throw new Error('Yedek doğrulanamadı: ' + sonuc); }
  return { dosya: hedef, boyut: fs.statSync(hedef).size };
}

export function yedekleriListele(klasor = KLASOR) {
  if (!fs.existsSync(klasor)) return [];
  return fs.readdirSync(klasor).filter(a => /^akant-\d{12}\.db$/.test(a)).sort().reverse()
    .map(a => ({ ad: a, boyut: fs.statSync(path.join(klasor, a)).size }));
}

// Son N günden eski yedekleri siler; her zaman en az en yeni 3 yedeği bırakır
export function eskileriTemizle(gun = ortam.yedekSaklaGun, klasor = KLASOR) {
  const sinir = Date.now() - gun * 86400000;
  const liste = yedekleriListele(klasor);
  let silinen = 0;
  for (const y of liste.slice(3)) {
    const yol = path.join(klasor, y.ad);
    if (fs.statSync(yol).mtimeMs < sinir) { fs.rmSync(yol); silinen++; }
  }
  return silinen;
}

const mevcutKritik = () => KRITIK_TABLOLAR.filter(t => db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t));

// Kritik tablolara değişiklik sayacı tetikleyicileri (tablolar oluştuktan sonra, sunucu açılışında çağrılır)
export function kritikIzle() {
  db.exec('CREATE TABLE IF NOT EXISTS yedek_durum (id INTEGER PRIMARY KEY CHECK (id = 1), sayac INTEGER NOT NULL DEFAULT 0)');
  db.exec('INSERT OR IGNORE INTO yedek_durum (id, sayac) VALUES (1, 0)');
  for (const t of mevcutKritik()) {
    for (const olay of ['INSERT', 'UPDATE', 'DELETE']) {
      db.exec(`CREATE TRIGGER IF NOT EXISTS yedek_iz_${t}_${olay.toLowerCase()} AFTER ${olay} ON "${t}"
        BEGIN UPDATE yedek_durum SET sayac = sayac + 1 WHERE id = 1; END`);
    }
  }
}
const sayac = () => db.prepare('SELECT sayac FROM yedek_durum WHERE id = 1').get().sayac;

// Yalnızca kritik tabloları (şemasıyla) ayrı bir dosyaya kopyalar
export function kritikYedekAl(klasor = KRITIK_KLASOR) {
  fs.mkdirSync(klasor, { recursive: true });
  const hedef = path.join(klasor, `kritik-${damgaSn()}.db`);
  if (fs.existsSync(hedef)) fs.rmSync(hedef);
  const k = new DatabaseSync(hedef);
  try {
    k.exec('PRAGMA foreign_keys = OFF');
    k.exec(`ATTACH DATABASE '${sqlYol(DB_YOLU)}' AS kaynak`);
    k.exec('BEGIN');
    for (const t of mevcutKritik()) {
      k.exec(db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(t).sql);
      k.exec(`INSERT INTO main."${t}" SELECT * FROM kaynak."${t}"`);
    }
    k.exec('COMMIT');
    k.exec('DETACH DATABASE kaynak');
  } finally { k.close(); }
  return { dosya: hedef, boyut: fs.statSync(hedef).size };
}

// En yeni 48 kritik yedek kalır; daha eskilerden 30 güne kadar her günün en yenisi kalır
export function kritikTemizle(klasor = KRITIK_KLASOR) {
  if (!fs.existsSync(klasor)) return 0;
  const dosyalar = fs.readdirSync(klasor).filter(a => /^kritik-\d{14}\.db$/.test(a)).sort().reverse();
  const sinir = Date.now() - 30 * 86400000, gunler = new Set();
  let silinen = 0;
  dosyalar.forEach((a, i) => {
    const gun = a.slice(7, 15);
    if (i < 48) { gunler.add(gun); return; }
    const yol = path.join(klasor, a);
    if (fs.statSync(yol).mtimeMs >= sinir && !gunler.has(gun)) { gunler.add(gun); return; }
    fs.rmSync(yol); silinen++;
  });
  return silinen;
}

// Kritik yedeği canlı veritabanına geri yazar (yalnızca o tabloların içeriği değişir)
export function kritikGeriYukle(kaynak) {
  const k = new DatabaseSync(kaynak, { readOnly: true });
  const tablolar = k.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name);
  k.close();
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`ATTACH DATABASE '${sqlYol(kaynak)}' AS kritik`);
  try {
    db.exec('BEGIN');
    for (const t of tablolar) {
      db.exec(`DELETE FROM main."${t}"`);
      db.exec(`INSERT INTO main."${t}" SELECT * FROM kritik."${t}"`);
    }
    db.exec('COMMIT');
  } catch (h) { try { db.exec('ROLLBACK'); } catch {} throw h; }
  finally { db.exec('DETACH DATABASE kritik'); db.exec('PRAGMA foreign_keys = ON'); }
  return tablolar.length;
}

// Sunucu içinden düzenli yedek (ilk tam yedek açılıştan kısa süre sonra)
export function yedekZamanla() {
  const buluta = async (dosya, tur) => {
    if (!bulutAyarli()) return;
    try { const r = await bulutaYukle(dosya, tur); console.log('Buluta yüklendi:', r.anahtar, (r.boyut / 1024).toFixed(0) + ' KB'); }
    catch (h) { console.error('Buluta yüklenemedi:', h.message); }
  };
  let sonTamBulut = 0;
  const calis = () => {
    try {
      const y = yedekAl(); eskileriTemizle(); console.log('Yedek alındı:', path.basename(y.dosya), (y.boyut / 1048576).toFixed(1) + ' MB');
      if (Date.now() - sonTamBulut >= ortam.bulutTamSaat * 3600000 - 60000) { sonTamBulut = Date.now(); buluta(y.dosya, 'tam'); }
    } catch (h) { console.error('Yedek alınamadı:', h.message); }
  };
  const ilk = ortam.yedekAralikSaat ? setTimeout(calis, 60 * 1000) : null;
  const dongu = ortam.yedekAralikSaat ? setInterval(calis, ortam.yedekAralikSaat * 3600000) : null;
  ilk?.unref(); dongu?.unref();

  // Kritik veri: değişiklikten sonra 15 sn sakinlik (en geç 2 dk) bekleyip yedek alır; değişiklik yoksa hiçbir şey yapmaz
  kritikIzle();
  let son = sayac(), ilkDegisim = 0, sonDegisim = 0;
  const izle = setInterval(() => {
    try {
      const s = sayac(), simdi = Date.now();
      if (s !== son) { if (!ilkDegisim) ilkDegisim = simdi; sonDegisim = simdi; son = s; }
      if (!ilkDegisim) return;
      if (simdi - sonDegisim < 15000 && simdi - ilkDegisim < 120000) return;
      ilkDegisim = 0;
      const y = kritikYedekAl(); kritikTemizle();
      console.log('Kritik yedek alındı:', path.basename(y.dosya), (y.boyut / 1024).toFixed(0) + ' KB');
      sonKritik = y.dosya;
    } catch (h) { console.error('Kritik yedek alınamadı:', h.message); }
  }, 5000);
  izle.unref();
  // Buluta: kritik yedekten yeni bir tane oluştuysa belirli aralıkla en sonuncusu yüklenir
  let sonKritik = null, yuklenen = null;
  const bulutKritik = setInterval(() => {
    if (sonKritik && sonKritik !== yuklenen) { yuklenen = sonKritik; buluta(sonKritik, 'kritik'); }
  }, Math.max(1, ortam.bulutKritikDakika) * 60000);
  bulutKritik.unref();
  return () => { clearTimeout(ilk); clearInterval(dongu); clearInterval(izle); clearInterval(bulutKritik); };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a[0] === '--liste') {
    for (const y of yedekleriListele()) console.log('tam   ', y.ad, (y.boyut / 1048576).toFixed(1) + ' MB');
    if (fs.existsSync(KRITIK_KLASOR)) for (const k of fs.readdirSync(KRITIK_KLASOR).sort().reverse().slice(0, 20)) console.log('kritik', k);
  } else if (a[0] === '--bulut-dene') {
    if (!bulutAyarli()) { console.error('YEDEK_S3_* ayarları tanımlı değil'); process.exit(1); }
    const y = yedekAl(); console.log('Yüklendi:', await bulutaYukle(y.dosya, 'tam'));
  } else if (a[0] === '--kritik') {
    kritikIzle();
    const y = kritikYedekAl(); console.log('Kritik yedek alındı:', y.dosya, (y.boyut / 1024).toFixed(0) + ' KB');
  } else if (a[0] === '--kritik-geri') {
    const kaynak = path.isAbsolute(a[1] || '') ? a[1] : path.join(KRITIK_KLASOR, a[1] || '');
    if (!a[1] || !fs.existsSync(kaynak)) { console.error('Kritik yedek bulunamadı. Liste: node yedek.js --liste'); process.exit(1); }
    console.log('Geri yüklemeden önce tam yedek alındı:', yedekAl().dosya);
    console.log(kritikGeriYukle(kaynak) + ' tablo geri yüklendi.');
  } else if (a[0] === '--geri') {
    const kaynak = path.isAbsolute(a[1] || '') ? a[1] : path.join(KLASOR, a[1] || '');
    if (!a[1] || !fs.existsSync(kaynak)) { console.error('Yedek dosyası bulunamadı. Liste: node yedek.js --liste'); process.exit(1); }
    const kontrol = new DatabaseSync(kaynak, { readOnly: true });
    const sonuc = kontrol.prepare('PRAGMA integrity_check').get().integrity_check;
    kontrol.close();
    if (sonuc !== 'ok') { console.error('Yedek bozuk:', sonuc); process.exit(1); }
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.close();
    const onceki = path.join(KLASOR, `geri-oncesi-${damga()}.db`);
    fs.mkdirSync(KLASOR, { recursive: true });
    fs.copyFileSync(DB_YOLU, onceki);
    for (const ek of ['-wal', '-shm']) fs.rmSync(DB_YOLU + ek, { force: true });
    fs.copyFileSync(kaynak, DB_YOLU);
    console.log('Geri yüklendi. Önceki hal saklandı:', onceki);
  } else {
    const y = yedekAl(); console.log('Yedek alındı:', y.dosya, (y.boyut / 1048576).toFixed(1) + ' MB');
    console.log('Temizlenen eski yedek:', eskileriTemizle());
  }
}
