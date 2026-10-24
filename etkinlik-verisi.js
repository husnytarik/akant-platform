// Örnek etkinlik verisi: geçmiş yoklamalar, işlenen konular, ödevler ve etütler.
// Önce ornek-veri.js çalışmış olmalı (sınıf, öğretmen, program). Tekrar çalıştırılırsa bir şey eklemez.
import { db } from './db.js';
import { dersKazanimlari } from './kazanim.js';

const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const kaydir = (t, n) => {
  const d = new Date(t + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const gunNo = t => new Date(t + 'T00:00:00Z').getUTCDay();
const sec = a => a[Math.floor(Math.random() * a.length)];
const karistir = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const KONULAR = ['Giriş ve tekrar', 'Yeni konu anlatımı', 'Alıştırmalar', 'Uygulama çalışması', 'Konu özeti', 'Soru çözümü', 'Değerlendirme', 'Grup çalışması'];
// Derse özgü, gerçekçi ödevler: [başlık, açıklama]
const ODEVLER = {
  'Türkçe': [
    ['Okuma günlüğü: bir bölüm özeti', 'Okuduğun kitabın bu haftaki bölümünü 5-6 cümleyle özetle. Bölümde geçen yeni 5 kelimeyi anlamlarıyla birlikte defterine yaz.'],
    ['Paragraf soruları', 'Ders kitabı sayfa 52-53 paragraf sorularını çöz. Her sorunun yanına ana fikri bulduğun cümlenin altını çizdiğin satırı yaz.'],
    ['Kısa yazı: Hayalimdeki okul', 'Hayalindeki okulu anlatan 8-10 cümlelik bir yazı yaz. Yazında en az üç sıfat ve iki bağlaç kullan, noktalama işaretlerine dikkat et.'],
  ],
  'Matematik': [
    ['Problem seti: kesirlerle işlemler', 'Çalışma kâğıdındaki 12 problemi defterine çöz. İşlem basamaklarını yaz; sonucu hem kesir hem karma sayı olarak göster.'],
    ['Ders kitabı alıştırmaları', 'Sayfa 64-65, 1-10. sorular. Çözemediğin soruların numarasını işaretle, derste birlikte bakacağız.'],
    ['Günlük hayattan kesir', 'Evde bir yemek tarifi seç; malzeme miktarlarını yarıya ve iki katına çıkararak yeni bir tablo hazırla.'],
  ],
  'Fen Bilimleri': [
    ['Mıknatıs deneyi raporu', 'Evde bulunan 10 eşyayı mıknatısla dene. Çeken ve çekmeyenleri iki sütunlu tabloya yaz, bir sonuç cümlesi ekle.'],
    ['Konu özeti ve kavram haritası', 'Bu haftaki üniteyi bir sayfada kavram haritası olarak özetle. Harita en az 8 kavram ve bağlantı sözcükleri içersin.'],
    ['Test çözümü', 'Çalışma kitabı sayfa 38 testini zaman tutarak çöz. Süreni ve yanlış yaptığın soruların numaralarını yaz.'],
  ],
  'Sosyal Bilgiler': [
    ['Aile tarihi röportajı', 'Büyüklerinden biriyle çocukluğundaki bir okul günü hakkında konuş. Öğrendiklerini 6-8 cümleyle yaz, mümkünse eski bir fotoğraf ekle.'],
    ['Harita çalışması', 'Atlasından Türkiye siyasi haritasını çiz; komşu ülkeleri ve çevre denizleri etiketle.'],
    ['Ders kitabı soruları', 'Sayfa 44-45 "Değerlendirelim" soruları. Cevaplarını tam cümleyle yaz.'],
  ],
  'İngilizce': [
    ['Vocabulary practice', 'Learn the 12 new words in Unit 3. Write each word in a sentence of your own (12 sentences) and be ready for a short quiz.'],
    ['Workbook pages', 'Workbook pages 28-29. Complete all exercises and record yourself reading the dialogue on page 29 (optional).'],
    ['My daily routine', 'Write 8 sentences about your daily routine using "first, then, after that". Use present simple tense.'],
  ],
  'Görsel Sanatlar': [
    ['Sonbahar teması resim', 'Sonbaharı anlatan bir resim yap. Sulu boya veya pastel kullanabilirsin; bir sonraki derse A4 kâğıtta getir.'],
    ['Malzeme hazırlığı', 'Gelecek haftaki kolaj çalışması için eski dergi ve gazete kesikleri, makas ve yapıştırıcı getir.'],
  ],
  'Müzik': [
    ['Şarkı sözü ezberi', 'Derste öğrendiğimiz şarkının ilk iki kıtasını ezberle. Gelecek derste tek tek söyleyeceğiz.'],
    ['Dinleme çalışması', 'Sevdiğin bir müzik parçasını dinle; hangi çalgıları duyduğunu ve parçanın sende bıraktığı duyguyu 3-4 cümleyle yaz.'],
  ],
  'Bilişim': [
    ['Güvenli internet kuralları', 'Güvenli internet kullanımı için kendi 5 maddelik kural listeni hazırla ve bir posterde göster.'],
    ['Klavye alıştırması', 'Haftada üç gün, günde 10 dakika on parmak klavye alıştırması yap; ilerlemeni not et.'],
  ],
  'Beden Eğitimi': [
    ['Haftalık hareket takvimi', 'Bu hafta her gün en az 30 dakika hareket et. Ne yaptığını ve süresini tabloya işle, velinin imzasını aldır.'],
    ['Spor kıyafeti hatırlatması', 'Gelecek ders için spor kıyafetini ve yedek çorabını unutma.'],
  ],
  'Din Kültürü': [
    ['Değerler çalışması', 'Dürüstlük ve yardımlaşma konusunda yaşadığın ya da tanık olduğun bir örneği 5-6 cümleyle yaz.'],
    ['Ders kitabı soruları', 'Sayfa 30-31 etkinliklerini tamamla; boş bıraktığın etkinlik olmasın.'],
  ],
};
const ODEV_GENEL = [['Konu tekrarı', 'Bu haftaki konuları defterinden tekrar et; anlamadığın yerleri not alıp derste sor.']];
const ETUT_KONULARI = ['Soru çözümü', 'Konu tekrarı', 'Eksik konular', 'Sınav hazırlık', 'Problemler'];

function calistir() {
  if (db.prepare('SELECT COUNT(*) AS n FROM yoklama').get().n > 0) {
    console.log('Etkinlik verisi zaten var, atlandı.');
    return;
  }
  const atamalar = db.prepare(`SELECT a.id, a.class_id AS sinif, a.teacher_membership_id AS ogr, c.name AS ders, cl.name AS sinifAd FROM assignments a JOIN courses c ON c.id = a.course_id JOIN classes cl ON cl.id = a.class_id WHERE a.teacher_membership_id IS NOT NULL`).all();
  if (!atamalar.length) { console.log('Önce ornek-veri.js çalıştırılmalı.'); return; }
  const demoOgr = db.prepare(`SELECT m.id FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.full_name = 'Demo Öğrenci' AND m.role = 'ogrenci'`).get()?.id;
  const sinifOgr = new Map();
  for (const r of db.prepare(`SELECT cs.class_id AS sinif, cs.student_membership_id AS id FROM class_students cs JOIN memberships m ON m.id = cs.student_membership_id WHERE m.status = 'aktif'`).all()) {
    if (!sinifOgr.has(r.sinif)) sinifOgr.set(r.sinif, []);
    sinifOgr.get(r.sinif).push(r.id);
  }
  const simdi = Date.now();
  // Her ders ataması için gerçek (MEB) kazanımlar sırayla işlenir; kazanım bulunamayan derste genel konu kullanılır
  const kazSirasi = new Map(atamalar.map(a => [a.id, { liste: dersKazanimlari(a.ders, parseInt(a.sinifAd, 10)), i: 0 }]));
  const sonrakiKonu = atamaId => {
    const k = kazSirasi.get(atamaId);
    if (!k.liste.length) return { konu: sec(KONULAR), kazanim: null };
    if (k.i % 9 === 4) k.i++; // her dokuzuncu kazanım derste hiç girilmez (müfredat takibi örneği)
    const x = k.liste[k.i++ % k.liste.length];
    const metin = x.metin.replace(/-\s+/g, '');
    return { konu: metin.length > 110 ? metin.slice(0, 107).replace(/\s+\S*$/, '') + '…' : metin, kazanim: ((x.kod ? x.kod + ' – ' : '') + metin).slice(0, 300) };
  };

  db.exec('BEGIN');
  try {
    // Son 3 haftanın geçmiş iş günleri için yoklama
    const programlar = db.prepare('SELECT class_id, day, period, assignment_id FROM schedule').all();
    const yEkle = db.prepare('INSERT INTO yoklama (class_id, date, period, assignment_id, teacher_membership_id, created_at, updated_at, topic, kazanim, completed_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const konuEkle = db.prepare('INSERT INTO konular (assignment_id, date, title, note, created_at, yoklama_id) VALUES (?,?,?,?,?,?)');
    const kEkle = db.prepare('INSERT INTO yoklama_kayit (yoklama_id, student_membership_id, status) VALUES (?,?,?)');
    const ogrOf = new Map(atamalar.map(a => [a.id, a.ogr]));
    // Her öğrenci için hafif bir devamsızlık eğilimi: çoğu öğrenci neredeyse hiç, bazıları sık
    const egilim = new Map();
    for (const ids of sinifOgr.values()) for (const id of ids) egilim.set(id, Math.random() < 0.15 ? 0.15 : 0.02);
    if (demoOgr) egilim.set(demoOgr, 0.12);
    let yoklamaSayisi = 0;
    for (let n = 21; n >= 1; n--) {
      const t = kaydir(bugun, -n);
      const gun = gunNo(t);
      if (gun < 1 || gun > 5) continue;
      for (const p of programlar.filter(p => p.day === gun)) {
        const bitti = Math.random() < 0.92; // %8 ders tamamlanmamış (süresi geçen ders hatırlatması için örnek)
        const kv = bitti ? sonrakiKonu(p.assignment_id) : null;
        const yid = Number(yEkle.run(p.class_id, t, p.period, p.assignment_id, ogrOf.get(p.assignment_id), simdi, simdi, kv?.konu ?? null, kv?.kazanim ?? null, bitti ? simdi : null).lastInsertRowid);
        if (kv) konuEkle.run(p.assignment_id, t, kv.konu, kv.kazanim ? 'Kazanım: ' + kv.kazanim : null, simdi, yid);
        for (const id of sinifOgr.get(p.class_id) || []) {
          const x = Math.random();
          const e = egilim.get(id) || 0.02;
          const durum = x < e ? 'gelmedi' : x < e + 0.015 ? 'gec' : x < e + 0.03 ? 'izinli' : 'geldi';
          kEkle.run(yid, id, durum);
        }
        yoklamaSayisi++;
      }
    }

    // Konular ve ödevler
    const odevEkle = db.prepare('INSERT INTO odevler (assignment_id, title, note, due_date, created_at, kazanim) VALUES (?,?,?,?,?,?)');
    let odevSayisi = 0;
    for (const a of atamalar) {
      if (Math.random() < 0.7) {
        const [baslik, not] = sec(ODEVLER[a.ders] || ODEV_GENEL);
        odevEkle.run(a.id, baslik, not, kaydir(bugun, Math.floor(Math.random() * 12) - 3), simdi, sonrakiKonu(a.id).kazanim);
        odevSayisi++;
      }
    }
    // Demo öğretmenin dersleri için garanti kayıt
    const demoOgrt = db.prepare(`SELECT m.id FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.full_name = 'Ceren Husny' AND m.role = 'ogretmen'`).get()?.id;
    for (const a of atamalar.filter(a => a.ogr === demoOgrt)) {
      const [baslik, not] = (ODEVLER[a.ders] || ODEV_GENEL)[0];
      odevEkle.run(a.id, baslik, not, kaydir(bugun, 4), simdi, sonrakiKonu(a.id).kazanim);
      odevSayisi++;
    }

    // Etütler: geçmiş (yoklamalı) ve yaklaşan
    const etutEkle = db.prepare(`INSERT INTO etutler (teacher_membership_id, course_id, topic, date, start_time, duration_min, place, note, status, created_at)
                                 VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const katEkle = db.prepare(`INSERT INTO etut_katilimcilar (etut_id, student_membership_id, parent_response, responded_at, attendance)
                                VALUES (?,?,?,?,?)`);
    const ogretmenler = [...new Set(atamalar.map(a => a.ogr))];
    const secili = karistir([...ogretmenler]).slice(0, 12);
    if (demoOgrt && !secili.includes(demoOgrt)) secili.push(demoOgrt);
    let etutSayisi = 0;
    for (const ogr of secili) {
      const benimAtamalar = atamalar.filter(a => a.ogr === ogr);
      const dersId = db.prepare('SELECT course_id AS c FROM assignments WHERE id = ?').get(benimAtamalar[0].id).c;
      const planlar = [{ gun: -(2 + Math.floor(Math.random() * 10)), gecmis: true }, { gun: -(1 + Math.floor(Math.random() * 5)), gecmis: true },
        { gun: 1 + Math.floor(Math.random() * 6), gecmis: false }];
      for (const pl of planlar) {
        let t = kaydir(bugun, pl.gun);
        while (gunNo(t) === 0 || gunNo(t) === 6) t = kaydir(t, pl.gecmis ? -1 : 1);
        const saat = sec(['15:30', '16:20', '17:10']);
        const id = Number(etutEkle.run(ogr, dersId, sec(ETUT_KONULARI), t, saat, 40, sec(['Sınıfta', 'Kütüphane', 'Etüt odası']), null, 'planli', simdi).lastInsertRowid);
        const sinifId = sec(benimAtamalar).sinif;
        let kisiler = karistir([...(sinifOgr.get(sinifId) || [])]).slice(0, 4 + Math.floor(Math.random() * 5));
        if (ogr === demoOgrt && demoOgr && !kisiler.includes(demoOgr)) kisiler.push(demoOgr);
        for (const k of kisiler) {
          const yanit = pl.gecmis ? (Math.random() < 0.85 ? 'gelecek' : 'gelmeyecek') : sec(['gelecek', 'gelecek', 'bekliyor', 'gelmeyecek']);
          let devam = null;
          if (pl.gecmis) devam = yanit === 'gelecek' ? (Math.random() < 0.9 ? 'geldi' : 'gelmedi') : sec(['gelmedi', 'izinli']);
          katEkle.run(id, k, yanit, yanit === 'bekliyor' ? null : simdi, devam);
        }
        etutSayisi++;
      }
    }
    db.exec('COMMIT');
    console.log(`Eklendi: ${yoklamaSayisi} ders yoklaması, ${db.prepare('SELECT COUNT(*) AS n FROM konular').get().n} konu, ${odevSayisi} ödev, ${etutSayisi} etüt.`);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

calistir();
