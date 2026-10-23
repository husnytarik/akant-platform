// Örnek gelişim raporu verisi: başlıklar, üç dönem (kapanmış, açık, yaklaşan), öğretmen gözlemleri ve veli görüşmeleri.
// Önce ornek-veri.js çalışmış olmalı (sınıf, öğretmen, atama). Tekrar çalıştırılırsa bir şey eklemez.
import { db } from './db.js';

const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const kaydir = (t, n) => {
  const d = new Date(t + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const BASLIKLAR = [
  ['Akademik süreç', 'Derse hazırlık, kazanımlara ulaşma düzeyi, ödev ve değerlendirme sonuçları'],
  ['Dikkat ve ders içi davranış', 'Derse katılım, dikkatini sürdürme, ders akışına uyum'],
  ['Sosyal ilişkiler ve iletişim', 'Arkadaşları ve öğretmenlerle iletişimi, iş birliği'],
  ['Sorumluluk ve öz düzenleme', 'Görev bilinci, zaman yönetimi, kendini değerlendirme'],
];

const METINLER = [
  [
    ['Derse hazırlıklı geliyor, ödevlerini düzenli teslim ediyor. Son yazılıda kazanımların büyük bölümünde başarılı.', 'Bazı konularda temel eksikleri var; kısa tekrar çalışmalarıyla desteklenmesi iyi olur.', 'Başarısı dönem içinde istikrarlı biçimde yükseldi.'],
    ['Derse ilgili ve merakla katılıyor, sorular soruyor.', 'Dikkati ders ortasında zaman zaman dağılıyor; ön sıralarda oturması yardımcı oluyor.', 'Ders içi davranışları örnek niteliğinde.'],
    ['Arkadaşlarıyla uyumlu, grup çalışmalarında iş birliğine açık.', 'Sınıfta daha çekingen; küçük gruplarda kendini daha rahat ifade ediyor.', 'İletişimi saygılı ve yapıcı, akran çatışmalarında arabulucu olabiliyor.'],
    ['Görevlerini zamanında yerine getiriyor, eşyalarına özen gösteriyor.', 'Zaman planlaması konusunda desteğe ihtiyaç duyuyor; ödev takvimi birlikte oluşturulabilir.', 'Kendi hatalarını fark edip düzeltmeye çalışıyor.'],
  ],
];

function calistir() {
  if (db.prepare('SELECT COUNT(*) AS n FROM gelisim_basliklari').get().n > 0) {
    console.log('Gelişim verisi zaten var, atlandı.');
    return;
  }
  const sube = db.prepare("SELECT branch_id FROM memberships WHERE role = 'yonetim' LIMIT 1").get()?.branch_id;
  const siniflar = db.prepare('SELECT id, name FROM classes WHERE branch_id = ? ORDER BY name').all(sube);
  if (!sube || !siniflar.length) { console.log('Önce ornek-veri.js çalıştırılmalı.'); return; }
  const simdi = Date.now();

  const baslikIds = BASLIKLAR.map(([ad, aciklama], i) =>
    Number(db.prepare('INSERT INTO gelisim_basliklari (branch_id, ad, aciklama, sira) VALUES (?,?,?,?)').run(sube, ad, aciklama, i + 1).lastInsertRowid));

  const donemEkle = (ad, bas, bit, top) =>
    Number(db.prepare('INSERT INTO gelisim_donemleri (branch_id, ad, baslangic, bitis, toplanti_tarihi, created_at) VALUES (?,?,?,?,?,?)').run(sube, ad, bas, bit, top, simdi).lastInsertRowid);
  const kapali = donemEkle('1. Dönem (Eylül – Ekim)', kaydir(bugun, -55), kaydir(bugun, -10), kaydir(bugun, -6));
  const acik = donemEkle('2. Dönem (Kasım)', kaydir(bugun, -3), kaydir(bugun, 20), kaydir(bugun, 26));
  donemEkle('3. Dönem (Şubat)', kaydir(bugun, 100), kaydir(bugun, 125), kaydir(bugun, 131));

  const giris = db.prepare('INSERT OR REPLACE INTO gelisim_girisleri (donem_id, baslik_id, student_membership_id, teacher_membership_id, metin, guncelleme) VALUES (?,?,?,?,?,?)');
  const gor = db.prepare('INSERT INTO gelisim_gorusmeleri (student_membership_id, donem_id, tur, tarih, notu, yazan_membership_id, created_at) VALUES (?,?,?,?,?,?,?)');
  const sablon = METINLER[0];
  let sayi = 0;

  for (const s of siniflar) {
    const ogretmenler = db.prepare(`SELECT DISTINCT a.teacher_membership_id AS id FROM assignments a WHERE a.class_id = ? AND a.teacher_membership_id IS NOT NULL ORDER BY a.id LIMIT 4`).all(s.id).map(r => r.id);
    const sinifHocasi = db.prepare('SELECT homeroom_membership_id AS id FROM classes WHERE id = ?').get(s.id)?.id;
    if (sinifHocasi && !ogretmenler.includes(sinifHocasi)) ogretmenler.unshift(sinifHocasi);
    const ogrenciler = db.prepare(`SELECT m.id, u.full_name AS ad FROM class_students cs JOIN memberships m ON m.id = cs.student_membership_id
      JOIN users u ON u.id = m.user_id WHERE cs.class_id = ? AND m.status = 'aktif' ORDER BY (u.full_name = 'Demo Öğrenci') DESC, u.full_name`).all(s.id);
    ogrenciler.slice(0, 6).forEach((o, oi) => {
      ogretmenler.forEach((t, ti) => {
        // Kapanmış dönem: her öğretmen dört başlığı doldurmuş
        baslikIds.forEach((b, bi) => {
          giris.run(kapali, b, o.id, t, sablon[bi][(oi + ti + bi) % 3], simdi - 12 * 864e5);
          sayi++;
        });
        // Açık dönem: bazı öğrenciler boş, bazıları kısmen dolu
        if (oi % 3 === 0) baslikIds.forEach((b, bi) => { if (bi < 2 + (ti % 3)) giris.run(acik, b, o.id, t, sablon[bi][(oi + ti + bi + 1) % 3], simdi - 864e5); });
      });
      if (oi < 3 && ogretmenler.length) {
        gor.run(o.id, kapali, 'toplanti', kaydir(bugun, -6), 'Veli toplantısına anne katıldı. Akademik gidişat olumlu; ödev düzeni ve ekran süresi konuşuldu. Evde belirli bir çalışma saati belirlenmesi önerildi.', ogretmenler[0], simdi - 6 * 864e5);
        if (oi === 0) gor.run(o.id, null, 'gorusme', kaydir(bugun, -1), 'Veli telefonla arandı. Öğrencinin sabahları derse geç kalmasının nedenleri görüşüldü; servis saatinin kontrol edilmesi istendi.', ogretmenler[0], simdi - 864e5);
      }
    });
  }
  console.log(`Gelişim verisi eklendi: ${BASLIKLAR.length} başlık, 3 dönem, ${sayi} giriş.`);
}
calistir();
