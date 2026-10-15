const $ = id => document.getElementById(id);
const GUNLER = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
let yapi = null;

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
  if (r.status === 403) { location.href = '/panel'; throw new Error('yetki'); }
  const v = await r.json().catch(() => ({}));
  return { ok: r.ok, veri: v };
}

function doldur(sel, liste, deger, etiket, bos) {
  sel.replaceChildren();
  if (bos) sel.appendChild(new Option(bos, ''));
  for (const x of liste) sel.appendChild(new Option(etiket(x), deger(x)));
}

async function yapiYukle() {
  const r = await api('/api/yonetim/sinif-yapisi');
  yapi = r.veri;

  const onceki = $('program-sinif').value;
  doldur($('program-sinif'), yapi.siniflar, s => s.id,
    s => `${s.sube} · ${s.kademe} · ${s.ad}`, yapi.siniflar.length ? null : 'Önce Okul kurulumu\'ndan sınıf açın');
  if (onceki && yapi.siniflar.some(s => String(s.id) === onceki)) $('program-sinif').value = onceki;

  // Aynı kişi birden fazla şubede öğretmense tek satırda göster
  const tekil = new Map();
  for (const o of yapi.ogretmenler) if (!tekil.has(o.userId)) tekil.set(o.userId, o);
  const prev = $('ogretmen-sec').value;
  doldur($('ogretmen-sec'), [...tekil.values()], o => o.userId, o => o.ad, 'Öğretmen seçin');
  if (prev) $('ogretmen-sec').value = prev;
}

function baslikSatiri(tablo) {
  const bas = document.createElement('tr');
  bas.appendChild(document.createElement('th'));
  for (const g of GUNLER.slice(0, yapi.gunSayisi)) {
    const th = document.createElement('th');
    th.textContent = g;
    bas.appendChild(th);
  }
  tablo.appendChild(bas);
}

function saatBasligi(saat) {
  const th = document.createElement('th');
  th.textContent = `${saat}. ders`;
  return th;
}

// ---- Sınıf programı ----
async function programYukle() {
  const sinifId = $('program-sinif').value;
  const tablo = $('program-tablo');
  tablo.replaceChildren();
  $('program-ozet').textContent = '';
  if (!sinifId) return;

  const [a, p] = await Promise.all([
    api('/api/yonetim/atamalar?sinifId=' + sinifId),
    api('/api/yonetim/program?sinifId=' + sinifId),
  ]);
  const tum = a.veri.atamalar;
  const atamalar = tum.filter(x => x.ogretmenUyelikId);
  const hucre = new Map(p.veri.hucreler.map(h => [`${h.gun}-${h.saat}`, h]));

  if (!atamalar.length) {
    $('program-ozet').textContent = 'Bu sınıfa öğretmeni atanmış ders yok. Okul kurulumu > Sınıflar bölümünden ders ve öğretmen atayın.';
  }

  baslikSatiri(tablo);
  for (let saat = 1; saat <= yapi.dersSaati; saat++) {
    const tr = document.createElement('tr');
    tr.appendChild(saatBasligi(saat));
    for (let gun = 1; gun <= yapi.gunSayisi; gun++) {
      const td = document.createElement('td');
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', `${GUNLER[gun - 1]} ${saat}. ders`);
      doldur(sel, atamalar, x => x.id, x => `${x.ders} - ${x.ogretmen}`, '—');
      const mevcut = hucre.get(`${gun}-${saat}`);
      if (mevcut) sel.value = String(mevcut.atamaId);
      sel.addEventListener('change', async () => {
        const r = await api('/api/yonetim/program-hucre', {
          sinifId: Number(sinifId), gun, saat, atamaId: sel.value === '' ? null : Number(sel.value),
        });
        if (!r.ok) mesaj(r.veri.hata || 'Hata', 'hata'); else mesaj('Kaydedildi.', 'tamam');
        programYukle();
      });
      td.appendChild(sel);
      tr.appendChild(td);
    }
    tablo.appendChild(tr);
  }

  if (tum.length) {
    $('program-ozet').textContent = 'Yerleşen / hedef: ' +
      tum.map(x => `${x.ders} ${x.kullanilan}/${x.haftalikSaat}`).join(' · ');
  }
}

$('program-sinif').addEventListener('change', programYukle);

// ---- Öğretmen programı (salt okunur) ----
async function ogretmenProgrami() {
  const tablo = $('ogretmen-tablo');
  tablo.replaceChildren();
  const userId = $('ogretmen-sec').value;
  if (!userId) return;
  const r = await api('/api/yonetim/ogretmen-programi?userId=' + userId);
  const hucre = new Map(r.veri.hucreler.map(h => [`${h.gun}-${h.saat}`, h]));

  baslikSatiri(tablo);
  for (let saat = 1; saat <= yapi.dersSaati; saat++) {
    const tr = document.createElement('tr');
    tr.appendChild(saatBasligi(saat));
    for (let gun = 1; gun <= yapi.gunSayisi; gun++) {
      const td = document.createElement('td');
      const h = hucre.get(`${gun}-${saat}`);
      td.textContent = h ? `${h.sinif} · ${h.ders}` : '';
      tr.appendChild(td);
    }
    tablo.appendChild(tr);
  }
}

$('ogretmen-sec').addEventListener('change', ogretmenProgrami);

// ---- Sekmeler ----
document.querySelectorAll('.sekmeler button').forEach(b => {
  b.addEventListener('click', async () => {
    document.querySelectorAll('.sekmeler button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('s-program').classList.toggle('gizli', b.dataset.sekme !== 'program');
    $('s-ogretmen').classList.toggle('gizli', b.dataset.sekme !== 'ogretmen');
    mesaj('');
    await yapiYukle();
    if (b.dataset.sekme === 'program') programYukle(); else ogretmenProgrami();
  });
});

yapiYukle().then(programYukle);
