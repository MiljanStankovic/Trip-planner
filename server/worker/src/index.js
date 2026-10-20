// Putovanja: MCP server za Claude (web, desktop, telefon), na Cloudflare Workers.
//
// Podatke ne računa sam: svako jutro ih GitHub Actions skenira i objavi kao male JSON fajlove na
// granu `podaci` (server/izvezi.py). Ovde se samo čitaju, filtriraju i šalju prozoru.
// Lične stvari (šta ko prati) su u KV, po korisniku.
//
// Protokol: MCP preko HTTP-a (JSON-RPC u POST telu, odgovor kao JSON), bez stanja između poziva.

import PROZOR_HTML from './prozor.html';
import POCETNA_HTML from './pocetna.html';
import IKONA from './ikona.png';

const VERZIJA = '0.7.2';
const PROZOR = `ui://putovanja/prozor-${VERZIJA}.html`;
const MIME_PROZORA = 'text/html;profile=mcp-app';
const ADRESA_SAJTA = 'https://putovanja.miljan-stankovic99.workers.dev';
const PODACI = 'https://raw.githubusercontent.com/MiljanStankovic/Trip-planner/podaci';

const UPUTSTVO =
  'Putovanja prikazuje ponude domaćih turističkih agencija (Srbija), cene po osobi, u prozoru u razgovoru. ' +
  'Kad korisnik pita za putovanja, aranžmane, gde da otputuje, ponude za neku zemlju ili šta prati, pozovi ' +
  'otvori_putovanja (sa zemljom ako je navedena). Prozor je cela aplikacija: korisnik u njemu sam bira zemlje, ' +
  'otvara ponude i prati cene. Za pitanja o jednoj ponudi koristi detalji_ponude umesto pretrage weba. ' +
  'Ponude se osvežavaju svako jutro. Odgovaraj kratko, srpskom latinicom. ' +
  'Kad je prozor otvoren, ti i korisnik ga koristite zajedno: sta_vidim kaže šta gleda (pozovi ga kad kaže „ova ponuda”, „ovde” ili pita o ekranu), ' +
  'a pokazi_u_putovanjima menja prikaz u istom prozoru (zemlja, pretraga, ponuda, filteri, kalendar) umesto da otvaraš novi. ' +
  'Za bilo kakvo traženje po kriterijumima (dnevni izleti, sve u oktobru, do 300 €, avionom, sa popustom…) koristi pretrazi_ponude sa naslovom: rezultat se pokaže u prozoru kao lista. ' +
  'Kad korisnik pita kako da pokrene ili doda Putovanja u Claude Code (pano pored razgovora), daj tačno ove korake, kratko, bez izmišljanja: 1) Treba Claude Code na računaru: terminal ili Code u aplikaciji Claude. Ako ga nema, instalira se jednom komandom: Windows (PowerShell): irm https://claude.ai/install.ps1 | iex; Mac ili Linux: curl -fsSL https://claude.ai/install.sh | bash. 2) U Claude Code pošalji, jednu pa drugu: /plugin marketplace add MiljanStankovic/Trip-planner i /plugin install putovanja@putovanja. 3) Zatvori i ponovo otvori Claude Code, pa otkucaj /putovanja; pano se otvara pored razgovora. Ništa drugo ne treba (ni Python), ponude stižu sa istog servera kao ovaj konektor. 4) Da pano prati isto što i telefon: u Claude Code otkucaj /putovanja adresa <adresa konektora>. Ako je korisnik u poruci dao svoju adresu konektora, napiši mu tu komandu sa njegovom adresom, spremnu za kopiranje; ako nije, reci da adresu nađe u Podešavanja → Konektori → putovanja. Ako pita sa telefona ili tableta, reci da se ovo radi na računaru; na telefonu već ima prozor.';

const ALATI = [
  {
    name: 'otvori_putovanja',
    title: 'Otvori Putovanja',
    description: 'Otvara Putovanja u prozoru: ponude domaćih agencija, preporučene ili za jednu zemlju (npr. "Grčka"). ' +
      'prikaz: pocetna | kalendar | praceno | uradisam. Prozor je cela aplikacija, korisnik dalje bira sam.',
    inputSchema: { type: 'object', properties: { zemlja: { type: 'string', default: '' }, prikaz: { type: 'string', default: 'pocetna' },
      naslov: { type: 'string', description: 'naslov liste kad se otvara sa filterom' },
      filter: { type: 'object', description: 'isti filter kao u pretrazi_ponude: prozor se otvara sa tom listom', properties: {
      tekst: { type: 'string', description: 'reči koje moraju da budu u nazivu, mestu, zemlji ili agenciji' },
      zemlje: { type: 'array', items: { type: 'string' } }, kontinent: { type: 'string' }, agencija: { type: 'string' },
      prevoz: { type: 'string', enum: ['avion', 'autobus', 'sopstveni', 'brod', 'voz'] },
      od: { type: 'string', description: 'polazak od datuma, YYYY-MM-DD' }, do: { type: 'string', description: 'polazak do datuma, YYYY-MM-DD' },
      mesec: { type: 'string', description: 'YYYY-MM, polasci u tom mesecu' },
      dnevni_izlet: { type: 'boolean', description: 'samo jednodnevni izleti (bez noćenja)' },
      noci_min: { type: 'integer' }, noci_max: { type: 'integer' },
      cena_max: { type: 'number', description: 'najviše evra po osobi' }, cena_min: { type: 'number' },
      samo_popust: { type: 'boolean' }, datum_po_izboru: { type: 'boolean', description: 'samo ponude bez fiksnog datuma (paketi)' },
      sort: { type: 'string', enum: ['preporuka', 'cena', 'datum', 'popust'] },
    } } } },
    _meta: { ui: { resourceUri: PROZOR } },
  },
  {
    name: 'detalji_ponude',
    title: 'Detalji ponude',
    description: 'Detalji jedne ponude sa sajta agencije: šta cena obuhvata i ne obuhvata, doplate, polasci, popusti za više osoba ' +
      'i procena ukupne cene za `osoba` putnika (1–4). id je iz prozora ili iz otvori_putovanja.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, osoba: { type: 'integer', default: 2 } }, required: ['id'] },
  },
  {
    name: 'skeniraj_agencije',
    title: 'Stanje skena',
    description: 'Ponude se skeniraju automatski svako jutro; ovo vraća kada je bio poslednji sken.',
    inputSchema: { type: 'object', properties: {} },
    _meta: { ui: { visibility: ['model', 'app'] } },
  },
  {
    name: 'pretrazi_ponude',
    title: 'Pretraži ponude',
    description: 'Pretražuje SVE ponude (oko 1000, 15 agencija) po bilo kojoj kombinaciji: tekst, zemlje, kontinent, agencija, prevoz, datumi ili mesec, ' +
      'jednodnevni izleti, broj noći, cena po osobi u evrima, samo sa popustom, datum po izboru; sort. Vraća broj i spisak. ' +
      'Kad je prikazi=true (podrazumevano) rezultat se pokaže i u prozoru Putovanja kao lista sa tvojim naslovom (npr. "Dnevni izleti", "Polasci u oktobru"); ' +
      'ako prozor nije otvoren, posle pozovi otvori_putovanja sa istim filter i naslov. Primeri: dnevni izleti → {dnevni_izlet:true}; sve u oktobru → {mesec:"2026-10"}; ' +
      'Grčka avionom do 400 € → {zemlje:["Grčka"], prevoz:"avion", cena_max:400}.',
    inputSchema: { type: 'object', properties: { naslov: { type: 'string', description: 'kratak naslov liste za prozor' }, prikazi: { type: 'boolean', default: true },
      filter: { type: 'object', properties: {
      tekst: { type: 'string', description: 'reči koje moraju da budu u nazivu, mestu, zemlji ili agenciji' },
      zemlje: { type: 'array', items: { type: 'string' } }, kontinent: { type: 'string' }, agencija: { type: 'string' },
      prevoz: { type: 'string', enum: ['avion', 'autobus', 'sopstveni', 'brod', 'voz'] },
      od: { type: 'string', description: 'polazak od datuma, YYYY-MM-DD' }, do: { type: 'string', description: 'polazak do datuma, YYYY-MM-DD' },
      mesec: { type: 'string', description: 'YYYY-MM, polasci u tom mesecu' },
      dnevni_izlet: { type: 'boolean', description: 'samo jednodnevni izleti (bez noćenja)' },
      noci_min: { type: 'integer' }, noci_max: { type: 'integer' },
      cena_max: { type: 'number', description: 'najviše evra po osobi' }, cena_min: { type: 'number' },
      samo_popust: { type: 'boolean' }, datum_po_izboru: { type: 'boolean', description: 'samo ponude bez fiksnog datuma (paketi)' },
      sort: { type: 'string', enum: ['preporuka', 'cena', 'datum', 'popust'] },
    } } } },
  },
  {
    name: 'sta_vidim',
    title: 'Šta je otvoreno u Putovanjima',
    description: 'Šta korisnik upravo gleda u otvorenom prozoru Putovanja: odeljak, izabrana zemlja ili pretraga, filteri, ponude na ekranu (sa id) i otvorena ponuda. ' +
      'Pozovi pre odgovora kad korisnik kaže „ova ponuda”, „ovde”, „ovo što gledam” ili pita nešto o onome što je na ekranu.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'pokazi_u_putovanjima',
    title: 'Pokaži u Putovanjima',
    description: 'Upravlja već otvorenim prozorom Putovanja: korisnik vidi promenu odmah. Koristi kad traži da mu nađeš, pokažeš, otvoriš ili sortiraš nešto, ' +
      'a prozor je otvoren (sta_vidim kaže aktivan). Ako prozor nije otvoren, pozovi otvori_putovanja. Sva polja su opciona: ' +
      'zemlja (npr. "Španija"), kontinent ("Evropa"), pretraga (mesto, hotel, agencija), ponuda_id (otvara ponudu), odeljak (ponude | kalendar | praceno | uradisam), ' +
      'mesec ("2026-11": u kalendaru taj mesec, u ponudama filter), sort (preporuka | cena | datum | popust), prevoz (avion | autobus | sopstveni | brod | voz | "" za sve), putnici ("2+0", "2+1", "1+0"…).',
    inputSchema: { type: 'object', properties: {
      zemlja: { type: 'string' }, kontinent: { type: 'string' }, pretraga: { type: 'string' }, ponuda_id: { type: 'string' },
      odeljak: { type: 'string', enum: ['ponude', 'kalendar', 'praceno', 'uradisam'] }, mesec: { type: 'string' },
      sort: { type: 'string', enum: ['preporuka', 'cena', 'datum', 'popust'] }, prevoz: { type: 'string' }, putnici: { type: 'string' } } },
  },
  {
    name: 'putovanja_podaci',
    title: 'Podaci za prozor',
    description: 'Interno za prozor Putovanja.',
    inputSchema: { type: 'object', properties: { komanda: { type: 'string' }, argumenti: { type: 'array', items: { type: 'string' } } }, required: ['komanda'] },
    _meta: { ui: { visibility: ['app'] } },
  },
];

// ---------- podaci sa grane `podaci` (keš: Cloudflare + memorija ovog procesa) ----------

const memorija = new Map();
async function fajl(putanja) {
  const m = memorija.get(putanja);
  if (m && Date.now() - m.t < 10 * 60 * 1000) return m.v;
  const r = await fetch(`${PODACI}/${putanja}`, { cf: { cacheTtl: 900, cacheEverything: true } });
  const v = r.ok ? await r.json() : null;
  memorija.set(putanja, { t: Date.now(), v });
  return v;
}

async function zemlja(naziv) {
  const fajlovi = (await fajl('fajlovi.json')) ?? {};
  const kljuc = Object.keys(fajlovi).find((z) => z.toLowerCase() === String(naziv).trim().toLowerCase());
  return kljuc ? ((await fajl(`zemlja/${fajlovi[kljuc]}.json`)) ?? []) : [];
}

// pretraga po nazivu, mestu, zemlji i agenciji; bez kvačica i velikih slova, sve reči moraju da se nađu
const bezKvacica = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'dj');
async function pretraga(upit) {
  const reci = bezKvacica(upit).split(/[^a-z0-9]+/).filter((r) => r.length > 1);
  if (!reci.length) return [];
  const sve = (await fajl('indeks.json')) ?? [];
  const nadjeno = [];
  for (const p of sve) {
    const t = bezKvacica(`${p.naziv ?? ''} ${p.title ?? ''} ${p.destination ?? ''} ${p.zemlja ?? ''} ${p.kontinent ?? ''} ${p.agencija ?? ''}`);
    if (reci.every((r) => t.includes(r))) nadjeno.push(p);
    if (nadjeno.length >= 300) break;
  }
  return nadjeno;
}


// ---------- filter preko svih ponuda (indeks.json) ----------
const IZLET = /jednodnevn|bez noćenja|bez nocenja|\bizlet/i;
const evra = (p) => (!p.price ? null : p.currency === 'RSD' ? p.price / 117 : p.price);
async function filtrirajSve(f = {}) {
  const [sve, zemlje] = await Promise.all([fajl('indeks.json'), fajl('zemlje.json')]);
  const kontinentOd = {};
  for (const [k, z] of Object.entries(zemlje ?? {})) for (const ime of Object.keys(z)) kontinentOd[ime] = k;
  const reci = f.tekst ? bezKvacica(f.tekst).split(/[^a-z0-9]+/).filter((r) => r.length > 1) : [];
  const zem = (f.zemlje ?? []).map((z) => bezKvacica(z));
  const kont = f.kontinent ? bezKvacica(f.kontinent) : '';
  const ag = f.agencija ? bezKvacica(f.agencija) : '';
  const datumi = (p) => (p.svi_datumi?.length ? p.svi_datumi : [p.date_from]).filter(Boolean);
  const danas = new Date().toISOString().slice(0, 10);
  // prošli polasci ne trebaju nikome: početak najranije danas
  const od0 = f.mesec ? `${f.mesec}-01` : f.od || '', doo = f.mesec ? `${f.mesec}-31` : f.do || '';
  const od = od0 && od0 < danas ? danas : od0;
  const out = (sve ?? []).filter((p) => {
    if (reci.length) { const t = bezKvacica(`${p.naziv ?? ''} ${p.title ?? ''} ${p.destination ?? ''} ${p.zemlja ?? ''} ${p.agencija ?? ''}`); if (!reci.every((r) => t.includes(r))) return false; }
    if (zem.length && !zem.includes(bezKvacica(p.zemlja))) return false;
    if (kont && bezKvacica(kontinentOd[p.zemlja] ?? '') !== kont) return false;
    if (ag && !bezKvacica(p.agencija).includes(ag)) return false;
    if (f.prevoz && p.transport !== f.prevoz) return false;
    if (od || doo) { const d = datumi(p); if (!d.some((x) => (!od || x >= od) && (!doo || x <= doo))) return false; }
    if (f.datum_po_izboru === true && p.date_from) return false;
    if (f.dnevni_izlet === true && !(p.nights === 0 || (p.nights == null && IZLET.test(`${p.naziv ?? ''} ${p.title ?? ''}`)))) return false;
    if (f.noci_min != null && !(p.nights >= f.noci_min)) return false;
    if (f.noci_max != null && !(p.nights != null && p.nights <= f.noci_max)) return false;
    const e = evra(p);
    if (f.cena_max != null && !(e != null && e <= f.cena_max)) return false;
    if (f.cena_min != null && !(e != null && e >= f.cena_min)) return false;
    if (f.samo_popust === true && !(p.old_price && p.price && p.old_price > p.price)) return false;
    return true;
  });
  const sort = f.sort || (od ? 'datum' : 'cena');
  const prvi = (p) => (od ? datumi(p).find((x) => x >= od) : p.date_from) ?? '9999';
  if (sort === 'cena') out.sort((a, b) => (evra(a) ?? 1e9) - (evra(b) ?? 1e9));
  else if (sort === 'datum') out.sort((a, b) => prvi(a).localeCompare(prvi(b)));
  else if (sort === 'popust') out.sort((a, b) => ((b.old_price ?? b.price) - b.price) / (b.old_price || 1) - ((a.old_price ?? a.price) - a.price) / (a.old_price || 1));
  return out;
}
const kratkoZaModel = (p) => `${p.naziv || p.title} (${p.zemlja}, ${p.agencija}), ${p.date_from || 'datum po izboru'}${p.nights != null ? `, ${p.nights} noći` : ''}${p.transport ? `, ${p.transport}` : ''}, ${p.price ? `${Math.round(p.price)} ${p.currency === 'RSD' ? 'din' : '€'}` : 'na upit'} [id ${p.id}]`;

async function kontinent(naziv) {
  const ime = String(naziv).trim().toLowerCase();
  const zemlje = (await fajl('zemlje.json')) ?? {};
  const kljuc = Object.keys(zemlje).find((k) => k.toLowerCase() === ime);
  if (!kljuc) return [];
  const delovi = await Promise.all(Object.keys(zemlje[kljuc]).map((z) => zemlja(z)));
  return delovi.flat();
}

async function ponuda(id, osoba = 2) {
  let p = await fajl(`ponuda/${id}.json`);
  if (!p && id.length < 16) {
    // kratak id (prvih 12 znakova): potraži u preporukama
    const top = (await fajl('top.json'))?.ponude ?? [];
    const pun = top.find((x) => x.id.startsWith(id))?.id;
    if (pun) p = await fajl(`ponuda/${pun}.json`);
  }
  if (!p) return null;
  const n = String(Math.min(4, Math.max(1, Number(osoba) || 2)));
  const { ukupno_po, ...ostalo } = p;
  return { ...ostalo, ukupno: ukupno_po?.[n] ?? null };
}

// ---------- lične stvari po korisniku (KV) ----------

async function praceno(env, korisnik) {
  if (!korisnik || !env.KV) return [];
  return (await env.KV.get(`k:${korisnik}:prati`, 'json')) ?? [];
}

async function prebaciPracenje(env, korisnik, id) {
  if (!korisnik || !env.KV) return { pratim: false, greska: 'Za praćenje se prijavi (dodaj Putovanja sa ličnom adresom).' };
  const lista = await praceno(env, korisnik);
  const i = lista.findIndex((x) => x.id === id || x.id.startsWith(id));
  if (i >= 0) {
    lista.splice(i, 1);
    await env.KV.put(`k:${korisnik}:prati`, JSON.stringify(lista));
    return { pratim: false };
  }
  const p = await ponuda(id, 1);
  if (!p) return { pratim: false, greska: 'Nema te ponude.' };
  lista.push({ id: p.id, naziv: p.naziv, title: p.title, agencija: p.agencija, zemlja: p.zemlja, url: p.url, currency: p.currency,
    date_from: p.date_from, cena_pocetna: p.price, javljena_cena: p.price, dodato: new Date().toISOString().slice(0, 10) });
  await env.KV.put(`k:${korisnik}:prati`, JSON.stringify(lista));
  return { pratim: true };
}

async function listaPracenja(env, korisnik) {
  const lista = await praceno(env, korisnik);
  return Promise.all(lista.map(async (x) => {
    const sad = await fajl(`ponuda/${x.id}.json`);
    const cena = sad?.price ?? null;
    return { ...x, ...(sad ? { termini: sad.termini, svi_datumi: sad.svi_datumi, transport: sad.transport, nights: sad.nights } : {}),
      kljuc: x.id, cena_sada: cena, price: cena ?? x.cena_pocetna, aktivno: !!sad,
      promena: cena && x.cena_pocetna ? cena - x.cena_pocetna : null };
  }));
}

async function obavestenja(env, korisnik) {
  const l = await listaPracenja(env, korisnik);
  const padovi = l.filter((x) => x.aktivno && x.cena_sada && x.javljena_cena && x.cena_sada < x.javljena_cena);
  const nestali = l.filter((x) => !x.aktivno);
  return { padovi, nestali, nove_po_zeljama: [], ukupno: padovi.length + nestali.length };
}

// ---------- alati ----------

async function podaciZaProzor(env, korisnik, komanda, a = []) {
  switch (komanda) {
    case 'zemlje': return fajl('zemlje.json');
    case 'top': {
      const k = /^[a-z]+$/.test(a[0] ?? '') ? a[0] : 'preporuka';
      return (await fajl(`top/${k}.json`)) ?? fajl('top.json');
    }
    case 'zemlja': return zemlja(a.join(' '));
    case 'kontinent': return kontinent(a.join(' '));
    case 'filter': { let f = {}; try { f = JSON.parse(a[0] || '{}'); } catch {} return filtrirajSve(f); }
    case 'pretraga': return pretraga(a.join(' '));
    case 'ponuda': {
      const osobe = a.includes('--osobe') ? a[a.indexOf('--osobe') + 1] : 2;
      const p = await ponuda(a[0], osobe);
      if (!p) return { greska: 'Nema te ponude (možda je skinuta sa sajta).' };
      const prati = await praceno(env, korisnik);
      return { ...p, pratim: prati.some((x) => x.id === p.id) };
    }
    case 'kalendar': {
      const zem = await fajl('stanje.json');
      const mesec = a[0] || new Date().toISOString().slice(0, 7);
      return (await fajl(`kalendar/${mesec}.json`)) ?? { mesec, meseci: [], dani: {}, praznici: {}, napomena: zem ? '' : 'nema podataka' };
    }
    case 'prati': return a[0] ? prebaciPracenje(env, korisnik, a[0]) : listaPracenja(env, korisnik);
    case 'obavestenja': return obavestenja(env, korisnik);
    case 'izvori': return fajl('izvori.json');
    case 'stanje': return fajl('stanje.json');
    case 'popusti': return {};
    case 'uradisam': return [];
    case 'vidim': {
      if (!korisnik || !env.KV) return { ok: false };
      const v = String(a[0] ?? '').slice(0, 6000);
      await env.KV.put(`k:${korisnik}:vidim`, JSON.stringify({ ts: Date.now(), stanje: JSON.parse(v || '{}') }), { expirationTtl: 172800 });
      return { ok: true };
    }
    case 'naredba': {
      if (!korisnik || !env.KV) return { ts: 0 };
      const n = await env.KV.get(`k:${korisnik}:naredba`, 'json');
      const posle = Number(a[0] || 0);
      return n && n.ts > posle ? n : { ts: n?.ts ?? 0 };
    }
    case 'adresa': return { adresa: korisnik ? `${ADRESA_SAJTA}/mcp/${korisnik}` : null };
    case 'agencije': return { poruka: 'Sken radi automatski svako jutro.' };
    default: return { greska: `komanda ${komanda} nije podržana` };
  }
}

const SKEN = { radi: false, greska: null };

async function pozoviAlat(env, korisnik, ime, a = {}) {
  if (ime === 'otvori_putovanja') {
    const z = String(a.zemlja ?? '').trim();
    const [zemlje, stanje] = await Promise.all([fajl('zemlje.json'), fajl('stanje.json')]);
    const saFilterom = a.filter && typeof a.filter === 'object' && Object.keys(a.filter).length;
    const lista = saFilterom ? await filtrirajSve(a.filter) : z ? await zemlja(z) : ((await fajl('top.json'))?.ponude ?? []);
    return {
      prikaz: a.prikaz || 'pocetna', zemlja: saFilterom ? '' : z, stanje, zemlje, lista, skeniranje: SKEN, verzija: VERZIJA, prijavljen: !!korisnik,
      ...(saFilterom ? { claude: { naslov: String(a.naslov || 'Izbor od Claude-a').slice(0, 80), filter: a.filter } } : {}),
      za_model: `Prozor je otvoren (${z ? 'zemlja ' + z : 'preporučeno'}, ${lista.length} ponuda). Prvih pet: ` +
        lista.slice(0, 5).map((p) => `${p.naziv || p.title} (${p.zemlja}), ${p.date_from || 'datum po izboru'}, ${p.price ?? 'na upit'} ${p.currency ?? ''}, ${p.agencija}`).join('; '),
    };
  }
  if (ime === 'detalji_ponude') return (await ponuda(String(a.id ?? ''), a.osoba)) ?? { greska: 'Nema te ponude.' };
  if (ime === 'skeniraj_agencije') return { skeniranje: SKEN, stanje: await fajl('stanje.json'), poruka: 'Sken radi automatski svako jutro.' };
  if (ime === 'pretrazi_ponude') {
    const f = a.filter && typeof a.filter === 'object' ? a.filter : {};
    const l = await filtrirajSve(f);
    const naslov = String(a.naslov || 'Izbor od Claude-a').slice(0, 80);
    let uProzoru = 'nije traženo';
    if (a.prikazi !== false && korisnik && env.KV) {
      const v = await env.KV.get(`k:${korisnik}:vidim`, 'json');
      if (v && Date.now() - v.ts < 120000) {
        await env.KV.put(`k:${korisnik}:naredba`, JSON.stringify({ ts: Date.now(), lista: { naslov, filter: f } }), { expirationTtl: 3600 });
        uProzoru = 'poslato u otvoren prozor (vidi se za 2–3 s)';
      } else uProzoru = 'prozor nije otvoren: pozovi otvori_putovanja sa istim filter i naslov';
    }
    return { ukupno: l.length, naslov, u_prozoru: uProzoru, filter: f,
      prvih: l.slice(0, 30).map(kratkoZaModel), ...(l.length > 30 ? { napomena: `Prikazano 30 od ${l.length}; ostalo je u prozoru.` } : {}) };
  }
  if (ime === 'sta_vidim') {
    if (!korisnik || !env.KV) return { aktivan: false, poruka: 'Konektor je dodat bez lične adrese, pa ne vidim prozor. Pitaj korisnika šta gleda.' };
    const v = await env.KV.get(`k:${korisnik}:vidim`, 'json');
    if (!v) return { aktivan: false, poruka: 'Prozor Putovanja još nije otvoren. Otvori ga sa otvori_putovanja.' };
    const pre = Math.round((Date.now() - v.ts) / 1000);
    return { aktivan: pre < 120, pre_sekundi: pre, ...v.stanje, ...(pre >= 120 ? { poruka: 'Ovo je poslednje stanje; prozor se ne javlja više od 2 minuta (možda je zatvoren).' } : {}) };
  }
  if (ime === 'pokazi_u_putovanjima') {
    if (!korisnik || !env.KV) return { poslato: false, poruka: 'Bez lične adrese ne mogu da upravljam prozorom. Pozovi otvori_putovanja.' };
    const dozvoljeno = ['zemlja', 'kontinent', 'pretraga', 'ponuda_id', 'odeljak', 'mesec', 'sort', 'prevoz', 'putnici'];
    const n = { ts: Date.now() };
    for (const k of dozvoljeno) if (a[k] !== undefined && a[k] !== null) n[k] = String(a[k]).slice(0, 120);
    await env.KV.put(`k:${korisnik}:naredba`, JSON.stringify(n), { expirationTtl: 3600 });
    const v = await env.KV.get(`k:${korisnik}:vidim`, 'json');
    const aktivan = v && Date.now() - v.ts < 120000;
    return { poslato: true, prozor_aktivan: !!aktivan, naredba: n,
      poruka: aktivan ? 'Poslato u otvoren prozor; promena se vidi za 2–3 sekunde. Posle možeš da pozoveš sta_vidim da proveriš.' : 'Prozor se ne javlja (možda nije otvoren): bolje pozovi otvori_putovanja.' };
  }
  if (ime === 'putovanja_podaci') return { komanda: a.komanda, rezultat: await podaciZaProzor(env, korisnik, a.komanda, a.argumenti ?? []), skeniranje: SKEN };
  throw Object.assign(new Error(`Nepoznat alat: ${ime}`), { code: -32602 });
}

// ---------- MCP (JSON-RPC) ----------

async function obradi(env, korisnik, poruka) {
  const { id, method, params = {} } = poruka;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: params.protocolVersion || '2025-06-18',
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, extensions: { 'io.modelcontextprotocol/ui': {} } },
        serverInfo: { name: 'putovanja', title: 'Putovanja', version: VERZIJA, websiteUrl: ADRESA_SAJTA,
          icons: [{ src: `${ADRESA_SAJTA}/ikona.png`, mimeType: 'image/png', sizes: ['512x512'] }] },
        instructions: UPUTSTVO,
      });
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: ALATI });
    case 'tools/call': {
      const rez = await pozoviAlat(env, korisnik, params.name, params.arguments ?? {});
      return ok({ content: [{ type: 'text', text: JSON.stringify(rez) }], structuredContent: rez });
    }
    case 'resources/list':
      return ok({ resources: [{ uri: PROZOR, name: 'Putovanja', description: 'Prozor aplikacije Putovanja', mimeType: MIME_PROZORA }] });
    case 'resources/templates/list': return ok({ resourceTemplates: [] });
    case 'prompts/list': return ok({ prompts: [] });
    case 'resources/read':
      // i stare adrese prozora (prozor-0.6.1.html…): Claude pamti spisak alata sa starom adresom, pa posle svake
      // nove verzije ne sme da dobije grešku; uvek dobija najnoviji prozor
      if (!/^ui:\/\/putovanja\/prozor(-[\w.]+)?\.html$/.test(String(params.uri ?? '')))
        return { jsonrpc: '2.0', id, error: { code: -32002, message: 'Nema tog resursa' } };
      return ok({ contents: [{ uri: params.uri, mimeType: MIME_PROZORA, text: PROZOR_HTML, _meta: { ui: { prefersBorder: false } } }] });
    default:
      if (id === undefined) return null; // obaveštenje, bez odgovora
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Metoda ${method} nije podržana` } };
  }
}

function korisnikIz(url) {
  // /mcp/<lični ključ>: privremeno, dok ne stigne Google prijava
  const m = url.pathname.match(/^\/mcp\/([A-Za-z0-9_-]{8,64})\/?$/);
  return m ? m[1] : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if ((url.pathname === '/ikona.png' || url.pathname === '/favicon.ico') && request.method === 'GET')
      return new Response(IKONA, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
    if (url.pathname === '/' && request.method === 'GET') {
      const st = await fajl('stanje.json');
      const kad = st?.poslednji_sken ? st.poslednji_sken.slice(8, 10) + '.' + st.poslednji_sken.slice(5, 7) + '. u ' + st.poslednji_sken.slice(11, 16) : '?';
      const html = POCETNA_HTML.replace('__VERZIJA__', VERZIJA).replace('__PONUDA__', String(st?.ponuda ?? '?')).replace('__SKEN__', kad);
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
    }
    if (url.pathname === '/stanje' && request.method === 'GET') {
      const st = await fajl('stanje.json');
      return new Response(`Putovanja ${VERZIJA}\nPonuda: ${st?.ponuda ?? '?'}, poslednji sken: ${st?.poslednji_sken ?? '?'}\nAdresa za Claude: ${url.origin}/mcp\n`,
        { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    if (!url.pathname.startsWith('/mcp')) return new Response('Nema', { status: 404 });
    if (request.method === 'GET') return new Response(null, { status: 405, headers: { allow: 'POST' } });
    if (request.method === 'DELETE') return new Response(null, { status: 204 });
    if (request.method !== 'POST') return new Response(null, { status: 405 });

    const korisnik = korisnikIz(url);
    let telo;
    try { telo = await request.json(); } catch { return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Neispravan JSON' } }, { status: 400 }); }
    const poruke = Array.isArray(telo) ? telo : [telo];
    const odgovori = [];
    for (const p of poruke) {
      try {
        const o = await obradi(env, korisnik, p);
        if (o) odgovori.push(o);
      } catch (e) {
        odgovori.push({ jsonrpc: '2.0', id: p.id ?? null, error: { code: e.code ?? -32603, message: String(e.message ?? e) } });
      }
    }
    if (!odgovori.length) return new Response(null, { status: 202 });
    return Response.json(Array.isArray(telo) ? odgovori : odgovori[0], { headers: { 'cache-control': 'no-store' } });
  },
};
