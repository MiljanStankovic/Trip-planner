// Putovanja: MCP server za Claude (web, desktop, telefon), na Cloudflare Workers.
//
// Podatke ne računa sam: svako jutro ih GitHub Actions skenira i objavi kao male JSON fajlove na
// granu `podaci` (server/izvezi.py). Ovde se samo čitaju, filtriraju i šalju prozoru.
// Lične stvari (šta ko prati) su u KV, po korisniku.
//
// Protokol: MCP preko HTTP-a (JSON-RPC u POST telu, odgovor kao JSON), bez stanja između poziva.

import PROZOR_HTML from './prozor.html';

const VERZIJA = '0.4.1';
const PROZOR = `ui://putovanja/prozor-${VERZIJA}.html`;
const MIME_PROZORA = 'text/html;profile=mcp-app';
const PODACI = 'https://raw.githubusercontent.com/MiljanStankovic/Trip-planner/podaci';

const UPUTSTVO =
  'Putovanja prikazuje ponude domaćih turističkih agencija (Srbija), cene po osobi, u prozoru u razgovoru. ' +
  'Kad korisnik pita za putovanja, aranžmane, gde da otputuje, ponude za neku zemlju ili šta prati, pozovi ' +
  'otvori_putovanja (sa zemljom ako je navedena). Prozor je cela aplikacija: korisnik u njemu sam bira zemlje, ' +
  'otvara ponude i prati cene. Za pitanja o jednoj ponudi koristi detalji_ponude umesto pretrage weba. ' +
  'Ponude se osvežavaju svako jutro. Odgovaraj kratko, srpskom latinicom.';

const ALATI = [
  {
    name: 'otvori_putovanja',
    title: 'Otvori Putovanja',
    description: 'Otvara Putovanja u prozoru: ponude domaćih agencija, preporučene ili za jednu zemlju (npr. "Grčka"). ' +
      'prikaz: pocetna | kalendar | praceno | uradisam. Prozor je cela aplikacija, korisnik dalje bira sam.',
    inputSchema: { type: 'object', properties: { zemlja: { type: 'string', default: '' }, prikaz: { type: 'string', default: 'pocetna' } } },
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
    case 'top': return fajl('top.json');
    case 'zemlja': return zemlja(a.join(' '));
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
    default: return { greska: `komanda ${komanda} nije podržana` };
  }
}

const SKEN = { radi: false, greska: null };

async function pozoviAlat(env, korisnik, ime, a = {}) {
  if (ime === 'otvori_putovanja') {
    const z = String(a.zemlja ?? '').trim();
    const [zemlje, stanje] = await Promise.all([fajl('zemlje.json'), fajl('stanje.json')]);
    const lista = z ? await zemlja(z) : ((await fajl('top.json'))?.ponude ?? []);
    return {
      prikaz: a.prikaz || 'pocetna', zemlja: z, stanje, zemlje, lista, skeniranje: SKEN, verzija: VERZIJA, prijavljen: !!korisnik,
      za_model: `Prozor je otvoren (${z ? 'zemlja ' + z : 'preporučeno'}, ${lista.length} ponuda). Prvih pet: ` +
        lista.slice(0, 5).map((p) => `${p.naziv || p.title} (${p.zemlja}), ${p.date_from || 'datum po izboru'}, ${p.price ?? 'na upit'} ${p.currency ?? ''}, ${p.agencija}`).join('; '),
    };
  }
  if (ime === 'detalji_ponude') return (await ponuda(String(a.id ?? ''), a.osoba)) ?? { greska: 'Nema te ponude.' };
  if (ime === 'skeniraj_agencije') return { skeniranje: SKEN, stanje: await fajl('stanje.json'), poruka: 'Sken radi automatski svako jutro.' };
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
        serverInfo: { name: 'putovanja', title: 'Putovanja', version: VERZIJA },
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
      if (params.uri !== PROZOR) return { jsonrpc: '2.0', id, error: { code: -32002, message: 'Nema tog resursa' } };
      return ok({ contents: [{ uri: PROZOR, mimeType: MIME_PROZORA, text: PROZOR_HTML, _meta: { ui: { prefersBorder: false } } }] });
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
    if (url.pathname === '/' && request.method === 'GET') {
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
