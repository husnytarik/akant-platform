// Örnek kulüp verisi: kulüp saatleri, kulüpler, üyeler ve geçmiş haftalık çalışmalar.
// Önce ornek-veri.js çalışmış olmalı (sınıf, öğretmen, program). Tekrar çalıştırılırsa bir şey eklemez.
import { db } from './db.js';
import { KULUP_DERSI } from './ders-programi.js';

const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const kaydir = (t, n) => {
  const d = new Date(t + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const GUN = 3, SAAT = 7; // Çarşamba, 7. ders: programda boş olduğu için tüm düzeyler aynı kulüp saatini kullanır

const KULUPLER = [
  { ad: 'Robotik ve Kodlama', tema: 'Bilim ve teknoloji', aciklama: 'Her hafta bir devre ya da robot projesi tasarlıyor, kodluyor ve deniyoruz.', hoca: 'Merve Türk', duzeyler: ['5', '6'], kontenjan: 14,
    calismalar: [['deney', 'Basit elektrik devresi', 'Pil, ampul ve anahtarla devre kurduk.'], ['proje', 'Engelden kaçan robot', 'Sensör bağlantısını yaptık, kodu yazmaya başladık.'], ['proje', 'Engelden kaçan robot: test', 'Robotları pistte denedik.']] },
  { ad: 'Bilim ve Deney', tema: 'Fen', aciklama: 'Evde bulunan malzemelerle haftalık deneyler yapıp sonuçları tartışıyoruz.', hoca: 'Ceren Husny', duzeyler: ['4', '5', '6'], kontenjan: 16,
    calismalar: [['deney', 'Yanardağ deneyi', 'Karbonat ve sirke ile yanardağ yaptık.'], ['deney', 'Yoğunluk kuleleri', 'Farklı sıvılarla yoğunluk kulesi kurduk.'], ['sunum', 'Bilim fuarı hazırlığı', 'Standlar için proje seçimi yapıldı.']],
    plan: ['deney', 'Asit ve baz göstergeleri', 'Mor lahana suyuyla gösterge hazırlanacak; malzemeler: lahana, limon, karbonat.'] },
  { ad: 'Satranç ve Zeka Oyunları', tema: 'Strateji', aciklama: 'Açılış stratejileri, bulmacalar ve okul içi turnuvalar.', hoca: 'Ahmet Tekin', duzeyler: ['4', '5', '6'], kontenjan: 12,
    calismalar: [['diger', 'Açılış ilkeleri', 'Merkezi ele geçirme ve taş gelişimi.'], ['diger', 'Mini turnuva', 'Kendi aramızda turnuva oynadık.']] },
  { ad: 'Müzik ve Koro', tema: 'Sanat', aciklama: 'Koro çalışması ve yıl sonu konseri için repertuvar hazırlığı.', hoca: 'Efe Öztürk', duzeyler: ['4', '5'], kontenjan: 20,
    calismalar: [['diger', 'Ses ısınma çalışması', 'Nefes ve ses ısınma egzersizleri.'], ['sunum', 'Yıl sonu konseri provası', 'İlk iki parçanın provası.']] },
  { ad: 'İngilizce Drama', tema: 'Dil ve sahne', aciklama: 'İngilizce kısa oyunlar ve doğaçlama çalışmaları.', hoca: 'Ayşe Aksoy', duzeyler: ['5', '6'], kontenjan: 12,
    calismalar: [['sunum', 'Kısa skeç', 'Rol dağılımı yapıldı ve ilk okuma yapıldı.']] },
];

function calistir() {
  if (db.prepare('SELECT COUNT(*) AS n FROM kulupler').get().n > 0) {
    console.log('Kulüp verisi zaten var, atlandı.');
    return;
  }
  const kulupDersi = db.prepare('SELECT id FROM courses WHERE name = ?').get(KULUP_DERSI)?.id;
  const sube = db.prepare("SELECT branch_id FROM memberships WHERE role = 'yonetim' LIMIT 1").get()?.branch_id;
  const siniflar = db.prepare('SELECT id, name FROM classes WHERE branch_id = ? ORDER BY name').all(sube);
  if (!kulupDersi || !siniflar.length) { console.log('Önce ornek-veri.js çalıştırılmalı.'); return; }

  // Kulüp saati: her sınıfın programında Çarşamba 7. ders
  const atamaEkle = db.prepare('INSERT INTO assignments (class_id, course_id, teacher_membership_id, weekly_hours) VALUES (?,?,NULL,1)');
  for (const s of siniflar) {
    if (db.prepare('SELECT 1 FROM schedule WHERE class_id = ? AND day = ? AND period = ?').get(s.id, GUN, SAAT)) continue;
    const a = db.prepare('SELECT id FROM assignments WHERE class_id = ? AND course_id = ?').get(s.id, kulupDersi)?.id
      || Number(atamaEkle.run(s.id, kulupDersi).lastInsertRowid);
    db.prepare('INSERT INTO schedule (class_id, day, period, assignment_id) VALUES (?,?,?,?)').run(s.id, GUN, SAAT, a);
  }

  // Öğrenciler düzeylerine göre sıralanır; demo öğrenci kulübe yerleştirilmez (talep akışı gösterilebilsin)
  const ogrenciler = db.prepare(`SELECT m.id, u.full_name AS ad, c.name AS sinif FROM class_students cs JOIN classes c ON c.id = cs.class_id
    JOIN memberships m ON m.id = cs.student_membership_id JOIN users u ON u.id = m.user_id
    WHERE m.status = 'aktif' AND c.branch_id = ? ORDER BY c.name, u.full_name`).all(sube).filter(o => o.ad !== 'Demo Öğrenci');
  const duzey = ad => String(ad).match(/^\d+/)?.[0] || ad;
  const simdi = Date.now();
  const sonCarsambalar = [3, 2, 1].map(n => { let t = kaydir(bugun, -1); while (new Date(t + 'T00:00:00Z').getUTCDay() !== GUN) t = kaydir(t, -1); return kaydir(t, -7 * (n - 1)); });

  const yerlesen = new Set();
  let numara = 0;
  for (const k of KULUPLER) {
    const hoca = db.prepare(`SELECT m.id FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.full_name = ? AND m.role = 'ogretmen' AND m.branch_id = ?`).get(k.hoca, sube)?.id;
    if (!hoca) { console.log(`${k.hoca} bulunamadı, ${k.ad} atlandı.`); continue; }
    const id = Number(db.prepare('INSERT INTO kulupler (branch_id, ad, tema, aciklama, kontenjan, gun, ders_saati, seviyeler, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(sube, k.ad, k.tema, k.aciklama, k.kontenjan, GUN, SAAT, k.duzeyler.join(','), simdi).lastInsertRowid);
    db.prepare('INSERT INTO kulup_ogretmen (kulup_id, teacher_membership_id) VALUES (?,?)').run(id, hoca);

    // Her kulübe uygun düzeylerden sırayla birkaç öğrenci
    const adaylar = ogrenciler.filter(o => k.duzeyler.includes(duzey(o.sinif)) && !yerlesen.has(o.id) && (numara++ % 3 !== 0));
    const uyeler = adaylar.slice(0, Math.min(k.kontenjan - 2, 9));
    for (const o of uyeler) {
      db.prepare('INSERT INTO kulup_uyeler (kulup_id, student_membership_id, tarih) VALUES (?,?,?)').run(id, o.id, simdi);
      db.prepare('INSERT INTO kulup_talepleri (student_membership_id, kulup_id, sira, durum, tarih) VALUES (?,?,1,?,?)').run(o.id, id, 'kabul', simdi);
      yerlesen.add(o.id);
    }
    k.calismalar.forEach(([tur, baslik, aciklama], i) => {
      const tarih = sonCarsambalar[i] || sonCarsambalar[0];
      const cid = Number(db.prepare('INSERT INTO kulup_calismalar (kulup_id, tarih, tur, baslik, aciklama, teacher_membership_id, created_at, tamamlandi) VALUES (?,?,?,?,?,?,?,?)')
        .run(id, tarih, tur, baslik, aciklama, hoca, simdi, simdi).lastInsertRowid);
      uyeler.forEach((o, j) => db.prepare('INSERT INTO kulup_katilim (calisma_id, student_membership_id, durum) VALUES (?,?,?)')
        .run(cid, o.id, (j + i) % 7 === 3 ? 'gelmedi' : (j + i) % 11 === 5 ? 'izinli' : 'geldi'));
    });
    // Önümüzdeki hafta için önceden yazılmış plan (yoklama ders saatinde alınır)
    if (k.plan) {
      let t = bugun;
      while (new Date(t + 'T00:00:00Z').getUTCDay() !== GUN || t <= bugun) t = kaydir(t, 1);
      db.prepare('INSERT INTO kulup_calismalar (kulup_id, tarih, tur, baslik, aciklama, teacher_membership_id, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(id, t, k.plan[0], k.plan[1], k.plan[2], hoca, simdi);
    }
  }

  // Yerleşmemiş birkaç öğrenci tercih listesi göndermiş (yönetim "Talepler" ekranı dolu görünsün)
  const kulupIdleri = db.prepare('SELECT id, seviyeler FROM kulupler ORDER BY id').all();
  let bekleyen = 0;
  for (const o of ogrenciler) {
    if (yerlesen.has(o.id) || bekleyen >= 8) continue;
    const uygun = kulupIdleri.filter(k => k.seviyeler.split(',').includes(duzey(o.sinif))).slice(bekleyen % 2, (bekleyen % 2) + 2);
    uygun.forEach((k, i) => db.prepare('INSERT INTO kulup_talepleri (student_membership_id, kulup_id, sira, tarih) VALUES (?,?,?,?)').run(o.id, k.id, i + 1, simdi));
    if (uygun.length) bekleyen++;
  }
  console.log(`Kulüp verisi eklendi: ${db.prepare('SELECT COUNT(*) AS n FROM kulupler').get().n} kulüp, ${yerlesen.size} üye, ${bekleyen} bekleyen talep.`);
}

calistir();
