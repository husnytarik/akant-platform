const ROL_ADI = { yonetim: 'Yönetim', ogretmen: 'Öğretmen', ogrenci: 'Öğrenci', veli: 'Veli' };
const $ = id => document.getElementById(id);
let subeler = [];

function mesaj(metin, tur = '') {
  $('mesaj').textContent = metin;
  $('mesaj').className = 'mesaj ' + tur;
}

async function api(yol, govde) {
  const r = await fetch(yol, govde === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(govde),
  });
  if (r.status === 401) { location.href = '/'; throw new Error('oturum'); }
  const v = await r.json().catch(() => ({}));
  return { ok: r.ok, veri: v };
}

function secenekler(sel, liste, deger, etiket) {
  sel.replaceChildren();
  for (const x of liste) {
    const o = document.createElement('option');
    o.value = deger(x);
    o.textContent = etiket(x);
    sel.appendChild(o);
  }
}

function hucre(...cocuklar) {
  const td = document.createElement('td');
  td.append(...cocuklar);
  return td;
}

async function yukle() {
  const { ok, veri } = await api('/api/yonetim/kullanicilar');
  if (!ok) { location.href = '/panel'; return; }
  const govde = $('liste');
  govde.replaceChildren();

  for (const u of veri.kullanicilar) {
    const tr = document.createElement('tr');

    const uyelikKutusu = document.createElement('div');
    for (const m of u.uyelikler) {
      const satir = document.createElement('div');
      satir.className = 'uyelik' + (m.durum === 'pasif' ? ' pasif' : '');
      const etiket = document.createElement('span');
      etiket.textContent = `${ROL_ADI[m.rol]} · ${m.sube || '-'}${m.durum === 'pasif' ? ' (pasif)' : ''}`;
      const dugme = document.createElement('button');
      dugme.type = 'button';
      dugme.className = 'ikincil kucuk';
      dugme.textContent = m.durum === 'aktif' ? 'Pasifleştir' : 'Aktifleştir';
      dugme.addEventListener('click', async () => {
        const r = await api('/api/yonetim/uyelik-durum', { uyelikId: m.id, durum: m.durum === 'aktif' ? 'pasif' : 'aktif' });
        if (!r.ok) mesaj(r.veri.hata || 'Hata', 'hata'); else { mesaj(''); yukle(); }
      });
      satir.append(etiket, dugme);
      uyelikKutusu.appendChild(satir);
    }

    const ekleForm = document.createElement('form');
    ekleForm.className = 'mini-form';
    const sSube = document.createElement('select');
    const sRol = document.createElement('select');
    secenekler(sSube, subeler, s => s.id, s => s.ad);
    secenekler(sRol, Object.keys(ROL_ADI), r => r, r => ROL_ADI[r]);
    sSube.setAttribute('aria-label', 'Şube');
    sRol.setAttribute('aria-label', 'Rol');
    const bt = document.createElement('button');
    bt.type = 'submit';
    bt.className = 'ikincil kucuk';
    bt.textContent = 'Ekle';
    ekleForm.append(sSube, sRol, bt);
    ekleForm.addEventListener('submit', async e => {
      e.preventDefault();
      const r = await api('/api/yonetim/uyelik-ekle', { userId: u.id, subeId: sSube.value, rol: sRol.value });
      if (!r.ok) mesaj(r.veri.hata || 'Hata', 'hata'); else { mesaj('Üyelik eklendi.', 'tamam'); yukle(); }
    });

    tr.append(
      hucre(u.ad),
      hucre(`${u.kimlikTuru} ${u.kimlik}`),
      hucre(u.telefon),
      hucre(uyelikKutusu),
      hucre(ekleForm),
    );
    govde.appendChild(tr);
  }
  if (!govde.children.length) {
    const tr = document.createElement('tr'), td = document.createElement('td');
    td.colSpan = 5; td.className = 'bos-hucre'; td.textContent = 'Henüz kullanıcı yok.';
    tr.appendChild(td); govde.appendChild(tr);
  }
}

$('ekle').addEventListener('submit', async e => {
  e.preventDefault();
  const r = await api('/api/yonetim/kullanici-ekle', {
    ad: $('ad').value, kimlik: $('kimlik').value, telefon: $('telefon').value,
    subeId: $('sube').value, rol: $('rol').value,
  });
  if (!r.ok) return mesaj(r.veri.hata || 'Hata', 'hata');
  mesaj('Kullanıcı eklendi.', 'tamam');
  $('ekle').reset();
  yukle();
});

(async () => {
  const s = await api('/api/yonetim/subeler');
  if (!s.ok) { location.href = '/panel'; return; }
  subeler = s.veri.subeler;
  secenekler($('sube'), subeler, x => x.id, x => x.ad);
  secenekler($('rol'), Object.keys(ROL_ADI), r => r, r => ROL_ADI[r]);
  yukle();
})();
