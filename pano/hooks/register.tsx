import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Detalji, Diy, Kalendar, Kombinacija, Nav, Obavestenja, Ponuda, Pracena, Stanje, Termin, ZemljeMapa } from '../types'

const PLUGIN = 'putesestvije-pano'
const PANE = 'putesestvije'

const nav = atom({ plugin: 'putesestvije-pano', key: 'nav' } as const, {
  view: 'pocetna', kontinent: '', zemlja: '', ponudaId: '', kriterijum: 'preporuka', strana: 0, sort: 'datum',
  mesec: '', kalStrana: 0,
  diy: { odakle: 'Beograd', kuda: '', od: '', do: '', osoba: '2' },
} as Nav)
const zemlje = atom({ plugin: 'putesestvije-pano', key: 'zemlje' } as const, {} as ZemljeMapa)
const top = atom({ plugin: 'putesestvije-pano', key: 'top' } as const, [] as Ponuda[])
const lista = atom({ plugin: 'putesestvije-pano', key: 'lista' } as const, [] as Ponuda[])
const ponuda = atom({ plugin: 'putesestvije-pano', key: 'ponuda' } as const, null as Ponuda | null)
const detalji = atom({ plugin: 'putesestvije-pano', key: 'detalji' } as const, null as Detalji | null)
const status = atom({ plugin: 'putesestvije-pano', key: 'status' } as const, '')
const kal = atom({ plugin: 'putesestvije-pano', key: 'kal' } as const, null as Kalendar | null)
const prac = atom({ plugin: 'putesestvije-pano', key: 'prac' } as const, [] as Pracena[])
const obav = atom({ plugin: 'putesestvije-pano', key: 'obav' } as const, null as Obavestenja | null)
const stanje = atom({ plugin: 'putesestvije-pano', key: 'stanje' } as const, null as Stanje | null)
const diyLista = atom({ plugin: 'putesestvije-pano', key: 'diyLista' } as const, [] as Kombinacija[])
const diyAgencije = atom({ plugin: 'putesestvije-pano', key: 'diyAgencije' } as const, [] as Ponuda[])

const KRITERIJUMI: [string, string][] = [
  ['preporuka', '⭐ Preporučeno za vas'],
  ['popust', '💸 Najveći popust'],
  ['jeftino', '💶 Najjeftinije'],
  ['specijal', '🔥 Specijalne / poslednja mesta'],
  ['uskoro', '⏰ Polazi uskoro'],
  ['izlet', '🚌 Izleti i vikendi'],
]
const IKONA: Record<string, string> = { avion: '✈', autobus: '🚌', sopstveni: '🚗' }
const NA_STRANI = 12

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

// "≈ 34 €" uz dinarske cene, da se porede sa ostalima
function uEvrima(p: Ponuda): string {
  return p.price && p.currency === 'RSD' ? `≈${Math.round(p.price / 117)} €` : ''
}

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
      ['✈ Avion · Google Flights', `https://www.google.com/travel/flights?q=${e(`Flights from ${od} to ${ku} on ${x.od} through ${x.do}`)}&hl=sr`],
      ['🧭 Svi prevozi · Rome2rio', `https://www.rome2rio.com/map/${e(od)}/${e(ku)}`],
      ['🚌 Autobus', `https://www.google.com/search?q=${e(`autobus ${od} ${ku} karte red vožnje`)}`],
      ['🚆 Voz', `https://www.google.com/search?q=${e(`voz ${od} ${ku} red vožnje cena karte`)}`],
      ['🚗 Autom · Google Maps', `https://www.google.com/maps/dir/?api=1&origin=${e(od)}&destination=${e(ku)}&travelmode=driving`],
    ],
    smestaj: [
      [`🛏 Booking · ${x.osoba} os.`, `https://www.booking.com/searchresults.html?ss=${e(ku)}&checkin=${x.od}&checkout=${x.do}&group_adults=${x.osoba}&no_rooms=1&group_children=0&lang=sr`],
      ['🔎 Trivago', `https://www.trivago.rs/sr/srl?search=${e(ku)}`],
      ['🏠 Airbnb', `https://www.airbnb.com/s/${e(ku)}/homes?checkin=${x.od}&checkout=${x.do}&adults=${x.osoba}`],
      ['🏨 Google hoteli', `https://www.google.com/travel/search?q=${e(`hoteli ${ku}`)}`],
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

// "1.799 €" ili "1.799–1.999 €" kad cena zavisi od datuma
function opseg(ts: Termin[]): string {
  const c = ts.map(t => t.cena).filter((x): x is number => !!x)
  if (!c.length) return 'na sajtu'
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

// koliko dugmića-datuma staje u širinu (sa cenom ~16 znakova, bez ~7)
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
  const kljuc = (t: Tura): number | string =>
    sort === 'cena' ? Math.min(...t.svi.map(eur)) : sort === 'popust' ? -Math.max(...t.svi.map(popust)) : t.glavna.date_from ?? '9999'
  return ture.sort((a, b) => {
    const x = kljuc(a), y = kljuc(b)
    return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
  })
}

// ---------- pozivi alata pt ----------

let OPCIJE: Record<string, unknown> = {}

async function pt($: any, args: string[], timeoutMs = 60000): Promise<any> {
  // redosled: /putovanja pt <putanja>, pa podešavanje plugina (upisuje ga install skripta), pa pt iz PATH-a
  const bin = ((await $.store.get('ptPath')) as string | undefined) || (OPCIJE.ptPath as string | undefined) || 'pt'
  try {
    const r = await $.process.run([bin, '--json', ...args], { timeoutMs, env: { PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } })
    if (r.exitCode !== 0) {
      await update($, status, () => `⚠️ pt: ${(r.stderr || r.stdout).slice(0, 160)}`)
      return null
    }
    return JSON.parse(r.stdout)
  } catch (err) {
    await update($, status, () =>
      `⚠️ Ne mogu da pokrenem "${bin}". Pokreni instalaciju ponovo (install.ps1 / install.sh u folderu Trip-planner) ili upiši putanju: /putovanja pt <putanja do pt>`)
    return null
  }
}

async function ucitajStanje($: any) {
  const s = await pt($, ['stanje'])
  if (s) await update($, stanje, () => s as Stanje)
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

async function ucitajPocetnu($: any) {
  void ucitajStanje($)
  await update($, status, () => 'Učitavam ponude…')
  const z = await pt($, ['zemlje'])
  if (z) await update($, zemlje, () => z)
  const n = await read($, nav)
  const t = await pt($, ['top', n.kriterijum, '--limit', '12'])
  if (t) await update($, top, () => t.ponude as Ponuda[])
  if (z && t) await update($, status, () => '')
  // obaveštenja: pad cene praćenih, nove ponude po vašim željama
  const o = (await pt($, ['obavestenja'])) as Obavestenja | null
  if (o) {
    const bilo = (await read($, obav))?.ukupno ?? 0
    await update($, obav, () => o)
    if (o.ukupno && o.ukupno !== bilo) {
      const delovi = [
        o.padovi.length ? `${o.padovi.length} pojeftinilo` : '',
        o.nestali.length ? `${o.nestali.length} nestalo` : '',
        o.nove_po_zeljama.length ? `${o.nove_po_zeljama.length} novo po vašim željama` : '',
      ].filter(Boolean)
      void $.ui.toast(`🔔 Putešestvije: ${delovi.join(', ')}. Otvori 👁 Praćenje.`)
    }
  }
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
  // viđeno: sledeći put se javlja samo ono što je novo posle ovoga
  void pt($, ['obavestenja', '--procitano'])
}

async function prebaciPracenje($: any, p: Ponuda) {
  const r = await pt($, ['prati', p.id.slice(0, 12)])
  if (!r) return
  await update($, ponuda, x => (x && x.id === p.id ? { ...x, pratim: !!r.pratim } : x))
  void $.ui.toast(r.pratim ? `👁 Pratim cenu: ${ime(p)}` : `Više ne pratim: ${ime(p)}`)
  const l = await pt($, ['prati'])
  if (l) await update($, prac, () => l as Pracena[])
}

async function idiNa($: any, patch: Partial<Nav>) {
  await update($, nav, n => ({ ...n, ...patch }))
}

async function otvoriZemlju($: any, zemlja: string) {
  await idiNa($, { view: 'zemlja', zemlja, strana: 0 })
  await update($, lista, () => [])
  await update($, status, () => `Učitavam ponude za ${zemlja}…`)
  const l = await pt($, ['zemlja', zemlja])
  if (l) {
    await update($, lista, () => l as Ponuda[])
    await update($, status, () => (l.length ? '' : `Nema ponuda za "${zemlja}" u bazi. Pitaj Claude-a da proveri i druge izvore.`))
  }
}

async function otvoriPonudu($: any, p: Ponuda) {
  await update($, ponuda, () => p)
  await update($, detalji, () => null)
  await idiNa($, { view: 'ponuda', ponudaId: p.id })
  await update($, status, () => `Čitam detalje sa sajta ${p.agencija}…`)
  const brzo = await pt($, ['ponuda', p.id.slice(0, 12)])
  if (brzo && (await read($, nav)).ponudaId === p.id) {
    await update($, ponuda, x => (x && x.id === p.id ? { ...x, termini: brzo.termini ?? x.termini, pratim: !!brzo.pratim,
      naziv: brzo.naziv ?? x.naziv, ukupno: brzo.ukupno ?? null } : x))
  }
  const d = await pt($, ['ponuda', p.id.slice(0, 12), '--detalji'], 90000)
  const cur = await read($, nav)
  if (d && cur.ponudaId === p.id) {
    await update($, detalji, () => (d.sa_sajta ?? null) as Detalji | null)
    await update($, ponuda, x => (x && x.id === p.id ? { ...x, ukupno: d.ukupno ?? x.ukupno ?? null } : x))
    await update($, status, () => '')
  }
}

function pitaj($: any, text: string) {
  void $.prompt.submit({ text })
}

// ---------- registracija ----------

export const register: Register = (on, options) => {
  OPCIJE = { ...(options ?? {}) }
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'putovanja',
      description: 'Otvori Putešestvije: ponude agencija po zemljama, kalendar, praćenje cena i Uradi sam (prevoz + smeštaj).',
      argumentHint: '[zemlja | pt <putanja>]',
    })
    return next(e)
  })

  on('command.run', { command: 'putovanja' }, async ($, e) => {
    const args = (e.args ?? '').trim()
    if (args.startsWith('pt ')) {
      await $.store.set('ptPath', args.slice(3).trim())
      return { text: `Putanja do alata pt sačuvana: ${args.slice(3).trim()}` }
    }
    // Telefon i uski ekrani ne otvaraju bočni pano: tada se aplikacija crta u razgovoru (CommandOutput ispod).
    const otvoren = await $.ui.open({ id: PANE, title: 'Putešestvije', focus: true, columns: 104 } as any)
    const uPanou = !!otvoren?.isPlaced
    if (args) void otvoriZemlju($, args)
    else {
      await idiNa($, { view: 'pocetna' })
      void ucitajPocetnu($)
    }
    return {
      text: uPanou
        ? (args ? `Otvoren pano Putešestvije: ${args}.` : 'Otvoren pano Putešestvije.')
        : 'Putešestvije',
      context: [
        'Korisnik je otvorio pano Putešestvije (ponude domaćih turističkih agencija po kontinentima i zemljama).',
        'Iz panoa stižu poruke kao "Stavi ponudu <ID> u Trello" ili "Uporedi ponudu <ID>". Radi ih po skillu putesestvije-planer:',
        'podaci iz `pt --json ponuda <ID> --detalji`, `pt --json zemlja <naziv>`, `pt --json top <kriterijum>`; Trello preko Trello MCP (lista 📬 Predlozi iz `pt --json profil`).',
        'Iz odeljka "🧭 Uradi sam" stiže zahtev za prevoz + smeštaj: radi ga po skillu uradi-sam i sačuvaj kombinacije sa `pt --json uradisam sacuvaj`.',
        'Klik na "Stavi u Trello" u panou je potvrda. Odgovaraj kratko, srpski latinica.',
      ],
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => crtaj($, e))

  // Gde nema bočnog panoa (telefon): ista aplikacija u redu ispod komande /putovanja.
  on('ui.render', { component: 'CommandOutput', props: { command: 'putovanja' } } as any, async ($, e: any, next: any) => {
    if (e.props?.text && e.props.text !== 'Putešestvije') return next(e)
    return crtaj($, e)
  })
}

const KONT_IKONA: Record<string, string> = {
  Evropa: '🏰', Azija: '🏯', Afrika: '🐘', 'Severna Amerika': '🗽', 'Južna Amerika': '🦜',
  'Karibi i Centralna Amerika': '🏝', Okeanija: '🦘', Ostalo: '🧭',
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
  const cols: number = (e.props as any)?.bodyColumns ?? e.viewport?.columns ?? 70
  const rows = Math.max(14, (e.viewport?.rows ?? 36) - 4)
  const kratko = (s: string, k: number) => (s.length > k ? s.slice(0, Math.max(1, k - 1)) + '…' : s)
  const telefon = e.surface === 'mobile' // telefon nema Select ni Input: tamo su izbori dugmići
  const siroko = !telefon && cols >= 84 // dve kolone: levo glavno, desno najbolje ponude
  const sirinaStrane = siroko ? Math.min(46, Math.floor(cols * 0.42)) : cols
  const sirinaGlavno = siroko ? cols - sirinaStrane - 1 : cols
  const ukupnoPonuda = Object.values(z).reduce((a, c) => a + Object.values(c).reduce((x, y) => x + y, 0), 0)
  const brojObav = ob?.ukupno ?? 0
  const odeljak = n.view === 'diy' ? 'diy' : n.view === 'pracenje' ? 'prac' : 'agencije'

  const izaberiKriterijum = async (v: string) => {
    await idiNa($, { kriterijum: v })
    const r = await pt($, ['top', v, '--limit', '12'])
    if (r) await update($, top, () => r.ponude as Ponuda[])
  }
  const SORTOVI: [Nav['sort'], string][] = [['datum', '📅 datum'], ['cena', '💶 cena'], ['popust', '💸 popust']]
  const bedz = (pp: number) => (pp ? <Text backgroundColor="success" color="inverseText" bold> -{pp}% </Text> : null)
  const naslov = (t: string, desno?: any) => (
    <Box flexDirection="row" justifyContent="space-between" paddingX={1} marginTop={1}>
      <Text bold>{t}</Text>
      {desno ?? null}
    </Box>
  )

  // red dugmića-datuma: klik otvara baš taj polazak; cena pored datuma kad se menja po datumu
  const datumiDugmad = (p: Ponuda, pre: string, max: number) => {
    const ts = termini(p)
    const varira = cenaVarira(ts)
    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
        <Text dimColor>📅</Text>
        {ts.slice(0, max).map((t, i) => (
          <Button plain dimColor key={`${pre}-${t.id}-${t.datum ?? 'x'}-${i}`} onPress={() => otvoriPonudu($, polazak(p, t))}>
            {kratakDatum(t.datum)}{varira ? <Text color="success"> {iznos(t.cena, t.valuta)}</Text> : ''}
          </Button>
        ))}
        {ts.length > max && <Text dimColor>+{ts.length - max}</Text>}
      </Box>
    )
  }

  // ===== zaglavlje: tri odeljka + svežina podataka =====
  const svezina = sk?.poslednji_sken
    ? sk.pre_dana === 0 ? 'sken danas' : sk.pre_dana === 1 ? 'sken juče' : `sken pre ${sk.pre_dana} dana`
    : 'nema skena'
  const staro = !sk?.poslednji_sken || (sk.pre_dana ?? 0) > 7
  const kartica = (key: string, label: any, aktivno: boolean, onPress: () => void, hotkey?: string) =>
    aktivno ? <Button key={key} variant="primary" hotkey={hotkey} onPress={onPress}>{label}</Button>
      : <Button plain dimColor key={key} hotkey={hotkey} onPress={onPress}>{label}</Button>
  const zaglavlje = (
    <Box borderStyle="round" borderColor="claude" paddingX={1} flexDirection={telefon ? 'column' : 'row'} justifyContent="space-between">
      <Box flexDirection="row" gap={2} flexWrap="wrap" alignItems="center">
        <Text bold color="claude">✈ PUTEŠESTVIJE</Text>
        {kartica('home', '🏢 Agencije', odeljak === 'agencije', () => { void idiNa($, { view: 'pocetna' }); void ucitajPocetnu($) }, 'a')}
        {kartica('diy', '🧭 Uradi sam', odeljak === 'diy', () => otvoriDiy($), 'd')}
        {kartica('prac', <Text>👁 Praćeno{brojObav ? <Text backgroundColor="warning" color="inverseText" bold> {brojObav} </Text> : ''}</Text>,
          odeljak === 'prac', () => otvoriPracenje($), 'p')}
      </Box>
      {!telefon && (
        <Text color={staro ? 'warning' : undefined} dimColor={!staro}>
          {ukupnoPonuda ? `${ukupnoPonuda} ponuda · ` : ''}{staro ? '⚠ ' : ''}{svezina}
        </Text>
      )}
    </Box>
  )
  // podnavigacija u Agencijama: destinacije / kalendar + putanja
  const podnav = odeljak === 'agencije' ? (
    <Box flexDirection="row" gap={1} paddingX={1} flexWrap="wrap">
      <Button plain dimColor={n.view !== 'pocetna'} key="nav-dest" onPress={() => idiNa($, { view: 'pocetna' })}>🌍 Destinacije</Button>
      {['kontinent', 'zemlja', 'ponuda'].includes(n.view) && n.kontinent && (
        <Button plain dimColor={n.view !== 'kontinent'} key="nav-kont" onPress={() => idiNa($, { view: 'kontinent' })}>› {n.kontinent}</Button>
      )}
      {(n.view === 'zemlja' || n.view === 'ponuda') && n.zemlja && (
        <Button plain dimColor={n.view !== 'zemlja'} key="nav-zemlja" onPress={() => idiNa($, { view: 'zemlja' })}>› {n.zemlja}</Button>
      )}
      <Text dimColor>│</Text>
      <Button plain dimColor={n.view !== 'kalendar'} key="kal" hotkey="k" onPress={() => otvoriKalendar($)}>📅 Kalendar</Button>
    </Box>
  ) : null
  const statusRed = st ? <Box paddingX={1}><Text color="warning">{st}</Text></Box> : null

  // ===== bočna kolona: najbolje ponude =====
  const najbolje = async (sirina: number, visina: number) => {
    const t = await read($, top)
    const kolikoStane = Math.max(3, Math.floor((visina - 5) / 4))
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1} width={telefon ? undefined : sirina}>
        {telefon ? (
          <Box flexDirection="column">
            <Text bold>⭐ Najbolje ponude</Text>
            <Box flexDirection="row" flexWrap="wrap" gap={1}>
              {KRITERIJUMI.map(([v, label]) => (
                <Button key={`kr-${v}`} variant={v === n.kriterijum ? 'primary' : 'secondary'} onPress={() => izaberiKriterijum(v)}>{label}</Button>
              ))}
            </Box>
          </Box>
        ) : (
          <Select key="kriterijum" label="Najbolje" value={n.kriterijum}
            options={KRITERIJUMI.map(([value, label]) => ({ value, label }))} onSelect={izaberiKriterijum} />
        )}
        {t.length === 0 && <Text dimColor>Nema ponuda za ovaj kriterijum.</Text>}
        {t.slice(0, kolikoStane).map(p => {
          const ts = termini(p)
          const c = opseg(ts)
          const w = sirina - 6
          const pp = Math.max(0, ...ts.map(x => (x.stara && x.cena && x.stara > x.cena ? Math.round((100 * (x.stara - x.cena)) / x.stara) : 0)))
          return (
            <Box flexDirection="column" marginTop={1}>
              <Box flexDirection="row" justifyContent="space-between">
                <Box flexShrink={1}>
                  <Button plain key={`t-${p.id}`} onPress={() => otvoriPonudu($, p)}>
                    {IKONA[p.transport ?? ''] ?? '·'} <Text bold>{kratko(ime(p), Math.max(10, w - c.length - 4))}</Text>
                  </Button>
                </Box>
                <Box flexShrink={0} paddingLeft={1}><Text bold color="success">{c}</Text></Box>
              </Box>
              <Box flexDirection="row" gap={1}>
                {bedz(pp)}
                <Text dimColor>{kratko(`${p.zemlja} · ${p.agencija}${p.nights ? ` · ${p.nights} noći` : ''}`, Math.max(10, w - (pp ? 7 : 0)))}</Text>
              </Box>
              {datumiDugmad(p, 'td', varijaDatuma(ts, w))}
            </Box>
          )
        })}
      </Box>
    )
  }

  const okvir = async (glavno: any, saStranom: boolean) => {
    const strana = saStranom ? await najbolje(siroko ? sirinaStrane : cols, siroko ? rows : Math.min(rows, 18)) : null
    return (
      <Box flexDirection="column">
        {zaglavlje}
        {podnav}
        {statusRed}
        {saStranom && siroko ? (
          <Box flexDirection="row" gap={1}>
            <Box flexDirection="column" width={sirinaGlavno} flexShrink={1} overflow="hidden">{glavno}</Box>
            <Box flexShrink={0}>{strana}</Box>
          </Box>
        ) : (
          <Box flexDirection="column" gap={1}>
            {glavno}
            {strana}
          </Box>
        )}
      </Box>
    )
  }

  // ===== AGENCIJE · početna: kontinenti kao pločice, dve u redu =====
  if (n.view === 'pocetna') {
    const kontinenti = Object.entries(z)
    const dve = !telefon && sirinaGlavno >= 56
    const wPl = dve ? Math.floor((sirinaGlavno - 1) / 2) : sirinaGlavno
    return okvir(
      <Box flexDirection="column">
        {naslov('🌍 Gde idemo?')}
        {kontinenti.length === 0 && !st && <Box paddingX={1}><Text dimColor>Baza je prazna. Napiši Claude-u: „uradi sken agencija“.</Text></Box>}
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          {kontinenti.map(([k, c], i) => {
            const ukK = Object.values(c).reduce((a, b) => a + b, 0)
            const zem = Object.entries(c).sort((a, b) => b[1] - a[1]).map(([x]) => x).filter(x => x !== 'Nepoznato').join(', ')
            return (
              <Box borderStyle="round" borderColor="subtle" paddingX={1} flexDirection="column" width={wPl}>
                <Box flexDirection="row" justifyContent="space-between">
                  <Button plain key={`k-${k}`} hotkey={i < 9 ? String(i + 1) : undefined} onPress={() => idiNa($, { view: 'kontinent', kontinent: k })}>
                    {KONT_IKONA[k] ?? '🧭'} <Text bold>{kratko(k, wPl - 10 - String(ukK).length)}</Text>
                  </Button>
                  <Text color="claude">{ukK}</Text>
                </Box>
                <Text dimColor>{kratko(zem || 'razno', wPl - 4)}</Text>
              </Box>
            )
          })}
        </Box>
        <Box paddingX={1} marginTop={1}><Text dimColor italic>Klikni, ili piši Claude-u ispod: „nešto jeftino za decembar?“</Text></Box>
      </Box>,
      true,
    )
  }

  // ===== AGENCIJE · kontinent: zemlje kao gusti spisak =====
  if (n.view === 'kontinent') {
    const spisak = Object.entries(z[n.kontinent] ?? {}).sort((a, b) => b[1] - a[1])
    return okvir(
      <Box flexDirection="column">
        {naslov(`${KONT_IKONA[n.kontinent] ?? '🧭'} ${n.kontinent}`, <Text dimColor>{spisak.length} zemalja · {spisak.reduce((a, [, c]) => a + c, 0)} ponuda</Text>)}
        <Box flexDirection="row" flexWrap="wrap" columnGap={3} borderStyle="round" borderColor="subtle" paddingX={1}>
          {spisak.map(([zemlja, c]) => (
            <Button plain key={`z-${zemlja}`} onPress={() => otvoriZemlju($, zemlja)}>
              <Text bold>{zemlja}</Text> <Text color="claude">{c}</Text>
            </Button>
          ))}
        </Box>
      </Box>,
      true,
    )
  }

  // ===== AGENCIJE · kalendar =====
  if (n.view === 'kalendar') {
    const k = await read($, kal)
    const dani = Object.entries(k?.dani ?? {})
    const mesto = Math.max(8, rows - 12)
    const strane: [string, Ponuda[]][][] = [[]]
    let zauzeto = 0
    for (const [d, lst] of dani) {
      const h = 2 + Math.min(lst.length, 5) + (lst.length > 5 ? 1 : 0)
      if (zauzeto + h > mesto && strane[strane.length - 1]!.length) { strane.push([]); zauzeto = 0 }
      strane[strane.length - 1]!.push([d, lst])
      zauzeto += h
    }
    const sp = Math.min(n.kalStrana, strane.length - 1)
    const naStrani = strane[sp] ?? []
    const wAg = telefon ? 0 : 13, wC = 11
    const wIme = Math.max(14, cols - wAg - wC - 10)
    const mIdx = Number((n.mesec || '2000-01').slice(5)) - 1
    const pr = k?.praznici ?? {}
    return okvir(
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap" columnGap={1} paddingX={1} marginTop={1}>
          {(k?.meseci ?? []).map(m => {
            const i = Number(m.mesec.slice(5)) - 1
            const label = `${MES_IME[i]}${i === 0 || m === k?.meseci[0] ? ' ' + m.mesec.slice(2, 4) : ''} ${m.broj}`
            return m.mesec === n.mesec || telefon
              ? <Button key={`m-${m.mesec}`} variant={m.mesec === n.mesec ? 'primary' : 'secondary'} onPress={() => otvoriKalendar($, m.mesec)}>{label}</Button>
              : <Button plain dimColor={m.broj === 0} key={`m-${m.mesec}`} onPress={() => otvoriKalendar($, m.mesec)}>{label}</Button>
          })}
        </Box>
        {naslov(`📅 ${MESECI_PUNO[mIdx] ?? ''} ${n.mesec.slice(0, 4)}`,
          <Text dimColor>{dani.reduce((a, [, l]) => a + l.length, 0)} polazaka{strane.length > 1 ? ` · strana ${sp + 1}/${strane.length}` : ''}</Text>)}
        {Object.keys(pr).length > 0 && (
          <Box paddingX={1}><Text color="claude">🎉 {Object.entries(pr).map(([d, ime]) => `${kratakDatum(d)} ${ime}`).join(' · ')}</Text></Box>
        )}
        <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
          {naStrani.length === 0 && <Text dimColor>{st ? '…' : 'Nema polazaka u ovom mesecu.'}</Text>}
          {naStrani.map(([d, lst], di) => {
            const dt = new Date(d + 'T12:00:00')
            const vikend = [0, 5, 6].includes(dt.getDay())
            return (
              <Box flexDirection="column" marginTop={di ? 1 : 0}>
                <Text bold color={pr[d] ? 'claude' : vikend ? 'suggestion' : undefined}>
                  {DAN[dt.getDay()]} {kratakDatum(d)}{pr[d] ? ` 🎉 ${pr[d]}` : ''} <Text dimColor>· {lst.length}</Text>
                </Text>
                {lst.slice(0, 5).map((p, i) => (
                  <Box flexDirection="row" paddingLeft={2}>
                    <Box flexGrow={1}>
                      <Button plain key={`kd-${p.id}-${d}-${i}`} onPress={() => otvoriPonudu($, p)}>
                        {IKONA[p.transport ?? ''] ?? '·'} {kratko(ime(p), Math.max(8, wIme - p.zemlja.length - 6))} <Text dimColor>{p.zemlja}{p.nights ? ` · ${p.nights}n` : ''}{p.ceo_mesec ? ' · dan po izboru' : ''}</Text>
                      </Button>
                    </Box>
                    <Box width={wC} justifyContent="flex-end"><Text bold color="success">{cena(p)}</Text></Box>
                    {!telefon && <Box width={wAg} paddingLeft={2}><Text dimColor>{kratko(p.agencija, wAg - 2)}</Text></Box>}
                  </Box>
                ))}
                {lst.length > 5 && <Box paddingLeft={2}><Text dimColor>+{lst.length - 5} još tog dana</Text></Box>}
              </Box>
            )
          })}
        </Box>
        <Box flexDirection="row" gap={2} paddingX={1}>
          {sp > 0 && <Button key="kprev" onPress={() => idiNa($, { kalStrana: sp - 1 })}>‹ Ranije</Button>}
          {sp < strane.length - 1 && <Button key="knext" onPress={() => idiNa($, { kalStrana: sp + 1 })}>Kasnije ›</Button>}
          <Button key="ask-kal" variant="primary"
            onPress={() => pitaj($, `Pogledaj polaske za ${MESECI_PUNO[mIdx]} ${n.mesec.slice(0, 4)} (pt --json kalendar ${n.mesec}) i predloži nam 3 najbolje opcije za vikend ili praznik, sa ukupnom cenom za dvoje.`)}>
            💬 Šta je najbolje ovog meseca?
          </Button>
        </Box>
      </Box>,
      false,
    )
  }

  // ===== PRAĆENO: obaveštenja + praćeni aranžmani =====
  if (n.view === 'pracenje') {
    const l = await read($, prac)
    const red = (p: Pracena, pre: string, desno: any) => (
      <Box flexDirection="row">
        <Box flexGrow={1}>
          <Button plain key={`${pre}-${p.id}`} onPress={() => otvoriPonudu($, p)}>
            {IKONA[p.transport ?? ''] ?? '·'} <Text bold>{kratko(ime(p), Math.max(14, cols - 44))}</Text> <Text dimColor>{p.agencija}</Text>
          </Button>
        </Box>
        <Box>{desno}</Box>
      </Box>
    )
    const iz = (v: number | null | undefined, p: Ponuda) => iznos(v ?? null, p.currency || 'EUR')
    return okvir(
      <Box flexDirection="column">
        {ob && ob.ukupno > 0 && (
          <Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1} marginTop={1}>
            <Text bold color="warning">🔔 Novo od poslednjeg pregleda</Text>
            {ob.padovi.map(p => red(p, 'ob-pad', <Text><Text dimColor strikethrough>{iz(p.javljena_cena, p)}</Text> <Text bold color="success">📉 {iz(p.cena_sada, p)}</Text></Text>))}
            {ob.nestali.map(p => red(p, 'ob-nest', <Text color="error">nestalo sa sajta</Text>))}
            {ob.nove_po_zeljama.slice(0, 10).map(p => red(p, 'ob-novo', <Text><Text color="suggestion">🆕 {p.zelja}</Text> <Text dimColor>{kratakDatum(p.date_from)}</Text> <Text bold color="success">{cena(p)}</Text></Text>))}
            {ob.nove_po_zeljama.length > 10 && <Text dimColor>+{ob.nove_po_zeljama.length - 10} još novih po vašim željama</Text>}
          </Box>
        )}
        {naslov(`👁 Pratite (${l.length})`, <Text dimColor>cene se proveravaju pri svakom skeniranju</Text>)}
        <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
          {l.length === 0 && <Text dimColor>Još ništa ne pratite. Otvori ponudu i klikni „👁 Prati cenu“: javiću kad pojeftini.</Text>}
          {l.map((p, i) => {
            const pr = p.promena ?? 0
            return (
              <Box flexDirection="column" marginTop={i ? 1 : 0}>
                {red(p, 'pr', !p.aktivno
                  ? <Text color="error">nema je više na sajtu</Text>
                  : <Text>{iz(p.cena_pocetna, p)} → <Text bold color={pr < 0 ? 'success' : pr > 0 ? 'error' : undefined}>{iz(p.cena_sada, p)}</Text>
                      {pr ? <Text color={pr < 0 ? 'success' : 'error'}> {pr < 0 ? '▼' : '▲'}{Math.abs(Math.round(pr))}</Text> : ''}</Text>)}
                {p.aktivno && termini(p).length > 0 && <Box paddingLeft={2}>{datumiDugmad(p, 'prd', varijaDatuma(termini(p), cols - 8))}</Box>}
              </Box>
            )
          })}
        </Box>
      </Box>,
      false,
    )
  }

  // ===== URADI SAM: prevoz + smeštaj =====
  if (n.view === 'diy') {
    const d = n.diy
    const x = diyIso(d)
    const lst = await read($, diyLista)
    const ag = await read($, diyAgencije)
    const lk = diyLinkovi(d)
    const polje = (key: keyof Diy, label: string, ph: string, sir: number, ucitaj = false) => telefon ? (
      <Text><Text dimColor>{label} </Text><Text bold>{d[key] || '—'}</Text></Text>
    ) : (
      <Box width={sir}>
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
      <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="subtle" paddingX={1}>
        <Text bold>{naslovK}</Text>
        {l.map(([label, href]) => <Link key={`ln-${label}`} href={href} label={label} />)}
      </Box>
    )
    return okvir(
      <Box flexDirection="column">
        <Box flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1} marginTop={1}>
          <Text bold>🧭 Uradi sam <Text dimColor>· prevoz i smeštaj po svom izboru, uporedo sa agencijama</Text></Text>
          <Box flexDirection={telefon ? 'column' : 'row'} columnGap={2} flexWrap="wrap" marginTop={1}>
            {polje('odakle', 'Odakle', 'Beograd', 28)}
            {polje('kuda', 'Kuda', 'grad ili zemlja', 34, true)}
          </Box>
          <Box flexDirection={telefon ? 'column' : 'row'} columnGap={2} flexWrap="wrap">
            {polje('od', 'Polazak', 'npr. 5.12.', 26)}
            {polje('do', 'Povratak', 'npr. 7.12.', 26)}
            {polje('osoba', 'Osoba', '2', 16)}
          </Box>
          <Text dimColor>
            {x.ok ? `✓ ${d.kuda} · ${datum(x.od)} – ${datum(x.do)} · ${x.osoba} os.`
              : telefon ? 'Na telefonu napiši Claude-u: „uradi sam Budimpešta 5.12.–7.12.“'
              : 'Upiši kuda i datume (npr. 5.12.), Enter potvrđuje polje.'}
          </Text>
        </Box>

        {x.ok && (
          <Box flexDirection={siroko ? 'row' : 'column'} gap={1}>
            {linkKolona('🚆 Kako stići', lk.prevoz)}
            {linkKolona(`🏨 Gde spavati · ${kratakDatum(x.od)}–${kratakDatum(x.do)}`, lk.smestaj)}
          </Box>
        )}
        {x.ok && (
          <Box paddingX={1}>
            <Button key="diy-trazi" variant="primary"
              onPress={() => pitaj($, `Uradi sam: ${d.odakle || 'Beograd'} → ${d.kuda}, ${datum(x.od)} – ${datum(x.do)}, ${x.osoba} osobe. Po skillu uradi-sam pronađi prevoz (avion, autobus, voz, auto) i smeštaj, sačuvaj 2–3 kombinacije sa ukupnom cenom (pt uradisam sacuvaj) i uporedi sa agencijama za istu destinaciju.`)}>
              💬 Claude, nađi najbolju kombinaciju
            </Button>
          </Box>
        )}

        {naslov(`📋 Sačuvane kombinacije${d.kuda ? ` · ${d.kuda}` : ''}`, lst.length ? <Text dimColor>{lst.length}</Text> : undefined)}
        <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
          {lst.length === 0 && <Text dimColor>Još nema. Klikni „💬 Claude, nađi najbolju kombinaciju“: Claude traži letove, autobuse, vozove i smeštaj i čuva ih ovde.</Text>}
          {lst.slice(0, 6).map((k, i) => (
            <Box flexDirection="column" marginTop={i ? 1 : 0}>
              <Box flexDirection="row" justifyContent="space-between">
                <Text bold>{k.naslov || k.kuda} <Text dimColor>{k.kuda} · {kratakDatum(k.od ?? null)}–{kratakDatum(k.do ?? null)}</Text></Text>
                <Text><Text bold color="success">{Math.round(k.ukupno).toLocaleString('de-DE')} €</Text><Text dimColor> · {Math.round(k.po_osobi)} €/os{k.nepotpuno ? ' · nepotpuno' : ''}</Text></Text>
              </Box>
              {[...k.prevoz.map(s => ({ s, ik: IKONA[s.tip === 'bus' ? 'autobus' : s.tip ?? ''] ?? (s.tip === 'voz' ? '🚆' : s.tip === 'auto' ? '🚗' : '·') })),
                ...k.smestaj.map(s => ({ s, ik: '🛏' })), ...k.ostalo.map(s => ({ s, ik: '+' }))].map(({ s, ik }) => (
                <Box flexDirection="row" paddingLeft={2} justifyContent="space-between">
                  <Text>{ik} {kratko([s.naziv, s.opis].filter(Boolean).join(' · ') || s.tip || '', Math.max(20, cols - 30))}{s.ocena ? <Text color="suggestion"> ★{s.ocena}</Text> : ''}</Text>
                  <Text dimColor>{s.cena ? `${Math.round(s.cena).toLocaleString('de-DE')} ${s.valuta === 'RSD' ? 'din' : '€'}` : '?'}</Text>
                </Box>
              ))}
              <Box flexDirection="row" gap={2} paddingLeft={2}>
                <Button plain dimColor key={`diy-trello-${k.id}`}
                  onPress={() => pitaj($, `Stavi uradi-sam kombinaciju ${k.id} (${k.naslov || k.kuda}, ${k.od}–${k.do}, ukupno ${Math.round(k.ukupno)} €) u Trello listu 📬 Predlozi, sa linkovima iz pt --json uradisam lista.`)}>📌 Trello</Button>
                <Button plain dimColor key={`diy-del-${k.id}`} onPress={async () => { await pt($, ['uradisam', 'obrisi', k.id]); await ucitajDiy($, (await read($, nav)).diy) }}>🗑 Obriši</Button>
                {[...k.prevoz, ...k.smestaj].filter(s => s.link).slice(0, 3).map((s, j) => (
                  <Link key={`diy-l-${k.id}-${j}`} href={s.link!} label={`🔗 ${kratko(s.naziv || s.tip || 'link', 18)}`} />
                ))}
              </Box>
            </Box>
          ))}
        </Box>

        {d.kuda.trim() !== '' && (
          <Box flexDirection="column">
            {naslov(`🏢 Agencije za ${d.kuda}`, <Text dimColor>za {x.osoba} os. + takse</Text>)}
            <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
              {agTop.length === 0 && <Text dimColor>Nijedna agencija trenutno nema ponudu za „{d.kuda}“.</Text>}
              {agTop.map(t => {
                const p = t.glavna
                const lo = Math.min(...t.svi.map(eur))
                const za = lo < 1e9 ? `${Math.round(lo * x.osoba).toLocaleString('de-DE')} €` : 'na sajtu'
                const blizu = x.ok && t.svi.some(s => s.date_from && Math.abs(Date.parse(s.date_from) - Date.parse(x.od)) < 4 * 864e5)
                return (
                  <Box flexDirection="row" justifyContent="space-between">
                    <Button plain key={`diy-ag-${p.id}`} onPress={() => otvoriPonudu($, p)}>
                      {IKONA[p.transport ?? ''] ?? '·'} <Text bold>{kratko(ime(p), Math.max(14, cols - 56))}</Text> <Text dimColor>{p.agencija} · {kratakDatum(p.date_from)}{p.nights ? ` · ${p.nights}n` : ''}</Text>{blizu ? <Text color="success"> ✓ tvoji datumi</Text> : ''}
                    </Button>
                    <Text bold color="success">{za}</Text>
                  </Box>
                )
              })}
            </Box>
          </Box>
        )}
      </Box>,
      false,
    )
  }

  // ===== AGENCIJE · zemlja: tabela tura =====
  if (n.view === 'zemlja') {
    const ture = grupisi(await read($, lista), n.sort)
    const naStr = Math.max(6, Math.min(16, Math.floor((rows - 10) / 1.5)))
    const odStr = n.strana * naStr
    const vidljive = ture.slice(odStr, odStr + naStr)
    const wDatum = 11, wCena = 18, wAg = telefon ? 0 : 13
    const wIme = Math.max(12, cols - wDatum - wCena - wAg - 10)
    return okvir(
      <Box flexDirection="column">
        <Box flexDirection={telefon ? 'column' : 'row'} justifyContent="space-between" paddingX={1} marginTop={1}>
          <Text><Text bold>📍 {n.zemlja}</Text><Text dimColor>  ·  {ture.length} aranžmana</Text></Text>
          {telefon ? (
            <Box flexDirection="row" gap={1}>
              {SORTOVI.map(([v, label]) => (
                <Button key={`sort-${v}`} variant={v === n.sort ? 'primary' : 'secondary'} onPress={() => idiNa($, { sort: v, strana: 0 })}>{label}</Button>
              ))}
            </Box>
          ) : (
            <Select key="sort" label="Sortiraj" value={n.sort} options={SORTOVI.map(([value, label]) => ({ value, label }))}
              onSelect={(v: string) => idiNa($, { sort: v as Nav['sort'], strana: 0 })} />
          )}
        </Box>
        <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
          {!telefon && (
            <Box flexDirection="row">
              <Box width={wDatum}><Text dimColor bold>POLAZAK</Text></Box>
              <Box flexGrow={1}><Text dimColor bold>ARANŽMAN</Text></Box>
              <Box width={wCena} justifyContent="flex-end"><Text dimColor bold>CENA / OS.</Text></Box>
              <Box width={wAg} paddingLeft={2}><Text dimColor bold>AGENCIJA</Text></Box>
            </Box>
          )}
          {vidljive.length === 0 && <Text dimColor>{st ? '…' : 'Nema ponuda.'}</Text>}
          {vidljive.map(t => {
            const p = t.glavna
            const ts = termini(p)
            const c = opseg(ts)
            const pp = Math.max(...t.svi.map(popust))
            return (
              <Box flexDirection="column">
                <Box flexDirection="row">
                  <Box width={wDatum}>
                    <Text>{kratakDatum(p.date_from)}{ts.length > 1 ? <Text color="suggestion"> +{ts.length - 1}</Text> : ''}</Text>
                  </Box>
                  <Box flexGrow={1}>
                    <Button plain key={`p-${p.id}`} onPress={() => otvoriPonudu($, p)}>
                      {IKONA[p.transport ?? ''] ?? '·'} <Text bold>{kratko(ime(p), wIme - (pp ? 6 : 0) - (p.nights ? 4 : 0))}</Text>{p.nights ? <Text dimColor> {p.nights}n</Text> : ''}{pp ? <Text color="success"> -{pp}%</Text> : ''}
                    </Button>
                  </Box>
                  <Box width={wCena} justifyContent="flex-end">
                    <Text><Text bold color="success">{c}</Text>{uEvrima(p) ? <Text dimColor> {uEvrima(p)}</Text> : ''}</Text>
                  </Box>
                  {!telefon && <Box width={wAg} paddingLeft={2}><Text dimColor>{kratko(p.agencija, wAg - 2)}</Text></Box>}
                </Box>
                {ts.length > 1 && <Box paddingLeft={telefon ? 0 : wDatum}>{datumiDugmad(p, 'zd', varijaDatuma(ts, cols - wDatum - 6) * 2)}</Box>}
              </Box>
            )
          })}
        </Box>
        <Box flexDirection="row" gap={2} paddingX={1}>
          {n.strana > 0 && <Button key="prev" onPress={() => idiNa($, { strana: n.strana - 1 })}>‹ Prethodne</Button>}
          {ture.length > naStr && <Text dimColor>strana {n.strana + 1}/{Math.ceil(ture.length / naStr)}</Text>}
          {odStr + naStr < ture.length && <Button key="next" onPress={() => idiNa($, { strana: n.strana + 1 })}>Sledeće ›</Button>}
          <Button key="ask-z" variant="primary"
            onPress={() => pitaj($, `Šta je najbolje od ponuda za ${n.zemlja}? Pogledaj pt --json zemlja "${n.zemlja}", proveri i Filip Travel, Ponte i Plana, i preporuči mi 3 sa kompromisima i ukupnom cenom za dvoje.`)}>
            💬 Pitaj Claude-a
          </Button>
        </Box>
      </Box>,
      false,
    )
  }

  // ===== AGENCIJE · ponuda =====
  const p = await read($, ponuda)
  const d = await read($, detalji)
  if (!p) return okvir(<Text dimColor>Izaberi ponudu.</Text>, true)
  const iste = (await read($, lista)).filter(x => x.agencija === p.agencija && baseUrl(x.url) === baseUrl(p.url) && x.title === p.title)
  const sviT: Termin[] = p.termini?.length ? p.termini : (iste.length ? iste : [p]).flatMap(termini)
    .sort((a, b) => (a.datum ?? '9999').localeCompare(b.datum ?? '9999'))
  const od = p.note === "cena 'od'"
  const napomena = p.note && !od && !p.note.startsWith('paket') ? p.note : ''
  const cinjenica = (oznaka: string, vrednost: string, boja?: string) => (
    <Box borderStyle="round" borderColor="subtle" paddingX={1} flexDirection="column" flexGrow={1}>
      <Text dimColor>{oznaka}</Text>
      <Text bold color={boja}>{vrednost}</Text>
    </Box>
  )
  // 💶 ukupno za sve putnike
  const u = p.ukupno
  const osobe = u?.osobe ?? sk?.putnika ?? 2
  const val = (v: number) => `${Math.round(v).toLocaleString('de-DE')} ${(u?.valuta ?? p.currency) === 'RSD' ? 'din' : '€'}`
  const obavezno = u?.stavke.filter(s => s.tip !== 'opciono') ?? []
  const opciono = u?.stavke.filter(s => s.tip === 'opciono') ?? []
  const ukupnoBox = p.price ? (
    <Box flexDirection="column" borderStyle="round" borderColor="success" paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>💶 Za {osobe === 2 ? 'vas dvoje' : `${osobe} osobe`} <Text dimColor>(procena)</Text></Text>
        <Text bold color="success">
          {u ? `~${val(u.ukupno_sa_preporucenim)}` : `${val(p.price * osobe)} + takse`}
        </Text>
      </Box>
      <Box flexDirection="row" justifyContent="space-between">
        <Text dimColor>  Aranžman {osobe} × {cena(p)}</Text><Text>{val(p.price * osobe)}</Text>
      </Box>
      {obavezno.map(s => (
        <Box flexDirection="row" justifyContent="space-between">
          <Text dimColor>  {kratko(s.naziv, 34)} <Text italic>{s.racun}</Text>{s.tip === 'preporučeno' ? ' · preporučeno' : ''}</Text>
          <Text>{s.valuta === (u?.valuta ?? p.currency) ? val(s.iznos) : `${Math.round(s.iznos)} ${s.valuta === 'RSD' ? 'din' : '€'}`}</Text>
        </Box>
      ))}
      {u && obavezno.length === 0 && <Text dimColor>  Na sajtu nisu navedene takse ni obavezne doplate.</Text>}
      {!u && <Text dimColor>  Čitam takse i doplate sa sajta…</Text>}
      {opciono.length > 0 && (
        <Text dimColor>  Fakultativno, nije uračunato: {opciono.slice(0, 5).map(s => `${kratko(s.naziv, 22)} ${Math.round(s.iznos)} €`).join(' · ')}</Text>
      )}
    </Box>
  ) : null

  const md: string[] = []
  if (sviT.length > 1) {
    md.push(`**Svi termini (${sviT.length})** · ${opseg(sviT)} po osobi\n`)
    md.push('| Polazak | Noći | Cena | |\n|---|---|---|---|')
    for (const t of sviT.slice(0, 20)) {
      const ovaj = t.datum === p.date_from && t.cena === p.price
      const stara = t.stara && t.cena && t.stara > t.cena ? ` ~~${Math.round(t.stara)}~~` : ''
      md.push(`| ${ovaj ? '**→ ' + datum(t.datum) + '**' : datum(t.datum)} | ${t.noci ?? ''} | ${iznos(t.cena, t.valuta)}${stara} | ${ovaj ? 'izabran' : ''} |`)
    }
  }
  if (d) {
    if (d.greska) md.push(`\n> ⚠️ ${d.greska}`)
    const sekcije: [keyof Detalji, string, number][] = [['opis', 'Ukratko', 4], ['termini', '📅 Polasci sa sajta', 8],
      ['sobe', '🛏 Cena po tipu sobe (ovaj polazak)', 6], ['obuhvata', '✅ Cena obuhvata', 8],
      ['ne_obuhvata', '➕ Ne obuhvata / doplate', 8], ['napomene', 'Napomene', 5], ['program', '🗺 Program', 10], ['tekst', 'Sa stranice', 8]]
    for (const [k, nas, max] of sekcije) {
      const v = d[k]
      if (!v) continue
      const linije = String(v).split('\n').map(x => x.replace(/^[\s*•\-–]+/, '').trim()).filter(Boolean)
      const telo = k === 'opis' ? kratko(linije.join(' '), 400) : linije.slice(0, max).map(x => `- ${kratko(x, k === 'program' ? 220 : 180)}`).join('\n')
      md.push(`\n**${nas}**\n\n${telo}${linije.length > max && k !== 'opis' ? `\n- _… još ${linije.length - max}, ceo tekst na sajtu agencije_` : ''}`)
    }
    if (d.provereno) md.push(`\n_Sa sajta agencije, provereno ${d.provereno.replace('T', ' ')}_`)
  }
  // kraj puta: iz ponude ili iz polazaka sa sajta ("21.10.2026. – 25.10.2026.")
  const izSajta = p.date_from ? (d?.termini ?? '').match(new RegExp(`${datum(p.date_from).replace(/\./g, '\\.')}\\s*–\\s*(\\d\\d)\\.(\\d\\d)\\.(\\d{4})`)) : null
  const krajDatum = p.date_to ?? (izSajta ? `${izSajta[3]}-${izSajta[2]}-${izSajta[1]}` : null)
  return okvir(
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="claude" paddingX={1} flexDirection="column" marginTop={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>{IKONA[p.transport ?? ''] ?? '·'} {kratko(ime(p), cols - 20)}</Text>
          {bedz(popust(p))}
        </Box>
        {ime(p) !== p.title && <Text dimColor>{kratko(p.title, cols - 6)}</Text>}
        <Text dimColor>{KONT_IKONA[p.kontinent] ?? ''} {p.zemlja} · {p.kontinent} · <Text color="claude">{p.agencija}</Text></Text>
        {napomena ? <Text color="warning">🔥 {napomena}</Text> : null}
      </Box>
      <Box flexDirection={telefon ? 'column' : 'row'} gap={telefon ? 0 : 1}>
        {cinjenica('Polazak', `${datum(p.date_from)}${krajDatum ? ' → ' + datum(krajDatum) : ''}`)}
        {cinjenica('Noći', p.nights === 0 ? 'izlet' : String(p.nights ?? '?'))}
        {cinjenica('Prevoz', p.transport ?? '?')}
        {cinjenica(popust(p) ? `Po osobi${od ? ' od' : ''} (bilo ${Math.round(p.old_price!)})` : `Po osobi${od ? ' od' : ''}`, `${cena(p)}${uEvrima(p) ? ' ' + uEvrima(p) : ''}`, 'success')}
      </Box>
      {ukupnoBox}
      {sviT.length > 1 && <Box paddingX={1}>{datumiDugmad({ ...p, termini: sviT }, 'pd', 16)}</Box>}
      <Box flexDirection="row" gap={1} marginY={1} flexWrap="wrap">
        <Button key="trello" variant="primary" hotkey="t"
          onPress={() => pitaj($, `Stavi ponudu ${p.id.slice(0, 8)} (${ime(p)}, ${p.agencija}, polazak ${datum(p.date_from)}, ${cena(p)} po osobi${u ? `, ukupno za ${osobe} ~${val(u.ukupno_sa_preporucenim)}` : ''}) u Trello listu 📬 Predlozi.`)}>
          📌 Stavi u Trello
        </Button>
        <Button key="prati" variant={p.pratim ? 'primary' : undefined} onPress={() => prebaciPracenje($, p)}>
          {p.pratim ? '✓ Pratim cenu' : '👁 Prati cenu'}
        </Button>
        <Button key="uporedi" hotkey="u"
          onPress={() => otvoriDiy($, { kuda: p.zemlja === 'Više zemalja' ? ime(p) : (ime(p).split(/[,–-]/)[0] ?? p.zemlja).trim(),
            od: p.date_from ? kratakDatum(p.date_from) : '', do: krajDatum ? kratakDatum(krajDatum)
              : p.date_from && p.nights ? kratakDatum(new Date(Date.parse(p.date_from) + p.nights * 864e5).toISOString().slice(0, 10)) : '' })}>
          🧭 Uradi sam za isto
        </Button>
        <Button key="nazad" hotkey="b" onPress={() => idiNa($, { view: n.zemlja ? 'zemlja' : 'pocetna' })}>↩ Nazad</Button>
        <Link href={p.url} label="🔗 Sajt agencije" />
      </Box>
      {md.length > 0 && <Box paddingX={1}><Markdown text={md.join('\n')} /></Box>}
    </Box>,
    false,
  )
}
