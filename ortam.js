import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Ortam ayarları tek yerden okunur; plan büyüdüğünde yalnızca bu değerler değişir, kod/kurulum değişmez.
const kok = path.dirname(fileURLToPath(import.meta.url));
const sayi = (ad, varsayilan) => {
  const n = Number(process.env[ad]);
  return Number.isFinite(n) && n >= 0 && process.env[ad] !== '' && process.env[ad] != null ? n : varsayilan;
};

export const ortam = {
  // SMS sağlayıcısı bağlanana kadar giriş TC/pasaport + telefonla yapılır; SMS devreye girince GIRIS_SMS=1 ile kod zorunlu olur
  kodsuzGiris: process.env.GIRIS_SMS !== '1',
  // Üretimde demo ve geliştirici kolaylıkları kapalıdır, gizli anahtar zorunludur
  uretim: process.env.NEADEMY_ORTAM === 'uretim',
  // Veritabanı ve yedeklerin durduğu klasör (Render diski, VPS'te ayrı disk vb.)
  veriKlasoru: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(kok, 'data'),
  // Bellek ayarları (MB): daha çok RAM'li plana geçince yalnızca bunları büyütmek yeter
  onbellekMB: sayi('DB_CACHE_MB', 64),
  mmapMB: sayi('DB_MMAP_MB', 256),
  yedekSaklaGun: sayi('YEDEK_SAKLA_GUN', 14),
  yedekAralikSaat: sayi('YEDEK_ARALIK_SAAT', 6),
  // Buluta yükleme aralıkları (yedek depo ayarlıysa): kritik veri dakikada, tam yedek saatte
  bulutKritikDakika: sayi('YEDEK_BULUT_KRITIK_DAKIKA', 15),
  bulutTamSaat: sayi('YEDEK_BULUT_TAM_SAAT', 12),
};
