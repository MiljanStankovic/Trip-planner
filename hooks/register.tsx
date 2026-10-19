import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Detalji, Diy, Izvori, Kalendar, Kombinacija, Konektor, Nav, Obavestenja, Ponuda, Pracena, Stanje, Termin, ZemljeMapa } from '../types'

const PANE = 'putovanja'
const VERZIJA_ALATA = '0.5.0' // isto kao version u pyproject.toml; kad se razlikuje, pano osveži alat
const KONEKTORI_STRANA = 'https://claude.ai/settings/connectors'

const nav = atom({ plugin: 'putovanja', key: 'nav' } as const, {
  view: 'pocetna', kontinent: '', zemlja: '', ponudaId: '', kriterijum: 'preporuka', strana: 0, sort: 'preporuka',
  mesec: '', kalStrana: 0,
  diy: { odakle: 'Beograd', kuda: '', od: '', do: '', osoba: '2' },
  putnici: '', izvoriOtvoreni: false,
} as Nav)
const zemlje = atom({ plugin: 'putovanja', key: 'zemlje' } as const, {} as ZemljeMapa)
const top = atom({ plugin: 'putovanja', key: 'top' } as const, [] as Ponuda[])
const lista = atom({ plugin: 'putovanja', key: 'lista' } as const, [] as Ponuda[])
const ponuda = atom({ plugin: 'putovanja', key: 'ponuda' } as const, null as Ponuda | null)
const detalji = atom({ plugin: 'putovanja', key: 'detalji' } as const, null as Detalji | null)
const status = atom({ plugin: 'putovanja', key: 'status' } as const, '')
const kal = atom({ plugin: 'putovanja', key: 'kal' } as const, null as Kalendar | null)
const prac = atom({ plugin: 'putovanja', key: 'prac' } as const, [] as Pracena[])
const obav = atom({ plugin: 'putovanja', key: 'obav' } as const, null as Obavestenja | null)
const stanje = atom({ plugin: 'putovanja', key: 'stanje' } as const, null as Stanje | null)
const diyLista = atom({ plugin: 'putovanja', key: 'diyLista' } as const, [] as Kombinacija[])
const diyAgencije = atom({ plugin: 'putovanja', key: 'diyAgencije' } as const, [] as Ponuda[])
const izvori = atom({ plugin: 'putovanja', key: 'izvori' } as const, null as Izvori | null)
const konektori = atom({ plugin: 'putovanja', key: 'konektori' } as const, [] as Konektor[])
const jeftino = atom({ plugin: 'putovanja', key: 'jeftino' } as const, [] as Ponuda[])
const popustiMapa = atom({ plugin: 'putovanja', key: 'popustiMapa' } as const, {} as { [id: string]: string[] })
const trelloUkljucen = atom({ plugin: 'putovanja', key: 'trello' } as const, false)
const alatPutanja = atom({ plugin: 'putovanja', key: 'alat' } as const, '')

const PUTNICI: [string, string][] = [
  ['1+0', '1 odrasla osoba'], ['2+0', '2 odrasla'], ['3+0', '3 odrasla'], ['4+0', '4 odrasla'],
  ['2+1', '2 odrasla + 1 dete'], ['2+2', '2 odrasla + 2 dece'], ['1+1', '1 odrasla + 1 dete'],
]
const KONEKTORI: [string, string, string][] = [
  ['Expedia', 'letovi i hoteli', 'expedia'],
  ['SlickTrip', 'praćenje cena letova', 'slicktrip'],
  ['eDreams', 'letovi', 'edreams'],
  ['Civitatis', 'izleti i ture', 'civitatis'],
]
const PREVOZ: Record<string, string> = { avion: 'avion', autobus: 'autobus', sopstveni: 'sopstveni', brod: 'brod' }

// ---------- boje: terminal dobija paletu iz dizajna, aplikacija prati svoju temu ----------

type Paleta = { amb: string; sky: string; mint: string; cor: string; dim: string; fg2: string; bor: string; pane?: string; sel?: string; strip?: string; ink: string }
const TERMINAL: Paleta = { amb: '#F3B94D', sky: '#7FB8E6', mint: '#86D19A', cor: '#F08A7E', dim: '#93A0B4', fg2: '#C3CCD9', bor: '#33415A', pane: '#172030', sel: '#22304A', strip: '#1B2638', ink: '#172030' }
const TEMA: Paleta = { amb: 'warning', sky: 'suggestion', mint: 'success', cor: 'error', dim: 'subtle', fg2: 'text', bor: 'subtle', ink: 'inverseText' }

// ---------- pomoćne ----------

function datum(d: string | null): string {
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return `${dd}.${m}.${y}.`
}

function cena(p: Ponuda): string {
  if (!p.price) return 'na sajtu'
  const v = Math.round(p.price).toLocaleString('de-DE')
  return p.currency === 'RSD' ? `${v} din` : `${v} €`
}

function popust(p: Ponuda): number {
  return p.old_price && p.price && p.old_price > p.price ? Math.round((100 * (p.old_price - p.price)) / p.old_price) : 0
}

function eur(p: Ponuda): number {
  if (!p.price) return 1e9
  return p.currency === 'RSD' ? p.price / 117 : p.price
}

function ime(p: Ponuda): string {
  if (p.naziv) return p.naziv
  return !p.destination || p.destination === p.zemlja ? p.title || p.destination : p.destination
}

function uEvrima(p: Ponuda): string {
  return p.price && p.currency === 'RSD' ? `≈${Math.round(p.price / 117)} €` : ''
}

function putnici(s: string): { odrasli: number; deca: number; ukupno: number; tekst: string } {
  const [a, d] = (s || '2+0').split('+').map(x => Math.max(0, Number(x) || 0))
  const odrasli = Math.max(1, a ?? 2), deca = d ?? 0
  const tekst = PUTNICI.find(([v]) => v === `${odrasli}+${deca}`)?.[1] ?? `${odrasli} odr. + ${deca} dece`
  return { odrasli, deca, ukupno: odrasli + deca, tekst }
}

const len = (s: string) => [...s].length
function padR(s: string, n: number): string {
  const t = len(s) > n ? [...s].slice(0, Math.max(0, n - 1)).join('') + '…' : s
  return t + ' '.repeat(Math.max(0, n - len(t)))
}
function padL(s: string, n: number): string {
  const t = len(s) > n ? [...s].slice(0, Math.max(0, n - 1)).join('') + '…' : s
  return ' '.repeat(Math.max(0, n - len(t))) + t
}
const kratko = (s: string, k: number) => (len(s) > k ? [...s].slice(0, Math.max(1, k - 1)).join('') + '…' : s)

// ---------- uradi sam: datumi i linkovi ----------

const MES_IME = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec']

/** "5.12." / "05.12.2026" / "2026-12-05" → "2026-12-05"; bez godine: najbliži budući. */
function isoDatum(s: string, danas = new Date()): string {
  const t = (s || '').trim()
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`
  m = t.match(/^(\d{1,2})\.\s*(\d{1,2})\.?\s*(\d{4})?\.?$/)
  if (!m) return ''
  const d = Number(m[1]), mo = Number(m[2])
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return ''
  let y = m[3] ? Number(m[3]) : danas.getFullYear()
  const iso = (yy: number) => `${yy}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  if (!m[3] && iso(y) < danas.toISOString().slice(0, 10)) y += 1
  return iso(y)
}

function diyIso(d: Diy): { od: string; do: string; osoba: number; ok: boolean } {
  const od = isoDatum(d.od), dd = isoDatum(d.do)
  const osoba = Math.max(1, Number(d.osoba) || 2)
  return { od, do: dd, osoba, ok: !!(d.kuda.trim() && od && dd && dd > od) }
}

function diyLinkovi(d: Diy): { prevoz: [string, string][]; smestaj: [string, string][] } {
  const x = diyIso(d)
  const e = encodeURIComponent
  const od = d.odakle.trim() || 'Beograd', ku = d.kuda.trim()
  return {
    prevoz: [
      ['Avion · Google Flights', `https://www.google.com/travel/flights?q=${e(`Flights from ${od} to ${ku} on ${x.od} through ${x.do}`)}&hl=sr`],
      ['Svi prevozi · Rome2rio', `https://www.rome2rio.com/map/${e(od)}/${e(ku)}`],
      ['Autobus', `https://www.google.com/search?q=${e(`autobus ${od} ${ku} karte red vožnje`)}`],
      ['Voz', `https://www.google.com/search?q=${e(`voz ${od} ${ku} red vožnje cena karte`)}`],
      ['Autom · Google Maps', `https://www.google.com/maps/dir/?api=1&origin=${e(od)}&destination=${e(ku)}&travelmode=driving`],
    ],
    smestaj: [
      [`Booking · ${x.osoba} os.`, `https://www.booking.com/searchresults.html?ss=${e(ku)}&checkin=${x.od}&checkout=${x.do}&group_adults=${x.osoba}&no_rooms=1&group_children=0&lang=sr`],
      ['Trivago', `https://www.trivago.rs/sr/srl?search=${e(ku)}`],
      ['Airbnb', `https://www.airbnb.com/s/${e(ku)}/homes?checkin=${x.od}&checkout=${x.do}&adults=${x.osoba}`],
      ['Google hoteli', `https://www.google.com/travel/search?q=${e(`hoteli ${ku}`)}`],
    ],
  }
}

function termini(p: Ponuda): Termin[] {
  if (p.termini?.length) return p.termini
  const d = p.svi_datumi.length ? p.svi_datumi : [p.date_from]
  return d.map(datum => ({ id: p.id, datum, noci: p.nights, cena: p.price, stara: p.old_price, valuta: p.currency }))
}

function iznos(v: number | null, valuta: string): string {
  if (!v) return 'na sajtu'
  return `${Math.round(v).toLocaleString('de-DE')} ${valuta === 'RSD' ? 'din' : '€'}`
}

function opseg(ts: Termin[]): string {
  const c = ts.map(t => t.cena).filter((x): x is number => !!x)
  if (!c.length) return 'na upit'
  const v = ts.find(t => t.cena)?.valuta ?? 'EUR'
  const lo = Math.min(...c), hi = Math.max(...c)
  if (lo === hi) return iznos(lo, v)
  return `${Math.round(lo).toLocaleString('de-DE')}–${iznos(hi, v)}`
}

function cenaVarira(ts: Termin[]): boolean {
  return new Set(ts.map(t => t.cena).filter(Boolean)).size > 1
}

function kratakDatum(d: string | null): string {
  if (!d) return '—'
  const [, m, dd] = d.split('-')
  return `${dd}.${m}.`
}

function polazak(p: Ponuda, t: Termin): Ponuda {
  return { ...p, id: t.id, date_from: t.datum, date_to: t.id === p.id ? p.date_to : null, nights: t.noci ?? p.nights,
    price: t.cena, old_price: t.stara, currency: t.valuta }
}

function varijaDatuma(ts: Termin[], sirina: number): number {
  return Math.max(2, Math.floor((sirina - 3) / (cenaVarira(ts) ? 16 : 7)))
}

type Tura = { glavna: Ponuda; svi: Ponuda[] }

function baseUrl(u: string): string {
  return (u.split('?')[0] ?? u).replace(/\/$/, '')
}

function grupisi(list: Ponuda[], sort: Nav['sort']): Tura[] {
  const map = new Map<string, Ponuda[]>()
  for (const p of list) {
    const k = `${p.agencija}|${baseUrl(p.url)}|${p.title.toLowerCase()}`
    map.set(k, [...(map.get(k) ?? []), p])
  }
  const ture: Tura[] = []
  for (const svi of map.values()) {
    const po = [...svi].sort((a, b) => (a.date_from ?? '9999').localeCompare(b.date_from ?? '9999'))
    if (po[0]) ture.push({ glavna: po[0], svi: po })
  }
  if (sort === 'preporuka') return ture
  const kljuc = (t: Tura): number | string =>
    sort === 'cena' ? Math.min(...t.svi.map(eur)) : sort === 'popust' ? -Math.max(...t.svi.map(popust)) : t.glavna.date_from ?? '9999'
  return ture.sort((a, b) => {
    const x = kljuc(a), y = kljuc(b)
    return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
  })
}

// ---------- alat putovanja: pronađi ga ili ga pripremi preko uv-a ----------

let OPCIJE: Record<string, unknown> = {}
let ALAT = ''
let PRIPREMA: Promise<string> | null = null
const ENV = { PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }

async function probaj($: any, argv: string[], timeoutMs = 20000): Promise<{ ok: boolean; out: string }> {
  try {
    const r = await $.process.run(argv, { timeoutMs, env: ENV })
    return { ok: r.exitCode === 0, out: (r.exitCode === 0 ? r.stdout : r.stderr || r.stdout).trim() }
  } catch (err) {
    return { ok: false, out: String(err) }
  }
}

async function nadjiUv($: any): Promise<string> {
  if ((await probaj($, ['uv', '--version'])).ok) return 'uv'
  const domovi = [$.env.get('USERPROFILE'), $.env.get('HOME')].filter(Boolean) as string[]
  for (const dom of domovi) {
    for (const p of [`${dom}\\.local\\bin\\uv.exe`, `${dom}/.local/bin/uv`, `${dom}/.cargo/bin/uv`]) {
      if ((await probaj($, [p, '--version'])).ok) return p
    }
  }
  return ''
}

async function pripremiAlat($: any): Promise<string> {
  const zadato = ((await $.store.get('ptPath')) as string | undefined) || (OPCIJE.ptPath as string | undefined)
  if (zadato) return zadato
  const uv = await nadjiUv($)
  if (uv) {
    const dir = await probaj($, [uv, 'tool', 'dir', '--bin'])
    const win = dir.out.includes('\\')
    const bin = dir.ok ? `${dir.out}${win ? '\\' : '/'}putovanja${win ? '.exe' : ''}` : ''
    let v = bin ? await probaj($, [bin, '--version']) : { ok: false, out: '' }
    if (!v.ok || v.out !== VERZIJA_ALATA) {
      await update($, status, () => 'Pripremam alat putovanja (prvi put traje minut-dva)…')
      await probaj($, [uv, 'tool', 'install', '--force', '--python', '3.12', $.plugin.root], 600000)
      v = bin ? await probaj($, [bin, '--version']) : { ok: false, out: '' }
      await update($, status, () => '')
    }
    if (v.ok) return bin
  }
  for (const b of ['putovanja', 'pt']) if ((await probaj($, [b, '--version'])).ok) return b
  return ''
}

async function alat($: any): Promise<string> {
  if (ALAT) return ALAT
  PRIPREMA ??= pripremiAlat($)
  ALAT = await PRIPREMA
  PRIPREMA = null
  if (ALAT) await update($, alatPutanja, () => ALAT)
  return ALAT
}

async function pt($: any, args: string[], timeoutMs = 60000): Promise<any> {
  const bin = await alat($)
  if (!bin) {
    await update($, status, () => 'Alat putovanja nije instaliran. Pokreni instalaciju iz README-a (jedna komanda), pa otvori /putovanja ponovo.')
    return null
  }
  try {
    const r = await $.process.run([bin, '--json', ...args], { timeoutMs, env: ENV })
    if (r.exitCode !== 0) {
      await update($, status, () => `Greška alata: ${(r.stderr || r.stdout).slice(0, 160)}`)
      return null
    }
    return JSON.parse(r.stdout)
  } catch (err) {
    await update($, status, () => `Ne mogu da pokrenem alat (${bin}). Pokreni instalaciju ponovo.`)
    return null
  }
}

// ---------- učitavanje ----------

async function ucitajStanje($: any) {
  const s = (await pt($, ['stanje'])) as Stanje | null
  if (!s) return
  await update($, stanje, () => s)
  const n = await read($, nav)
  if (!n.putnici) await update($, nav, x => ({ ...x, putnici: `${s.odraslih ?? s.putnika ?? 2}+${s.dece ?? 0}` }))
}

async function ucitajIzvore($: any) {
  const i = await pt($, ['izvori'])
  if (i) await update($, izvori, () => i as Izvori)
}

async function ucitajKonektore($: any) {
  let imena: string[] = []
  try { imena = ((await $.tool.list()) as { name: string }[]).map(t => t.name.toLowerCase()) } catch { /* nema liste */ }
  let trello = false
  try {
    trello = ((await $.command.list()) as { name: string; plugin?: string }[])
      .some(c => c.name.startsWith('putovanja-trello:') || c.plugin === 'putovanja-trello')
  } catch { /* nema liste */ }
  const ima = (k: string) => imena.some(n => n.startsWith('mcp__') && n.includes(k))
  const l: Konektor[] = KONEKTORI.map(([ime, sta, k]) => ({ ime, sta, povezan: ima(k) }))
  if (trello) l.push({ ime: 'Trello', sta: 'tvoja tabla', povezan: ima('trello') })
  await update($, konektori, () => l)
  await update($, trelloUkljucen, () => trello)
}

async function otvoriDiy($: any, patch?: Partial<Diy>) {
  const n = await read($, nav)
  const d = { ...n.diy, ...(patch ?? {}) }
  await idiNa($, { view: 'diy', diy: d })
  await ucitajDiy($, d)
}

async function ucitajDiy($: any, d: Diy) {
  if (!d.kuda.trim()) {
    const l = await pt($, ['uradisam', 'lista'])
    if (l) await update($, diyLista, () => l as Kombinacija[])
    await update($, diyAgencije, () => [])
    return
  }
  const [l, a] = [await pt($, ['uradisam', 'lista', d.kuda.trim()]), await pt($, ['zemlja', d.kuda.trim()])]
  if (l) await update($, diyLista, () => l as Kombinacija[])
  if (a) await update($, diyAgencije, () => a as Ponuda[])
}

async function postaviDiy($: any, polje: keyof Diy, vrednost: string, ucitaj = false) {
  await update($, nav, n => ({ ...n, diy: { ...n.diy, [polje]: vrednost } }))
  if (ucitaj) await ucitajDiy($, (await read($, nav)).diy)
}

async function ucitajTop($: any, kriterijum: string) {
  const t = await pt($, ['top', kriterijum, '--limit', '40'])
  if (t) await update($, top, () => t.ponude as Ponuda[])
}

async function ucitajPocetnu($: any) {
  void ucitajStanje($)
  void ucitajIzvore($)
  void ucitajKonektore($)
  await update($, status, () => 'Učitavam ponude…')
  const z = await pt($, ['zemlje'])
  if (z) await update($, zemlje, () => z)
  const n = await read($, nav)
  await ucitajTop($, 'preporuka')
  const j = await pt($, ['top', 'jeftino', '--limit', '6'])
  if (j) await update($, jeftino, () => j.ponude as Ponuda[])
  if (z) await update($, status, () => '')
  const o = (await pt($, ['obavestenja'])) as Obavestenja | null
  if (o) {
    const bilo = (await read($, obav))?.ukupno ?? 0
    await update($, obav, () => o)
    if (o.ukupno && o.ukupno !== bilo) {
      const delovi = [
        o.padovi.length ? `${o.padovi.length} pojeftinilo` : '',
        o.nestali.length ? `${o.nestali.length} nestalo` : '',
        o.nove_po_zeljama.length ? `${o.nove_po_zeljama.length} novo po željama` : '',
      ].filter(Boolean)
      void $.ui.toast(`Putovanja: ${delovi.join(', ')}. Otvori Praćeno.`)
    }
  }
}

async function skeniraj($: any) {
  await update($, status, () => 'Skeniram agencije (1–2 min)…')
  const r = await pt($, ['agencije', 'skeniraj'], 600000)
  await update($, status, () => (r ? '' : 'Sken nije uspeo.'))
  await ucitajPocetnu($)
}

async function otvoriKalendar($: any, mesec?: string) {
  const m = mesec || (await read($, nav)).mesec || new Date().toISOString().slice(0, 7)
  await idiNa($, { view: 'kalendar', mesec: m, kalStrana: 0 })
  await update($, status, () => `Učitavam polaske za ${m}…`)
  const k = await pt($, ['kalendar', m])
  if (k) {
    await update($, kal, () => k as Kalendar)
    await update($, status, () => '')
  }
}

async function otvoriPracenje($: any) {
  await idiNa($, { view: 'pracenje' })
  await update($, status, () => 'Učitavam praćeno…')
  const [o, l] = [await pt($, ['obavestenja']), await pt($, ['prati'])]
  if (o) await update($, obav, () => o as Obavestenja)
  if (l) await update($, prac, () => l as Pracena[])
  await update($, status, () => '')
  void pt($, ['obavestenja', '--procitano'])
}

async function prebaciPracenje($: any, p: Ponuda) {
  const r = await pt($, ['prati', p.id.slice(0, 12)])
  if (!r) return
  await update($, ponuda, x => (x && x.id === p.id ? { ...x, pratim: !!r.pratim } : x))
  void $.ui.toast(r.pratim ? `Pratim cenu: ${ime(p)}` : `Više ne pratim: ${ime(p)}`)
  const l = await pt($, ['prati'])
  if (l) await update($, prac, () => l as Pracena[])
}

async function idiNa($: any, patch: Partial<Nav>) {
  await update($, nav, n => ({ ...n, ...patch }))
}

async function otvoriKontinent($: any, kontinent: string) {
  await idiNa($, { view: 'kontinent', kontinent, strana: 0 })
}

async function otvoriZemlju($: any, zemlja: string) {
  const z = await read($, zemlje)
  const kontinent = Object.entries(z).find(([, c]) => zemlja in c)?.[0]
  await idiNa($, { view: 'zemlja', zemlja, strana: 0, ...(kontinent ? { kontinent } : {}) })
  await update($, lista, () => [])
  await update($, status, () => `Učitavam ponude za ${zemlja}…`)
  const l = (await pt($, ['zemlja', zemlja])) as Ponuda[] | null
  if (!l) return
  await update($, lista, () => l)
  await update($, status, () => (l.length ? '' : `Nema ponuda za „${zemlja}“. Pitaj Claude-a da proveri i druge izvore.`))
  // popusti za više osoba: čitaju se sa stranica ponuda u pozadini
  const ture = grupisi(l, 'cena').filter(t => !t.glavna.popusti_provereni).slice(0, 30)
  if (ture.length) {
    void (async () => {
      const m = await pt($, ['popusti', ...ture.map(t => t.glavna.id.slice(0, 12))], 120000)
      if (m) await update($, popustiMapa, x => ({ ...x, ...(m as { [id: string]: string[] }) }))
    })()
  }
}

async function otvoriPonudu($: any, p: Ponuda) {
  await update($, ponuda, () => p)
  await update($, detalji, () => null)
  await idiNa($, { view: 'ponuda', ponudaId: p.id })
  await update($, status, () => `Čitam detalje sa sajta ${p.agencija}…`)
  const osobe = String(putnici((await read($, nav)).putnici).ukupno)
  const brzo = await pt($, ['ponuda', p.id.slice(0, 12), '--osobe', osobe])
  if (brzo && (await read($, nav)).ponudaId === p.id) {
    await update($, ponuda, x => (x && x.id === p.id ? { ...x, termini: brzo.termini ?? x.termini, pratim: !!brzo.pratim,
      naziv: brzo.naziv ?? x.naziv, ukupno: brzo.ukupno ?? null, popusti: brzo.popusti ?? x.popusti } : x))
  }
  const d = await pt($, ['ponuda', p.id.slice(0, 12), '--detalji', '--osobe', osobe], 90000)
  const cur = await read($, nav)
  if (d && cur.ponudaId === p.id) {
    await update($, detalji, () => (d.sa_sajta ?? null) as Detalji | null)
    await update($, ponuda, x => (x && x.id === p.id ? { ...x, ukupno: d.ukupno ?? x.ukupno ?? null, popusti: d.popusti ?? x.popusti } : x))
    await update($, status, () => '')
  }
}

function pitaj($: any, text: string) {
  void $.prompt.submit({ text })
}

// ---------- registracija ----------

let VISINA = 0 // poslednja poznata visina terminala (redovi), za pano od 3/5 ekrana
let VISINA_POSTAVLJENA = false

export const register: Register = (on, options) => {
  OPCIJE = { ...(options ?? {}) }
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'putovanja',
      description: 'Otvori Putovanja: ponude agencija po zemljama, kalendar, praćenje cena i Uradi sam (prevoz + smeštaj).',
      argumentHint: '[zemlja | pt <putanja>]',
    })
    return next(e)
  })

  on('command.run', { command: 'putovanja' }, async ($, e) => {
    const args = (e.args ?? '').trim()
    if (args.startsWith('pt ')) {
      await $.store.set('ptPath', args.slice(3).trim())
      ALAT = ''
      return { text: `Putanja do alata sačuvana: ${args.slice(3).trim()}` }
    }
    const pr = (e as any).presentation as { isFullscreen?: boolean; columns?: number } | undefined
    const otvoren = await $.ui.open({
      id: PANE, title: 'Putovanja', focus: true,
      rows: Math.max(18, Math.round((VISINA || 40) * 0.6)),
      columns: Math.max(70, Math.round((pr?.columns ?? 160) * 0.7)),
    } as any)
    const uPanou = !!otvoren?.isPlaced
    if (args) void (async () => { await ucitajPocetnu($); await otvoriZemlju($, args) })()
    else {
      await idiNa($, { view: 'pocetna' })
      void ucitajPocetnu($)
    }
    const trello = await read($, trelloUkljucen)
    return {
      text: uPanou ? (args ? `Otvoren pano Putovanja: ${args}.` : 'Otvoren pano Putovanja.') : 'Putovanja',
      context: [
        'Korisnik je otvorio pano Putovanja (ponude domaćih turističkih agencija po kontinentima i zemljama, cene po osobi).',
        'Iz panoa stižu poruke kao "Uporedi ponudu <ID>" i "Uradi sam…". Radi ih po skillu putovanja-planer i uradi-sam;',
        'podaci iz `pt --json ponuda <ID> --detalji`, `pt --json zemlja <naziv>`, `pt --json top <kriterijum>`, `pt --json izvori`.',
        trello ? 'Dodatak putovanja-trello je uključen: "Stavi ponudu <ID> u Trello" radi po skillu trello-tabla; klik u panou je potvrda.' : 'Trello nije uključen; ne pominji ga.',
        'Odgovaraj kratko, srpski latinica.',
      ],
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => crtaj($, e))

  // Gde nema bočnog panoa (telefon): ista aplikacija u redu ispod komande /putovanja.
  on('ui.render', { component: 'CommandOutput', props: { command: 'putovanja' } } as any, async ($, e: any, next: any) => {
    if (e.props?.text && e.props.text !== 'Putovanja') return next(e)
    return crtaj($, e)
  })
}

const DAN = ['ned', 'pon', 'uto', 'sre', 'čet', 'pet', 'sub']
const MESECI_PUNO = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar']

async function crtaj($: any, e: any) {
  const { Box, Text, Button, Select, Link, Markdown, Input } = $.ui.resolve(e) as any
  const n = await read($, nav)
  const st = await read($, status)
  const z = await read($, zemlje)
  const sk = await read($, stanje)
  const ob = await read($, obav)
  const trello = await read($, trelloUkljucen)
  const cols: number = (e.props as any)?.bodyColumns ?? e.viewport?.columns ?? 70
  const vpRows: number = e.viewport?.rows ?? 40
  const bodyRows: number = (e.props as any)?.scroll?.bodyRows ?? Math.round(vpRows * 0.6)
  const rows = Math.max(16, bodyRows)
  const placement: string = (e.props as any)?.placement ?? 'inline'
  if (e.viewport?.rows) {
    VISINA = e.viewport.rows
    if (placement === 'inline' && !VISINA_POSTAVLJENA && e.component === 'Pane') {
      VISINA_POSTAVLJENA = true
      void Promise.resolve().then(() => $.ui.open({ id: PANE, title: 'Putovanja', rows: Math.max(18, Math.round(VISINA * 0.6)) } as any))
    }
  }
  const terminal = e.surface === 'terminal'
  const telefon = e.surface === 'mobile'
  const C = terminal ? TERMINAL : TEMA
  const pp = putnici(n.putnici)
  const odeljak = n.view === 'diy' ? 'diy' : n.view === 'pracenje' ? 'prac' : 'agencije'
  const brojObav = ob?.ukupno ?? 0

  // ===== zaglavlje =====
  const tab = (key: string, label: any, aktivno: boolean, onPress: () => void, hotkey?: string) =>
    aktivno
      ? <Button key={key} variant="primary" hotkey={hotkey} onPress={onPress}>{label}</Button>
      : <Button plain key={key} hotkey={hotkey} onPress={onPress}><Text color={C.fg2}>{label}</Text></Button>
  const zaglavlje = (
    <Box flexDirection="row" justifyContent="space-between" paddingX={1} flexWrap="wrap">
      <Box flexDirection="row" gap={2} alignItems="center" flexWrap="wrap">
        <Text bold color={C.amb}>Putovanja</Text>
        {tab('t-ag', 'Agencije', odeljak === 'agencije', () => { void idiNa($, { view: 'pocetna' }); void ucitajPocetnu($) })}
        {tab('t-diy', 'Uradi sam', odeljak === 'diy', () => otvoriDiy($))}
        {tab('t-pr', <Text>Praćeno{brojObav ? <Text color={C.cor} bold> {brojObav} nova</Text> : ''}</Text>, odeljak === 'prac', () => otvoriPracenje($))}
      </Box>
      {odeljak === 'agencije' && (
        <Box flexDirection="row" gap={3}>
          <Button plain key="t-dest" onPress={() => idiNa($, { view: n.zemlja ? 'zemlja' : 'pocetna' })}>
            <Text bold={n.view !== 'kalendar'} underline={n.view !== 'kalendar'} color={n.view !== 'kalendar' ? C.sky : C.dim}>Destinacije</Text>
          </Button>
          <Button plain key="t-kal" onPress={() => otvoriKalendar($)}>
            <Text bold={n.view === 'kalendar'} underline={n.view === 'kalendar'} color={n.view === 'kalendar' ? C.sky : C.dim}>Kalendar</Text>
          </Button>
        </Box>
      )}
    </Box>
  )
  const crta = (w: number) => <Text color={C.bor}>{'─'.repeat(Math.max(1, w))}</Text>
  const statusRed = st ? <Box paddingX={1}><Text color={C.amb}>{st}</Text></Box> : null
  const vertikala = (vis: number) => <Box width={1} flexShrink={0}><Text color={C.bor}>{Array(Math.max(1, vis)).fill('│').join('\n')}</Text></Box>

  // ===== bočna kolona: izvori + konektori =====
  const iz = await read($, izvori)
  const ko = await read($, konektori)
  const sirinaStrane = 34
  const strana = (vis: number) => {
    const w = sirinaStrane - 2
    const ag = iz?.agencije ?? []
    const problemi = ag.filter(a => a.stanje === 'greska' || a.stanje === 'delimicno')
    const uRedu = ag.filter(a => a.stanje === 'ok').length
    const kad = iz?.poslednji_sken ? (() => {
      const sati = Math.round((Date.now() - Date.parse(iz.poslednji_sken!)) / 36e5)
      return sati < 1 ? 'sken upravo' : sati < 24 ? `sken pre ${sati} h` : `sken pre ${Math.round(sati / 24)} d`
    })() : 'nema skena'
    const nepovezani = ko.filter(k => !k.povezan)
    return (
      <Box flexDirection="column" width={sirinaStrane} flexShrink={0} paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between"><Text bold>Izvori</Text><Text color={C.dim}>{kad}</Text></Box>
        {problemi.map(a => (
          <Link key={`iz-p-${a.id}`} href={a.sajt} label={kratko(`! ${a.naziv}: ${a.greske[0] ?? (a.stanje === 'greska' ? 'nije učitano' : 'delimično')}`, w)} />
        ))}
        <Button plain key="iz-sve" onPress={() => idiNa($, { izvoriOtvoreni: !n.izvoriOtvoreni })}>
          <Text color={C.mint}>✓</Text><Text color={C.fg2}>{padR(` ${uRedu} agencija u redu`, w - 9)}</Text><Text color={C.sky}>{n.izvoriOtvoreni ? 'sakrij ▾' : 'spisak ▸'}</Text>
        </Button>
        {n.izvoriOtvoreni && ag.filter(a => a.stanje !== 'greska' && a.stanje !== 'delimicno').map(a => (
          <Link key={`iz-${a.id}`} href={a.sajt} label={`${padR('  ' + a.naziv, w - 6)}${padL(String(a.ponuda), 5)}`} />
        ))}
        <Text color={C.fg2}><Text color={C.dim}>◌</Text> {iz?.cita_claude.length ?? 3} čita Claude kad pitaš</Text>
        <Button plain key="iz-sken" onPress={() => skeniraj($)}><Text color={C.sky}>Skeniraj ponovo</Text></Button>
        <Box marginTop={1}>{crta(w)}</Box>
        <Box flexDirection="row" justifyContent="space-between"><Text bold>Konektori</Text><Text color={C.dim}>{ko.filter(k => k.povezan).length} od {ko.length}</Text></Box>
        {ko.map(k => (
          <Box flexDirection="column" key={`ko-${k.ime}`}>
            <Box flexDirection="row" justifyContent="space-between">
              <Text><Text color={k.povezan ? C.mint : C.cor}>{k.povezan ? '✓' : '✗'}</Text> {k.ime}</Text>
              {k.povezan ? <Text color={C.dim}>povezan</Text> : <Link key={`ko-l-${k.ime}`} href={KONEKTORI_STRANA} label="Poveži" />}
            </Box>
            <Text color={C.dim}>  {k.sta}</Text>
          </Box>
        ))}
        {nepovezani.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Link key="ko-sve" href={KONEKTORI_STRANA} label={`Poveži preostale (${nepovezani.length})`} />
            <Text color={C.dim}>{kratko('Otvara claude.ai; posle povezivanja ukucaj /mcp', w + 20)}</Text>
          </Box>
        )}
      </Box>
    )
  }

  // ===== leva kolona: kontinenti ili zemlje =====
  const sirinaNav = 21
  const navKolona = (vis: number) => {
    const w = sirinaNav - 1
    const kontinenti = Object.entries(z)
    const otvoren = n.kontinent && z[n.kontinent] ? n.kontinent : (kontinenti[0]?.[0] ?? '')
    const zemljeOtv = Object.entries(z[otvoren] ?? {}).sort((x, y) => y[1] - x[1])
    const mesta = Math.max(3, vis - 2 - kontinenti.length)
    const i = Math.max(0, zemljeOtv.findIndex(([x]) => x === n.zemlja))
    const od = zemljeOtv.length > mesta ? Math.max(0, Math.min(i - Math.floor(mesta / 2), zemljeOtv.length - mesta + 1)) : 0
    const vidljive = zemljeOtv.length > mesta ? zemljeOtv.slice(od, od + mesta - 1) : zemljeOtv
    const kontRed = (k: string, c: number, otv: boolean) => (
      <Button plain key={`nk-${k}`} onPress={() => idiNa($, { kontinent: k })}>
        <Text color={otv ? C.sky : C.dim}>{otv ? '▾' : '▸'}</Text><Text bold={otv} color={otv ? undefined : C.fg2}>{padR(' ' + k, w - 5)}</Text><Text color={C.dim}>{padL(String(c), 3)} </Text>
      </Button>
    )
    return (
      <Box flexDirection="column" width={sirinaNav} flexShrink={0}>
        <Button plain key="nav-pocetna" onPress={() => idiNa($, { view: 'pocetna', zemlja: '', strana: 0 })}>
          <Text color={n.view === 'pocetna' ? C.sky : C.fg2} bold={n.view === 'pocetna'}>{padR(' Preporučeno', w)}</Text>
        </Button>
        <Text> </Text>
        {kontinenti.map(([k, c]) => (
          <Box flexDirection="column" key={`nkb-${k}`}>
            {kontRed(k, Object.values(c).reduce((x, y) => x + y, 0), k === otvoren)}
            {k === otvoren && (
              <Box flexDirection="column">
                {od > 0 && <Text color={C.dim}>   … još {od} gore</Text>}
                {vidljive.map(([zem, cz]) => zem === n.zemlja && n.view !== 'pocetna'
                  ? <Button plain key={`nz-${zem}`} onPress={() => otvoriZemlju($, zem)}><Text color={C.sky} backgroundColor={C.sel}> ▌</Text><Text bold backgroundColor={C.sel}>{padR(zem, w - 6)}{padL(String(cz), 3)} </Text></Button>
                  : <Button plain key={`nz-${zem}`} onPress={() => otvoriZemlju($, zem)}><Text color={C.fg2}>{'  ' + padR(zem, w - 6)}</Text><Text color={C.dim}>{padL(String(cz), 3)} </Text></Button>)}
                {od + vidljive.length < zemljeOtv.length && <Text color={C.dim}>   +{zemljeOtv.length - od - vidljive.length} zemalja</Text>}
              </Box>
            )}
          </Box>
        ))}
      </Box>
    )
  }

  // ===== tabla polazaka =====
  const pm = await read($, popustiMapa)
  const tabla = (ture: Tura[], w: number, vis: number, naslov: any, prazno: string) => {
    const wD = 8, wN = 7, wP = w >= 90 ? 11 : 0, wA = w >= 62 ? 14 : 0, wC = 15
    const wIme = Math.max(10, w - 1 - wD - wN - wP - wA - wC - 1)
    const mesta = Math.max(2, Math.floor((vis - 6) / 2))
    const strane = Math.max(1, Math.ceil(ture.length / mesta))
    const sp = Math.min(n.strana, strane - 1)
    const vidljive = ture.slice(sp * mesta, sp * mesta + mesta)
    return (
      <Box flexDirection="column" width={w} flexShrink={1}>
        {naslov}
        <Text color={C.dim}>{' ' + padR('Polazak', wD) + padR('Odredište', wIme) + padL('Noći', wN - 2) + '  ' + (wP ? padR('Prevoz', wP) : '') + (wA ? padR('Agencija', wA) : '') + padL('Po osobi', wC) + ' '}</Text>
        {crta(w)}
        {vidljive.length === 0 && <Text color={C.dim}> {st ? '…' : prazno}</Text>}
        {vidljive.map(t => {
          const p = t.glavna
          const ts = t.svi.flatMap(termini)
          const pop = Math.max(0, ...t.svi.map(popust))
          const nap = [...new Set([...(p.popusti ?? []), ...(pm[p.id] ?? [])])]
          const vise = ts.length > 1 ? `${ts.length} polazaka${cenaVarira(ts) ? '' : ''}` : '1 polazak'
          const kraj = ts.length > 1 ? ` do ${kratakDatum(ts[ts.length - 1]!.datum)}` : ''
          const red2 = [vise + kraj, ...(p.zemlja && n.view !== 'zemlja' ? [p.zemlja] : [])].join(' · ')
          const pp2 = pop ? `   −${pop}%` : ''
          const mestoZaNap = w - 1 - wD - Math.min(len(red2), 22) - len(pp2)
          let nap2 = ''
          for (const x of nap.slice(0, 3)) if (len(nap2) + len(x) + 5 <= mestoZaNap) nap2 += `   + ${x}`
          const ostatak = Math.max(0, w - 1 - wD - len(red2) - len(nap2) - len(pp2))
          return (
            <Box flexDirection="column" key={`b-${p.id}`}>
              <Button plain key={`b1-${p.id}`} onPress={() => otvoriPonudu($, p)}>
                <Text> </Text>
                <Text color={C.amb} bold>{padR(kratakDatum(p.date_from), wD)}</Text>
                <Text bold>{padR(ime(p), wIme)}</Text>
                <Text>{padL(p.nights === 0 ? 'izlet' : String(p.nights ?? ''), wN - 2)}  </Text>
                {wP ? <Text color={C.fg2}>{padR(PREVOZ[p.transport ?? ''] ?? (p.transport ?? ''), wP)}</Text> : ''}
                {wA ? <Text color={C.fg2}>{padR(p.agencija, wA)}</Text> : ''}
                <Text color={C.amb} bold>{padL(opseg(ts), wC)}</Text>
                <Text> </Text>
              </Button>
              <Button plain key={`b2-${p.id}`} onPress={() => otvoriPonudu($, p)}>
                <Text>{' '.repeat(1 + wD)}</Text>
                <Text color={C.dim}>{kratko(red2, Math.max(8, w - 1 - wD - len(nap2) - len(pp2)))}</Text>
                <Text color={C.mint}>{nap2}{pp2}</Text>
                <Text>{' '.repeat(ostatak)}</Text>
              </Button>
            </Box>
          )
        })}
        {strane > 1 && (
          <Box flexDirection="row" gap={2} paddingX={1}>
            {sp > 0 && <Button plain key="pg-prev" onPress={() => idiNa($, { strana: sp - 1 })}><Text color={C.sky}>‹ prethodne</Text></Button>}
            <Text color={C.dim}>strana {sp + 1}/{strane}</Text>
            {sp < strane - 1 && <Button plain key="pg-next" onPress={() => idiNa($, { strana: sp + 1 })}><Text color={C.sky}>sledeće ›</Text></Button>}
          </Box>
        )}
      </Box>
    )
  }

  const izborPutnika = telefon ? (
    <Box flexDirection="row" gap={1} flexWrap="wrap">
      {PUTNICI.slice(0, 4).map(([v, l]) => <Button key={`put-${v}`} variant={v === n.putnici ? 'primary' : 'secondary'} onPress={() => idiNa($, { putnici: v })}>{l}</Button>)}
    </Box>
  ) : (
    <Select key="putnici" label="Putnika" value={`${pp.odrasli}+${pp.deca}`} options={PUTNICI.map(([value, label]) => ({ value, label }))}
      onSelect={(v: string) => idiNa($, { putnici: v })} />
  )

  const SORT_OPC: [Nav['sort'], string][] = [['preporuka', 'Preporučeno'], ['cena', 'Najjeftinije'], ['datum', 'Po datumu'], ['popust', 'Najveći popust']]
  const izborSorta = telefon ? (
    <Box flexDirection="row" gap={1} flexWrap="wrap">
      {SORT_OPC.map(([v, l]) => <Button key={`sort-${v}`} variant={v === n.sort ? 'primary' : 'secondary'} onPress={() => idiNa($, { sort: v, strana: 0 })}>{l}</Button>)}
    </Box>
  ) : (
    <Select key="sort" label="Redosled" value={n.sort} options={SORT_OPC.map(([value, label]) => ({ value, label }))}
      onSelect={(v: string) => idiNa($, { sort: v as Nav['sort'], strana: 0 })} />
  )

  // ===== traka na dnu: najjeftinije svuda =====
  const jf = await read($, jeftino)
  const traka = (w: number) => {
    const delovi: any[] = []
    let ostalo = w - 22
    for (const p of jf) {
      const t = `${kratko(ime(p), 24)} ${cena(p)} ${kratakDatum(p.date_from)}`
      if (len(t) + 3 > ostalo - 7) break
      ostalo -= len(t) + 3
      delovi.push(
        <Button plain key={`jf-${p.id}`} onPress={() => otvoriPonudu($, p)}>
          <Text>{kratko(ime(p), 24)} </Text><Text color={C.amb} bold>{cena(p)}</Text><Text color={C.dim}> {kratakDatum(p.date_from)}</Text>
        </Button>,
      )
    }
    return (
      <Box flexDirection="row" gap={3} paddingX={1} backgroundColor={C.strip}>
        <Text color={C.dim}>Najjeftinije svuda</Text>
        {delovi}
      </Box>
    )
  }

  // ===== raspored Agencija: zemlje | tabla | izvori i konektori =====
  if (n.view === 'pocetna' || n.view === 'kontinent' || n.view === 'zemlja') {
    const saStranom = !telefon && cols >= 110
    const saNav = !telefon && cols >= 76
    const vis = rows - 4 - (statusRed ? 1 : 0) - (!saStranom && !telefon ? 1 : 0)
    const wTabla = cols - (saNav ? sirinaNav + 1 : 0) - (saStranom ? sirinaStrane + 1 : 0)
    let ture: Tura[]
    let naslov: any
    let prazno = 'Nema ponuda.'
    if (n.view === 'zemlja') {
      ture = grupisi(await read($, lista), n.sort === 'preporuka' ? 'cena' : n.sort)
      naslov = (
        <Box flexDirection="row" justifyContent="space-between" paddingX={1} flexWrap="wrap">
          <Text><Text bold>{n.zemlja}</Text><Text color={C.dim}>  {ture.length} {ture.length === 1 ? 'aranžman' : 'aranžmana'}</Text></Text>
          <Box flexDirection="row" gap={2}>
            {izborPutnika}
            {izborSorta}
          </Box>
        </Box>
      )
    } else if (n.view === 'kontinent') {
      const sve = Object.entries(z[n.kontinent] ?? {}).sort((a, b) => b[1] - a[1])
      const t = (await read($, top)).filter(p => p.kontinent === n.kontinent)
      ture = grupisi(t, n.sort)
      prazno = 'Izaberi zemlju levo.'
      naslov = (
        <Box flexDirection="column" paddingX={1}>
          <Box flexDirection="row" justifyContent="space-between"><Text bold>{n.kontinent}</Text><Text color={C.dim}>{sve.length} zemalja · {sve.reduce((a, [, c]) => a + c, 0)} ponuda</Text></Box>
          {!saNav && (
            <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
              {sve.map(([zem, c]) => <Button plain key={`kz-${zem}`} onPress={() => otvoriZemlju($, zem)}><Text bold>{zem}</Text><Text color={C.dim}> {c}</Text></Button>)}
            </Box>
          )}
          <Text color={C.dim}>Najbolje sada na ovom kontinentu:</Text>
        </Box>
      )
    } else {
      ture = grupisi(await read($, top), n.sort)
      prazno = 'Baza je prazna. Klikni „Skeniraj ponovo“ desno, ili napiši Claude-u: „uradi sken agencija“.'
      naslov = (
        <Box flexDirection="row" justifyContent="space-between" paddingX={1} flexWrap="wrap">
          <Text bold>Preporučeno za tebe</Text>
          <Box flexDirection="row" gap={2}>
            {izborPutnika}
            {izborSorta}
          </Box>
        </Box>
      )
      if (!saNav && Object.keys(z).length) {
        naslov = (
          <Box flexDirection="column">
            <Box flexDirection="row" flexWrap="wrap" columnGap={2} paddingX={1}>
              {Object.entries(z).map(([k, c]) => <Button plain key={`pk-${k}`} onPress={() => otvoriKontinent($, k)}><Text bold>{k}</Text><Text color={C.dim}> {Object.values(c).reduce((a, b) => a + b, 0)}</Text></Button>)}
            </Box>
            {naslov}
          </Box>
        )
      }
    }
    const sazetak = !saStranom && !telefon ? (() => {
      const ag = iz?.agencije ?? []
      const los = ag.filter(a => a.stanje === 'greska' || a.stanje === 'delimicno').length
      const nepov = ko.filter(k => !k.povezan).length
      return (
        <Box flexDirection="row" gap={2} paddingX={1}>
          <Text color={C.dim}>Izvori <Text color={C.mint}>✓ {ag.length - los}</Text>{los ? <Text color={C.amb}> ! {los}</Text> : ''}</Text>
          <Text color={C.dim}>Konektori {ko.length - nepov}/{ko.length}</Text>
          {nepov > 0 && <Link key="sz-pov" href={KONEKTORI_STRANA} label={`Poveži (${nepov})`} />}
        </Box>
      )
    })() : null
    return (
      <Box flexDirection="column">
        {zaglavlje}
        {crta(cols)}
        {statusRed}
        <Box flexDirection="row">
          {saNav && navKolona(vis)}
          {saNav && vertikala(vis)}
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            {tabla(ture, wTabla, vis - 1, naslov, prazno)}
          </Box>
          {saStranom && vertikala(vis)}
          {saStranom && strana(vis)}
        </Box>
        {crta(cols)}
        {jf.length > 0 ? traka(cols) : null}
        {sazetak}
      </Box>
    )
  }

  // ===== ostali ekrani: isti okvir, bez bočnih kolona =====
  const okvir = (glavno: any) => (
    <Box flexDirection="column">
      {zaglavlje}
      {crta(cols)}
      {statusRed}
      <Box flexDirection="column" paddingX={1}>{glavno}</Box>
    </Box>
  )
  const naslov = (t: string, desno?: any) => (
    <Box flexDirection="row" justifyContent="space-between" marginTop={1}>
      <Text bold>{t}</Text>
      {desno ?? null}
    </Box>
  )
  const datumiDugmad = (p: Ponuda, pre: string, max: number) => {
    const ts = termini(p)
    const varira = cenaVarira(ts)
    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        {ts.slice(0, max).map((t, i) => (
          <Button plain key={`${pre}-${t.id}-${t.datum ?? 'x'}-${i}`} onPress={() => otvoriPonudu($, polazak(p, t))}>
            <Text color={C.amb}>{kratakDatum(t.datum)}</Text>{varira ? <Text color={C.fg2}> {iznos(t.cena, t.valuta)}</Text> : ''}
          </Button>
        ))}
        {ts.length > max && <Text color={C.dim}>+{ts.length - max}</Text>}
      </Box>
    )
  }

  // ===== kalendar =====
  if (n.view === 'kalendar') {
    const k = await read($, kal)
    const dani = Object.entries(k?.dani ?? {})
    const mesto = Math.max(8, rows - 8)
    const strane: [string, Ponuda[]][][] = [[]]
    let zauzeto = 0
    for (const [d, lst] of dani) {
      const hh = 2 + Math.min(lst.length, 5) + (lst.length > 5 ? 1 : 0)
      if (zauzeto + hh > mesto && strane[strane.length - 1]!.length) { strane.push([]); zauzeto = 0 }
      strane[strane.length - 1]!.push([d, lst])
      zauzeto += hh
    }
    const sp = Math.min(n.kalStrana, strane.length - 1)
    const naStrani = strane[sp] ?? []
    const wAg = telefon ? 0 : 14, wC = 15
    const wIme = Math.max(14, cols - wAg - wC - 8)
    const mIdx = Number((n.mesec || '2000-01').slice(5)) - 1
    const pr = k?.praznici ?? {}
    return okvir(
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          {(k?.meseci ?? []).map(m => {
            const i = Number(m.mesec.slice(5)) - 1
            const label = `${MES_IME[i]}${i === 0 || m === k?.meseci[0] ? ' ' + m.mesec.slice(2, 4) : ''} ${m.broj}`
            return m.mesec === n.mesec
              ? <Button key={`m-${m.mesec}`} variant="primary" onPress={() => otvoriKalendar($, m.mesec)}>{label}</Button>
              : <Button plain key={`m-${m.mesec}`} onPress={() => otvoriKalendar($, m.mesec)}><Text color={m.broj ? C.fg2 : C.dim}>{label}</Text></Button>
          })}
        </Box>
        {naslov(`${MESECI_PUNO[mIdx] ?? ''} ${n.mesec.slice(0, 4)}`,
          <Text color={C.dim}>{dani.reduce((a, [, l]) => a + l.length, 0)} polazaka · cene po osobi{strane.length > 1 ? ` · strana ${sp + 1}/${strane.length}` : ''}</Text>)}
        {Object.keys(pr).length > 0 && <Text color={C.amb}>Praznici: {Object.entries(pr).map(([d, x]) => `${kratakDatum(d)} ${x}`).join(' · ')}</Text>}
        {naStrani.length === 0 && <Text color={C.dim}>{st ? '…' : 'Nema polazaka u ovom mesecu.'}</Text>}
        {naStrani.map(([d, lst], di) => {
          const dt = new Date(d + 'T12:00:00')
          const vikend = [0, 5, 6].includes(dt.getDay())
          return (
            <Box flexDirection="column" marginTop={di ? 1 : 0} key={`kd-${d}`}>
              <Text bold color={pr[d] ? C.amb : vikend ? C.sky : undefined}>
                {DAN[dt.getDay()]} {kratakDatum(d)}{pr[d] ? ` · ${pr[d]}` : ''} <Text color={C.dim}>· {lst.length}</Text>
              </Text>
              {lst.slice(0, 5).map((p, i) => (
                <Button plain key={`kd-${p.id}-${d}-${i}`} onPress={() => otvoriPonudu($, p)}>
                  <Text>{'  ' + padR(`${ime(p)}`, Math.max(8, wIme - len(p.zemlja) - 3))}</Text>
                  <Text color={C.dim}>{padR(` ${p.zemlja}`, len(p.zemlja) + 3)}</Text>
                  <Text color={C.amb} bold>{padL(cena(p), wC)}</Text>
                  {!telefon ? <Text color={C.fg2}>{'  ' + padR(p.agencija, wAg - 2)}</Text> : ''}
                </Button>
              ))}
              {lst.length > 5 && <Text color={C.dim}>  +{lst.length - 5} još tog dana</Text>}
            </Box>
          )
        })}
        <Box flexDirection="row" gap={2} marginTop={1}>
          {sp > 0 && <Button key="kprev" onPress={() => idiNa($, { kalStrana: sp - 1 })}>‹ Ranije</Button>}
          {sp < strane.length - 1 && <Button key="knext" onPress={() => idiNa($, { kalStrana: sp + 1 })}>Kasnije ›</Button>}
          <Button key="ask-kal" variant="primary"
            onPress={() => pitaj($, `Pogledaj polaske za ${MESECI_PUNO[mIdx]} ${n.mesec.slice(0, 4)} (pt --json kalendar ${n.mesec}) i predloži 3 najbolje opcije za vikend ili praznik, sa cenom po osobi i ukupno za ${pp.tekst}.`)}>
            Pitaj Claude-a za ovaj mesec
          </Button>
        </Box>
      </Box>,
    )
  }

  // ===== praćeno =====
  if (n.view === 'pracenje') {
    const l = await read($, prac)
    const red = (p: Pracena, pre: string, desno: any) => (
      <Box flexDirection="row" justifyContent="space-between" key={`${pre}-${p.id}`}>
        <Button plain key={`${pre}-b-${p.id}`} onPress={() => otvoriPonudu($, p)}>
          <Text bold>{kratko(ime(p), Math.max(14, cols - 44))}</Text><Text color={C.fg2}> {p.agencija}</Text>
        </Button>
        <Box>{desno}</Box>
      </Box>
    )
    const izn = (v: number | null | undefined, p: Ponuda) => iznos(v ?? null, p.currency || 'EUR')
    return okvir(
      <Box flexDirection="column">
        {ob && ob.ukupno > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color={C.amb}>Novo od poslednjeg pregleda</Text>
            {ob.padovi.map(p => red(p, 'ob-pad', <Text><Text color={C.dim} strikethrough>{izn(p.javljena_cena, p)}</Text> <Text bold color={C.mint}>{izn(p.cena_sada, p)}</Text></Text>))}
            {ob.nestali.map(p => red(p, 'ob-nest', <Text color={C.cor}>nestalo sa sajta</Text>))}
            {ob.nove_po_zeljama.slice(0, 10).map(p => red(p, 'ob-novo', <Text><Text color={C.sky}>novo: {p.zelja}</Text> <Text color={C.dim}>{kratakDatum(p.date_from)}</Text> <Text bold color={C.amb}>{cena(p)}</Text></Text>))}
            {ob.nove_po_zeljama.length > 10 && <Text color={C.dim}>+{ob.nove_po_zeljama.length - 10} još novih po željama</Text>}
            <Box marginTop={1}>{crta(cols - 2)}</Box>
          </Box>
        )}
        {naslov(`Pratiš (${l.length})`, <Text color={C.dim}>cene po osobi, proveravaju se pri svakom skenu</Text>)}
        {l.length === 0 && <Text color={C.dim}>Još ništa ne pratiš. Otvori ponudu i klikni „Prati cenu“: javiću kad pojeftini.</Text>}
        {l.map((p, i) => {
          const promena = p.promena ?? 0
          return (
            <Box flexDirection="column" marginTop={i ? 1 : 0} key={`pr-${p.id}`}>
              {red(p, 'pr', !p.aktivno
                ? <Text color={C.cor}>nema je više na sajtu</Text>
                : <Text>{izn(p.cena_pocetna, p)} → <Text bold color={promena < 0 ? C.mint : promena > 0 ? C.cor : C.amb}>{izn(p.cena_sada, p)}</Text>
                    {promena ? <Text color={promena < 0 ? C.mint : C.cor}> {promena < 0 ? '▼' : '▲'}{Math.abs(Math.round(promena))}</Text> : ''}</Text>)}
              {p.aktivno && termini(p).length > 0 && <Box paddingLeft={2}>{datumiDugmad(p, 'prd', varijaDatuma(termini(p), cols - 8))}</Box>}
            </Box>
          )
        })}
      </Box>,
    )
  }

  // ===== uradi sam =====
  if (n.view === 'diy') {
    const d = n.diy
    const x = diyIso(d)
    const lst = await read($, diyLista)
    const ag = await read($, diyAgencije)
    const lk = diyLinkovi(d)
    const siroko = cols >= 90
    const polje = (key: keyof Diy, label: string, ph: string, sir: number, ucitaj = false) => telefon ? (
      <Text key={`dp-${key}`}><Text color={C.dim}>{label} </Text><Text bold>{d[key] || '—'}</Text></Text>
    ) : (
      <Box width={sir} key={`dp-${key}`}>
        <Input key={`diy-${key}`} label={label} placeholder={d[key] || ph} value={d[key]} submitLabel="ok"
          onSubmit={(v: string) => postaviDiy($, key, v.trim(), ucitaj)} />
      </Box>
    )
    const blizina = (t: Tura) => !x.ok ? 0 : Math.min(...t.svi.map(s => s.date_from ? Math.abs(Date.parse(s.date_from) - Date.parse(x.od)) / 864e5 : 999))
    const agTop = grupisi(ag, 'cena')
      .filter(t => t.glavna.nights !== 0)
      .sort((a, b) => (blizina(a) <= 7 ? 0 : 1) - (blizina(b) <= 7 ? 0 : 1) || Math.min(...a.svi.map(eur)) - Math.min(...b.svi.map(eur)))
      .slice(0, 5)
    const linkKolona = (naslovK: string, l: [string, string][]) => (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold>{naslovK}</Text>
        {l.map(([label, href]) => <Link key={`ln-${label}`} href={href} label={label} />)}
      </Box>
    )
    return okvir(
      <Box flexDirection="column">
        <Box flexDirection="column" marginTop={1}>
          <Text><Text bold>Uradi sam</Text><Text color={C.dim}>  prevoz i smeštaj po svom izboru, uporedo sa agencijama</Text></Text>
          <Box flexDirection={telefon ? 'column' : 'row'} columnGap={2} flexWrap="wrap" marginTop={1}>
            {polje('odakle', 'Odakle', 'Beograd', 28)}
            {polje('kuda', 'Kuda', 'grad ili zemlja', 34, true)}
          </Box>
          <Box flexDirection={telefon ? 'column' : 'row'} columnGap={2} flexWrap="wrap">
            {polje('od', 'Polazak', 'npr. 5.12.', 26)}
            {polje('do', 'Povratak', 'npr. 7.12.', 26)}
            {polje('osoba', 'Osoba', '2', 16)}
          </Box>
          <Text color={C.dim}>
            {x.ok ? `✓ ${d.kuda} · ${datum(x.od)} – ${datum(x.do)} · ${x.osoba} os.`
              : telefon ? 'Na telefonu napiši Claude-u: „uradi sam Budimpešta 5.12.–7.12.“'
              : 'Upiši kuda i datume (npr. 5.12.), Enter potvrđuje polje.'}
          </Text>
        </Box>
        {x.ok && (
          <Box flexDirection={siroko ? 'row' : 'column'} gap={2} marginTop={1}>
            {linkKolona('Kako stići', lk.prevoz)}
            {linkKolona(`Gde spavati · ${kratakDatum(x.od)}–${kratakDatum(x.do)}`, lk.smestaj)}
          </Box>
        )}
        {x.ok && (
          <Box marginTop={1}>
            <Button key="diy-trazi" variant="primary"
              onPress={() => pitaj($, `Uradi sam: ${d.odakle || 'Beograd'} → ${d.kuda}, ${datum(x.od)} – ${datum(x.do)}, ${x.osoba} osobe. Po skillu uradi-sam pronađi prevoz (avion, autobus, voz, auto) i smeštaj, sačuvaj 2–3 kombinacije sa ukupnom cenom (pt uradisam sacuvaj) i uporedi sa agencijama za istu destinaciju.`)}>
              Claude, nađi najbolju kombinaciju
            </Button>
          </Box>
        )}
        {naslov(`Sačuvane kombinacije${d.kuda ? ` · ${d.kuda}` : ''}`, lst.length ? <Text color={C.dim}>{lst.length}</Text> : undefined)}
        {lst.length === 0 && <Text color={C.dim}>Još nema. Klikni „Claude, nađi najbolju kombinaciju“: Claude traži letove, autobuse, vozove i smeštaj i čuva ih ovde.</Text>}
        {lst.slice(0, 6).map((k, i) => (
          <Box flexDirection="column" marginTop={i ? 1 : 0} key={`dk-${k.id}`}>
            <Box flexDirection="row" justifyContent="space-between">
              <Text bold>{k.naslov || k.kuda} <Text color={C.dim}>{k.kuda} · {kratakDatum(k.od ?? null)}–{kratakDatum(k.do ?? null)}</Text></Text>
              <Text><Text bold color={C.amb}>{Math.round(k.po_osobi)} € po osobi</Text><Text color={C.dim}> · ukupno {Math.round(k.ukupno).toLocaleString('de-DE')} €{k.nepotpuno ? ' · nepotpuno' : ''}</Text></Text>
            </Box>
            {[...k.prevoz.map(s => ({ s, ik: s.tip || 'prevoz' })), ...k.smestaj.map(s => ({ s, ik: 'smeštaj' })), ...k.ostalo.map(s => ({ s, ik: '+' }))].map(({ s, ik }, j) => (
              <Box flexDirection="row" paddingLeft={2} justifyContent="space-between" key={`dks-${k.id}-${j}`}>
                <Text><Text color={C.dim}>{padR(ik, 8)}</Text>{kratko([s.naziv, s.opis].filter(Boolean).join(' · ') || s.tip || '', Math.max(20, cols - 36))}{s.ocena ? <Text color={C.sky}> ★{s.ocena}</Text> : ''}</Text>
                <Text color={C.fg2}>{s.cena ? `${Math.round(s.cena).toLocaleString('de-DE')} ${s.valuta === 'RSD' ? 'din' : '€'}` : '?'}</Text>
              </Box>
            ))}
            <Box flexDirection="row" gap={2} paddingLeft={2}>
              {trello && (
                <Button plain key={`diy-trello-${k.id}`}
                  onPress={() => pitaj($, `Stavi uradi-sam kombinaciju ${k.id} (${k.naslov || k.kuda}, ${k.od}–${k.do}, ${Math.round(k.po_osobi)} € po osobi) na Trello tablu u Predloge, sa linkovima iz pt --json uradisam lista.`)}><Text color={C.sky}>Stavi u Trello</Text></Button>
              )}
              <Button plain key={`diy-del-${k.id}`} onPress={async () => { await pt($, ['uradisam', 'obrisi', k.id]); await ucitajDiy($, (await read($, nav)).diy) }}><Text color={C.sky}>Obriši</Text></Button>
              {[...k.prevoz, ...k.smestaj].filter(s => s.link).slice(0, 3).map((s, j) => (
                <Link key={`diy-l-${k.id}-${j}`} href={s.link!} label={kratko(s.naziv || s.tip || 'link', 18)} />
              ))}
            </Box>
          </Box>
        ))}
        {d.kuda.trim() !== '' && (
          <Box flexDirection="column">
            {naslov(`Agencije za ${d.kuda}`, <Text color={C.dim}>po osobi</Text>)}
            {agTop.length === 0 && <Text color={C.dim}>Nijedna agencija trenutno nema ponudu za „{d.kuda}“.</Text>}
            {agTop.map(t => {
              const p = t.glavna
              const lo = Math.min(...t.svi.map(eur))
              const blizu = x.ok && t.svi.some(s => s.date_from && Math.abs(Date.parse(s.date_from) - Date.parse(x.od)) < 4 * 864e5)
              return (
                <Box flexDirection="row" justifyContent="space-between" key={`dag-${p.id}`}>
                  <Button plain key={`diy-ag-${p.id}`} onPress={() => otvoriPonudu($, p)}>
                    <Text bold>{kratko(ime(p), Math.max(14, cols - 56))}</Text><Text color={C.fg2}> {p.agencija} · {kratakDatum(p.date_from)}{p.nights ? ` · ${p.nights} noći` : ''}</Text>{blizu ? <Text color={C.mint}> ✓ tvoji datumi</Text> : ''}
                  </Button>
                  <Text bold color={C.amb}>{lo < 1e9 ? `${Math.round(lo).toLocaleString('de-DE')} €` : 'na sajtu'}</Text>
                </Box>
              )
            })}
          </Box>
        )}
      </Box>,
    )
  }

  // ===== ponuda =====
  const p = await read($, ponuda)
  const d = await read($, detalji)
  if (!p) return okvir(<Text color={C.dim}>Izaberi ponudu.</Text>)
  const iste = (await read($, lista)).filter(x => x.agencija === p.agencija && baseUrl(x.url) === baseUrl(p.url) && x.title === p.title)
  const sviT: Termin[] = p.termini?.length ? p.termini : (iste.length ? iste : [p]).flatMap(termini)
    .sort((a, b) => (a.datum ?? '9999').localeCompare(b.datum ?? '9999'))
  const od = p.note === "cena 'od'"
  const napomena = p.note && !od && !p.note.startsWith('paket') ? p.note : ''
  const nap = [...new Set([...(p.popusti ?? []), ...((await read($, popustiMapa))[p.id] ?? [])])]
  const cinjenica = (oznaka: string, vrednost: string, boja?: string) => (
    <Box flexDirection="column" flexGrow={1} key={`c-${oznaka}`}>
      <Text color={C.dim}>{oznaka}</Text>
      <Text bold color={boja}>{vrednost}</Text>
    </Box>
  )
  const u = p.ukupno
  const osobe = u?.osobe ?? pp.ukupno
  const val = (v: number) => `${Math.round(v).toLocaleString('de-DE')} ${(u?.valuta ?? p.currency) === 'RSD' ? 'din' : '€'}`
  const obavezno = u?.stavke.filter(s => s.tip !== 'opciono') ?? []
  const opciono = u?.stavke.filter(s => s.tip === 'opciono') ?? []
  const ukupnoBox = p.price ? (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Ukupno za {pp.tekst} <Text color={C.dim}>(procena, pre popusta za decu i treću osobu)</Text></Text>
        <Text bold color={C.amb}>{u ? `~${val(u.ukupno_sa_preporucenim)}` : `${val(p.price * osobe)} + takse`}</Text>
      </Box>
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={C.dim}>  Aranžman {osobe} × {cena(p)}</Text><Text>{val(p.price * osobe)}</Text>
      </Box>
      {obavezno.map((s, i) => (
        <Box flexDirection="row" justifyContent="space-between" key={`ob-${i}`}>
          <Text color={C.dim}>  {kratko(s.naziv, 34)} <Text italic>{s.racun}</Text>{s.tip === 'preporučeno' ? ' · preporučeno' : ''}</Text>
          <Text>{s.valuta === (u?.valuta ?? p.currency) ? val(s.iznos) : `${Math.round(s.iznos)} ${s.valuta === 'RSD' ? 'din' : '€'}`}</Text>
        </Box>
      ))}
      {u && obavezno.length === 0 && <Text color={C.dim}>  Na sajtu nisu navedene takse ni obavezne doplate.</Text>}
      {!u && <Text color={C.dim}>  Čitam takse i doplate sa sajta…</Text>}
      {opciono.length > 0 && (
        <Text color={C.dim}>  Fakultativno, nije uračunato: {opciono.slice(0, 5).map(s => `${kratko(s.naziv, 22)} ${Math.round(s.iznos)} €`).join(' · ')}</Text>
      )}
    </Box>
  ) : null

  const md: string[] = []
  if (sviT.length > 1) {
    md.push(`**Svi polasci (${sviT.length})** · ${opseg(sviT)} po osobi\n`)
    md.push('| Polazak | Noći | Po osobi | |\n|---|---|---|---|')
    for (const t of sviT.slice(0, 20)) {
      const ovaj = t.datum === p.date_from && t.cena === p.price
      const stara = t.stara && t.cena && t.stara > t.cena ? ` ~~${Math.round(t.stara)}~~` : ''
      md.push(`| ${ovaj ? '**→ ' + datum(t.datum) + '**' : datum(t.datum)} | ${t.noci ?? ''} | ${iznos(t.cena, t.valuta)}${stara} | ${ovaj ? 'izabran' : ''} |`)
    }
  }
  if (d) {
    if (d.greska) md.push(`\n> ${d.greska}`)
    const sekcije: [keyof Detalji, string, number][] = [['opis', 'Ukratko', 4], ['termini', 'Polasci sa sajta', 8],
      ['sobe', 'Cena po tipu sobe (ovaj polazak)', 6], ['obuhvata', 'Cena obuhvata', 8],
      ['ne_obuhvata', 'Ne obuhvata / doplate', 8], ['napomene', 'Napomene', 5], ['program', 'Program', 10], ['tekst', 'Sa stranice', 8]]
    for (const [k, nas, max] of sekcije) {
      const v = d[k]
      if (!v) continue
      const linije = String(v).split('\n').map(x => x.replace(/^[\s*•\-–]+/, '').trim()).filter(Boolean)
      const telo = k === 'opis' ? kratko(linije.join(' '), 400) : linije.slice(0, max).map(x => `- ${kratko(x, k === 'program' ? 220 : 180)}`).join('\n')
      md.push(`\n**${nas}**\n\n${telo}${linije.length > max && k !== 'opis' ? `\n- _… još ${linije.length - max}, ceo tekst na sajtu agencije_` : ''}`)
    }
    if (d.provereno) md.push(`\n_Sa sajta agencije, provereno ${d.provereno.replace('T', ' ')}_`)
  }
  const izSajta = p.date_from ? (d?.termini ?? '').match(new RegExp(`${datum(p.date_from).replace(/\./g, '\\.')}\\s*–\\s*(\\d\\d)\\.(\\d\\d)\\.(\\d{4})`)) : null
  const krajDatum = p.date_to ?? (izSajta ? `${izSajta[3]}-${izSajta[2]}-${izSajta[1]}` : null)
  return okvir(
    <Box flexDirection="column">
      <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>{kratko(ime(p), cols - 20)}</Text>
          {popust(p) ? <Text color={C.mint} bold>−{popust(p)}%</Text> : null}
        </Box>
        {ime(p) !== p.title && <Text color={C.dim}>{kratko(p.title, cols - 6)}</Text>}
        <Text color={C.dim}>{p.zemlja} · {p.kontinent} · <Text color={C.sky}>{p.agencija}</Text></Text>
        {napomena ? <Text color={C.amb}>{napomena}</Text> : null}
      </Box>
      <Box flexDirection={telefon ? 'column' : 'row'} gap={2} marginTop={1}>
        {cinjenica('Polazak', `${datum(p.date_from)}${krajDatum ? ' → ' + datum(krajDatum) : ''}`, C.amb)}
        {cinjenica('Noći', p.nights === 0 ? 'izlet' : String(p.nights ?? '?'))}
        {cinjenica('Prevoz', p.transport ?? '?')}
        {cinjenica(popust(p) ? `Po osobi${od ? ' od' : ''} (bilo ${Math.round(p.old_price!)})` : `Po osobi${od ? ' od' : ''}`, `${cena(p)}${uEvrima(p) ? ' ' + uEvrima(p) : ''}`, C.amb)}
      </Box>
      {nap.length > 0 && (
        <Box flexDirection="row" flexWrap="wrap" columnGap={3} marginTop={1}>
          <Text color={C.dim}>Za više osoba:</Text>
          {nap.map(x => <Text color={C.mint} key={`np-${x}`}>+ {x}</Text>)}
        </Box>
      )}
      {ukupnoBox}
      {sviT.length > 1 && <Box marginTop={1}>{datumiDugmad({ ...p, termini: sviT }, 'pd', 16)}</Box>}
      <Box flexDirection="row" gap={2} marginY={1} flexWrap="wrap">
        <Button key="prati" variant={p.pratim ? 'primary' : undefined} onPress={() => prebaciPracenje($, p)}>
          {p.pratim ? '✓ Pratim cenu' : 'Prati cenu'}
        </Button>
        <Button key="uporedi" hotkey="u"
          onPress={() => otvoriDiy($, { kuda: p.zemlja === 'Više zemalja' ? ime(p) : (ime(p).split(/[,–-]/)[0] ?? p.zemlja).trim(),
            od: p.date_from ? kratakDatum(p.date_from) : '', do: krajDatum ? kratakDatum(krajDatum)
              : p.date_from && p.nights ? kratakDatum(new Date(Date.parse(p.date_from) + p.nights * 864e5).toISOString().slice(0, 10)) : '',
            osoba: String(pp.ukupno) })}>
          Uradi sam za isto
        </Button>
        {trello && (
          <Button key="trello" hotkey="t"
            onPress={() => pitaj($, `Stavi ponudu ${p.id.slice(0, 8)} (${ime(p)}, ${p.agencija}, polazak ${datum(p.date_from)}, ${cena(p)} po osobi${u ? `, ukupno za ${osobe} ~${val(u.ukupno_sa_preporucenim)}` : ''}) na Trello tablu u Predloge.`)}>
            Stavi u Trello
          </Button>
        )}
        <Button key="nazad" hotkey="b" onPress={() => idiNa($, { view: n.zemlja ? 'zemlja' : 'pocetna' })}>‹ Nazad</Button>
        <Link href={p.url} label="Sajt agencije" />
      </Box>
      {md.length > 0 && <Markdown text={md.join('\n')} />}
    </Box>,
  )
}
