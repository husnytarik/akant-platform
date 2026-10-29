// Boş bir veritabanına ilk yöneticiyi ekler (arayüzdeki ilk üyelik ekranının komut satırı karşılığı).
// Kullanım: node ilk-kurulum.js --ad "Ad Soyad" --tc 12345678901 --telefon 5xxxxxxxxx --okul "Okul adı"
import './kurum.js';
import { ilkOkulKur } from './kurum.js';

const arg = ad => { const i = process.argv.indexOf(`--${ad}`); return i > 0 ? String(process.argv[i + 1] ?? '').trim() : ''; };
const s = ilkOkulKur({ ad: arg('ad'), tc: arg('tc'), telefon: arg('telefon'), okul: arg('okul') });
if (s.hata) { console.error(s.hata); process.exit(1); }
console.log('İlk yönetici oluşturuldu. Giriş: TC kimlik no + telefon.');
