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


// Sınav modülü: yönetim sınavı açar (düzey, ders başına soru sayısı) ve etkinleştirir; ders öğretmenleri soru kazanımını ve cevap anahtarını girip
// onaylar; öğrenci cevaplarını (optik/Excel/elle) yalnız yönetim girer; öğretmen yalnız ders verdiği sınıfların sonuçlarını görür.
export async function sinavApi({ req, res, url, o, json, govde, denetle }) {
  const yol = url.pathname;
  if (!yol.startsWith('/api/sinav/')) return false;
  const hata = (kod, mesaj) => { json(res, kod, { hata: mesaj }); return true; };
  const yon = o.role === 'yonetim';

  const dersleri = id => db.prepare(`SELECT d.id, d.ders, d.soru_sayisi AS soruSayisi, d.anahtar, d.iptal, d.onay, d.onay_tarih AS onayTarih,
      (SELECT u.full_name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.id = d.onaylayan) AS onayAd
    FROM sinav_dersler d WHERE d.sinav_id = ? ORDER BY d.id`).all(id)
    .map(d => ({ ...d, onay: !!d.onay, iptal: JSON.parse(d.iptal), anahtar: (d.anahtar + '?'.repeat(d.soruSayisi)).slice(0, d.soruSayisi) }));
  const sinavSiniflari = id => db.prepare('SELECT c.id, c.name FROM sinav_siniflar ss JOIN classes c ON c.id = ss.class_id WHERE ss.sinav_id = ? ORDER BY c.name').all(id);
  // Öğretmenin bu sınavda ders verdiği (sınıf, ders) çiftleri: sonuç görme ve puan girme kapsamı
  const ciftler = (sinavId, ogretmenId) => db.prepare(`SELECT DISTINCT a.class_id AS sinifId, co.name AS ders FROM assignments a
    JOIN courses co ON co.id = a.course_id JOIN sinav_siniflar ss ON ss.class_id = a.class_id
    JOIN sinav_dersler sd ON sd.sinav_id = ss.sinav_id AND sd.ders = co.name
    WHERE ss.sinav_id = ? AND a.teacher_membership_id = ?`).all(sinavId, ogretmenId);
  // Yönetim her şeyi görür ve düzenler; öğretmen yalnız etkin sınavlarda, dersini verdiği dersleri
  const erisim = id => {
    const s = db.prepare('SELECT * FROM sinavlar WHERE id = ?').get(id);
    if (!s) return null;
    const dl = dersleri(id);
    if (yon) return { s, ders: new Set(dl.map(d => d.id)) };
    if (s.durum !== 'aktif') return null;
    const adlar = new Set(ciftler(id, o.membership_id).map(c => c.ders));
    const ders = new Set(dl.filter(d => adlar.has(d.ders)).map(d => d.id));
    return ders.size ? { s, ders } : null;
  };
  const kisit = s => ({ cift: new Set(ciftler(s.id, o.membership_id).map(c => c.sinifId + ':' + c.ders)) });

  const genelKazanim = id => db.prepare('SELECT kazanim FROM sinav_genel_kazanim WHERE sinav_id = ? ORDER BY sira').all(id).map(r => r.kazanim);
  const kazanimListe = v => [...new Set((Array.isArray(v) ? v : []).map(x => String(x || '').replace(/\s+/g, ' ').trim()).filter(Boolean))];

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
  // Dersin hazırlık durumu: anahtar ve kazanım kaç soruda girildi (iptal edilen soruda kazanım aranmaz)
  const hazirlik = (d, kazDizi) => {
    const sik = [...d.anahtar].filter(c => SIKLAR.includes(c)).length;
    const gerekli = d.soruSayisi - d.iptal.length;
    const kazanim = kazDizi.filter((k, i) => k && !d.iptal.includes(i + 1)).length;
    return { sik, kazanim, gerekli, tamam: d.soruSayisi > 0 && sik === d.soruSayisi && kazanim === gerekli };
  };

  // Sonuç + madde analizi (öğretmen ekranı ve yayınlanmış sınavlarda öğrenci görünümü bunu kullanır)
  // ks: { cift } verilirse yalnız öğretmenin ders verdiği sınıf+ders çiftleri hesaplanır; başka sınıfın öğrencisi ya da sonucu sızmaz
  const sonucHesapla = (s, kazanimli = false, ks = null) => {
    const dersler = dersleri(s.id);
    const yazili = s.tur === 'yazili';
    const puanHarita = new Map(yazili ? db.prepare(`SELECT p.sinav_ders_id AS dersId, p.student_membership_id AS ogrenciId, p.puan FROM sinav_puanlar p
      JOIN sinav_dersler d ON d.id = p.sinav_ders_id WHERE d.sinav_id = ?`).all(s.id).map(p => [p.dersId + ':' + p.ogrenciId, p.puan]) : []);
    const gorur = (d, sinifId) => !ks || ks.cift.has(sinifId + ':' + d.ders);
    const kaz = kazanimlari(s.id);
    const siniflar = sinavSiniflari(s.id);
    const tumOgrenciler = sinifOgrencileri(siniflar.map(c => c.id));
    const ogrenciler = ks ? tumOgrenciler.filter(g => dersler.some(d => gorur(d, g.sinifId))) : tumOgrenciler;
    const islenen = kazanimli ? islenenKazanimlar(siniflar.map(c => c.id), s.date) : null;
    const cevaplar = db.prepare(`SELECT c.sinav_ders_id AS dersId, c.student_membership_id AS ogrenciId, c.cevaplar
      FROM sinav_cevaplar c JOIN sinav_dersler d ON d.id = c.sinav_ders_id WHERE d.sinav_id = ?`).all(s.id);
    const harita = new Map(cevaplar.map(c => [c.dersId + ':' + c.ogrenciId, c.cevaplar]));

    const satirlar = ogrenciler.map(g => {
      const dersSonuc = {}, kazanim = {};
      let topPuan = 0, say = 0;
      for (const d of dersler) {
        if (!gorur(d, g.sinifId)) continue;
        if (yazili) {
          const p = puanHarita.get(d.id + ':' + g.ogrenciId);
          if (p === undefined) continue;
          dersSonuc[d.id] = { dogru: null, yanlis: null, bos: null, net: null, puan: p };
          topPuan += p; say++;
          continue;
        }
        const c = harita.get(d.id + ':' + g.ogrenciId);
        if (!c) continue;
        const r = hesapla(d.anahtar, d.iptal, c, s.yanlis_kat);
        dersSonuc[d.id] = r;
        if (kazanimli) kazanim[d.id] = kazanimDurum(kaz.get(d.id), d.anahtar, d.iptal, c).map(k => ({ ...k, isleme: islemeDurumu(islenen, g.sinifId, d.ders, g.ogrenciId, k.kazanim) }));
        topPuan += r.puan; say++;
      }
      return { ogrenciId: g.ogrenciId, okulNo: g.okulNo, ad: g.ad, sinif: g.sinif, sinifId: g.sinifId, dersler: dersSonuc, ...(kazanimli ? { kazanim } : {}), ortalama: say ? Math.round(topPuan / say * 10) / 10 : null,
        kume: dersler.filter(d => gorur(d, g.sinifId)).map(d => d.id).join() };
    });
    const girenler = satirlar.filter(r => r.ortalama !== null).sort((a, b) => b.ortalama - a.ortalama);
    // Sıra, aynı ders kümesini gören öğrenciler arasında verilir (kısıtlıyken farklı kümeler karışmaz)
    const sayac = new Map();
    for (const r of girenler) { r.sira = (sayac.get(r.kume) || 0) + 1; sayac.set(r.kume, r.sira); }
    for (const r of satirlar) delete r.kume;
    const gorunenDersler = dersler.filter(d => ogrenciler.some(g => gorur(d, g.sinifId)));

    const analiz = gorunenDersler.filter(d => !yazili).map(d => {
      const girenCevaplar = ogrenciler.filter(g => gorur(d, g.sinifId)).map(g => ({ id: g.ogrenciId, c: harita.get(d.id + ':' + g.ogrenciId) })).filter(x => x.c);
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
      // Sınıf düzeyi kazanım başarısı: kazanımı ölçen soruların öğrencilerdeki ortalama doğru oranı
      const kazGrup = new Map();
      const islenenAnaliz = kazanimli ? islenen : islenenKazanimlar(siniflar.map(c => c.id), s.date);
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
      sinav: { id: s.id, ad: s.name, tarih: s.date, yanlisKat: s.yanlis_kat, yayin: !!s.yayin, tur: s.tur, amac: s.amac, duzey: s.duzey, kapsam: genelKazanim(s.id) },
      dersler: gorunenDersler.map(d => ({ id: d.id, ders: d.ders, soruSayisi: d.soruSayisi })),
      ogrenciler: satirlar, giren: girenler.length, beklenen: ogrenciler.length, analiz, kisitli: !!ks,
    };
  };

  // Sıralama: sıra yalnız sınava giren (ortalaması olan) öğrenciler arasında verilir; eşit ortalama aynı sırayı alır (1, 2, 2, 4).
  // Sınıf = kendi sınıfı, okul = aynı okulda aynı düzey, tüm okullar = ad, tarih, düzey ve türü aynı olan diğer okul/kampüs sınavları da dahil
  const ozetOnbellek = new Map();
  const ozetOku = s => {
    if (!ozetOnbellek.has(s.id)) {
      const r = sonucHesapla(s);
      ozetOnbellek.set(s.id, { dersAd: new Map(r.dersler.map(d => [d.id, d.ders])), satirlar: r.ogrenciler.filter(g => g.ortalama !== null) });
    }
    return ozetOnbellek.get(s.id);
  };
  const esOnbellek = new Map();
  const esSatirlar = s => {
    if (!esOnbellek.has(s.id)) {
      const es = s.duzey ? db.prepare(`SELECT x.* FROM sinavlar x JOIN memberships m ON m.id = x.teacher_membership_id
        WHERE x.id <> ? AND x.name = ? AND x.date = ? AND x.duzey = ? AND x.tur = ? AND x.amac = ? AND x.durum = 'aktif'
          AND m.branch_id <> (SELECT branch_id FROM memberships WHERE id = ?)`).all(s.id, s.name, s.date, s.duzey, s.tur, s.amac, s.teacher_membership_id) : [];
      esOnbellek.set(s.id, es.flatMap(x => ozetOku(x).satirlar));
    }
    return esOnbellek.get(s.id);
  };
  const siraVer = (liste, ortalama) => ({ sira: 1 + liste.filter(x => x.ortalama > ortalama).length, sayi: liste.length });
  const siralamaBilgisi = (s, ogrenciId) => {
    const { satirlar } = ozetOku(s);
    const ben = satirlar.find(x => x.ogrenciId === ogrenciId);
    if (!ben) return null;
    const baskalari = esSatirlar(s);
    return {
      sinif: siraVer(satirlar.filter(x => x.sinifId === ben.sinifId), ben.ortalama),
      okul: siraVer(satirlar, ben.ortalama),
      genel: baskalari.length ? siraVer([...satirlar, ...baskalari], ben.ortalama) : null,
    };
  };
  // Önceki sınava göre değişim: aynı türdeki (deneme / açılış / aynı dersin yazılısı) bir önceki sınav; öğrenci/veli yalnız yayınlanmışı görür
  const sinavKategori = s => (s.tur === 'yazili' ? 'yazili:' + (dersleri(s.id)[0]?.ders || '') : 'test');
  const degisimBilgisi = (s, ogrenciId, ortalama, yalnizYayin) => {
    const adaylar = db.prepare(`SELECT DISTINCT p.* FROM sinavlar p JOIN sinav_siniflar ss ON ss.sinav_id = p.id
        JOIN class_students cs ON cs.class_id = ss.class_id
      WHERE cs.student_membership_id = ? AND p.id <> ? AND p.durum = 'aktif' AND p.tur = ? AND p.amac = ?
        AND (p.date < ? OR (p.date = ? AND p.id < ?)) ${yalnizYayin ? 'AND p.yayin = 1' : ''}
      ORDER BY p.date DESC, p.id DESC`).all(ogrenciId, s.id, s.tur, s.amac, s.date, s.date, s.id);
    const kat = sinavKategori(s);
    for (const p of adaylar) {
      if (sinavKategori(p) !== kat) continue;
      const { dersAd, satirlar } = ozetOku(p);
      const ben = satirlar.find(x => x.ogrenciId === ogrenciId);
      if (!ben) continue;
      const fark = Math.round((ortalama - ben.ortalama) * 10) / 10;
      const dersPuan = {};
      for (const [id, ad] of dersAd) if (ben.dersler[id]) dersPuan[ad] = ben.dersler[id].puan;
      return { ad: p.name, tarih: p.date, ortalama: ben.ortalama, fark, oran: ben.ortalama > 0 ? Math.round(fark / ben.ortalama * 1000) / 10 : null, dersPuan };
    }
    return null;
  };

  // Bir öğrencinin yayınlanmış sınav sonuçları (öğrenci/veli ve mentor öğretmen görünümü ortak kullanır)
  const yayinliSinavlar = ogrId => db.prepare(`SELECT s.* FROM sinavlar s JOIN sinav_siniflar ss ON ss.sinav_id = s.id
      JOIN class_students cs ON cs.class_id = ss.class_id WHERE cs.student_membership_id = ? AND s.yayin = 1 AND s.amac = 'deneme' AND s.durum = 'aktif'
      ORDER BY s.date DESC, s.id DESC`).all(ogrId).map(s => {
    const r = sonucHesapla(s, true);
    const g = r.ogrenciler.find(x => x.ogrenciId === ogrId);
    if (!g || g.ortalama === null) return null;
    const degisim = degisimBilgisi(s, ogrId, g.ortalama, true);
    return {
      ad: s.name, tarih: s.date, yanlisKat: s.yanlis_kat, ortalama: g.ortalama, sira: g.sira, giren: r.giren,
      yazili: s.tur === 'yazili', kapsam: genelKazanim(s.id),
      siralama: siralamaBilgisi(s, ogrId), degisim,
      dersler: r.dersler.filter(d => g.dersler[d.id]).map(d => ({ ders: d.ders, soruSayisi: d.soruSayisi, ...g.dersler[d.id], onceki: degisim?.dersPuan[d.ders] ?? null, kazanimlar: g.kazanim[d.id] })),
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

  // Öğrenci/veli: yalnızca yönetimin yayınladığı sınavlar
  if (req.method === 'GET' && yol === '/api/sinav/notlarim') {
    let cocuklar;
    if (o.role === 'ogrenci') cocuklar = db.prepare('SELECT m.id, u.full_name AS ad FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.id = ?').all(o.membership_id);
    else if (o.role === 'veli') cocuklar = db.prepare(`SELECT m.id, u.full_name AS ad FROM guardians g JOIN memberships m ON m.id = g.student_membership_id
      JOIN users u ON u.id = m.user_id WHERE g.parent_membership_id = ? ORDER BY u.full_name`).all(o.membership_id);
    else return hata(403, 'Bu işlem için yetkiniz yok');
    json(res, 200, { ogrenciler: cocuklar.map(c => ({ ad: c.ad, sinavlar: yayinliSinavlar(c.id) })) });
    return true;
  }

  if (o.role !== 'ogretmen' && !yon) return hata(403, 'Bu işlem için yetkiniz yok');

  // Eksik kazanım hatırlatması: öğretmenin ders verdiği sınıf+ders için, sınavda bir kazanımı edinemeyen (< %40) öğrenciler.
  // Sınav sonuçlarından hesaplanır; öğretmen "tekrar ettim" derse (sınav, sınıf, kazanım) kapatılır.
  if (req.method === 'GET' && yol === '/api/sinav/hatirlatma') {
    if (yon) return hata(403, 'Bu işlem için yetkiniz yok');
    const atamalar = db.prepare(`SELECT DISTINCT a.class_id AS sinifId, co.name AS ders FROM assignments a JOIN courses co ON co.id = a.course_id
      WHERE a.teacher_membership_id = ?`).all(o.membership_id);
    const benimki = new Set(atamalar.map(a => a.sinifId + ':' + a.ders));
    const kapali = new Set(db.prepare('SELECT sinav_id, class_id, kazanim FROM kazanim_hatirlatma_kapat WHERE teacher_membership_id = ?')
      .all(o.membership_id).map(k => k.sinav_id + ':' + k.class_id + ':' + k.kazanim));
    const sinifIdleri = [...new Set(atamalar.map(a => a.sinifId))];
    const sinavlar = sinifIdleri.length ? db.prepare(`SELECT DISTINCT s.* FROM sinavlar s JOIN sinav_siniflar ss ON ss.sinav_id = s.id
      WHERE s.durum = 'aktif' AND s.tur = 'test' AND ss.class_id IN (${sinifIdleri.map(() => '?').join(',')}) ORDER BY s.date DESC, s.id DESC`).all(...sinifIdleri) : [];
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
    if (yon) return hata(403, 'Bu işlem için yetkiniz yok');
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

  // Yönetim: yeni sınavın seçenekleri. Düzey = sınıf adının başındaki sayı (5-A, 5-B → 5); tüm şubeler birlikte sınava girer
  const subeSiniflari = () => db.prepare('SELECT c.id, c.name FROM classes c WHERE c.branch_id = (SELECT branch_id FROM memberships WHERE id = ?) ORDER BY c.name').all(o.membership_id);
  if (req.method === 'GET' && yol === '/api/sinav/secenekler') {
    if (!yon) return hata(403, 'Bu işlem için yetkiniz yok');
    const duzeyler = new Map();
    for (const c of subeSiniflari()) {
      const dz = parseInt(c.name, 10);
      if (!dz) continue;
      const k = duzeyler.get(dz) || { duzey: dz, siniflar: [], dersler: new Set() };
      k.siniflar.push(c.name);
      for (const r of db.prepare('SELECT DISTINCT co.name FROM assignments a JOIN courses co ON co.id = a.course_id WHERE a.class_id = ? ORDER BY co.name').all(c.id)) k.dersler.add(r.name);
      duzeyler.set(dz, k);
    }
    json(res, 200, { duzeyler: [...duzeyler.values()].sort((a, b) => a.duzey - b.duzey).map(k => ({ ...k, dersler: [...k.dersler] })) });
    return true;
  }

  if (req.method === 'GET' && yol === '/api/sinav/liste') {
    const satirlar = yon
      ? db.prepare(`SELECT s.* FROM sinavlar s JOIN memberships m ON m.id = s.teacher_membership_id
          WHERE m.branch_id = (SELECT branch_id FROM memberships WHERE id = ?) ORDER BY s.date DESC, s.id DESC`).all(o.membership_id)
      : db.prepare(`SELECT s.* FROM sinavlar s WHERE s.durum = 'aktif' AND EXISTS (
          SELECT 1 FROM sinav_siniflar ss JOIN assignments a ON a.class_id = ss.class_id AND a.teacher_membership_id = ?
          JOIN courses co ON co.id = a.course_id JOIN sinav_dersler sd ON sd.sinav_id = s.id AND sd.ders = co.name WHERE ss.sinav_id = s.id)
          ORDER BY s.date DESC, s.id DESC`).all(o.membership_id);
    const genelSayisi = db.prepare('SELECT COUNT(*) AS n FROM sinav_genel_kazanim WHERE sinav_id = ?');
    const puanSayisi = db.prepare(`SELECT COUNT(DISTINCT p.student_membership_id) AS n FROM sinav_puanlar p
      JOIN sinav_dersler d ON d.id = p.sinav_ders_id WHERE d.sinav_id = ?`);
    const cevapSayisi = db.prepare(`SELECT COUNT(DISTINCT c.student_membership_id) AS n FROM sinav_cevaplar c
      JOIN sinav_dersler d ON d.id = c.sinav_ders_id WHERE d.sinav_id = ?`);
    json(res, 200, {
      yonetim: yon,
      sinavlar: satirlar.map(s => {
        const tum = dersleri(s.id);
        const e = erisim(s.id);
        const kaz = kazanimlari(s.id);
        const benim = tum.filter(d => e && e.ders.has(d.id));
        const durum = d => ({ ders: d.ders, onay: d.onay, soru: d.soruSayisi, ...hazirlik(d, kaz.get(d.id)) });
        return {
          id: s.id, ad: s.name, tarih: s.date, yanlisKat: s.yanlis_kat, yayin: !!s.yayin, tur: s.tur, amac: s.amac, duzey: s.duzey, durum: s.durum,
          siniflar: sinavSiniflari(s.id).map(c => c.name),
          dersler: (yon ? tum : benim).map(d => d.ders),
          soru: tum.reduce((t, d) => t + d.soruSayisi, 0),
          hazirlik: s.tur === 'test' ? (yon ? tum : benim).map(durum) : [],
          kazanimli: s.tur === 'yazili' ? genelSayisi.get(s.id).n : 0,
          okunan: s.tur === 'yazili' ? puanSayisi.get(s.id).n : cevapSayisi.get(s.id).n,
        };
      }),
    });
    return true;
  }

  const katOku = v => (v === undefined || v === null || v === '' ? 0 : tamSayi(v, 0, 10));
  const siniflarDuzey = duzey => subeSiniflari().filter(c => parseInt(c.name, 10) === duzey);

  // Yönetim: sınav açar. Test (deneme / açılış): düzey + ders başına soru sayısı. Yazılı: düzey + tek ders (soru sayısı ve kazanım isteğe bağlı)
  if (req.method === 'POST' && yol === '/api/sinav/olustur') {
    if (!yon) return hata(403, 'Sınavları yalnızca okul yönetimi oluşturur');
    const b = await govde(req);
    const ad = String(b.ad || '').trim();
    const tarih = String(b.tarih || bugun());
    const kat = katOku(b.yanlisKat);
    const tur = b.tur === 'yazili' ? 'yazili' : 'test';
    const amac = tur === 'test' && b.amac === 'acilis' ? 'acilis' : 'deneme';
    const duzey = tamSayi(b.duzey, 1, 12);
    if (ad.length < 2 || ad.length > 80) return hata(400, 'Sınav adı 2-80 karakter olmalı');
    if (!tarihGecerli(tarih)) return hata(400, 'Tarih geçersiz');
    if (kat === null || kat === 1) return hata(400, 'Yanlış katsayısı 0 (yok) veya 2-10 olmalı');
    const siniflar = duzey ? siniflarDuzey(duzey) : [];
    if (!siniflar.length) return hata(400, 'Sınıf düzeyini seçin');
    const dersVar = db.prepare('SELECT 1 FROM courses WHERE name = ?');
    let dersler;
    if (tur === 'yazili') {
      const ders = String(b.ders || '').trim();
      const kaz = kazanimListe(b.kazanimlar);
      const n = b.soruSayisi === undefined || b.soruSayisi === '' || b.soruSayisi === null ? 0 : tamSayi(b.soruSayisi, 0, 200);
      if (!ders || !dersVar.get(ders)) return hata(400, 'Ders seçin');
      if (n === null) return hata(400, 'Soru sayısı 0-200 olmalı');
      if (kaz.length > 30 || kaz.some(k => k.length > 300)) return hata(400, 'En çok 30 kazanım, her biri en çok 300 karakter olabilir');
      dersler = [{ ders, n, kaz }];
    } else {
      if (!Array.isArray(b.dersler) || !b.dersler.length || b.dersler.length > 12) return hata(400, 'En az bir ders ekleyin');
      dersler = [];
      for (const d of b.dersler) {
        const ders = String(d.ders || '').trim();
        const n = tamSayi(d.soruSayisi, 1, 200);
        if (!ders || !dersVar.get(ders) || !n) return hata(400, 'Ders ve soru sayısı (1-200) gerekli');
        if (dersler.some(x => x.ders === ders)) return hata(400, `${ders} iki kez eklenmiş`);
        dersler.push({ ders, n });
      }
    }
    const id = islem(() => {
      const sid = Number(db.prepare("INSERT INTO sinavlar (name, date, teacher_membership_id, yanlis_kat, created_at, tur, duzey, durum, amac) VALUES (?,?,?,?,?,?,?,'taslak',?)")
        .run(ad, tarih, o.membership_id, tur === 'test' ? kat : 0, Date.now(), tur, duzey, amac).lastInsertRowid);
      for (const c of siniflar) db.prepare('INSERT INTO sinav_siniflar (sinav_id, class_id) VALUES (?,?)').run(sid, c.id);
      for (const x of dersler) db.prepare("INSERT INTO sinav_dersler (sinav_id, ders, soru_sayisi, anahtar, iptal, onay) VALUES (?,?,?,'','[]',0)").run(sid, x.ders, x.n);
      (dersler[0].kaz || []).forEach((k, i) => db.prepare('INSERT INTO sinav_genel_kazanim (sinav_id, sira, kazanim) VALUES (?,?,?)').run(sid, i + 1, k));
      return sid;
    });
    denetle(o.user_id, 'sinav-olustur', { id, ad, tur, duzey });
    json(res, 200, { id });
    return true;
  }

  // Yönetim: ad, tarih, yanlış katsayısı ve soru sayıları. Cevap girilmiş dersin soru sayısı değişmez
  if (req.method === 'POST' && yol === '/api/sinav/guncelle') {
    if (!yon) return hata(403, 'Bu işlem için yetkiniz yok');
    const b = await govde(req);
    const e = erisim(tamSayi(b.id, 1, 1e9));
    if (!e) return hata(404, 'Sınav bulunamadı');
    const s = e.s;
    const ad = String(b.ad || '').trim();
    const tarih = String(b.tarih || '');
    const kat = s.tur === 'test' ? katOku(b.yanlisKat) : 0;
    if (ad.length < 2 || ad.length > 80) return hata(400, 'Sınav adı 2-80 karakter olmalı');
    if (!tarihGecerli(tarih)) return hata(400, 'Tarih geçersiz');
    if (kat === null || kat === 1) return hata(400, 'Yanlış katsayısı 0 (yok) veya 2-10 olmalı');
    const mevcut = new Map(dersleri(s.id).map(d => [d.id, d]));
    const yeni = [];
    for (const g of Array.isArray(b.dersler) ? b.dersler : []) {
      const m = mevcut.get(Number(g.id));
      const n = s.tur === 'yazili' && (g.soruSayisi === '' || g.soruSayisi === null) ? 0 : tamSayi(g.soruSayisi, s.tur === 'yazili' ? 0 : 1, 200);
      if (!m || n === null) return hata(400, 'Soru sayısı geçersiz');
      if (n !== m.soruSayisi) {
        const cevapli = db.prepare('SELECT COUNT(*) AS n FROM sinav_cevaplar WHERE sinav_ders_id = ?').get(m.id).n;
        if (cevapli) return hata(400, `${m.ders}: öğrenci cevapları girildikten sonra soru sayısı değiştirilemez`);
        yeni.push({ m, n });
      }
    }
    islem(() => {
      db.prepare('UPDATE sinavlar SET name = ?, date = ?, yanlis_kat = ? WHERE id = ?').run(ad, tarih, kat, s.id);
      for (const { m, n } of yeni) {
        const anahtar = m.anahtar.slice(0, n).padEnd(n, '?');
        const iptal = m.iptal.filter(x => x <= n);
        db.prepare('UPDATE sinav_dersler SET soru_sayisi = ?, anahtar = ?, iptal = ?, onay = 0 WHERE id = ?').run(n, anahtar, JSON.stringify(iptal), m.id);
        db.prepare('DELETE FROM sinav_kazanim WHERE sinav_ders_id = ? AND soru_no > ?').run(m.id, n);
      }
    });
    denetle(o.user_id, 'sinav-guncelle', { id: s.id });
    json(res, 200, { tamam: true });
    return true;
  }

  // Yönetim: sınavı öğretmenlere açar (aktif) ya da taslağa alır
  if (req.method === 'POST' && yol === '/api/sinav/aktif') {
    if (!yon) return hata(403, 'Bu işlem için yetkiniz yok');
    const b = await govde(req);
    const e = erisim(tamSayi(b.id, 1, 1e9));
    if (!e) return hata(404, 'Sınav bulunamadı');
    const aktif = !!b.aktif;
    if (!aktif && e.s.yayin) return hata(400, 'Yayındaki sınav taslağa alınamaz; önce yayından kaldırın');
    db.prepare('UPDATE sinavlar SET durum = ? WHERE id = ?').run(aktif ? 'aktif' : 'taslak', e.s.id);
    denetle(o.user_id, aktif ? 'sinav-aktif' : 'sinav-taslak', { id: e.s.id });
    json(res, 200, { durum: aktif ? 'aktif' : 'taslak' });
    return true;
  }

  if (req.method === 'GET' && yol === '/api/sinav/detay') {
    const e = erisim(tamSayi(url.searchParams.get('id'), 1, 1e9));
    if (!e) return hata(404, 'Sınav bulunamadı');
    const { s } = e;
    const siniflar = sinavSiniflari(s.id);
    const sinav = { id: s.id, ad: s.name, tarih: s.date, yanlisKat: s.yanlis_kat, yayin: !!s.yayin, tur: s.tur, amac: s.amac, duzey: s.duzey, durum: s.durum, kapsam: genelKazanim(s.id),
      cevapVar: !!db.prepare('SELECT 1 FROM sinav_cevaplar c JOIN sinav_dersler d ON d.id = c.sinav_ders_id WHERE d.sinav_id = ? LIMIT 1').get(s.id) };
    const benimDersler = dersleri(s.id).filter(d => e.ders.has(d.id));
    const puanlar = {};
    if (s.tur === 'yazili') for (const p of db.prepare(`SELECT p.student_membership_id AS ogrenciId, p.puan FROM sinav_puanlar p
      JOIN sinav_dersler d ON d.id = p.sinav_ders_id WHERE d.sinav_id = ?`).all(s.id)) puanlar[p.ogrenciId] = p.puan;
    if (!yon) {
      // Öğretmen: yazılıda yalnız ders verdiği sınıfların öğrencileri (puan girişi için); testte öğrenci listesi sonuç ekranından gelir
      const benimSiniflar = [...new Set(ciftler(s.id, o.membership_id).map(c => c.sinifId))];
      const ogr = s.tur === 'yazili' ? sinifOgrencileri(benimSiniflar).map(g => ({ ...g, puan: puanlar[g.ogrenciId] ?? null })) : [];
      json(res, 200, {
        yonetim: false, sinav, siniflar: siniflar.filter(c => benimSiniflar.includes(c.id)),
        dersler: benimDersler.map(({ id, ders, soruSayisi, onay }) => ({ id, ders, soruSayisi, onay })), ogrenciler: ogr,
      });
      return true;
    }
    const ogrenciler = sinifOgrencileri(siniflar.map(c => c.id));
    const cevaplar = db.prepare(`SELECT c.sinav_ders_id AS dersId, c.student_membership_id AS ogrenciId, c.cevaplar
      FROM sinav_cevaplar c JOIN sinav_dersler d ON d.id = c.sinav_ders_id WHERE d.sinav_id = ?`).all(s.id);
    const harita = {};
    for (const c of cevaplar) (harita[c.ogrenciId] ||= {})[c.dersId] = c.cevaplar;
    json(res, 200, {
      yonetim: true, sinav, siniflar, dersler: benimDersler,
      ogrenciler: ogrenciler.map(g => ({ ...g, cevaplar: harita[g.ogrenciId] || {}, puan: puanlar[g.ogrenciId] ?? null })),
    });
    return true;
  }

  // Hazırlık: dersin soru soru cevap anahtarı ve kazanımı. Dersi veren tüm öğretmenler (ve yönetim) görür; değişiklik "Düzenle" ile ayrı yapılır
  if (req.method === 'GET' && yol === '/api/sinav/hazirlik') {
    const e = erisim(tamSayi(url.searchParams.get('id'), 1, 1e9));
    if (!e || e.s.tur !== 'test') return hata(404, 'Sınav bulunamadı');
    const kayit = new Map(db.prepare(`SELECT k.sinav_ders_id AS dersId, k.soru_no AS no, k.kazanim, u.full_name AS kim
      FROM sinav_kazanim k JOIN sinav_dersler d ON d.id = k.sinav_ders_id
      JOIN memberships m ON m.id = k.guncelleyen JOIN users u ON u.id = m.user_id WHERE d.sinav_id = ?`).all(e.s.id).map(k => [k.dersId + ':' + k.no, k]));
    json(res, 200, {
      siniflar: sinavSiniflari(e.s.id).map(c => c.name), duzey: e.s.duzey, durum: e.s.durum,
      dersler: dersleri(e.s.id).filter(d => e.ders.has(d.id)).map(d => {
        const sorular = Array.from({ length: d.soruSayisi }, (_, i) => {
          const k = kayit.get(d.id + ':' + (i + 1));
          return { no: i + 1, sik: SIKLAR.includes(d.anahtar[i]) ? d.anahtar[i] : '', iptal: d.iptal.includes(i + 1), kazanim: k?.kazanim || '', kim: k?.kim || '' };
        });
        return { id: d.id, ders: d.ders, soruSayisi: d.soruSayisi, onay: d.onay, onayAd: d.onayAd, onayTarih: d.onayTarih,
          ...hazirlik(d, sorular.map(q => q.kazanim || null)), sorular };
      }),
    });
    return true;
  }

  // Dersin soru kazanımları + cevap anahtarı + iptaller tek kayıtta: { id, dersId, sorular: [{ no, sik, kazanim, iptal }] }.
  // Öğretmen değiştirirse onay düşer (yeniden onaylamalı); yönetim değiştirirse onay korunur. Sonuçlar cevaplardan hesaplandığı için anında güncellenir
  if (req.method === 'POST' && yol === '/api/sinav/sorular') {
    const b = await govde(req);
    const e = erisim(tamSayi(b.id, 1, 1e9));
    if (!e || e.s.tur !== 'test') return hata(404, 'Sınav bulunamadı');
    const dersId = Number(b.dersId);
    if (!e.ders.has(dersId)) return hata(403, 'Bu dersin soruları yalnızca dersi veren öğretmenler ve yönetim tarafından girilir');
    const d = dersleri(e.s.id).find(x => x.id === dersId);
    if (!Array.isArray(b.sorular) || b.sorular.length > 200) return hata(400, 'Geçersiz istek');
    const anahtar = [...d.anahtar];
    const iptal = new Set(d.iptal);
    const kazanimlar = [];
    for (const q of b.sorular) {
      const no = tamSayi(q.no, 1, d.soruSayisi);
      const sik = String(q.sik || '').toLocaleUpperCase('en');
      const kazanim = String(q.kazanim || '').replace(/\s+/g, ' ').trim();
      if (!no || kazanim.length > 300 || (sik && !SIKLAR.includes(sik))) return hata(400, 'Soru numarası, şık veya kazanım geçersiz (kazanım en çok 300 karakter)');
      anahtar[no - 1] = sik || '?';
      if (q.iptal) iptal.add(no); else iptal.delete(no);
      kazanimlar.push({ no, kazanim });
    }
    islem(() => {
      db.prepare('UPDATE sinav_dersler SET anahtar = ?, iptal = ?, onay = ? WHERE id = ?')
        .run(anahtar.join(''), JSON.stringify([...iptal].sort((a, c) => a - c)), yon ? Number(d.onay) : 0, dersId);
      for (const q of kazanimlar) {
        if (!q.kazanim) db.prepare('DELETE FROM sinav_kazanim WHERE sinav_ders_id = ? AND soru_no = ?').run(dersId, q.no);
        else db.prepare(`INSERT INTO sinav_kazanim (sinav_ders_id, soru_no, kazanim, guncelleyen, tarih) VALUES (?,?,?,?,?)
          ON CONFLICT (sinav_ders_id, soru_no) DO UPDATE SET kazanim = excluded.kazanim, guncelleyen = excluded.guncelleyen, tarih = excluded.tarih`)
          .run(dersId, q.no, q.kazanim, o.membership_id, Date.now());
      }
    });
    denetle(o.user_id, 'sinav-sorular', { id: e.s.id, dersId });
    json(res, 200, { tamam: true });
    return true;
  }

  // Dersin hazırlığını onaylar: anahtar ve kazanımlar eksiksiz olmalı; yönetim "hazır" görür
  if (req.method === 'POST' && yol === '/api/sinav/onay') {
    const b = await govde(req);
    const e = erisim(tamSayi(b.id, 1, 1e9));
    if (!e || e.s.tur !== 'test') return hata(404, 'Sınav bulunamadı');
    const dersId = Number(b.dersId);
    if (!e.ders.has(dersId)) return hata(403, 'Bu dersi onaylama yetkiniz yok');
    const d = dersleri(e.s.id).find(x => x.id === dersId);
    if (b.onay) {
      const h = hazirlik(d, kazanimlari(e.s.id).get(dersId));
      if (!h.tamam) return hata(400, `Onaylamadan önce tüm cevapları (${h.sik}/${d.soruSayisi}) ve kazanımları (${h.kazanim}/${h.gerekli}) girin`);
      db.prepare('UPDATE sinav_dersler SET onay = 1, onaylayan = ?, onay_tarih = ? WHERE id = ?').run(o.membership_id, Date.now(), dersId);
    } else db.prepare('UPDATE sinav_dersler SET onay = 0, onaylayan = NULL, onay_tarih = NULL WHERE id = ?').run(dersId);
    denetle(o.user_id, b.onay ? 'sinav-onay' : 'sinav-onay-kaldir', { id: e.s.id, dersId });
    json(res, 200, { onay: !!b.onay });
    return true;
  }

  // Öğrenci cevapları: { id, kayitlar: [{ ogrenciId, dersId, cevaplar }] } — yalnız yönetim (optik okuyucu / Excel / elle)
  if (req.method === 'POST' && yol === '/api/sinav/cevaplar') {
    if (!yon) return hata(403, 'Öğrenci cevaplarını yalnızca okul yönetimi girebilir veya değiştirebilir');
    const b = await govde(req);
    const s = db.prepare("SELECT * FROM sinavlar WHERE id = ? AND tur = 'test'").get(tamSayi(b.id, 1, 1e9));
    if (!s) return hata(404, 'Sınav bulunamadı');
    if (!Array.isArray(b.kayitlar) || b.kayitlar.length > 2000) return hata(400, 'Geçersiz istek');
    const dersler = new Map(dersleri(s.id).map(d => [d.id, d]));
    const ogr = new Set(sinifOgrencileri(sinavSiniflari(s.id).map(c => c.id)).map(g => g.ogrenciId));
    for (const k of b.kayitlar) {
      const d = dersler.get(Number(k.dersId));
      if (!d || !ogr.has(Number(k.ogrenciId))) return hata(400, 'Geçersiz kayıt');
      if (d.anahtar.includes('?') && String(k.cevaplar || '').trim()) return hata(400, `${d.ders}: cevap anahtarı henüz tamamlanmadı`);
    }
    islem(() => {
      for (const k of b.kayitlar) {
        const d = dersler.get(Number(k.dersId));
        const og = Number(k.ogrenciId);
        const c = String(k.cevaplar || '').trim();
        if (!c) db.prepare('DELETE FROM sinav_cevaplar WHERE sinav_ders_id = ? AND student_membership_id = ?').run(d.id, og);
        else db.prepare(`INSERT INTO sinav_cevaplar (sinav_ders_id, student_membership_id, cevaplar) VALUES (?,?,?)
          ON CONFLICT (sinav_ders_id, student_membership_id) DO UPDATE SET cevaplar = excluded.cevaplar`)
          .run(d.id, og, cevapTemiz(c, d.soruSayisi));
      }
    });
    denetle(o.user_id, 'sinav-cevap', { id: s.id, adet: b.kayitlar.length });
    json(res, 200, { tamam: true });
    return true;
  }

  // Yazılı sınav: öğrenci puanları { id, kayitlar: [{ ogrenciId, puan }] } (boş puan = girmedi).
  // Öğretmen yalnız dersi verdiği sınıfların öğrencilerine puan girer; yönetim hepsine
  if (req.method === 'POST' && yol === '/api/sinav/puanlar') {
    const b = await govde(req);
    const e = erisim(tamSayi(b.id, 1, 1e9));
    if (!e || e.s.tur !== 'yazili') return hata(404, 'Sınav bulunamadı');
    if (!Array.isArray(b.kayitlar) || b.kayitlar.length > 2000) return hata(400, 'Geçersiz istek');
    const ders = dersleri(e.s.id)[0];
    const sinifIdleri = yon ? sinavSiniflari(e.s.id).map(c => c.id) : [...new Set(ciftler(e.s.id, o.membership_id).map(c => c.sinifId))];
    const ogr = new Set(sinifOgrencileri(sinifIdleri).map(g => g.ogrenciId));
    const yeni = [];
    for (const k of b.kayitlar) {
      const og = Number(k.ogrenciId);
      if (!ogr.has(og)) return hata(400, 'Geçersiz öğrenci: yalnızca ders verdiğiniz sınıfların öğrencilerine puan girebilirsiniz');
      const ham = String(k.puan ?? '').trim().replace(',', '.');
      if (!ham) { yeni.push([og, null]); continue; }
      const p = Number(ham);
      if (!Number.isFinite(p) || p < 0 || p > 100) return hata(400, 'Puan 0 ile 100 arasında olmalı');
      yeni.push([og, Math.round(p * 10) / 10]);
    }
    islem(() => {
      for (const [og, p] of yeni) {
        if (p === null) db.prepare('DELETE FROM sinav_puanlar WHERE sinav_ders_id = ? AND student_membership_id = ?').run(ders.id, og);
        else db.prepare(`INSERT INTO sinav_puanlar (sinav_ders_id, student_membership_id, puan) VALUES (?,?,?)
          ON CONFLICT (sinav_ders_id, student_membership_id) DO UPDATE SET puan = excluded.puan`).run(ders.id, og, p);
      }
    });
    denetle(o.user_id, 'sinav-puan', { id: e.s.id, adet: yeni.length });
    json(res, 200, { tamam: true });
    return true;
  }

  // Yazılı sınav: sınavın bütününün ölçtüğü kazanımlar (isteğe bağlı); yönetim ve dersi veren öğretmenler girer
  if (req.method === 'POST' && yol === '/api/sinav/yazili-kazanim') {
    const b = await govde(req);
    const e = erisim(tamSayi(b.id, 1, 1e9));
    if (!e || e.s.tur !== 'yazili') return hata(404, 'Sınav bulunamadı');
    const kaz = kazanimListe(b.kazanimlar);
    if (kaz.length > 30 || kaz.some(k => k.length > 300)) return hata(400, 'En çok 30 kazanım, her biri en çok 300 karakter olabilir');
    islem(() => {
      db.prepare('DELETE FROM sinav_genel_kazanim WHERE sinav_id = ?').run(e.s.id);
      kaz.forEach((k, i) => db.prepare('INSERT INTO sinav_genel_kazanim (sinav_id, sira, kazanim) VALUES (?,?,?)').run(e.s.id, i + 1, k));
    });
    denetle(o.user_id, 'sinav-yazili-kazanim', { id: e.s.id });
    json(res, 200, { tamam: true });
    return true;
  }

  // Sonuçlar ve madde analizi: yönetim hepsini, öğretmen yalnız ders verdiği sınıfların kendi dersini görür
  if (req.method === 'GET' && yol === '/api/sinav/sonuc') {
    const e = erisim(tamSayi(url.searchParams.get('id'), 1, 1e9));
    if (!e) return hata(404, 'Sınav bulunamadı');
    const sonuc = sonucHesapla(e.s, url.searchParams.get('kazanim') === '1', yon ? null : kisit(e.s));
    // Öğretmenin kısıtlı görünümünde ortalama yalnız kendi dersinindir; genel sıra ve değişim o zaman verilmez
    if (!sonuc.kisitli) {
      for (const g of sonuc.ogrenciler) {
        if (g.ortalama === null) continue;
        g.siralama = siralamaBilgisi(e.s, g.ogrenciId);
        g.degisim = degisimBilgisi(e.s, g.ogrenciId, g.ortalama, false);
      }
    }
    json(res, 200, sonuc);
    return true;
  }

  // Yayınla / yayından kaldır (yönetim): yayınlanınca öğrenci ve veli sonucu görür; açılış sınavı hiçbir zaman yayınlanmaz
  if (req.method === 'POST' && yol === '/api/sinav/yayin') {
    if (!yon) return hata(403, 'Sonuçları yalnızca okul yönetimi yayınlar');
    const b = await govde(req);
    const e = erisim(tamSayi(b.id, 1, 1e9));
    if (!e) return hata(404, 'Sınav bulunamadı');
    if (b.yayin && e.s.amac === 'acilis') return hata(400, 'Açılış sınavı sonuçları öğrenci ve velilere açılmaz');
    if (b.yayin && e.s.durum !== 'aktif') return hata(400, 'Önce sınavı etkinleştirin');
    db.prepare('UPDATE sinavlar SET yayin = ? WHERE id = ?').run(b.yayin ? 1 : 0, e.s.id);
    denetle(o.user_id, b.yayin ? 'sinav-yayin' : 'sinav-yayin-kaldir', { id: e.s.id });
    json(res, 200, { yayin: !!b.yayin });
    return true;
  }

  if (req.method === 'POST' && yol === '/api/sinav/sil') {
    if (!yon) return hata(403, 'Sınavı yalnızca okul yönetimi siler');
    const b = await govde(req);
    const e = erisim(tamSayi(b.id, 1, 1e9));
    if (!e) return hata(404, 'Sınav bulunamadı');
    const s = e.s;
    islem(() => {
      db.prepare('DELETE FROM sinav_cevaplar WHERE sinav_ders_id IN (SELECT id FROM sinav_dersler WHERE sinav_id = ?)').run(s.id);
      db.prepare('DELETE FROM sinav_kazanim WHERE sinav_ders_id IN (SELECT id FROM sinav_dersler WHERE sinav_id = ?)').run(s.id);
      db.prepare('DELETE FROM sinav_puanlar WHERE sinav_ders_id IN (SELECT id FROM sinav_dersler WHERE sinav_id = ?)').run(s.id);
      db.prepare('DELETE FROM sinav_genel_kazanim WHERE sinav_id = ?').run(s.id);
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
