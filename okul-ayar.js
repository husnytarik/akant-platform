// Okul takvimi: ders günleri ve ders saatleri (zil saatleri). Yönetim belirler; tüm modüller buradan okur.
// DERS_ZAMANLARI ve ACIK_GUNLER yerinde güncellenen dizilerdir: içe aktaran modüller değişikliği anında görür.
import { db } from './db.js';

db.exec('CREATE TABLE IF NOT EXISTS okul_ayar (anahtar TEXT PRIMARY KEY, deger TEXT NOT NULL)');

// 0 = Pazar ... 6 = Cumartesi (JS getUTCDay); ders programında gün numarası da budur
export const GUN_ADLARI = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
export const GUN_SIRASI = [1, 2, 3, 4, 5, 6, 0];
export const AZAMI_SAAT = 14;

const VARSAYILAN = {
  gunler: [1, 2, 3, 4, 5],
  // Okulun mevcut sistemindeki zil saatleri (3. ve 7. ders aradaki düzene göre varsayıldı)
  saatler: [
    ['08:50', '09:30'], ['10:00', '10:40'], ['10:50', '11:30'], ['11:40', '12:20'], ['13:00', '13:40'],
    ['13:50', '14:30'], ['14:40', '15:20'], ['15:30', '16:10'], ['16:20', '17:00'],
  ],
};

export const DERS_ZAMANLARI = [];
export const ACIK_GUNLER = [];
export const gunAcik = g => ACIK_GUNLER.includes(g);

function uygula(gunler, saatler) {
  ACIK_GUNLER.length = 0;
  ACIK_GUNLER.push(...GUN_SIRASI.filter(g => gunler.includes(g)));
  DERS_ZAMANLARI.length = 0;
  DERS_ZAMANLARI.push(...saatler.map(s => [s[0], s[1]]));
}

function oku(anahtar, varsayilan) {
  const r = db.prepare('SELECT deger FROM okul_ayar WHERE anahtar = ?').get(anahtar);
  if (!r) return varsayilan;
  try { return JSON.parse(r.deger); } catch { return varsayilan; }
}

uygula(oku('gunler', VARSAYILAN.gunler), oku('saatler', VARSAYILAN.saatler));

export const ayarlar = () => ({
  gunler: GUN_SIRASI.map(no => ({ no, ad: GUN_ADLARI[no], acik: gunAcik(no) })),
  saatler: DERS_ZAMANLARI.map(z => ({ bas: z[0], bit: z[1] })),
});

const SAAT_BICIMI = /^([01]\d|2[0-3]):[0-5]\d$/;

// Gelen ayarı doğrular; hata varsa { hata }, yoksa temiz { gunler, saatler }
export function ayarDogrula(b) {
  const gunler = [...new Set((Array.isArray(b.gunler) ? b.gunler : []).map(Number))];
  if (!gunler.length || gunler.some(g => !Number.isInteger(g) || g < 0 || g > 6)) return { hata: 'En az bir ders günü seçin' };
  const ham = Array.isArray(b.saatler) ? b.saatler : [];
  if (!ham.length || ham.length > AZAMI_SAAT) return { hata: `Ders saati sayısı 1-${AZAMI_SAAT} olmalı` };
  const saatler = [];
  for (const [i, s] of ham.entries()) {
    const bas = String(s?.bas ?? ''), bit = String(s?.bit ?? '');
    if (!SAAT_BICIMI.test(bas) || !SAAT_BICIMI.test(bit)) return { hata: `${i + 1}. ders saati geçersiz (SS:DD biçiminde yazın)` };
    if (bas >= bit) return { hata: `${i + 1}. dersin bitişi başlangıcından sonra olmalı` };
    if (i && bas < saatler[i - 1][1]) return { hata: `${i + 1}. ders, bir önceki dersin bitişinden önce başlıyor` };
    saatler.push([bas, bit]);
  }
  return { gunler, saatler };
}

// Kaldırılan gün ya da ders saatinde programda ders varsa kayıt reddedilir
export function ayarKaydet({ gunler, saatler }) {
  const yer = GUN_SIRASI.filter(g => !gunler.includes(g));
  if (yer.length) {
    const n = db.prepare(`SELECT COUNT(*) AS n FROM schedule WHERE day IN (${yer.join(',')})`).get().n;
    if (n) return { hata: `Kapatılan günlerde programda ${n} ders var; önce programdan boşaltın` };
  }
  const n = db.prepare('SELECT COUNT(*) AS n FROM schedule WHERE period > ?').get(saatler.length).n;
  if (n) return { hata: `${saatler.length}. dersten sonraki saatlerde programda ${n} ders var; önce programdan boşaltın` };
  db.prepare('INSERT OR REPLACE INTO okul_ayar (anahtar, deger) VALUES (?, ?)').run('gunler', JSON.stringify(gunler));
  db.prepare('INSERT OR REPLACE INTO okul_ayar (anahtar, deger) VALUES (?, ?)').run('saatler', JSON.stringify(saatler));
  uygula(gunler, saatler);
  return { tamam: true };
}
