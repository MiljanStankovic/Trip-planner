# Putešestvije · pregledač ponuda agencija

Aplikacija u terminalu koja skuplja ponude domaćih turističkih agencija i slaže ih po **kontinentima i zemljama**. Klikneš zemlju, vidiš sve ponude, klikneš ponudu i dobiješ sve termine, cene, program i šta cena obuhvata (sa sajta agencije). Ono što vam se svidi označiš i pošalješ na Trello tablu **Putešestvije**. Trello ostaje tabla za vaše ideje, a aplikacija služi za traženje.

```
┌ Kontinenti → zemlje ┐┌ Ponude za izabranu zemlju ─────────────────┐┌ Detalji ponude ─────────────┐
│ Evropa (196)        ││ Polazak    Destinacija   Noći  Cena  Agen. ││ Polazak, svi termini i cene │
│   Španija (46)      ││ 08.11. +24 Bangkok, Krabi 12  1.549 € JT    ││ Program                     │
│ Azija (259)         ││ ...                                         ││ Cena obuhvata / ne obuhvata │
├ Najbolje ponude ▼   ┤│                                             ││ Link                        │
│ 💸 Najveći popust   ││                                             ││                             │
└─────────────────────┘└─────────────────────────────────────────────┘└─────────────────────────────┘
```

**Tasteri:** `/` traži (zemlja, grad, agencija) · `Enter` ili `d` detalji sa sajta · `o` otvori u pregledaču · `t` označi za Trello · `s` sortiraj (datum, cena, popust, agencija) · `q` izlaz. Radi i mišem.

**Najbolje ponude** (levo dole) imaju izbor kriterijuma: preporučeno za vas, najveći popust, najjeftinije, specijalne i poslednja mesta, polazi uskoro, izleti i vikendi.

## Instalacija

Treba: Python 3.11+, [Claude Code](https://docs.claude.com/en/docs/claude-code/overview).

```bash
git clone https://github.com/MiljanStankovic/Trip-planner.git
cd Trip-planner
python3 -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e .
pt init                     # pravi ~/.config/putesestvije/config.toml – otvori i podesi profil
pt agencije skeniraj        # prvo skeniranje
pt                          # pregledač ponuda
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

## Claude Code komande

| Komanda | Šta radi |
|---|---|
| `/putesestvije:zemlja Tajland` | Sve ponude za zemlju ili grad, najbolji termini i detalji sa sajtova (šta cena obuhvata, doplate) |
| `/putesestvije:u-trello` | Ponude označene u aplikaciji (`t`) šalje kao kartice u 📬 Predlozi |
| `/putesestvije:istrazi <tema>` | Istraživanje: letovi, smeštaj, aranžmani, vize, poređenje sa "uradi sam" |
| `/putesestvije:predlozi [vikend\|mesec]` | Ideje sa vaše Trello table koje sad imaju smisla, plus ponude agencija |
| `/putesestvije:planiraj <kartica>` | Plan za karticu, prebacivanje u Planirano, datum, kalendar |
| `/putesestvije:agencije` | Sveže skeniranje (i agencije koje čita Claude) |
| `/putesestvije:pregled [auto]` | Nedeljni pregled: izveštaj + predlozi u Trello |
| `/putesestvije:profil` | Profil: budžet, šta volite, aerodrom |

## Komande `pt`

```
pt                                  pregledač ponuda (kontinenti → zemlje → ponude → detalji)
pt zemlje                           broj ponuda po kontinentu i zemlji
pt zemlja tajland                   sve ponude za zemlju ili grad
pt ponuda <ID> --detalji            sve o ponudi + program i cene sa sajta agencije
pt izabrano                         ponude označene za Trello
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

`pt trello ...` koristi Trello REST API (aplikacija `pt` ga ne traži; slanje ide preko `/putesestvije:u-trello`). Ključ: https://trello.com/power-ups/admin → New → API key → generiši token. Zatim:

```bash
export TRELLO_KEY=...  TRELLO_TOKEN=...      # npr. u ~/.zshrc; nikad u config.toml ni u git
```

Bez ključa sve radi; Claude komande koriste Trello MCP.

## Agencije

| Agencija | Kako | Šta se dobija |
|---|---|---|
| Travelland | `pt` | city break, Egipat, Kipar; cene i stare cene |
| Argus Tours | `pt` | sigurni polasci, praznici (npr. Dan primirja); cene "od" |
| Grand Tours | `pt` | autobuski izleti i vikend putovanja (Budimpešta, Temišvar, adventi); cene u € ili dinarima |
| Halo Tours | `pt` | adventi i vikend ture autobusom (Budimpešta, Zagreb, Ljubljana, Beč); cene u dinarima ili € |
| Belvi Travel | `pt` | polasci autobusom i avionom (Istanbul, Prag, Toskana), praznici; cene "od" |
| Jungle Tribe | `pt` (njihov javni JSON) | daleka i neobična putovanja i hoteli sa letom; svi polasci (~470), cene i popusti |
| Felix Travel | `pt` | evropski gradovi i adventi; cene, datumi na stranici ponude |
| Fibula Air Travel | `pt` | hoteli sa letom iz Beograda; polazak, noći, cena po osobi |
| Kontiki | `pt` | ture i Nova godina; datumi, cene na sajtu |
| Big Blue | `pt` | evropske metropole; datumi, cene na sajtu |
| Odeon World Travel | `pt` | ture i wellness (i Segedin); datumi, cene retko |
| Filip Travel, Ponte, Plana Tours | Claude preko WebFetch → `pt agencije ubaci` | sajt odbija skripte ili cene učitava JavaScript |

Nova agencija: javi Claude-u link, ili napravi klasu sa `pages` i `parse()` u `src/putesestvije/scrapers/` i dodaj je u `scrapers/__init__.py`.

Skripte poštuju robots.txt i prave pauzu između stranica. Preporuke imaju najviše 3 ponude po agenciji (`--po-agenciji`), da ne bi jedna agencija zauzela ceo spisak. Sajtovi agencija se menjaju; kad parser prestane da vraća ponude, `pt agencije skeniraj` to pokaže (0 ponuda), a parser je jedan mali fajl.

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
