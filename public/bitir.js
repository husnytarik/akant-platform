// Seçili dersin "Dersi bitir" sekmesi: yoklama, işlenen konu + kazanım, ödev, iptal.
// derslerim.js içinden çağrılır (el, api, mesaj, kazanimAlani, ders, tarih, bugun oradan gelir).
const BITIR_SECENEK = [['geldi', 'Geldi'], ['gelmedi', 'Gelmedi'], ['gec', 'Geç'], ['izinli', 'İzinli']];

async function bitirCiz(k, bitince) {
  const q = new URLSearchParams({ tarih, sinifId: ders.sinifId, dersSaati: ders.dersSaati });
  const r = await api('/api/yoklama/ogrenciler?' + q);
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  const ogrenciler = r.veri.ogrenciler;
  const durum = new Map(ogrenciler.map(o => [o.ogrenciId, o.durum]));
  k.replaceChildren();

  const durumEtiket = el('span', r.veri.iptal ? 'İptal edilmiş' : r.veri.tamam ? 'Düzenleniyor' : 'Yeni kayıt', 'rozet ' + (r.veri.iptal ? 'iptal' : r.veri.tamam ? 'tamam' : 'bekliyor'));

  // Yoklama: oransal çubuk + sayılar; toplu işaretleme tek bir yumuşak düğme
  const RENK = { geldi: '#2e9e5b', gelmedi: '#d64545', gec: '#e0a100', izinli: '#8a867d' };
  const AD = { geldi: 'geldi', gelmedi: 'gelmedi', gec: 'geç', izinli: 'izinli' };
  const ozet = el('div', undefined, 'yok-ozet');
  const liste = el('div', undefined, 'yoklama-liste hapli');
  const toplu = el('button', undefined, 'yok-toplu'); toplu.type = 'button';
  toplu.append(el('span', '✓', 'yok-toplu-ikon'), document.createTextNode('Hepsini geldi yap'));
  const ozetYaz = () => {
    const say = { geldi: 0, gelmedi: 0, gec: 0, izinli: 0 };
    for (const o of ogrenciler) say[durum.get(o.ogrenciId)]++;
    const dilimler = Object.keys(say).map(d => ({ deger: say[d], renk: RENK[d], etiket: AD[d] }));
    ozet.replaceChildren(yiginCubuk(dilimler), gosterge(dilimler.filter(d => d.deger > 0 || d.etiket === 'geldi')));
    toplu.classList.toggle('gizli', ogrenciler.length === 0 || say.geldi === ogrenciler.length);
  };
  const hapCiz = () => {
    liste.replaceChildren();
    for (const o of ogrenciler) {
      const hap = el('button', undefined, 'yok-hap d-' + durum.get(o.ogrenciId));
      hap.type = 'button';
      const ikon = el('span', PASTA_IKON[durum.get(o.ogrenciId)], 'yok-ikon');
      hap.append(el('span', o.ad, 'yok-ad'), ikon);
      hap.addEventListener('click', () => pastaAc(o.ad, hap, BITIR_SECENEK, durum.get(o.ogrenciId), d => {
        durum.set(o.ogrenciId, d);
        hap.className = 'yok-hap d-' + d;
        ikon.textContent = PASTA_IKON[d];
        ozetYaz();
      }));
      liste.appendChild(hap);
    }
    ozetYaz();
  };
  toplu.addEventListener('click', () => {
    for (const o of ogrenciler) durum.set(o.ogrenciId, 'geldi');
    hapCiz();
  });

  const yok = el('div', undefined, 'adim');
  const yokUst = el('div', undefined, 'adim-ust');
  yokUst.append(el('h3', 'Yoklama'), durumEtiket);
  yok.append(yokUst, ozet, toplu, liste);
  if (!ogrenciler.length) yok.append(el('p', 'Bu sınıfta aktif öğrenci yok.', 'alt'));

  // İşlenen konu + kazanım
  const konu = el('input'); konu.id = 'b-konu'; konu.maxLength = 120; konu.placeholder = 'Örn. Doğal sayılarla işlemler'; konu.value = r.veri.konu || '';
  const lk = el('label', 'Konu'); lk.htmlFor = 'b-konu';
  const kaz = el('input'); kaz.id = 'b-kazanim'; kaz.maxLength = 300; kaz.autocomplete = 'off'; kaz.placeholder = 'Kod veya kelimeyle arayın'; kaz.value = r.veri.kazanim || '';
  const lkz = el('label', 'Kazanım (isteğe bağlı)'); lkz.htmlFor = 'b-kazanim';
  const konuKutu = el('div', undefined, 'adim');
  const konuUst = el('div', undefined, 'adim-ust'); konuUst.append(el('h3', 'İşlenen konu'));
  konuKutu.append(konuUst, lk, konu, lkz, kaz, kazanimAlani(kaz));

  // Ödev
  const ob = el('input'); ob.id = 'b-odev'; ob.maxLength = 120; ob.placeholder = 'Örn. Sayfa 40-41 alıştırmaları'; ob.value = r.veri.odev?.baslik || '';
  const oa = el('input'); oa.id = 'b-odev-ac'; oa.maxLength = 500; oa.value = r.veri.odev?.aciklama || '';
  const ot = el('input'); ot.id = 'b-odev-tarih'; ot.type = 'date';
  ot.value = r.veri.odev?.sonTarih || new Date(Date.now() + 7 * 864e5).toLocaleDateString('sv-SE');
  const l1 = el('label', 'Ödev'); l1.htmlFor = 'b-odev';
  const l2 = el('label', 'Açıklama'); l2.htmlFor = 'b-odev-ac';
  const l3 = el('label', 'Son teslim tarihi'); l3.htmlFor = 'b-odev-tarih';
  const odevKutu = el('div', undefined, 'adim');
  const odevUst = el('div', undefined, 'adim-ust'); odevUst.append(el('h3', 'Ödev'), el('span', 'isteğe bağlı', 'alt'));
  odevKutu.append(odevUst, l1, ob, l2, oa, l3, ot);

  // Düğmeler
  const iptal = el('button', 'Dersi iptal et', 'ikincil tehlike'); iptal.type = 'button';
  const kaydet = el('button', r.veri.tamam ? 'Değişiklikleri kaydet' : 'Dersi bitir', 'birincil'); kaydet.type = 'button';
  const cubuk = el('div', undefined, 'kaydet-cubuk');
  cubuk.append(iptal, kaydet);

  const hataTemizle = () => {
    for (const x of k.querySelectorAll('.alan-hata')) x.remove();
    for (const x of k.querySelectorAll('.hatali')) x.classList.remove('hatali');
  };
  const hataGoster = metin => {
    hataTemizle();
    const m = metin.toLowerCase();
    const hedef = m.includes('konu') ? konu : m.includes('ödev başlığı') ? ob : m.includes('ödev') ? ot : null;
    const p = el('p', metin, 'alan-hata'); p.setAttribute('role', 'alert');
    if (hedef) { hedef.classList.add('hatali'); hedef.after(p); hedef.scrollIntoView({ behavior: 'smooth', block: 'center' }); hedef.focus({ preventScroll: true }); }
    else { cubuk.before(p); p.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  };
  for (const x of [konu, ob, ot]) x.addEventListener('input', hataTemizle);

  kaydet.addEventListener('click', async () => {
    const s = await api('/api/yoklama/kaydet', {
      tarih, sinifId: ders.sinifId, dersSaati: ders.dersSaati,
      kayitlar: ogrenciler.map(o => ({ ogrenciId: o.ogrenciId, durum: durum.get(o.ogrenciId) })),
      konu: konu.value, kazanim: kaz.value,
      odev: { baslik: ob.value, aciklama: oa.value, sonTarih: ot.value },
    });
    if (!s.ok) return hataGoster(s.veri.hata || 'Hata');
    hataTemizle();
    mesaj(`Ders tamamlandı: ${s.veri.gelmedi} gelmedi, ${s.veri.gec} geç, ${s.veri.izinli} izinli.`, 'tamam');
    bitince();
  });
  iptal.addEventListener('click', async () => {
    if (!confirm('Bu ders iptal edilsin mi? Girilen yoklama, konu ve ödev silinir.')) return;
    const s = await api('/api/yoklama/iptal', { tarih, sinifId: ders.sinifId, dersSaati: ders.dersSaati });
    if (!s.ok) return mesaj(s.veri.hata || 'Hata', 'hata');
    mesaj('Ders iptal edildi.', 'tamam');
    bitince();
  });

  k.append(yok, konuKutu, odevKutu, cubuk);
  hapCiz();
}
