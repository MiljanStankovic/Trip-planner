import { expect, mock, test } from 'claude-code/testing'

const PONUDA = {
  id: 'abcdef1234567890', destination: 'Tajland Bangkok, Krabi i Puket', title: 'Tajland Bangkok, Krabi i Puket',
  date_from: '2026-11-08', date_to: '2026-11-20', nights: 12, transport: 'avion', price: 1549, old_price: 1899,
  currency: 'EUR', agencija: 'Jungle Tribe', zemlja: 'Tajland', kontinent: 'Azija',
  svi_datumi: ['2026-11-08'], url: 'https://www.jungletribe.rs/destinacije/azija/tajland/x', note: 'poslednja mesta',
}

function odgovor(argv: readonly string[]): string {
  const a = argv.slice(2)
  if (a[0] === 'zemlje') return JSON.stringify({ Evropa: { 'Španija': 46 }, Azija: { Tajland: 51, Maldivi: 74 } })
  if (a[0] === 'top') return JSON.stringify({ kriterijumi: {}, ponude: [{ ...PONUDA, zasto: '-18% (bilo 1899)' }] })
  if (a[0] === 'zemlja') return JSON.stringify([PONUDA, { ...PONUDA, id: 'zzz1', date_from: '2026-12-02', svi_datumi: ['2026-12-02'], price: 1649 }])
  if (a[0] === 'ponuda') return JSON.stringify({ ...PONUDA, sa_sajta: { opis: 'Avion, transferi, hoteli.', obuhvata: 'Avio karta\nHotel BB' } })
  return '{}'
}

const PANE = { component: 'Pane', requestId: 'putesestvije', props: { title: 'Putešestvije', isFocused: true, bodyColumns: 70 } } as const

test('pano: početna → kontinent → zemlja → ponuda → Trello', async ($, on) => {
  const poslato: string[] = []
  mock.store(on)
  on('process.run', async (_$, e: any) => ({
    value: { exitCode: 0, stdout: odgovor(e.argv), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }) as any)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as any)
  on('prompt.submit', async (_$, e) => {
    poslato.push(e.text)
    return { drop: 'test' } as any
  })

  const r = await $.command.run({ command: 'putovanja', args: '' } as any)
  expect(r.text).toContain('Putešestvije')

  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'putesestvije-pano', surface, ...PANE })
    const sacekaj = () => (surface === 'mobile' ? ui.redraw() : ui.advance(50))
    await sacekaj()
    expect(await ui.find({ key: 'k-Azija' })).toBeDefined()
    expect(await ui.find({ key: `t-${PONUDA.id}` })).toBeDefined()

    if (surface === 'mobile') {
      expect(await ui.find({ key: 'kr-popust' })).toBeDefined()
      await ui.press({ key: 'kr-popust' })
    }
    await ui.press({ key: 'k-Azija' })
    expect(await ui.find({ key: 'z-Tajland' })).toBeDefined()

    await ui.press({ key: 'z-Tajland' })
    await sacekaj()
    expect(await ui.find({ key: `p-${PONUDA.id}` })).toBeDefined()
    expect(await ui.find({ key: 'p-zzz1' })).toBeUndefined() // isti aranžman: jedan red, +1 termin
    if (surface === 'mobile') await ui.press({ key: 'sort-cena' })

    await ui.press({ key: `p-${PONUDA.id}` })
    await sacekaj()
    expect(await ui.find({ type: 'Markdown', text: /Cena obuhvata/ })).toBeDefined()
    expect(await ui.find({ type: 'Markdown', text: /Svi termini \(2\)/ })).toBeDefined()

    await ui.press({ key: 'trello' })
    expect(poslato.at(-1)).toContain('u Trello listu')

    await ui.press({ key: 'nazad' })
    expect(await ui.find({ key: `p-${PONUDA.id}` })).toBeDefined()
    await ui.press({ key: 'home' })
    await ui.unmount()
  }
})

test('telefon: bez bočnog panoa aplikacija se crta u razgovoru ispod /putovanja', async ($, on) => {
  mock.store(on)
  on('process.run', async (_$, e: any) => ({
    value: { exitCode: 0, stdout: odgovor(e.argv), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }) as any)
  on('ui.open', async () => ({ value: { isPlaced: false } }) as any)

  const r = await $.command.run({ command: 'putovanja', args: '' } as any)
  expect(r.text).toBe('Putešestvije')

  const ui = await $.ui.mount({
    plugin: 'putesestvije-pano', surface: 'mobile', component: 'CommandOutput',
    props: { command: 'putovanja', args: '', text: 'Putešestvije', isErrored: false } as any,
  })
  await ui.redraw()
  expect(await ui.find({ key: 'k-Azija' })).toBeDefined()
  expect(await ui.find({ key: 'kr-popust' })).toBeDefined()
  await ui.press({ key: 'k-Azija' })
  await ui.press({ key: 'z-Tajland' })
  await ui.redraw()
  expect(await ui.find({ key: `p-${PONUDA.id}` })).toBeDefined()
  await ui.unmount()
})

test('preporučeno: opseg cena, datumi sa cenom, klik na datum otvara taj polazak', async ($, on) => {
  const T = [
    { id: 'abcdef1234567890', datum: '2026-11-08', noci: 12, cena: 1549, stara: 1899, valuta: 'EUR' },
    { id: 'zzz1', datum: '2026-12-02', noci: 12, cena: 1649, stara: null, valuta: 'EUR' },
  ]
  mock.store(on)
  on('process.run', async (_$, e: any) => {
    const a = e.argv.slice(2)
    const out = a[0] === 'top' ? JSON.stringify({ ponude: [{ ...PONUDA, termini: T, zasto: 'x' }] })
      : a[0] === 'ponuda' ? JSON.stringify({ ...PONUDA, id: 'zzz1', sa_sajta: {} }) : odgovor(e.argv)
    return { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } as any
  })
  on('ui.open', async () => ({ value: { isPlaced: true } }) as any)
  await $.command.run({ command: 'putovanja', args: '' } as any)
  const ui = await $.ui.mount({ plugin: 'putesestvije-pano', surface: 'terminal', ...PANE, props: { ...PANE.props, bodyColumns: 110 } })
  await ui.advance(50)
  expect(await ui.find({ text: /1\.549–1\.649 €/ })).toBeDefined()
  const d = await ui.find({ key: 'td-zzz1-2026-12-02-1' })
  expect(d).toBeDefined()
  await ui.press({ key: 'td-zzz1-2026-12-02-1' })
  await ui.advance(50)
  expect(await ui.find({ type: 'Markdown', text: /→ 02\.12\.2026\./ })).toBeDefined()
  await ui.unmount()
})

test('kalendar i praćenje', async ($, on) => {
  const prac = { ...PONUDA, kljuc: 'k', cena_pocetna: 1649, cena_sada: 1549, javljena_cena: 1649, aktivno: true, promena: -100 }
  const pozivi: string[][] = []
  mock.store(on)
  on('process.run', async (_$, e: any) => {
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
  const ui = await $.ui.mount({ plugin: 'putesestvije-pano', surface: 'terminal', ...PANE })
  await ui.advance(50)
  await ui.press({ key: 'kal' })
  await ui.advance(50)
  expect(await ui.find({ key: `kd-${PONUDA.id}-2026-11-08-0` })).toBeDefined()
  await ui.press({ key: 'prac' })
  await ui.advance(50)
  expect(await ui.find({ key: `ob-pad-${PONUDA.id}` })).toBeDefined()
  expect(await ui.find({ key: `pr-${PONUDA.id}` })).toBeDefined()
  expect(pozivi.some(a => a[0] === 'obavestenja' && a[1] === '--procitano')).toBe(true)
  await ui.press({ key: `pr-${PONUDA.id}` })
  await ui.advance(50)
  await ui.press({ key: 'prati' })
  await ui.advance(50)
  expect(pozivi.some(a => a[0] === 'prati' && a[1] === PONUDA.id.slice(0, 12))).toBe(true)
  expect(await ui.find({ key: 'prati', text: /Pratim cenu/ })).toBeDefined()
  await ui.unmount()
})
