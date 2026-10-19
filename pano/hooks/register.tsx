import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Detalji, Nav, Ponuda, ZemljeMapa } from '../types'

const PLUGIN = 'putesestvije-pano'
const PANE = 'putesestvije'

const nav = atom({ plugin: 'putesestvije-pano', key: 'nav' } as const, {
  view: 'pocetna', kontinent: '', zemlja: '', ponudaId: '', kriterijum: 'preporuka', strana: 0, sort: 'datum',
} as Nav)
const zemlje = atom({ plugin: 'putesestvije-pano', key: 'zemlje' } as const, {} as ZemljeMapa)
const top = atom({ plugin: 'putesestvije-pano', key: 'top' } as const, [] as Ponuda[])
const lista = atom({ plugin: 'putesestvije-pano', key: 'lista' } as const, [] as Ponuda[])
const ponuda = atom({ plugin: 'putesestvije-pano', key: 'ponuda' } as const, null as Ponuda | null)
const detalji = atom({ plugin: 'putesestvije-pano', key: 'detalji' } as const, null as Detalji | null)
const status = atom({ plugin: 'putesestvije-pano', key: 'status' } as const, '')

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
  return !p.destination || p.destination === p.zemlja ? p.title || p.destination : p.destination
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

async function pt($: any, args: string[], timeoutMs = 60000): Promise<any> {
  const bin = ((await $.store.get('ptPath')) as string | undefined) || 'pt'
  try {
    const r = await $.process.run([bin, '--json', ...args], { timeoutMs, env: { PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } })
    if (r.exitCode !== 0) {
      await update($, status, () => `⚠️ pt: ${(r.stderr || r.stdout).slice(0, 160)}`)
      return null
    }
    return JSON.parse(r.stdout)
  } catch (err) {
    await update($, status, () =>
      `⚠️ Ne mogu da pokrenem "${bin}". Instaliraj alat (pip install -e . u folderu Trip-planner) ili upiši putanju: /putovanja pt <putanja do pt>`)
    return null
  }
}

async function ucitajPocetnu($: any) {
  await update($, status, () => 'Učitavam ponude…')
  const z = await pt($, ['zemlje'])
  if (z) await update($, zemlje, () => z)
  const n = await read($, nav)
  const t = await pt($, ['top', n.kriterijum, '--limit', '12'])
  if (t) await update($, top, () => t.ponude as Ponuda[])
  if (z && t) await update($, status, () => '')
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
  const d = await pt($, ['ponuda', p.id.slice(0, 12), '--detalji'], 90000)
  const cur = await read($, nav)
  if (d && cur.ponudaId === p.id) {
    await update($, detalji, () => (d.sa_sajta ?? null) as Detalji | null)
    await update($, status, () => '')
  }
}

function pitaj($: any, text: string) {
  void $.prompt.submit({ text })
}

// ---------- registracija ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'putovanja',
      description: 'Otvori pano Putešestvije (ponude agencija po zemljama). /putovanja <zemlja> otvara zemlju.',
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

async function crtaj($: any, e: any) {
  const { Box, Text, Button, Select, Link, Markdown } = $.ui.resolve(e) as any
  const n = await read($, nav)
  const st = await read($, status)
  const z = await read($, zemlje)
  const cols: number = (e.props as any)?.bodyColumns ?? e.viewport?.columns ?? 70
  const rows = Math.max(12, (e.viewport?.rows ?? 34) - 4)
  const kratko = (s: string, k: number) => (s.length > k ? s.slice(0, Math.max(1, k - 1)) + '…' : s)
  const telefon = e.surface === 'mobile' // telefon nema Select: tamo su izbori dugmići
  const siroko = !telefon && cols >= 84 // dve kolone: levo navigacija, desno najbolje ponude
  const ukupno = Object.values(z).reduce((a, c) => a + Object.values(c).reduce((x, y) => x + y, 0), 0)

  const izaberiKriterijum = async (v: string) => {
    await idiNa($, { kriterijum: v })
    const r = await pt($, ['top', v, '--limit', '12'])
    if (r) await update($, top, () => r.ponude as Ponuda[])
  }
  const SORTOVI: [Nav['sort'], string][] = [['datum', '📅 datum'], ['cena', '💶 cena'], ['popust', '💸 popust']]

  const bedz = (pp: number) => (pp ? <Text backgroundColor="success" color="inverseText" bold> -{pp}% </Text> : null)

  // ----- zaglavlje: naziv aplikacije + putanja -----
  const zaglavlje = (
    <Box borderStyle="round" borderColor="claude" paddingX={1} flexDirection="row" justifyContent="space-between">
      <Box flexDirection="row" gap={1}>
        <Text bold color="claude">✈ PUTEŠESTVIJE</Text>
        <Button plain dimColor={n.view !== 'pocetna'} key="home" onPress={() => { void idiNa($, { view: 'pocetna' }); void ucitajPocetnu($) }}>
          🏠 Početna
        </Button>
        {n.kontinent && n.view !== 'pocetna' && (
          <Button plain dimColor={n.view !== 'kontinent'} key="nav-kont" onPress={() => idiNa($, { view: 'kontinent' })}>› {n.kontinent}</Button>
        )}
        {n.zemlja && (n.view === 'zemlja' || n.view === 'ponuda') && (
          <Button plain dimColor={n.view !== 'zemlja'} key="nav-zemlja" onPress={() => idiNa($, { view: 'zemlja' })}>› {n.zemlja}</Button>
        )}
      </Box>
      {!telefon && ukupno > 0 && <Text dimColor>{ukupno} ponuda</Text>}
    </Box>
  )
  const statusRed = st ? <Box paddingX={1}><Text color="warning">{st}</Text></Box> : null

  // ----- bočna kolona: najbolje ponude -----
  const najbolje = async (sirina: number, visina: number) => {
    const t = await read($, top)
    const kolikoStane = Math.max(3, Math.floor((visina - 4) / 2))
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1} width={telefon ? undefined : sirina}>
        {telefon ? (
          <Box flexDirection="column">
            <Text bold>⭐ Najbolje ponude</Text>
            <Box flexDirection="row" flexWrap="wrap" gap={1}>
              {KRITERIJUMI.map(([v, label]) => (
                <Button key={`kr-${v}`} variant={v === n.kriterijum ? 'primary' : 'secondary'}
                  onPress={() => izaberiKriterijum(v)}>{label}</Button>
              ))}
            </Box>
          </Box>
        ) : (
          <Select key="kriterijum" label="Najbolje" value={n.kriterijum}
            options={KRITERIJUMI.map(([value, label]) => ({ value, label }))}
            onSelect={izaberiKriterijum} />
        )}
        {t.length === 0 && <Text dimColor>Nema ponuda za ovaj kriterijum.</Text>}
        {t.slice(0, kolikoStane).map(p => {
          const c = cena(p)
          const w = sirina - 6
          return (
            <Box key={`tb-${p.id}`} flexDirection="column" marginTop={1} hover={{ backgroundColor: 'subtle' }}>
              <Box flexDirection="row" justifyContent="space-between">
                <Button plain key={`t-${p.id}`} onPress={() => otvoriPonudu($, p)}>
                  {IKONA[p.transport ?? ''] ?? '•'} <Text bold>{kratko(ime(p), Math.max(10, w - c.length - 4))}</Text>
                </Button>
                <Text bold color="success">{c}</Text>
              </Box>
              <Box flexDirection="row" gap={1}>
                {bedz(popust(p))}
                <Text dimColor>{kratko(`${p.zemlja} · ${p.agencija}${p.date_from ? ' · ' + datum(p.date_from) : ''}`, Math.max(10, w - (popust(p) ? 7 : 0)))}</Text>
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  }

  const okvir = async (glavno: any, sa: boolean) => {
    const strana = sa ? await najbolje(siroko ? Math.min(46, Math.floor(cols * 0.45)) : cols, siroko ? rows : Math.min(rows, 18)) : null
    return (
    <Box flexDirection="column">
      {zaglavlje}
      {statusRed}
      {sa && siroko ? (
        <Box flexDirection="row" gap={1}>
          <Box flexDirection="column" flexGrow={1}>{glavno}</Box>
          {strana}
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

  // ----- početna: kontinenti kao pločice -----
  if (n.view === 'pocetna') {
    const kontinenti = Object.entries(z)
    const sirinaLevo = siroko ? cols - Math.min(46, Math.floor(cols * 0.45)) - 1 : cols
    return okvir(
      <Box flexDirection="column">
        <Box paddingX={1} marginTop={1}><Text bold>🌍 Gde idemo?</Text></Box>
        {kontinenti.length === 0 && !st && <Box paddingX={1}><Text dimColor>Baza je prazna. Napiši Claude-u: „uradi sken agencija“.</Text></Box>}
        {kontinenti.map(([k, c], i) => {
          const ukK = Object.values(c).reduce((a, b) => a + b, 0)
          const zem = Object.entries(c).sort((a, b) => b[1] - a[1]).map(([x]) => x).join(', ')
          return (
            <Box key={`kb-${k}`} borderStyle="round" borderColor="subtle" hover={{ borderColor: 'claude' }}
              paddingX={1} flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Button plain key={`k-${k}`} hotkey={i < 9 ? String(i + 1) : undefined}
                  onPress={() => idiNa($, { view: 'kontinent', kontinent: k })}>
                  {KONT_IKONA[k] ?? '🧭'} <Text bold>{k}</Text>
                </Button>
                <Text color="claude">{ukK} ponuda</Text>
              </Box>
              <Text dimColor>{kratko(zem, Math.max(10, sirinaLevo - 6))}</Text>
            </Box>
          )
        })}
        <Box paddingX={1} marginTop={1}><Text dimColor italic>Klikni ili piši Claude-u ispod: „nešto jeftino za decembar?“</Text></Box>
      </Box>,
      true,
    )
  }

  // ----- kontinent: zemlje kao mreža pločica -----
  if (n.view === 'kontinent') {
    const zk = z[n.kontinent] ?? {}
    const lista = Object.entries(zk).sort((a, b) => b[1] - a[1])
    const sirinaLevo = siroko ? cols - Math.min(46, Math.floor(cols * 0.45)) - 1 : cols
    const plocica = Math.max(18, Math.floor((sirinaLevo - 1) / Math.max(1, Math.floor(sirinaLevo / 22))))
    return okvir(
      <Box flexDirection="column">
        <Box paddingX={1} marginTop={1}><Text bold>{KONT_IKONA[n.kontinent] ?? '🧭'} {n.kontinent}</Text><Text dimColor>  ·  {lista.length} zemalja</Text></Box>
        <Box flexDirection="row" flexWrap="wrap">
          {lista.map(([zemlja, c]) => (
            <Box key={`zb-${zemlja}`} width={telefon ? undefined : plocica} borderStyle="round" borderColor="subtle"
              hover={{ borderColor: 'claude' }} paddingX={1} flexDirection="column">
              <Button plain key={`z-${zemlja}`} onPress={() => otvoriZemlju($, zemlja)}>
                <Text bold>{kratko(zemlja, plocica - 4)}</Text>
              </Button>
              <Text color="claude">{c} {c === 1 ? 'ponuda' : 'ponuda'}</Text>
            </Box>
          ))}
        </Box>
      </Box>,
      true,
    )
  }

  // ----- zemlja: tabela tura -----
  if (n.view === 'zemlja') {
    const ture = grupisi(await read($, lista), n.sort)
    const naStr = Math.max(6, Math.min(NA_STRANI + 6, rows - 12))
    const odStr = n.strana * naStr
    const vidljive = ture.slice(odStr, odStr + naStr)
    const wDatum = 14, wCena = 12, wAg = telefon ? 0 : 13
    const wIme = Math.max(12, cols - wDatum - wCena - wAg - 10)
    return okvir(
      <Box flexDirection="column">
        <Box flexDirection={telefon ? 'column' : 'row'} justifyContent="space-between" paddingX={1} marginTop={1}>
          <Text><Text bold>📍 {n.zemlja}</Text><Text dimColor>  ·  {ture.length} aranžmana</Text></Text>
          {telefon ? (
            <Box flexDirection="row" gap={1}>
              {SORTOVI.map(([v, label]) => (
                <Button key={`sort-${v}`} variant={v === n.sort ? 'primary' : 'secondary'}
                  onPress={() => idiNa($, { sort: v, strana: 0 })}>{label}</Button>
              ))}
            </Box>
          ) : (
            <Select key="sort" label="Sortiraj" value={n.sort}
              options={SORTOVI.map(([value, label]) => ({ value, label }))}
              onSelect={(v: string) => idiNa($, { sort: v as Nav['sort'], strana: 0 })} />
          )}
        </Box>
        <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
          {!telefon && (
            <Box flexDirection="row">
              <Box width={wDatum}><Text dimColor bold>POLAZAK</Text></Box>
              <Box flexGrow={1}><Text dimColor bold>ARANŽMAN</Text></Box>
              <Box width={wCena} justifyContent="flex-end"><Text dimColor bold>CENA</Text></Box>
              <Box width={wAg} paddingLeft={2}><Text dimColor bold>AGENCIJA</Text></Box>
            </Box>
          )}
          {vidljive.length === 0 && <Text dimColor>{st ? '…' : 'Nema ponuda.'}</Text>}
          {vidljive.map(t => {
            const p = t.glavna
            const termini = new Set(t.svi.flatMap(x => x.svi_datumi)).size
            const cene = t.svi.map(x => x.price).filter(Boolean) as number[]
            const c = cene.length > 1 && Math.min(...cene) !== Math.max(...cene)
              ? `od ${Math.round(Math.min(...cene)).toLocaleString('de-DE')} ${p.currency === 'RSD' ? 'din' : '€'}`
              : cena(p)
            const pp = Math.max(...t.svi.map(popust))
            return (
              <Box key={`r-${p.id}`} flexDirection="row" hover={{ backgroundColor: 'subtle' }}>
                <Box width={wDatum}>
                  <Text>{datum(p.date_from).slice(0, 6)}{termini > 1 ? <Text color="suggestion"> +{termini - 1}</Text> : ''}</Text>
                </Box>
                <Box flexGrow={1}>
                  <Button plain key={`p-${p.id}`} onPress={() => otvoriPonudu($, p)}>
                    {IKONA[p.transport ?? ''] ?? '•'} {kratko(ime(p), wIme - (pp ? 6 : 0))}{pp ? <Text color="success"> -{pp}%</Text> : ''}
                  </Button>
                </Box>
                <Box width={wCena} justifyContent="flex-end"><Text bold color="success">{c}</Text></Box>
                {!telefon && <Box width={wAg} paddingLeft={2}><Text dimColor>{kratko(p.agencija, wAg - 2)}</Text></Box>}
              </Box>
            )
          })}
        </Box>
        <Box flexDirection="row" gap={2} paddingX={1}>
          {n.strana > 0 && <Button key="prev" onPress={() => idiNa($, { strana: n.strana - 1 })}>‹ Prethodne</Button>}
          {ture.length > naStr && <Text dimColor>strana {n.strana + 1}/{Math.ceil(ture.length / naStr)}</Text>}
          {odStr + naStr < ture.length && <Button key="next" onPress={() => idiNa($, { strana: n.strana + 1 })}>Sledeće ›</Button>}
          <Button key="ask-z" variant="primary"
            onPress={() => pitaj($, `Šta je najbolje od ponuda za ${n.zemlja}? Pogledaj pt --json zemlja "${n.zemlja}", proveri i Filip Travel, Ponte i Plana, i preporuči mi 3 sa kompromisima.`)}>
            💬 Pitaj Claude-a
          </Button>
        </Box>
      </Box>,
      false,
    )
  }

  // ----- ponuda: kartica sa detaljima -----
  const p = await read($, ponuda)
  const d = await read($, detalji)
  if (!p) return okvir(<Text dimColor>Izaberi ponudu.</Text>, true)
  const iste = (await read($, lista)).filter(x => x.agencija === p.agencija && baseUrl(x.url) === baseUrl(p.url) && x.title === p.title)
  const termini = (iste.length ? iste : [p]).flatMap(x => x.svi_datumi.map(dt => ({ dt, x })))
    .sort((a, b) => a.dt.localeCompare(b.dt))
  const md: string[] = []
  if (termini.length > 1) {
    md.push(`**Svi termini (${termini.length})**\n`)
    md.push('| Polazak | Noći | Cena |\n|---|---|---|')
    for (const { dt, x } of termini.slice(0, 20)) md.push(`| ${datum(dt)} | ${x.nights ?? ''} | ${cena(x)} |`)
  }
  if (d) {
    if (d.greska) md.push(`\n> ⚠️ ${d.greska}`)
    const sekcije: [keyof Detalji, string][] = [['opis', 'Ukratko'], ['obuhvata', 'Cena obuhvata'],
      ['ne_obuhvata', 'Cena ne obuhvata / doplate'], ['program', 'Program'], ['termini', 'Termini i cene sa sajta'],
      ['napomene', 'Napomene'], ['tekst', 'Sa stranice']]
    for (const [k, naslov] of sekcije) {
      const v = d[k]
      if (v) md.push(`\n**${naslov}**\n\n${k === 'opis' ? v : '- ' + String(v).split('\n').join('\n- ')}`)
    }
    if (d.provereno) md.push(`\n_Sa sajta agencije, provereno ${d.provereno}_`)
  }
  const cinjenica = (k: string, oznaka: string, vrednost: string, boja?: string) => (
    <Box key={k} borderStyle="round" borderColor="subtle" paddingX={1} flexDirection="column" flexGrow={1}>
      <Text dimColor>{oznaka}</Text>
      <Text bold color={boja}>{vrednost}</Text>
    </Box>
  )
  return okvir(
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="claude" paddingX={1} flexDirection="column" marginTop={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>{IKONA[p.transport ?? ''] ?? '•'} {kratko(p.title, cols - 20)}</Text>
          {bedz(popust(p))}
        </Box>
        <Text dimColor>{KONT_IKONA[p.kontinent] ?? ''} {p.zemlja} · {p.kontinent} · <Text color="claude">{p.agencija}</Text></Text>
        {p.note ? <Text color="warning">🔥 {p.note}</Text> : null}
      </Box>
      <Box flexDirection={telefon ? 'column' : 'row'} gap={telefon ? 0 : 1}>
        {cinjenica('f-polazak', 'Polazak', `${datum(p.date_from)}${p.date_to ? ' → ' + datum(p.date_to) : ''}`)}
        {cinjenica('f-noci', 'Noći', p.nights === 0 ? 'izlet' : String(p.nights ?? '?'))}
        {cinjenica('f-prevoz', 'Prevoz', p.transport ?? '?')}
        {cinjenica('f-cena', popust(p) ? `Cena (bilo ${Math.round(p.old_price!)})` : 'Cena po osobi', cena(p), 'success')}
      </Box>
      <Box flexDirection="row" gap={1} marginY={1}>
        <Button key="trello" variant="primary" hotkey="t"
          onPress={() => pitaj($, `Stavi ponudu ${p.id.slice(0, 8)} (${ime(p)}, ${p.agencija}, polazak ${datum(p.date_from)}, ${cena(p)}) u Trello listu 📬 Predlozi.`)}>
          📌 Stavi u Trello
        </Button>
        <Button key="uporedi" hotkey="u"
          onPress={() => pitaj($, `Uporedi ponudu ${p.id.slice(0, 8)} (${ime(p)}, ${p.agencija}, ${datum(p.date_from)}, ${cena(p)}) sa sličnim ponudama drugih agencija i sa "uradi sam" varijantom (let + smeštaj). Reci da li se isplati.`)}>
          🔍 Uporedi
        </Button>
        <Button key="nazad" hotkey="b" onPress={() => idiNa($, { view: n.zemlja ? 'zemlja' : 'pocetna' })}>↩ Nazad</Button>
        <Link href={p.url} label="🔗 Sajt agencije" />
      </Box>
      {md.length > 0 && <Box paddingX={1}><Markdown text={md.join('\n')} /></Box>}
    </Box>,
    false,
  )
}
