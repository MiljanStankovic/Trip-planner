# Putešestvije · CLI za putovanja

Mini aplikacija u terminalu za planiranje putovanja i izlazaka za dvoje:

- **`pt`** – Python alat: skida ponude domaćih agencija, pamti istoriju cena, boduje ponude po našem profilu, prikazuje Trello tablu i preporuke jednu pored druge.
- **Claude Code plugin `putesestvije`** – Claude kao mozak: komande-modovi za istraživanje (letovi, smeštaj, aranžmani), predloge i planiranje, sa upisom u Trello tablu **Putešestvije**.
- **Nedeljni pregled** – zakazano pokretanje koje skenira agencije, piše izveštaj u `izvestaji/` i stavlja do 5 predloga u Trello listu **📬 Predlozi**.

Trello ostaje samo tabla (ideje → Planirano → Završeno). Istraživanje i savet su u terminalu.

```
┌──────────────── Trello · Putešestvije ─────────────┐┌──── ⭐ Preporuke ─────────────┐
│ 📬 Predlozi │ Izleti │ Hrana │ Aktivnosti │ ...    ││ 03.11 ✈ Sevilja  499 € -33%  │
│ • ...       │ • ...  │ • ... │ • ...      │        ││ 25.10 ✈ Aja Napa 337 € -30%  │
└────────────────────────────────────────────────────┘└───────────────────────────────┘
┌──────────────────────── 🆕 Novo ove nedelje ─────────────────────────────────────────┐
```

## Instalacija

Treba: Python 3.11+, [Claude Code](https://docs.claude.com/en/docs/claude-code/overview).

```bash
git clone https://github.com/MiljanStankovic/Trip-planner.git
cd Trip-planner
python3 -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e .
pt init                     # pravi ~/.config/putesestvije/config.toml – otvori i podesi profil
pt agencije skeniraj        # prvo skeniranje
pt                          # tabla
```

### Claude Code plugin

U Claude Code-u (iz bilo kog foldera):

```
/plugin marketplace add MiljanStankovic/Trip-planner
/plugin install putesestvije@putesestvije
```

Trello (jednom, za sve projekte):

```bash
claude mcp add --scope user --transport http trello https://mcp.trello.com/v1
```

Pa u Claude Code-u `/mcp` → trello → prijava na Trello.

Preporučeni konektori za istraživanje (opciono, u Claude Code-u preko `claude mcp add`): SlickTrip, eDreams, Expedia (letovi i hoteli), Booking.com, Civitatis (ture), AccuWeather (vreme).

## Modovi (Claude Code)

| Komanda | Šta radi |
|---|---|
| `/putesestvije:pocetna` | Tabla + preporuke + novo ove nedelje, sa predlogom sledećeg koraka |
| `/putesestvije:predlozi [vikend\|mesec\|putovanje]` | Šta da radimo: 3 ideje sa table + 1 nova + ponude agencija |
| `/putesestvije:istrazi <tema>` | Istraživanje: letovi, smeštaj, aranžmani, vize, vreme, poređenje sa "uradi sam" |
| `/putesestvije:planiraj <kartica>` | Plan za izabranu karticu, prebacivanje u Planirano, datum, labela, kalendar |
| `/putesestvije:agencije [filter]` | Sveže skeniranje (uključujući Filip Travel) i nove/pojeftinjene ponude |
| `/putesestvije:pregled [auto]` | Nedeljni pregled: izveštaj + predlozi u Trello |
| `/putesestvije:tabla` | Trello tabla |
| `/putesestvije:profil [izmena]` | Profil: aerodrom, budžet, šta volimo |

Skillovi u pluginu: `putesestvije-planer` (način istraživanja i planiranja) i `agencije-pregled` (nedeljni pregled).

## Komande `pt`

```
pt                                  tabla (Trello levo, preporuke desno, novo dole)
pt agencije skeniraj [--samo travelland bigblue]
pt agencije nove [--dana 7] [--sve]
pt agencije ubaci ponude.json       ponude koje je Claude pročitao (Filip Travel)
pt agencije istorija <ID>           kako se kretala cena
pt agencije odbij <ID>              ne predlaži više
pt preporuke [--limit 10]
pt trello tabla
pt trello predlog <ID>              ponuda → kartica u 📬 Predlozi
pt trello dodaj --lista izleti --naslov "Segedin" --rok 2026-11-08 [--opis ...] [--link ...]
pt profil
```

Svaka komanda prima `--json` (tako ih zovu Claude komande).

### Trello iz `pt` (opciono)

Tabla u `pt` prikazu i `pt trello ...` koriste Trello REST API. Ključ: https://trello.com/power-ups/admin → New → API key → generiši token. Zatim:

```bash
export TRELLO_KEY=...  TRELLO_TOKEN=...      # npr. u ~/.zshrc; nikad u config.toml ni u git
```

Bez ključa sve radi osim Trello panela u `pt`; Claude komande koriste Trello MCP.

## Agencije

| Agencija | Kako | Cene |
|---|---|---|
| Travelland | `pt` (HTML) | da |
| Big Blue | `pt` (HTML) | datumi da, cene na sajtu (JavaScript) |
| Odeon World Travel | `pt` (HTML) | datumi da, cene retko |
| Filip Travel | Claude preko WebFetch → `pt agencije ubaci` | kad su vidljive |
| Kontiki | ne čita se – robots.txt zabranjuje | ručno, kontiki.rs |

Skripte poštuju robots.txt i prave pauzu između stranica. Sajtovi agencija se menjaju; kad parser prestane da vraća ponude, `pytest` i komanda `pt agencije skeniraj` to odmah pokažu, a parser je jedan mali fajl u `src/putesestvije/scrapers/`. Nova agencija = nova klasa sa `pages` i `parse()`, dodata u `scrapers/__init__.py`.

## Nedeljni pregled

macOS / Linux (`crontab -e`), svake nedelje u 09:47:

```
47 9 * * 0  /putanja/do/Trip-planner/scripts/nedeljni-pregled.sh
```

Na dve nedelje: `47 9 * * 0  PT_SVAKE_DVE=1 /putanja/do/Trip-planner/scripts/nedeljni-pregled.sh`

Windows: vidi komentar na vrhu `scripts/nedeljni-pregled.ps1` (schtasks).

Prvi put pokreni `/putesestvije:pregled` ručno u Claude Code-u i dozvoli Trello alate ("Always allow"), da bi zakazano pokretanje radilo bez pitanja. Izveštaji idu u `izvestaji/YYYY-MM-DD.md`, logovi u `logs/`.

## Podaci

- Baza: `~/.local/share/putesestvije/putesestvije.db` (menja se sa `PT_DATA`)
- Profil: `~/.config/putesestvije/config.toml` (menja se sa `PT_CONFIG`)

## Razvoj

```bash
pip install -e ".[dev]" && pytest
```

Delovi workflow-a (sedam faza planiranja, provera pre polaska, "tri opcije sa stavom") su inspirisani skillovima [apljacob/travel-agent](https://github.com/apljacob/travel-agent), [Filip-Kin/travel-agent-skill](https://github.com/Filip-Kin/travel-agent-skill) i [d-wwei/trip-planner](https://github.com/d-wwei/trip-planner); kod nije kopiran.
