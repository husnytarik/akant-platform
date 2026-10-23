// Örnek ödev takibi verisi: öğrencilerin işaretleri, öğretmen doğrulamaları, birkaç fotoğraf ve soru-cevap.
// Önce ornek-veri.js çalışmış olmalı (ödevler orada oluşur). Tekrar çalıştırılırsa bir şey eklemez.
import { deflateSync, crc32 } from 'node:zlib';
import { db } from './db.js';

// Küçük, düz renk geçişli bir PNG üretir (gerçek fotoğraf yerine örnek)
function png(w, h, r, g, b) {
  const satirlar = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w * 3 + 1);
    for (let x = 0; x < w; x++) {
      const t = (x + y) / (w + h);
      satirlar[o + 1 + x * 3] = Math.round(r + (255 - r) * t * 0.6);
      satirlar[o + 2 + x * 3] = Math.round(g + (255 - g) * t * 0.6);
      satirlar[o + 3 + x * 3] = Math.round(b + (255 - b) * t * 0.6);
    }
  }
  const parca = (tur, veri) => {
    const u = Buffer.alloc(4); u.writeUInt32BE(veri.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([Buffer.from(tur), veri])) >>> 0);
    return Buffer.concat([u, Buffer.from(tur), veri, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), parca('IHDR', ihdr), parca('IDAT', deflateSync(satirlar)), parca('IEND', Buffer.alloc(0))]);
}

function calistir() {
  if (db.prepare('SELECT COUNT(*) AS n FROM odev_durumlari').get().n > 0) {
    console.log('Ödev takibi verisi zaten var, atlandı.');
    return;
  }
  const odevler = db.prepare(`SELECT od.id, a.class_id AS sinifId, a.teacher_membership_id AS ogretmenId FROM odevler od JOIN assignments a ON a.id = od.assignment_id
    WHERE a.teacher_membership_id IS NOT NULL ORDER BY od.id`).all();
  if (!odevler.length) { console.log('Önce ornek-veri.js çalıştırılmalı.'); return; }
  const simdi = Date.now();
  const durum = db.prepare('INSERT INTO odev_durumlari (odev_id, student_membership_id, durum, ogrenci_notu, ogretmen_notu, isaret_zamani, dogrulama_zamani, guncelleme) VALUES (?,?,?,?,?,?,?,?)');
  const dosya = db.prepare("INSERT INTO odev_dosyalari (odev_id, student_membership_id, mesaj_id, amac, mime, boyut, veri, created_at) VALUES (?,?,?,?,'image/png',?,?,?)");
  const mesaj = db.prepare('INSERT INTO odev_mesajlari (odev_id, student_membership_id, yazan_membership_id, yazan_rol, metin, okundu, created_at) VALUES (?,?,?,?,?,?,?)');
  const renkler = [[90, 140, 200], [200, 150, 90], [110, 170, 120]];
  let sayi = 0;
  let demoSayac = 0; // Demo öğrencinin ödev sırası: durumlar ve sorular onun ekranında çeşitli görünsün

  odevler.forEach((od, oi) => {
    const ogrenciler = db.prepare(`SELECT m.id, u.full_name AS ad FROM class_students cs JOIN memberships m ON m.id = cs.student_membership_id JOIN users u ON u.id = m.user_id
      WHERE cs.class_id = ? AND m.status = 'aktif' ORDER BY (u.full_name = 'Demo Öğrenci') DESC, u.full_name`).all(od.sinifId);
    ogrenciler.forEach((s, si) => {
      // Demo öğrenci: ödevlerin bir kısmı henüz işaretlenmemiş kalır, diğerleri çeşitli aşamalarda
      const demoMu = s.ad === 'Demo Öğrenci';
      const kalip = ['dogrulandi', 'yapildi', null, 'duzeltme', 'yapilamadi', 'dogrulandi', 'yapildi'][((demoMu ? demoSayac++ : oi) + si * 2) % 7];
      if (!kalip) return;
      const isaret = simdi - (si + 1) * 36e5;
      durum.run(od.id, s.id, kalip,
        kalip === 'yapilamadi' ? 'Son soruyu çözemedim.' : kalip === 'yapildi' && si % 3 === 0 ? 'Defterime yazdım.' : null,
        kalip === 'duzeltme' ? 'Üçüncü soruda birimleri yazmayı unutmuşsun, düzeltip tekrar işaretle.' : kalip === 'dogrulandi' && si % 2 === 0 ? 'Düzenli, tebrikler.' : null,
        isaret, kalip === 'dogrulandi' ? isaret + 36e5 : null, isaret);
      sayi++;
      if (kalip === 'yapildi' || kalip === 'dogrulandi') {
        const k = renkler[(oi + si) % 3];
        const p = png(240, 180, ...k);
        dosya.run(od.id, s.id, null, 'teslim', p.length, p, isaret);
      }
    });
    // İlk iki ödevde demo öğrenci soru sormuş: biri yanıtlanmış, biri yanıt bekliyor
    const demo = ogrenciler[0];
    if (demo?.ad === 'Demo Öğrenci' && demoSayac <= 2) {
      const oi = demoSayac - 1;
      const sor = mesaj.run(od.id, demo.id, demo.id, 'ogrenci', oi === 0 ? 'Hocam ikinci soruda birimi nasıl yazmalıyım?' : 'Bu ödevde kaynak kitaptan mı çözeceğiz, çalışma kağıdından mı?', oi === 0 ? 1 : 0, simdi - 5 * 36e5);
      if (oi === 0) {
        mesaj.run(od.id, demo.id, od.ogretmenId, 'ogretmen', 'Sonucu hem sayı hem birim olarak yaz, örnek çözüm defterinde 41. sayfada.', 0, simdi - 3 * 36e5);
        const p = png(240, 180, 200, 120, 120);
        dosya.run(od.id, demo.id, Number(sor.lastInsertRowid), 'soru', p.length, p, simdi - 5 * 36e5);
      }
    }
  });
  console.log(`Ödev takibi verisi eklendi: ${sayi} durum.`);
}
calistir();
