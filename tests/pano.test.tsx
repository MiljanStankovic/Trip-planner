import { expect, mock, test } from 'claude-code/testing'

const PONUDA = {
  id: 'abcdef1234567890', destination: 'Tajland Bangkok, Krabi i Puket', title: 'Tajland Bangkok, Krabi i Puket',
  date_from: '2026-11-08', date_to: '2026-11-20', nights: 12, transport: 'avion', price: 1549, old_price: 1899,
  currency: 'EUR', agencija: 'Jungle Tribe', zemlja: 'Tajland', kontinent: 'Azija',
  svi_datumi: ['2026-11-08'], url: 'https://www.jungletribe.rs/destinacije/azija/tajland/x', note: 'poslednja mesta',
  popusti: ['poslednja mesta'],
}
const IZVORI = {
  agencije: [
    { id: 'jungletribe', naziv: 'Jungle Tribe', sajt: 'https://www.jungletribe.rs/', ponuda: 470, skenirano: '2026-10-19T02:31:00', stanje: 'ok', greske: [] },
    { id: 'odeon', naziv: 'Odeon', sajt: 'https://www.odeontravel.rs/', ponuda: 22, skenirano: '2026-10-19T02:31:00', stanje: 'delimicno', greske: ['stranica „kruzne-ture” nije učitana'] },
  ],
  cita_claude: [{ id: 'filip', naziv: 'Filip Travel', sajt: 'https://www.filiptravel.rs/' }],
  poslednji_sken: '2026-10-19T02:31:00',
}

function odgovor(argv: readonly string[]): string {
  if (argv[1] === '--version') return '0.5.1'
  if (argv.includes('tool') && argv.includes('dir')) return '/u/bin'
  const a = argv.slice(2)
  if (a[0] === 'zemlje') return JSON.stringify({ Evropa: { 'Španija': 46 }, Azija: { Tajland: 51, Maldivi: 74 } })
  if (a[0] === 'top') return JSON.stringify({ kriterijumi: {}, ponude: [{ ...PONUDA, zasto: '-18% (bilo 1899)' }] })
  if (a[0] === 'zemlja') return JSON.stringify([PONUDA, { ...PONUDA, id: 'zzz1', date_from: '2026-12-02', svi_datumi: ['2026-12-02'], price: 1649 }])
  if (a[0] === 'ponuda') return JSON.stringify({ ...PONUDA, popusti: ['3. osoba: −10 €'], sa_sajta: { opis: 'Avion, transferi, hoteli.', obuhvata: 'Avio karta\nHotel BB' } })
  if (a[0] === 'izvori') return JSON.stringify(IZVORI)
  if (a[0] === 'popusti') return JSON.stringify({ [PONUDA.id]: ['deca do 12 god.: −20 €'] })
  if (a[0] === 'stanje') return JSON.stringify({ poslednji_sken: '2026-10-19T02:31:00', pre_dana: 0, ponuda: 171, agencija: 15, putnika: 2, odraslih: 2, dece: 0 })
  return '{}'
}
const ok = (argv: readonly string[]) => ({ value: { exitCode: 0, stdout: odgovor(argv), stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }) as any

// isti odgovori i za lokalni alat (process.run) i za server (http.fetch: JSON-RPC tools/call putovanja_podaci)
const adrese: string[] = []
function obe(on: any, h: (x: any, e: any) => Promise<any>) {
  on('process.run', h)
  on('http.fetch', async (_$: any, e: any) => {
    adrese.push(e.url)
    const { komanda, argumenti } = JSON.parse(e.init.body).params.arguments
    const r = await h(_$, { argv: ['pt', '--json', komanda, ...argumenti] })
    const rezultat = JSON.parse(r.value.stdout)
    const text = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [], structuredContent: { komanda, rezultat } } })
    return { value: { status: 200, ok: true, headers: {}, text } } as any
  })
}

const PANE = { component: 'Pane', requestId: 'putovanja', props: { title: 'Putovanja', isFocused: true, bodyColumns: 150 } } as const

test('pano (široko): destinacije levo, tabla, izvori kao poseban ekran; klik na red otvara ponudu', async ($, on) => {
  mock.store(on)
  obe(on, async (_$, e: any) => ok(e.argv))
  on('ui.open', async () => ({ value: { isPlaced: true } }) as any)
  const r = await $.command.run({ command: 'putovanja', args: '' } as any)
  expect(r.text).toContain('Putovanja')
  const r2 = await $.command.run({ command: 'putovanja:pano', args: '' } as any) // isti pano iz commands/pano.md
  expect(r2.text).toContain('Putovanja')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'putovanja', surface, ...PANE })
    await ui.advance(50)
    expect(await ui.find({ key: 'nk-Azija' })).toBeDefined()
    expect(await ui.find({ key: `b1-${PONUDA.id}` })).toBeDefined()
    expect(await ui.find({ key: `b2-${PONUDA.id}` })).toBeDefined()
    expect(await ui.find({ text: /agencij[ae] sa greškom/ })).toBeDefined() // podnožje: stanje izvora u jednom redu
    expect(await ui.find({ text: /✈ avion/ })).toBeDefined() // prevoz se uvek vidi
    expect(await ui.find({ text: /€ za 2/ })).toBeDefined() // ukupno za putnike

    expect(await ui.find({ text: /Preporučeno za tebe/ })).toBeDefined()
    expect(await ui.find({ key: 'nz-Španija' })).toBeDefined() // prvi kontinent je otvoren, zemlje se vide odmah
    await ui.press({ key: 'm-putnici' }) // izbor putnika radi mišem: dugme pa čipovi
    await ui.press({ key: 'put-2+1' })
    await ui.advance(20)
    expect(await ui.find({ text: /€ za 3/ })).toBeDefined() // promena putnika menja ukupno na tabli
    await ui.press({ key: 'm-sort' })
    await ui.press({ key: 'sort-cena' })
    await ui.press({ key: 'nk-Azija' })
    await ui.advance(50)
    expect(await ui.find({ key: 'nz-Tajland' })).toBeDefined()
    expect(await ui.find({ text: /Preporučeno za tebe/ })).toBeDefined() // klik na kontinent samo otvara zemlje
    await ui.press({ key: 'nz-Tajland' })
    await ui.advance(50)
    expect(await ui.find({ key: `b1-${PONUDA.id}` })).toBeDefined()
    expect(await ui.find({ key: 'b1-zzz1' })).toBeUndefined() // isti aranžman: jedan red, 2 polaska
    expect(await ui.find({ text: /poslednja mesta/ })).toBeDefined() // jedna napomena ispod naziva
    expect(await ui.find({ text: /Najjeftinije/ })).toBeDefined() // isti redosled kao na početnoj

    await ui.press({ key: `b2-${PONUDA.id}` }) // i drugi red reda otvara ponudu
    await ui.advance(50)
    expect(await ui.find({ type: 'Markdown', text: /Cena obuhvata/ })).toBeDefined()
    expect(await ui.find({ type: 'Markdown', text: /Svi polasci \(2\)/ })).toBeDefined()
    expect(await ui.find({ text: /3\. osoba: −10 €/ })).toBeDefined()
    expect(await ui.find({ text: /deca do 12 god/ })).toBeDefined() // popusti za više osoba iz pozadine su u detalju
    expect(await ui.find({ key: 'trello' })).toBeUndefined() // bez dodatka nema Trella

    await ui.press({ key: 'nazad' })
    expect(await ui.find({ key: `b1-${PONUDA.id}` })).toBeDefined()
    await ui.press({ key: 't-izv' }) // izvori i konektori su poseban ekran
    expect(await ui.find({ text: /Odeon/ })).toBeDefined()
    expect(await ui.find({ text: /Konektori/i })).toBeDefined()
    await ui.press({ key: 't-ag' })
    await ui.press({ key: 'm-putnici' })
    await ui.press({ key: 'put-2+0' })
    await ui.press({ key: 'nk-Evropa' }) // sledeća površina kreće od istog stanja
    await ui.unmount()
  }
})

test('usko (80 kolona): destinacije levo, stanje izvora u podnožju', async ($, on) => {
  mock.store(on)
  obe(on, async (_$, e: any) => ok(e.argv))
  on('ui.open', async () => ({ value: { isPlaced: true } }) as any)
  await $.command.run({ command: 'putovanja', args: '' } as any)
  const ui = await $.ui.mount({ plugin: 'putovanja', surface: 'terminal', ...PANE, props: { ...PANE.props, bodyColumns: 80 } })
  await ui.advance(50)
  expect(await ui.find({ key: 'nk-Azija' })).toBeDefined()
  expect(await ui.find({ text: /konektori 0\/4/ })).toBeDefined()
  await ui.unmount()
})

test('telefon: bez bočnog panoa aplikacija se crta u razgovoru ispod /putovanja', async ($, on) => {
  mock.store(on)
  obe(on, async (_$, e: any) => ok(e.argv))
  on('ui.open', async () => ({ value: { isPlaced: false } }) as any)
  const r = await $.command.run({ command: 'putovanja', args: '' } as any)
  expect(r.text).toBe('Putovanja')
  const ui = await $.ui.mount({
    plugin: 'putovanja', surface: 'mobile', component: 'CommandOutput',
    props: { command: 'putovanja', args: '', text: 'Putovanja', isErrored: false } as any,
  })
  await ui.redraw()
  expect(await ui.find({ key: 'pk-Azija' })).toBeDefined()
  await ui.press({ key: 'pk-Azija' })
  await ui.redraw()
  await ui.press({ key: 'kz-Tajland' })
  await ui.redraw()
  expect(await ui.find({ key: `b1-${PONUDA.id}` })).toBeDefined()
  await ui.unmount()
})

test('ponuda: opseg cena na tabli, klik na datum otvara taj polazak', async ($, on) => {
  const T = [
    { id: 'abcdef1234567890', datum: '2026-11-08', noci: 12, cena: 1549, stara: 1899, valuta: 'EUR' },
    { id: 'zzz1', datum: '2026-12-02', noci: 12, cena: 1649, stara: null, valuta: 'EUR' },
  ]
  mock.store(on)
  obe(on, async (_$, e: any) => {
    const a = e.argv.slice(2)
    if (a[0] === 'top') return { value: { exitCode: 0, stdout: JSON.stringify({ ponude: [{ ...PONUDA, termini: T, zasto: 'x' }] }), stderr: '' } } as any
    if (a[0] === 'ponuda') return { value: { exitCode: 0, stdout: JSON.stringify({ ...PONUDA, id: a[1] === 'zzz1' ? 'zzz1' : PONUDA.id, date_from: a[1] === 'zzz1' ? '2026-12-02' : PONUDA.date_from, termini: T, sa_sajta: {} }), stderr: '' } } as any
    return ok(e.argv)
  })
  on('ui.open', async () => ({ value: { isPlaced: true } }) as any)
  await $.command.run({ command: 'putovanja', args: '' } as any)
  const ui = await $.ui.mount({ plugin: 'putovanja', surface: 'terminal', ...PANE })
  await ui.advance(50)
  expect(await ui.find({ text: /od 1\.549 €/ })).toBeDefined()
  await ui.press({ key: `b1-${PONUDA.id}` })
  await ui.advance(50)
  await ui.press({ key: 'pd-zzz1-2026-12-02-1' })
  await ui.advance(50)
  expect(await ui.find({ type: 'Markdown', text: /→ 02\.12\.2026\./ })).toBeDefined()
  await ui.unmount()
})

test('kalendar i praćenje', async ($, on) => {
  const prac = { ...PONUDA, kljuc: 'k', cena_pocetna: 1649, cena_sada: 1549, javljena_cena: 1649, aktivno: true, promena: -100 }
  const pozivi: string[][] = []
  mock.store(on)
  obe(on, async (_$, e: any) => {
    const a = e.argv.slice(2)
    pozivi.push(a)
    const out = a[0] === 'kalendar' ? JSON.stringify({ mesec: '2026-11', meseci: [{ mesec: '2026-11', broj: 1 }, { mesec: '2026-12', broj: 0 }], dani: { '2026-11-08': [PONUDA] } })
      : a[0] === 'obavestenja' ? JSON.stringify({ padovi: [prac], nestali: [], nove_po_zeljama: [], ukupno: 1 })
      : a[0] === 'prati' ? (a[1] ? JSON.stringify({ id: PONUDA.id, pratim: true }) : JSON.stringify([prac]))
      : odgovor(e.argv)
    return { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as any
  })
  on('ui.open', async () => ({ value: { isPlaced: true } }) as any)
  await $.command.run({ command: 'putovanja', args: '' } as any)
  const ui = await $.ui.mount({ plugin: 'putovanja', surface: 'terminal', ...PANE })
  await ui.advance(50)
  await ui.press({ key: 't-kal' })
  await ui.advance(50)
  expect(await ui.find({ key: `kd-${PONUDA.id}-2026-11-08-0` })).toBeDefined()
  await ui.press({ key: 't-pr' })
  await ui.advance(50)
  expect(await ui.find({ key: `ob-pad-b-${PONUDA.id}` })).toBeDefined()
  expect(await ui.find({ key: `pr-b-${PONUDA.id}` })).toBeDefined()
  expect(pozivi.some(a => a[0] === 'obavestenja' && a[1] === '--procitano')).toBe(true)
  await ui.press({ key: `pr-b-${PONUDA.id}` })
  await ui.advance(50)
  await ui.press({ key: 'prati' })
  await ui.advance(50)
  expect(pozivi.some(a => a[0] === 'prati' && a[1] === PONUDA.id)).toBe(true)
  expect(await ui.find({ key: 'prati', text: /Pratim cenu/ })).toBeDefined()
  await ui.unmount()
})

test('uradi sam: forma, linkovi, zahtev Claude-u; ponuda: ukupno za izabrane putnike', async ($, on) => {
  const poslato: string[] = []
  const komb = [{ id: 'k1', kuda: 'Budimpešta', od: '2026-12-05', do: '2026-12-07', osoba: 2, naslov: 'Voz + hotel',
    prevoz: [{ tip: 'voz', opis: 'Soko + MÁV', cena: 64, valuta: 'EUR' }], smestaj: [{ naziv: 'Hotel M', cena: 212, valuta: 'EUR' }],
    ostalo: [], ukupno: 276, po_osobi: 138, nepotpuno: false }]
  const uk = { osobe: 2, valuta: 'EUR', osnovno: 3098, stavke: [{ naziv: 'Boravišna taksa', iznos: 24, valuta: 'EUR', racun: '1 € × 12 noći × 2 os.', tip: 'obavezno', izvor: '' }],
    ukupno: 3122, ukupno_sa_preporucenim: 3122, napomena: '' }
  mock.store(on)
  obe(on, async (_$, e: any) => {
    const a = e.argv.slice(2)
    const out = a[0] === 'uradisam' ? JSON.stringify(komb) : a[0] === 'ponuda' ? JSON.stringify({ ...PONUDA, ukupno: uk, sa_sajta: {} }) : odgovor(e.argv)
    return { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as any
  })
  on('ui.open', async () => ({ value: { isPlaced: true } }) as any)
  on('prompt.submit', async (_$, e) => { poslato.push(e.text); return { drop: 't' } as any })
  await $.command.run({ command: 'putovanja', args: '' } as any)
  const ui = await $.ui.mount({ plugin: 'putovanja', surface: 'terminal', ...PANE })
  await ui.advance(50)
  await ui.press({ key: 't-diy' })
  await ui.input({ key: 'diy-kuda', text: 'Budimpešta' })
  await ui.input({ key: 'diy-od', text: '5.12.2026' })
  await ui.input({ key: 'diy-do', text: '7.12.2026' })
  await ui.advance(50)
  const linkovi = await ui.findAll({ type: 'Link' })
  expect(linkovi.some((l: any) => /booking\.com.*checkin=2026-12-05.*checkout=2026-12-07.*group_adults=2/.test(JSON.stringify(l)))).toBe(true)
  expect(await ui.find({ text: /Voz \+ hotel/ })).toBeDefined()
  expect(await ui.find({ text: /138 € po osobi/ })).toBeDefined()
  await ui.press({ key: 'diy-trazi' })
  expect(poslato.at(-1)).toContain('Budimpešta')
  expect(poslato.at(-1)).toContain('uradi-sam')
  await ui.press({ key: `diy-ag-${PONUDA.id}` })
  await ui.advance(50)
  expect(await ui.find({ text: /Ukupno za 2 odrasla/ })).toBeDefined()
  expect(await ui.find({ text: /3\.122 €/ })).toBeDefined()
  await ui.unmount()
})

test('alat iz podešavanja plugina (ptPath) ima prednost', { options: { ptPath: 'C:/alat/putovanja.exe' } } as any, async ($, on) => {
  const pokrenuto: string[] = []
  mock.store(on)
  on('process.run', async (_$, e: any) => { pokrenuto.push(e.argv[0]); return ok(e.argv) })
  on('ui.open', async () => ({ value: { isPlaced: true } }) as any)
  await $.command.run({ command: 'putovanja', args: '' } as any)
  const ui = await $.ui.mount({ plugin: 'putovanja', surface: 'terminal', ...PANE })
  await ui.advance(50)
  expect(pokrenuto.length).toBeGreaterThan(0)
  expect(pokrenuto.every(b => b === 'C:/alat/putovanja.exe')).toBe(true)
  await ui.unmount()
})

test('lokalno bez ptPath: pano nađe uv i pokreće alat iz uv-ovog foldera', { options: { lokalno: true } } as any, async ($, on) => {
  const pokrenuto: string[][] = []
  mock.store(on)
  on('process.run', async (_$, e: any) => { pokrenuto.push([...e.argv]); return ok(e.argv) })
  on('ui.open', async () => ({ value: { isPlaced: true } }) as any)
  await $.command.run({ command: 'putovanja', args: '' } as any)
  const ui = await $.ui.mount({ plugin: 'putovanja', surface: 'terminal', ...PANE })
  await ui.advance(50)
  expect(pokrenuto.some(a => a[0] === '/u/bin/putovanja' && a[1] === '--json')).toBe(true)
  expect(pokrenuto.some(a => a.includes('install'))).toBe(false) // verzija se poklapa: bez reinstalacije
  await ui.unmount()
})

test('podrazumevano: podaci sa servera, bez lokalnog alata; lična adresa iz podešavanja', { options: { adresa: 'https://putovanja.miljan-stankovic99.workers.dev/mcp/test-kljuc-123' } } as any, async ($, on) => {
  const pokrenuto: string[][] = []
  adrese.length = 0
  mock.store(on)
  obe(on, async (_$: any, e: any) => { if (e.argv[0] !== 'pt') pokrenuto.push([...e.argv]); return ok(e.argv) })
  on('ui.open', async () => ({ value: { isPlaced: true } }) as any)
  await $.command.run({ command: 'putovanja', args: '' } as any)
  const ui = await $.ui.mount({ plugin: 'putovanja', surface: 'terminal', ...PANE })
  await ui.advance(50)
  expect(await ui.find({ key: `b1-${PONUDA.id}` })).toBeDefined()
  expect(adrese.length).toBeGreaterThan(0)
  expect(adrese.every(a => a.endsWith('/mcp/test-kljuc-123'))).toBe(true)
  expect(pokrenuto.length).toBe(0)
  await ui.unmount()
})
