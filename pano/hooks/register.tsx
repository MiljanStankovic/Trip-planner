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
    const r = await $.process.run([bin, '--json', ...args], { timeoutMs })
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
    await $.ui.open({ id: PANE, title: 'Putešestvije', focus: true, columns: 72 } as any)
    if (args) void otvoriZemlju($, args)
    else {
      await idiNa($, { view: 'pocetna' })
      void ucitajPocetnu($)
    }
    return {
      text: args ? `Otvoren pano Putešestvije: ${args}.` : 'Otvoren pano Putešestvije.',
      context: [
        'Korisnik je otvorio pano Putešestvije (ponude domaćih turističkih agencija po kontinentima i zemljama).',
        'Iz panoa stižu poruke kao "Stavi ponudu <ID> u Trello" ili "Uporedi ponudu <ID>". Radi ih po skillu putesestvije-planer:',
        'podaci iz `pt --json ponuda <ID> --detalji`, `pt --json zemlja <naziv>`, `pt --json top <kriterijum>`; Trello preko Trello MCP (lista 📬 Predlozi iz `pt --json profil`).',
        'Klik na "Stavi u Trello" u panou je potvrda. Odgovaraj kratko, srpski latinica.',
      ],
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Select, Link, Markdown } = $.ui.resolve(e) as any
    const n = await read($, nav)
    const st = await read($, status)
    const cols = (e.props as any)?.bodyColumns ?? e.viewport?.columns ?? 70
    const rows = Math.max(10, (e.viewport?.rows ?? 30) - 6)
    const kratko = (s: string, k: number) => (s.length > k ? s.slice(0, k - 1) + '…' : s)

    const zaglavlje = (
      <Box flexDirection="row" gap={1}>
        <Button plain key="home" onPress={() => { void idiNa($, { view: 'pocetna' }); void ucitajPocetnu($) }}>🏠 Početna</Button>
        {n.kontinent && n.view !== 'pocetna' && (
          <Button plain dimColor key="nav-kont" onPress={() => idiNa($, { view: 'kontinent' })}>› {n.kontinent}</Button>
        )}
        {n.zemlja && (n.view === 'zemlja' || n.view === 'ponuda') && (
          <Button plain dimColor key="nav-zemlja" onPress={() => idiNa($, { view: 'zemlja' })}>› {n.zemlja}</Button>
        )}
      </Box>
    )
    const statusRed = st ? <Text color="yellow">{st}</Text> : null

    // ----- početna: kontinenti + najbolje ponude -----
    if (n.view === 'pocetna') {
      const z = await read($, zemlje)
      const t = await read($, top)
      const kontinenti = Object.entries(z)
      return (
        <Box flexDirection="column" gap={1}>
          {zaglavlje}
          {statusRed}
          <Box flexDirection="column">
            <Text bold>🌍 Kontinenti</Text>
            {kontinenti.map(([k, c], i) => (
              <Button plain key={`k-${k}`} hotkey={i < 9 ? String(i + 1) : undefined}
                onPress={() => idiNa($, { view: 'kontinent', kontinent: k })}>
                {k} <Text dimColor>({Object.values(c).reduce((a, b) => a + b, 0)})</Text>
              </Button>
            ))}
          </Box>
          <Box flexDirection="column">
            <Select key="kriterijum" label="Najbolje ponude: " value={n.kriterijum}
              options={KRITERIJUMI.map(([value, label]) => ({ value, label }))}
              onSelect={async (v: string) => {
                await idiNa($, { kriterijum: v })
                const r = await pt($, ['top', v, '--limit', '12'])
                if (r) await update($, top, () => r.ponude as Ponuda[])
              }} />
            {t.slice(0, Math.max(3, rows - kontinenti.length - 6)).map(p => (
              <Button plain key={`t-${p.id}`} onPress={() => otvoriPonudu($, p)}>
                {kratko(`${ime(p)} · ${p.zemlja}`, Math.max(20, cols - 34))} <Text dimColor>{kratko(`${p.agencija} · ${p.zasto ?? cena(p)}`, 32)}</Text>
              </Button>
            ))}
          </Box>
          <Text dimColor>Klikni, ili piši Claude-u normalno ispod (npr. „nešto jeftino za decembar?“).</Text>
        </Box>
      )
    }

    // ----- kontinent: zemlje -----
    if (n.view === 'kontinent') {
      const z = (await read($, zemlje))[n.kontinent] ?? {}
      return (
        <Box flexDirection="column" gap={1}>
          {zaglavlje}
          {statusRed}
          <Text bold>{n.kontinent}: izaberi zemlju</Text>
          <Box flexDirection="column">
            {Object.entries(z).sort((a, b) => b[1] - a[1]).map(([zemlja, c]) => (
              <Button plain key={`z-${zemlja}`} onPress={() => otvoriZemlju($, zemlja)}>
                {zemlja} <Text dimColor>({c})</Text>
              </Button>
            ))}
          </Box>
        </Box>
      )
    }

    // ----- zemlja: ture -----
    if (n.view === 'zemlja') {
      const ture = grupisi(await read($, lista), n.sort)
      const odStr = n.strana * NA_STRANI
      const vidljive = ture.slice(odStr, odStr + NA_STRANI)
      return (
        <Box flexDirection="column" gap={1}>
          {zaglavlje}
          {statusRed}
          <Box flexDirection="row" gap={2}>
            <Text bold>{n.zemlja}: {ture.length} ponuda</Text>
            <Select key="sort" label="Sortiraj: " value={n.sort}
              options={[{ value: 'datum', label: 'datum' }, { value: 'cena', label: 'cena' }, { value: 'popust', label: 'popust' }]}
              onSelect={(v: string) => idiNa($, { sort: v as Nav['sort'], strana: 0 })} />
          </Box>
          <Box flexDirection="column">
            {vidljive.map(t => {
              const p = t.glavna
              const termini = new Set(t.svi.flatMap(x => x.svi_datumi)).size
              const cene = t.svi.map(x => x.price).filter(Boolean) as number[]
              const c = cene.length > 1 && Math.min(...cene) !== Math.max(...cene)
                ? `od ${Math.round(Math.min(...cene)).toLocaleString('de-DE')} ${p.currency === 'RSD' ? 'din' : '€'}`
                : cena(p)
              const pp = Math.max(...t.svi.map(popust))
              return (
                <Button plain key={`p-${p.id}`} onPress={() => otvoriPonudu($, p)}>
                  {datum(p.date_from)}{termini > 1 ? ` +${termini - 1}` : ''} {IKONA[p.transport ?? ''] ?? ''} {kratko(ime(p), Math.max(14, cols - 46))}{' '}
                  <Text bold>{c}</Text>{pp ? <Text color="green"> -{pp}%</Text> : ''} <Text dimColor>{p.agencija}</Text>
                </Button>
              )
            })}
          </Box>
          <Box flexDirection="row" gap={2}>
            {n.strana > 0 && <Button key="prev" onPress={() => idiNa($, { strana: n.strana - 1 })}>‹ Prethodne</Button>}
            {odStr + NA_STRANI < ture.length && <Button key="next" onPress={() => idiNa($, { strana: n.strana + 1 })}>Sledeće ›</Button>}
            <Button key="ask-z" variant="primary"
              onPress={() => pitaj($, `Šta je najbolje od ponuda za ${n.zemlja}? Pogledaj pt --json zemlja "${n.zemlja}", proveri i Filip Travel, Ponte i Plana, i preporuči mi 3 sa kompromisima.`)}>
              💬 Pitaj Claude-a za {n.zemlja}
            </Button>
          </Box>
        </Box>
      )
    }

    // ----- ponuda: detalji -----
    const p = await read($, ponuda)
    const d = await read($, detalji)
    if (!p) return <Box flexDirection="column">{zaglavlje}<Text dimColor>Izaberi ponudu.</Text></Box>
    const iste = (await read($, lista)).filter(x => x.agencija === p.agencija && baseUrl(x.url) === baseUrl(p.url) && x.title === p.title)
    const termini = (iste.length ? iste : [p]).flatMap(x => x.svi_datumi.map(dt => ({ dt, x })))
      .sort((a, b) => a.dt.localeCompare(b.dt))
    const md: string[] = []
    md.push(`**${p.title}**`)
    md.push(`${p.zemlja} · ${p.kontinent} · **${p.agencija}**`)
    md.push('')
    md.push(`- **Polazak:** ${datum(p.date_from)}${p.date_to ? ` → ${datum(p.date_to)}` : ''}`)
    md.push(`- **Noći:** ${p.nights === 0 ? 'jednodnevni izlet' : p.nights ?? 'na sajtu'} · **Prevoz:** ${p.transport ?? 'na sajtu'}`)
    md.push(`- **Cena:** ${cena(p)} po osobi${popust(p) ? ` (bilo ${Math.round(p.old_price!)}, -${popust(p)}%)` : ''}`)
    if (p.note) md.push(`- **Napomena:** ${p.note}`)
    if (termini.length > 1) {
      md.push(`\n**Svi termini (${termini.length})**\n`)
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
    return (
      <Box flexDirection="column" gap={1}>
        {zaglavlje}
        {statusRed}
        <Text bold>{ime(p)}</Text>
        <Box flexDirection="row" gap={1}>
          <Button key="trello" variant="primary" hotkey="t"
            onPress={() => pitaj($, `Stavi ponudu ${p.id.slice(0, 8)} (${ime(p)}, ${p.agencija}, polazak ${datum(p.date_from)}, ${cena(p)}) u Trello listu 📬 Predlozi.`)}>
            📌 Stavi u Trello
          </Button>
          <Button key="uporedi" hotkey="u"
            onPress={() => pitaj($, `Uporedi ponudu ${p.id.slice(0, 8)} (${ime(p)}, ${p.agencija}, ${datum(p.date_from)}, ${cena(p)}) sa sličnim ponudama drugih agencija i sa "uradi sam" varijantom (let + smeštaj). Reci da li se isplati.`)}>
            🔍 Uporedi
          </Button>
          <Button key="nazad" hotkey="b" onPress={() => idiNa($, { view: n.zemlja ? 'zemlja' : 'pocetna' })}>↩ Nazad</Button>
        </Box>
        <Link href={p.url} label="🔗 Otvori na sajtu agencije" />
        <Markdown text={md.join('\n')} />
      </Box>
    )
  })
}
