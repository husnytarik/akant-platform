import { db } from './db.js';

const bugun = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const tarihGecerli = t => /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t));
const tamSayi = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const SIKLAR = 'ABCDE';

function islem(fn) {
  db.exec('BEGIN');
  try { const s = fn(); db.exec('COMMIT'); return s; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

const anahtarTemiz = (a, n) => {
  const t = String(a || '').toLocaleUpperCase('en').replace(/[\s,;]/g, '');
  return t.length === n && [...t].every(c => SIKLAR.includes(c)) ? t : null;
};
// Öğrenci cevabı: A-E işaretli, diğer her karakter (boşluk, '-', '.', '*') boş; kısa kalırsa boşla tamamlanır
const cevapTemiz = (c, n) => {
  const t = String(c || '').toLocaleUpperCase('en').replace(/\s/g, ' ');
  return Array.from({ length: n }, (_, i) => (SIKLAR.includes(t[i]) ? t[i] : '-')).join('');
};

// Tek öğrencinin bir dersteki sonucu. İptal edilen soru herkese doğru sayılır.
function hesapla(anahtar, iptal, cevap, kat) {
  let dogru = 0, yanlis = 0, bos = 0;
  for (let i = 0; i < anahtar.length; i++) {
    if (iptal.includes(i + 1) || cevap[i] === anahtar[i]) dogru++;
    else if (cevap[i] === '-') bos++;
    else yanlis++;
  }
  const net = dogru - (kat > 0 ? yanlis / kat : 0);
  const puan = anahtar.length ? Math.max(0, net) / anahtar.length * 100 : 0;
  return { dogru, yanlis, bos, net: Math.round(net * 100) / 100, puan: Math.round(puan * 10) / 10 };
}

// Bir öğrencinin kazanım durumu: aynı kazanımı ölçen sorular birleştirilir, iptal sorular dışarıda kalır
function kazanimDurum(kazList, anahtar, iptal, cevap) {
  const grup = new Map();
  kazList.forEach((k, i) => {
    if (!k || iptal.includes(i + 1)) return;
    const g = grup.get(k) || { kazanim: k, sorular: [], dogru: 0 };
    g.sorular.push(i + 1);
    if (cevap[i] === anahtar[i]) g.dogru++;
    grup.set(k, g);
  });
  return [...grup.values()].map(g => {
    const oran = Math.round(g.dogru / g.sorular.length * 100);
    return { ...g, toplam: g.sorular.length, oran, durum: oran >= 70 ? 'Edinildi' : oran >= 40 ? 'Kısmen' : 'Eksik' };
  }).sort((a, b) => a.oran - b.oran || a.sorular[0] - b.sorular[0]);
}

// Kazanım eşleştirme anahtarı: "MAT.5.1.2 – metin" biçiminde kod, değilse küçük harfli serbest metin
const kazAnahtar = k => { const t = String(k || '').trim(), i = t.indexOf(' – '); return (i > 0 ? t.slice(0, i) : t).toLocaleLowerCase('tr'); };
const kazEslesir = (sinavKaz, dersKaz) => {
  const a = kazAnahtar(sinavKaz), b = kazAnahtar(dersKaz);
  return a === b || (a.length >= 4 && String(dersKaz).toLocaleLowerCase('tr').includes(a)) || (b.length >= 4 && String(sinavKaz).toLocaleLowerCase('tr').includes(b));
};
// Sınav tarihine kadar sınıfta işlenen kazanımlar: sınıf -> ders adı -> [{ kazanim, yoklamaId, durum: {ogrenciId: 'geldi'|...} }]
function islenenKazanimlar(sinifIdleri, sinavTarihi) {
  const harita = new Map();
  for (const sid of sinifIdleri) {
    const dersler = new Map();
    const ekle = (ders, kayit) => { (dersler.get(ders) || dersler.set(ders, []).get(ders)).push(kayit); };
    for (const y of db.prepare(`SELECT y.id, y.kazanim, co.name AS ders FROM yoklama y JOIN assignments a ON a.id = y.assignment_id
      JOIN courses co ON co.id = a.course_id WHERE y.class_id = ? AND y.date <= ? AND y.cancelled = 0 AND y.completed_at IS NOT NULL
        AND y.kazanim IS NOT NULL AND y.kazanim <> ''`).all(sid, sinavTarihi)) {
      const durum = {};
      for (const k of db.prepare('SELECT student_membership_id AS id, status FROM yoklama_kayit WHERE yoklama_id = ?').all(y.id)) durum[k.id] = k.status;
      ekle(y.ders, { kazanim: y.kazanim, durum });
    }
    // Konu kaydına elle girilen kazanımlar (yoklama kaydı olmadığından devam bilgisi yoktur)
    for (const k of db.prepare(`SELECT k.kazanim, co.name AS ders FROM konular k JOIN assignments a ON a.id = k.assignment_id
      JOIN courses co ON co.id = a.course_id WHERE a.class_id = ? AND k.date <= ? AND k.yoklama_id IS NULL AND k.kazanim IS NOT NULL AND k.kazanim <> ''`).all(sid, sinavTarihi)) {
      ekle(k.ders, { kazanim: k.kazanim, durum: null });
    }
    harita.set(sid, dersler);
  }
  return harita;
}
// Öğrencinin bir kazanımı alıp almadığı: islenmedi | devamsiz | katildi | bilinmiyor
function islemeDurumu(islenen, sinifId, ders, ogrenciId, kazanim) {
  const kayitlar = (islenen.get(sinifId)?.get(ders) || []).filter(k => kazEslesir(kazanim, k.kazanim));
  if (!kayitlar.length) return { durum: 'islenmedi', ders: 0, katildi: 0 };
  let katildi = 0, bilgili = 0;
  for (const k of kayitlar) {
    if (!k.durum) continue;
    const d = k.durum[ogrenciId];
    if (d) bilgili++;
    if (d === 'geldi' || d === 'gec') katildi++;
  }
  return { durum: !bilgili ? 'bilinmiyor' : katildi ? 'katildi' : 'devamsiz', ders: kayitlar.length, katildi };
}

const zorluk = y => (y >= 80 ? 'Çok kolay' : y >= 60 ? 'Kolay' : y >= 40 ? 'Orta' : y >= 20 ? 'Zor' : 'Çok zor');

const sinifOgrencileri = idler => idler.length ? db.prepare(`
  SELECT m.id AS ogrenciId, m.okul_no AS okulNo, u.full_name AS ad, c.name AS sinif, c.id AS sinifId
  FROM class_students cs JOIN classes c ON c.id = cs.class_id
  JOIN memberships m ON m.id = cs.student_membership_id JOIN users u ON u.id = m.user_id
  WHERE cs.class_id IN (${idler.map(() => '?').join(',')}) AND m.status = 'aktif'
  ORDER BY c.name, u.full_name`).all(...idler) : [];

// Sınav modülü: öğretmen optik/test sınavı tanımlar, cevap anahtarını girer, öğrenci cevaplarını işler.
export async function sinavApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  if (!yol.startsWith('/api/sinav/')) return false;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };
  const sinavim = id => db.prepare('SELECT * FROM sinavlar WHERE id = ? AND teacher_membership_id = ?').get(id, o.membership_id);
  // Sınav sahibi her şeyi yönetir; sınıflarında o dersi veren diğer öğretmenler yalnızca kendi dersinin kazanımlarını girer
  const erisim = id => {
    const s = db.prepare('SELECT * FROM sinavlar WHERE id = ?').get(id);
    if (!s) return null;
    const dersAd = db.prepare(`SELECT DISTINCT co.name FROM assignments a JOIN courses co ON co.id = a.course_id
      JOIN sinav_siniflar ss ON ss.class_id = a.class_id WHERE ss.sinav_id = ? AND a.teacher_membership_id = ?`)
      .all(id, o.membership_id).map(r => r.name);
    const sahip = s.teacher_membership_id === o.membership_id;
    const duzenle = new Set(dersleri(id).filter(d => sahip || dersAd.includes(d.ders)).map(d => d.id));
    return sahip || duzenle.size ? { s, sahip, duzenle } : null;
  };
  const dersleri = id => db.prepare('SELECT id, ders, soru_sayisi AS soruSayisi, anahtar, iptal FROM sinav_dersler WHERE sinav_id = ? ORDER BY id')
    .all(id).map(d => ({ ...d, iptal: JSON.parse(d.iptal) }));
  const sinavSiniflari = id => db.prepare('SELECT c.id, c.name FROM sinav_siniflar ss JOIN classes c ON c.id = ss.class_id WHERE ss.sinav_id = ? ORDER BY c.name').all(id);

  // Soru başına kazanım: dersId -> [kazanım | null, ...]
  const kazanimlari = sinavId => {
    const harita = new Map(dersleri(sinavId).map(d => [d.id, Array(d.soruSayisi).fill(null)]));
    for (const k of db.prepare(`SELECT k.sinav_ders_id AS dersId, k.soru_no AS no, k.kazanim FROM sinav_kazanim k
      JOIN sinav_dersler d ON d.id = k.sinav_ders_id WHERE d.sinav_id = ?`).all(sinavId)) {
      const dizi = harita.get(k.dersId);
      if (dizi && k.no >= 1 && k.no <= dizi.length) dizi[k.no - 1] = k.kazanim;
    }
    return harita;
  };

  // Sonuç + madde analizi (öğretmen ekranı ve yayınlanmış sınavlarda öğrenci görünümü bunu kullanır)
  const sonucHesapla = (s, kazanimli = false) => {
  const dersler = dersleri(s.id);
  const kaz = kazanimlari(s.id);
  const ogrenciler = sinifOgrencileri(sinavSiniflari(s.id).map(c => c.id));
  const islenen = kazanimli ? islenenKazanimlar(sinavSiniflari(s.id).map(c => c.id), s.date) : null;
  const cevaplar = db.prepare(`SELECT c.sinav_ders_id AS dersId, c.student_membership_id AS ogrenciId, c.cevaplar
    FROM sinav_cevaplar c JOIN sinav_dersler d ON d.id = c.sinav_ders_id WHERE d.sinav_id = ?`).all(s.id);
  const harita = new Map(cevaplar.map(c => [c.dersId + ':' + c.ogrenciId, c.cevaplar]));

  const satirlar = ogrenciler.map(g => {
    const dersSonuc = {}, kazanim = {};
    let topPuan = 0, say = 0;
    for (const d of dersler) {
      const c = harita.get(d.id + ':' + g.ogrenciId);
      if (!c) continue;
      const r = hesapla(d.anahtar, d.iptal, c, s.yanlis_kat);
      dersSonuc[d.id] = r;
      if (kazanimli) kazanim[d.id] = kazanimDurum(kaz.get(d.id), d.anahtar, d.iptal, c).map(k => ({ ...k, isleme: islemeDurumu(islenen, g.sinifId, d.ders, g.ogrenciId, k.kazanim) }));
      topPuan += r.puan; say++;
    }
    return { ogrenciId: g.ogrenciId, okulNo: g.okulNo, ad: g.ad, sinif: g.sinif, dersler: dersSonuc, ...(kazanimli ? { kazanim } : {}), ortalama: say ? Math.round(topPuan / say * 10) / 10 : null };
  });
  const girenler = satirlar.filter(r => r.ortalama !== null).sort((a, b) => b.ortalama - a.ortalama);
  girenler.forEach((r, i) => { r.sira = i + 1; });

  const analiz = dersler.map(d => {
    const girenCevaplar = ogrenciler.map(g => ({ id: g.ogrenciId, c: harita.get(d.id + ':' + g.ogrenciId) })).filter(x => x.c);
    const n = girenCevaplar.length;
    const net = new Map(girenCevaplar.map(x => [x.id, hesapla(d.anahtar, d.iptal, x.c, s.yanlis_kat).net]));
    const sirali = [...girenCevaplar].sort((a, b) => net.get(b.id) - net.get(a.id));
    const grup = Math.round(n * 0.27);
    const ust = sirali.slice(0, grup), alt = sirali.slice(n - grup);
    const sorular = [];
    for (let i = 0; i < d.soruSayisi; i++) {
      const dagilim = { A: 0, B: 0, C: 0, D: 0, E: 0, bos: 0 };
      let dogru = 0, yanlis = 0, bos = 0;
      for (const x of girenCevaplar) {
        const ch = x.c[i];
        if (ch === '-') { bos++; dagilim.bos++; } else { dagilim[ch]++; if (ch === d.anahtar[i]) dogru++; else yanlis++; }
      }
      const iptalMi = d.iptal.includes(i + 1);
      const basari = n ? Math.round((iptalMi ? n : dogru) / n * 1000) / 10 : null;
      const ustD = ust.filter(x => x.c[i] === d.anahtar[i]).length, altD = alt.filter(x => x.c[i] === d.anahtar[i]).length;
      sorular.push({
        no: i + 1, dogruSik: d.anahtar[i], iptal: iptalMi, dogru, yanlis, bos, dagilim, basari,
        zorluk: basari === null ? null : zorluk(basari),
        ayirt: grup >= 1 ? Math.round((ustD - altD) / grup * 100) / 100 : null,
      });
    }
    // Sınıf düzeyi kazanım başarısı: kazanımı ölçen soruların tüm öğrencilerdeki ortalama doğru oranı
    const kazGrup = new Map();
    const islenenAnaliz = kazanimli ? islenen : islenenKazanimlar(sinavSiniflari(s.id).map(c => c.id), s.date);
    const sinifIdsi = new Map(ogrenciler.map(g => [g.ogrenciId, g.sinifId]));
    for (const x of girenCevaplar) for (const k of kazanimDurum(kaz.get(d.id), d.anahtar, d.iptal, x.c)) {
      const g = kazGrup.get(k.kazanim) || { kazanim: k.kazanim, sorular: k.sorular, dogru: 0, toplam: 0, ogr: 0, islenmedi: 0, devamsiz: 0 };
      g.dogru += k.dogru; g.toplam += k.toplam; g.ogr++;
      const im = islemeDurumu(islenenAnaliz, sinifIdsi.get(x.id), d.ders, x.id, k.kazanim).durum;
      if (im === 'islenmedi') g.islenmedi++; else if (im === 'devamsiz') g.devamsiz++;
      kazGrup.set(k.kazanim, g);
    }
    const kazanimlar = [...kazGrup.values()].map(g => ({ kazanim: g.kazanim, sorular: g.sorular, oran: Math.round(g.dogru / g.toplam * 1000) / 10, giren: g.ogr, islenmedi: g.islenmedi, devamsiz: g.devamsiz }))
      .sort((a, b) => a.oran - b.oran);
    return { dersId: d.id, ders: d.ders, giren: n, sorular, kazanimlar };
  });

    return {
      sinav: { id: s.id, ad: s.name, tarih: s.date, yanlisKat: s.yanlis_kat, yayin: !!s.yayin },
      dersler: dersler.map(d => ({ id: d.id, ders: d.ders, soruSayisi: d.soruSayisi })),
      ogrenciler: satirlar, giren: girenler.length, beklenen: ogrenciler.length, analiz,
    };
  };


  // Bir öğrencinin yayınlanmış sınav sonuçları (öğrenci/veli ve mentor öğretmen görünümü ortak kullanır)
  const yayinliSinavlar = ogrId => db.prepare(`SELECT s.* FROM sinavlar s JOIN sinav_siniflar ss ON ss.sinav_id = s.id
      JOIN class_students cs ON cs.class_id = ss.class_id WHERE cs.student_membership_id = ? AND s.yayin = 1 ORDER BY s.date DESC, s.id DESC`).all(ogrId).map(s => {
    const r = sonucHesapla(s, true);
    const g = r.ogrenciler.find(x => x.ogrenciId === ogrId);
    if (!g || g.ortalama === null) return null;
    return {
      ad: s.name, tarih: s.date, yanlisKat: s.yanlis_kat, ortalama: g.ortalama, sira: g.sira, giren: r.giren,
      dersler: r.dersler.filter(d => g.dersler[d.id]).map(d => ({ ders: d.ders, soruSayisi: d.soruSayisi, ...g.dersler[d.id], kazanimlar: g.kazanim[d.id] })),
    };
  }).filter(Boolean);

  // Mentor öğretmen: sınıfındaki bir öğrencinin yayınlanmış sınav sonuçları
  if (req.method === 'GET' && yol === '/api/sinav/ogrenci') {
    if (o.role !== 'ogretmen') return hata(403, 'Bu işlem için yetkiniz yok');
    const id = Number(url.searchParams.get('id'));
    const mentor = db.prepare(`SELECT 1 FROM class_students cs JOIN classes c ON c.id = cs.class_id
      WHERE cs.student_membership_id = ? AND c.homeroom_membership_id = ?`).get(id, o.membership_id);
    if (!mentor) return hata(404, 'Öğrenci bulunamadı');
    json(res, 200, { sinavlar: yayinliSinavlar(id) });
    return true;
  }

  // Öğrenci/veli: yalnızca öğretmenin yayınladığı sınavlar
  if (req.method === 'GET' && yol === '/api/sinav/notlarim') {
    let cocuklar;
    if (o.role === 'ogrenci') cocuklar = db.prepare('SELECT m.id, u.full_name AS ad FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.id = ?').all(o.membership_id);
    else if (o.role === 'veli') cocuklar = db.prepare(`SELECT m.id, u.full_name AS ad FROM guardians g JOIN memberships m ON m.id = g.student_membership_id
      JOIN users u ON u.id = m.user_id WHERE g.parent_membership_id = ? ORDER BY u.full_name`).all(o.membership_id);
    else return hata(403, 'Bu işlem için yetkiniz yok');
    json(res, 200, { ogrenciler: cocuklar.map(c => ({ ad: c.ad, sinavlar: yayinliSinavlar(c.id) })) });
    return true;
  }

  if (o.role !== 'ogretmen') return hata(403, 'Bu işlem için yetkiniz yok');

  // Eksik kazanım hatırlatması: öğretmenin ders verdiği sınıf+ders için, sınavda bir kazanımı edinemeyen (< %40) öğrenciler.
  // Sınav sonuçlarından hesaplanır; öğretmen "tekrar ettim" derse (sınav, sınıf, kazanım) kapatılır.
  if (req.method === 'GET' && yol === '/api/sinav/hatirlatma') {
    const atamalar = db.prepare(`SELECT DISTINCT a.class_id AS sinifId, co.name AS ders FROM assignments a JOIN courses co ON co.id = a.course_id
      WHERE a.teacher_membership_id = ?`).all(o.membership_id);
    const benimki = new Set(atamalar.map(a => a.sinifId + ':' + a.ders));
    const kapali = new Set(db.prepare('SELECT sinav_id, class_id, kazanim FROM kazanim_hatirlatma_kapat WHERE teacher_membership_id = ?')
      .all(o.membership_id).map(k => k.sinav_id + ':' + k.class_id + ':' + k.kazanim));
    const sinifIdleri = [...new Set(atamalar.map(a => a.sinifId))];
    const sinavlar = sinifIdleri.length ? db.prepare(`SELECT DISTINCT s.* FROM sinavlar s JOIN sinav_siniflar ss ON ss.sinav_id = s.id
      WHERE ss.class_id IN (${sinifIdleri.map(() => '?').join(',')}) ORDER BY s.date DESC, s.id DESC`).all(...sinifIdleri) : [];
    // Öğrencinin bir kazanımdaki son durumu: kazanımı ölçen en yeni sınav belirler, sonraki sınavda edinen öğrenci hatırlatmadan düşer
    const son = new Map();
    for (const s of [...sinavlar].reverse()) {
      const siniflar = sinavSiniflari(s.id).filter(c => sinifIdleri.includes(c.id));
      const dersler = dersleri(s.id);
      const kaz = kazanimlari(s.id);
      const islenen = islenenKazanimlar(siniflar.map(c => c.id), s.date);
      const cevap = new Map(db.prepare(`SELECT c.sinav_ders_id AS dersId, c.student_membership_id AS ogrenciId, c.cevaplar FROM sinav_cevaplar c
        JOIN sinav_dersler d ON d.id = c.sinav_ders_id WHERE d.sinav_id = ?`).all(s.id).map(c => [c.dersId + ':' + c.ogrenciId, c.cevaplar]));
      for (const g of sinifOgrencileri(siniflar.map(c => c.id))) for (const d of dersler) {
        if (!benimki.has(g.sinifId + ':' + d.ders)) continue;
        const cv = cevap.get(d.id + ':' + g.ogrenciId);
        if (!cv) continue;
        for (const k of kazanimDurum(kaz.get(d.id), d.anahtar, d.iptal, cv)) {
          son.set([g.sinifId, d.ders, k.kazanim, g.ogrenciId].join('|'), {
            sinifId: g.sinifId, sinif: g.sinif, ders: d.ders, kazanim: k.kazanim, sorular: k.sorular, durum: k.durum, sinav: s,
            ogrenci: { ad: g.ad, oran: k.oran, isleme: islemeDurumu(islenen, g.sinifId, d.ders, g.ogrenciId, k.kazanim).durum },
          });
        }
      }
    }
    const grup = new Map();
    for (const x of son.values()) {
      if (x.durum !== 'Eksik') continue;
      const anahtar = [x.sinifId, x.ders, x.kazanim].join('|');
      const h = grup.get(anahtar) || { sinavId: x.sinav.id, sinav: x.sinav.name, tarih: x.sinav.date, sinifId: x.sinifId, sinif: x.sinif, ders: x.ders, kazanim: x.kazanim, sorular: x.sorular, ogrenciler: [] };
      if (x.sinav.date > h.tarih || (x.sinav.date === h.tarih && x.sinav.id > h.sinavId)) Object.assign(h, { sinavId: x.sinav.id, sinav: x.sinav.name, tarih: x.sinav.date, sorular: x.sorular });
      h.ogrenciler.push(x.ogrenci);
      grup.set(anahtar, h);
    }
    // Tek tük öğrenciyi değil, sınıfta bir eğilim olan (en az 3 öğrenci) kazanımları hatırlat
    const sonuc = [...grup.values()].filter(h => h.ogrenciler.length >= 3 && !kapali.has(h.sinavId + ':' + h.sinifId + ':' + h.kazanim));
    sonuc.sort((a, b) => b.ogrenciler.length - a.ogrenciler.length || b.tarih.localeCompare(a.tarih));
    // Sınav tarihinde girilmemiş kazanım sonradan işlenmiş mi, yoksa hâlâ hiçbir derste girilmemiş mi?
    const simdiki = islenenKazanimlar(sinifIdleri, '9999-12-31');
    for (const h of sonuc) h.sonradan = islemeDurumu(simdiki, h.sinifId, h.ders, 0, h.kazanim).durum !== 'islenmedi';
    json(res, 200, { sayi: sonuc.length, hatirlatmalar: sonuc.slice(0, 60) });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/sinav/hatirlatma-kapat') {
    const b = await govde(req);
    const sinavId = tamSayi(b.sinavId, 1, 1e9), sinifId = tamSayi(b.sinifId, 1, 1e9), kazanim = String(b.kazanim || '');
    if (!sinavId || !sinifId || !kazanim || kazanim.length > 300) return hata(400, 'Geçersiz istek');
    const ders = db.prepare(`SELECT 1 FROM sinav_siniflar ss JOIN assignments a ON a.class_id = ss.class_id
      WHERE ss.sinav_id = ? AND ss.class_id = ? AND a.teacher_membership_id = ?`).get(sinavId, sinifId, o.membership_id);
    if (!ders) return hata(404, 'Hatırlatma bulunamadı');
    db.prepare('INSERT OR IGNORE INTO kazanim_hatirlatma_kapat (teacher_membership_id, sinav_id, class_id, kazanim, tarih) VALUES (?,?,?,?,?)')
      .run(o.membership_id, sinavId, sinifId, kazanim, Date.now());
    json(res, 200, { tamam: true });
    return true;
  }

  // Öğretmenin ders verdiği sınıflar ve dersleri
  if (req.method === 'GET' && yol === '/api/sinav/secenekler') {
    const siniflar = db.prepare(`
      SELECT DISTINCT c.id, c.name FROM assignments a JOIN classes c ON c.id = a.class_id
      WHERE a.teacher_membership_id = ? ORDER BY c.name`).all(o.membership_id);
    const dersler = db.prepare(`
      SELECT DISTINCT co.name FROM assignments a JOIN courses co ON co.id = a.course_id
      WHERE a.teacher_membership_id = ? ORDER BY co.name`).all(o.membership_id).map(r => r.name);
    json(res, 200, { siniflar, dersler });
    return true;
  }

  if (req.method === 'GET' && yol === '/api/sinav/liste') {
    const kendi = db.prepare(`SELECT s.id, s.name, s.date, s.yanlis_kat, s.yayin, s.teacher_membership_id, u.full_name AS sahipAd
      FROM sinavlar s JOIN memberships m ON m.id = s.teacher_membership_id JOIN users u ON u.id = m.user_id
      WHERE s.teacher_membership_id = ? ORDER BY s.date DESC, s.id DESC`).all(o.membership_id);
    // Başka öğretmenin, benim dersimi ve sınıfımı kapsayan sınavları: kazanım girmek için ortak görünür
    const paylasilan = db.prepare(`SELECT DISTINCT s.id, s.name, s.date, s.yanlis_kat, s.yayin, s.teacher_membership_id, u.full_name AS sahipAd
      FROM sinavlar s JOIN sinav_siniflar ss ON ss.sinav_id = s.id JOIN sinav_dersler sd ON sd.sinav_id = s.id
      JOIN assignments a ON a.class_id = ss.class_id AND a.teacher_membership_id = ?
      JOIN courses co ON co.id = a.course_id AND co.name = sd.ders
      JOIN memberships m ON m.id = s.teacher_membership_id JOIN users u ON u.id = m.user_id
      WHERE s.teacher_membership_id != ? ORDER BY s.date DESC, s.id DESC`).all(o.membership_id, o.membership_id);
    const kazanimSayisi = db.prepare('SELECT COUNT(*) AS n FROM sinav_kazanim k JOIN sinav_dersler d ON d.id = k.sinav_ders_id WHERE d.sinav_id = ?');
    json(res, 200, {
      sinavlar: [...kendi, ...paylasilan].map(s => ({
        id: s.id, ad: s.name, tarih: s.date, yanlisKat: s.yanlis_kat, yayin: !!s.yayin,
        sahip: s.teacher_membership_id === o.membership_id, sahipAd: s.sahipAd,
        siniflar: sinavSiniflari(s.id).map(c => c.name),
        dersler: dersleri(s.id).map(d => d.ders),
        soru: dersleri(s.id).reduce((t, d) => t + d.soruSayisi, 0),
        kazanimli: kazanimSayisi.get(s.id).n,
        okunan: db.prepare(`SELECT COUNT(DISTINCT c.student_membership_id) AS n FROM sinav_cevaplar c
          JOIN sinav_dersler d ON d.id = c.sinav_ders_id WHERE d.sinav_id = ?`).get(s.id).n,
      })),
    });
    return true;
  }

  const dersleriOku = (b) => {
    if (!Array.isArray(b.dersler) || !b.dersler.length || b.dersler.length > 12) return { hata: 'En az bir ders ekleyin' };
    const sonuc = [];
    for (const d of b.dersler) {
      const ders = String(d.ders || '').trim();
      const n = tamSayi(d.soruSayisi, 1, 200);
      if (!ders || ders.length > 60 || !n) return { hata: 'Ders adı ve soru sayısı (1-200) gerekli' };
      const anahtar = anahtarTemiz(d.anahtar, n);
      if (!anahtar) return { hata: `${ders}: cevap anahtarı ${n} harften (A-E) oluşmalı` };
      const iptal = [...new Set((Array.isArray(d.iptal) ? d.iptal : []).map(Number))].filter(x => Number.isInteger(x) && x >= 1 && x <= n).sort((a, c) => a - c);
      sonuc.push({ id: d.id, ders, n, anahtar, iptal });
    }
    return { dersler: sonuc };
  };
  const katOku = v => (v === undefined || v === null || v === '' ? 0 : tamSayi(v, 0, 10));

  if (req.method === 'POST' && yol === '/api/sinav/olustur') {
    const b = await govde(req);
    const ad = String(b.ad || '').trim();
    const tarih = String(b.tarih || bugun());
    const kat = katOku(b.yanlisKat);
    if (ad.length < 2 || ad.length > 80) return hata(400, 'Sınav adı 2-80 karakter olmalı');
    if (!tarihGecerli(tarih)) return hata(400, 'Tarih geçersiz');
    if (kat === null || kat === 1) return hata(400, 'Yanlış katsayısı 0 (yok) veya 2-10 olmalı');
    const siniflar = [...new Set((Array.isArray(b.sinifIds) ? b.sinifIds : []).map(Number))];
    if (!siniflar.length) return hata(400, 'En az bir sınıf seçin');
    const yetkili = db.prepare('SELECT 1 FROM assignments WHERE class_id = ? AND teacher_membership_id = ?');
    if (!siniflar.every(id => yetkili.get(id, o.membership_id))) return hata(403, 'Seçilen sınıflardan birinde dersiniz yok');
    const d = dersleriOku(b);
    if (d.hata) return hata(400, d.hata);
    const id = islem(() => {
      const sid = Number(db.prepare('INSERT INTO sinavlar (name, date, teacher_membership_id, yanlis_kat, created_at) VALUES (?,?,?,?,?)')
        .run(ad, tarih, o.membership_id, kat, Date.now()).lastInsertRowid);
      for (const c of siniflar) db.prepare('INSERT INTO sinav_siniflar (sinav_id, class_id) VALUES (?,?)').run(sid, c);
      for (const x of d.dersler) db.prepare('INSERT INTO sinav_dersler (sinav_id, ders, soru_sayisi, anahtar, iptal) VALUES (?,?,?,?,?)')
        .run(sid, x.ders, x.n, x.anahtar, JSON.stringify(x.iptal));
      return sid;
    });
    denetle(o.user_id, 'sinav-olustur', { id, ad });
    json(res, 200, { id });
    return true;
  }

  if (req.method === 'GET' && yol === '/api/sinav/detay') {
    const e = erisim(tamSayi(url.searchParams.get('id'), 1, 1e9));
    if (!e) return hata(404, 'Sınav bulunamadı');
    const { s, sahip } = e;
    const siniflar = sinavSiniflari(s.id);
    const sinav = { id: s.id, ad: s.name, tarih: s.date, yanlisKat: s.yanlis_kat, yayin: !!s.yayin };
    // Ortak öğretmen öğrenci cevaplarını ve sonuçları görmez; yalnızca soru-kazanım eşlemesine erişir
    if (!sahip) return json(res, 200, { sahip, sinav, siniflar, dersler: dersleri(s.id), ogrenciler: [] }), true;
    const ogrenciler = sinifOgrencileri(siniflar.map(c => c.id));
    const cevaplar = db.prepare(`SELECT c.sinav_ders_id AS dersId, c.student_membership_id AS ogrenciId, c.cevaplar
      FROM sinav_cevaplar c JOIN sinav_dersler d ON d.id = c.sinav_ders_id WHERE d.sinav_id = ?`).all(s.id);
    const harita = {};
    for (const c of cevaplar) (harita[c.ogrenciId] ||= {})[c.dersId] = c.cevaplar;
    json(res, 200, {
      sahip, sinav, siniflar, dersler: dersleri(s.id),
      ogrenciler: ogrenciler.map(g => ({ ...g, cevaplar: harita[g.ogrenciId] || {} })),
    });
    return true;
  }

  // Soru-kazanım eşlemesi: sınava erişen her öğretmen okur, yalnızca dersini verdiği bölümü düzenler
  if (req.method === 'GET' && yol === '/api/sinav/kazanimlar') {
    const e = erisim(tamSayi(url.searchParams.get('id'), 1, 1e9));
    if (!e) return hata(404, 'Sınav bulunamadı');
    const kayit = new Map(db.prepare(`SELECT k.sinav_ders_id AS dersId, k.soru_no AS no, k.kazanim, u.full_name AS kim
      FROM sinav_kazanim k JOIN sinav_dersler d ON d.id = k.sinav_ders_id
      JOIN memberships m ON m.id = k.guncelleyen JOIN users u ON u.id = m.user_id WHERE d.sinav_id = ?`).all(e.s.id).map(k => [k.dersId + ':' + k.no, k]));
    json(res, 200, {
      siniflar: sinavSiniflari(e.s.id).map(c => c.name),
      dersler: dersleri(e.s.id).map(d => ({
        id: d.id, ders: d.ders, duzenle: e.duzenle.has(d.id),
        sorular: Array.from({ length: d.soruSayisi }, (_, i) => {
          const k = kayit.get(d.id + ':' + (i + 1));
          return { no: i + 1, dogruSik: d.anahtar[i], iptal: d.iptal.includes(i + 1), kazanim: k?.kazanim || '', kim: k?.kim || '' };
        }),
      })),
    });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/sinav/kazanimlar') {
    const b = await govde(req);
    const e = erisim(tamSayi(b.id, 1, 1e9));
    if (!e) return hata(404, 'Sınav bulunamadı');
    const dersId = Number(b.dersId);
    if (!e.duzenle.has(dersId)) return hata(403, 'Bu dersin kazanımlarını düzenleyemezsiniz');
    const d = dersleri(e.s.id).find(x => x.id === dersId);
    if (!Array.isArray(b.sorular) || b.sorular.length > 200) return hata(400, 'Geçersiz istek');
    const yeni = [];
    for (const q of b.sorular) {
      const no = tamSayi(q.no, 1, d.soruSayisi);
      const kazanim = String(q.kazanim || '').replace(/\s+/g, ' ').trim();
      if (!no || kazanim.length > 300) return hata(400, 'Soru numarası veya kazanım geçersiz (en çok 300 karakter)');
      yeni.push({ no, kazanim });
    }
    islem(() => {
      for (const q of yeni) {
        if (!q.kazanim) db.prepare('DELETE FROM sinav_kazanim WHERE sinav_ders_id = ? AND soru_no = ?').run(dersId, q.no);
        else db.prepare(`INSERT INTO sinav_kazanim (sinav_ders_id, soru_no, kazanim, guncelleyen, tarih) VALUES (?,?,?,?,?)
          ON CONFLICT (sinav_ders_id, soru_no) DO UPDATE SET kazanim = excluded.kazanim, guncelleyen = excluded.guncelleyen, tarih = excluded.tarih`)
          .run(dersId, q.no, q.kazanim, o.membership_id, Date.now());
      }
    });
    denetle(o.user_id, 'sinav-kazanim', { id: e.s.id, dersId });
    json(res, 200, { tamam: true });
    return true;
  }

  // Cevap anahtarı düzeltme, soru iptali, yanlış katsayısı: sonuçlar cevaplardan hesaplandığı için anında yeniden hesaplanır
  if (req.method === 'POST' && yol === '/api/sinav/anahtar') {
    const b = await govde(req);
    const s = sinavim(tamSayi(b.id, 1, 1e9));
    if (!s) return hata(404, 'Sınav bulunamadı');
    const kat = katOku(b.yanlisKat);
    if (kat === null || kat === 1) return hata(400, 'Yanlış katsayısı 0 (yok) veya 2-10 olmalı');
    const mevcut = new Map(dersleri(s.id).map(d => [d.id, d]));
    const girilen = Array.isArray(b.dersler) ? b.dersler : [];
    for (const g of girilen) if (!mevcut.has(Number(g.id))) return hata(400, 'Geçersiz ders');
    const yeni = girilen.map(g => {
      const m = mevcut.get(Number(g.id));
      const anahtar = anahtarTemiz(g.anahtar, m.soruSayisi);
      if (!anahtar) return null;
      const iptal = [...new Set((Array.isArray(g.iptal) ? g.iptal : []).map(Number))].filter(x => Number.isInteger(x) && x >= 1 && x <= m.soruSayisi).sort((a, c) => a - c);
      return { id: m.id, anahtar, iptal };
    });
    if (yeni.some(x => !x)) return hata(400, 'Cevap anahtarı soru sayısı kadar harften (A-E) oluşmalı');
    islem(() => {
      db.prepare('UPDATE sinavlar SET yanlis_kat = ? WHERE id = ?').run(kat, s.id);
      for (const x of yeni) db.prepare('UPDATE sinav_dersler SET anahtar = ?, iptal = ? WHERE id = ?').run(x.anahtar, JSON.stringify(x.iptal), x.id);
    });
    denetle(o.user_id, 'sinav-anahtar', { id: s.id });
    json(res, 200, { tamam: true });
    return true;
  }

  // Öğrenci cevapları: { id, kayitlar: [{ ogrenciId, dersId, cevaplar }] }
  if (req.method === 'POST' && yol === '/api/sinav/cevaplar') {
    const b = await govde(req);
    const s = sinavim(tamSayi(b.id, 1, 1e9));
    if (!s) return hata(404, 'Sınav bulunamadı');
    if (!Array.isArray(b.kayitlar) || b.kayitlar.length > 2000) return hata(400, 'Geçersiz istek');
    const dersler = new Map(dersleri(s.id).map(d => [d.id, d]));
    const ogr = new Set(sinifOgrencileri(sinavSiniflari(s.id).map(c => c.id)).map(g => g.ogrenciId));
    islem(() => {
      for (const k of b.kayitlar) {
        const d = dersler.get(Number(k.dersId));
        const og = Number(k.ogrenciId);
        if (!d || !ogr.has(og)) throw new Error('Geçersiz kayıt');
        const c = String(k.cevaplar || '').trim();
        if (!c) db.prepare('DELETE FROM sinav_cevaplar WHERE sinav_ders_id = ? AND student_membership_id = ?').run(d.id, og);
        else db.prepare(`INSERT INTO sinav_cevaplar (sinav_ders_id, student_membership_id, cevaplar) VALUES (?,?,?)
          ON CONFLICT (sinav_ders_id, student_membership_id) DO UPDATE SET cevaplar = excluded.cevaplar`)
          .run(d.id, og, cevapTemiz(c, d.soruSayisi));
      }
    });
    json(res, 200, { tamam: true });
    return true;
  }

  // Sonuçlar ve madde analizi
  if (req.method === 'GET' && yol === '/api/sinav/sonuc') {
    const s = sinavim(tamSayi(url.searchParams.get('id'), 1, 1e9));
    if (!s) return hata(404, 'Sınav bulunamadı');
    json(res, 200, sonucHesapla(s, url.searchParams.get('kazanim') === '1'));
    return true;
  }

  // Yayınla / yayından kaldır: yayınlanınca öğrenci ve veli sonucu görür
  if (req.method === 'POST' && yol === '/api/sinav/yayin') {
    const b = await govde(req);
    const s = sinavim(tamSayi(b.id, 1, 1e9));
    if (!s) return hata(404, 'Sınav bulunamadı');
    db.prepare('UPDATE sinavlar SET yayin = ? WHERE id = ?').run(b.yayin ? 1 : 0, s.id);
    denetle(o.user_id, b.yayin ? 'sinav-yayin' : 'sinav-yayin-kaldir', { id: s.id });
    json(res, 200, { yayin: !!b.yayin });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/sinav/sil') {
    const b = await govde(req);
    const s = sinavim(tamSayi(b.id, 1, 1e9));
    if (!s) return hata(404, 'Sınav bulunamadı');
    islem(() => {
      db.prepare('DELETE FROM sinav_cevaplar WHERE sinav_ders_id IN (SELECT id FROM sinav_dersler WHERE sinav_id = ?)').run(s.id);
      db.prepare('DELETE FROM sinav_kazanim WHERE sinav_ders_id IN (SELECT id FROM sinav_dersler WHERE sinav_id = ?)').run(s.id);
      db.prepare('DELETE FROM kazanim_hatirlatma_kapat WHERE sinav_id = ?').run(s.id);
      db.prepare('DELETE FROM sinav_dersler WHERE sinav_id = ?').run(s.id);
      db.prepare('DELETE FROM sinav_siniflar WHERE sinav_id = ?').run(s.id);
      db.prepare('DELETE FROM sinavlar WHERE id = ?').run(s.id);
    });
    denetle(o.user_id, 'sinav-sil', { id: s.id, ad: s.name });
    json(res, 200, { tamam: true });
    return true;
  }

  return hata(404, 'Bulunamadı');
}
