# Putovanja · ponude agencija u Claude Code-u

U Claude Code-u ukucaš **`/putovanja`** i pored razgovora se otvori **pano**: kontinenti → zemlje → ponude → detalji ponude (svi termini, cene, šta cena obuhvata, doplate, program, link). Klikćeš kroz pano, a sa Claude-om se normalno dopisuješ ispod. Dugmići u panou šalju Claude-u poruku: **📌 Stavi u Trello** (kartica u 📬 Predlozi na tabli Putovanja), **🔍 Uporedi** (druge agencije i "uradi sam" let + smeštaj), **💬 Pitaj Claude-a za zemlju**.

```
┌ razgovor sa Claude-om ─────────────────┐┌ Putovanja ─────────────────────────────┐
│ > nešto jeftinije u decembru?          ││ 🏠 Početna › Azija › Tajland              │
│ Claude: Za decembar su najbolji…       ││ Tajland: 18 ponuda   Sortiraj: datum ▾    │
│                                        ││ 08.11. +24 ✈ Bangkok, Krabi  1.549 € -18% │
│                                        ││ 11.01. +6  ✈ Indokina        1.849 € -23% │
│                                        ││ [💬 Pitaj Claude-a za Tajland]            │
└────────────────────────────────────────┘└───────────────────────────────────────────┘
```

Na početnoj su i **najbolje ponude** sa izborom kriterijuma: preporučeno za vas, najveći popust, najjeftinije, specijalne i poslednja mesta, polazi uskoro, izleti i vikendi.

Ispod panoa radi mali Python alat **`pt`**: skida ponude 15 agencija, čuva istoriju cena i odgovara panou i Claude-u. Trello ostaje tabla za vaše ideje.

## Instalacija (jedna komanda)

Treba: [git](https://git-scm.com), Python 3.11+, [Claude Code](https://docs.claude.com/en/docs/claude-code/overview).
Na Windows-u, ako nešto fali: `winget install Git.Git Python.Python.3.12`.

**Windows (PowerShell):**

```powershell
git clone https://github.com/MiljanStankovic/Trip-planner.git $HOME\Putesestvije; powershell -ExecutionPolicy Bypass -File $HOME\Putesestvije\install.ps1
```

**macOS / Linux:**

```bash
git clone https://github.com/MiljanStankovic/Trip-planner.git ~/Putesestvije && ~/Putesestvije/install.sh
```

Skripta sama: napravi Python okruženje i instalira alat `pt`, napravi podešavanja
(`~/.config/putovanja/config.toml`), doda `pt` u PATH, instalira oba Claude Code plugina
(`putovanja` i pano `/putovanja`), upiše panou putanju do `pt` i skenira agencije (~1–2 min).
Zatim otvori Claude Code i ukucaj **`/putovanja`**.

**Ažuriranje:** ista skripta još jednom (`install.ps1` / `install.sh`): povuče izmene i osveži sve. Posle toga restartuj Claude Code.

Opcije: `-BezSkena` / `--bez-skena` preskače skeniranje.

> Repo je javan: instalacija ne traži GitHub nalog. Izmene (push) mogu da šalju samo vlasnik i dodati saradnici; ostali mogu da predlože izmenu preko fork-a i pull request-a.

<details><summary>Ručna instalacija (ako skripta ne može)</summary>

```bash
git clone https://github.com/MiljanStankovic/Trip-planner.git && cd Trip-planner
python3 -m venv .venv && .venv/bin/pip install -e .      # Windows: .venv\Scripts\pip install -e .
.venv/bin/pt init && .venv/bin/pt agencije skeniraj
claude plugin marketplace add "$(pwd)"
claude plugin install putovanja@putovanja
claude plugin install putovanja@putovanja
```
U Claude Code-u, ako pano ne nađe `pt`: `/putovanja pt <puna putanja do pt>`.
</details>

## Claude Code komande

Glavna je **`/putovanja`** (pano). `/putovanja Tajland` otvara pano odmah na Tajlandu.

| Komanda | Šta radi |
|---|---|
| `/putovanja [zemlja]` | Pano Putovanja pored razgovora |
| `/putovanja:zemlja Tajland` | Sve ponude za zemlju ili grad, najbolji termini i detalji sa sajtova (šta cena obuhvata, doplate) |
| `/putovanja:istrazi <tema>` | Istraživanje: letovi, smeštaj, aranžmani, vize, poređenje sa "uradi sam" |
| `/putovanja:predlozi [vikend\|mesec]` | Ideje sa vaše Trello table koje sad imaju smisla, plus ponude agencija |
| `/putovanja:uradi-sam <kuda> <od> <do>` | Prevoz + smeštaj u sopstvenoj režiji, ukupna cena, poređenje sa agencijama |
| `/putovanja:planiraj <kartica>` | Plan za karticu, prebacivanje u Planirano, datum, kalendar |
| `/putovanja:agencije` | Sveže skeniranje (i agencije koje čita Claude) |
| `/putovanja:pregled [auto]` | Nedeljni pregled: izveštaj + predlozi u Trello |
| `/putovanja:profil` | Profil: budžet, šta volite, aerodrom |

## Komande `pt`

```
pt top [popust|jeftino|specijal|uskoro|izlet]   najbolje ponude po kriterijumu
pt zemlje                           broj ponuda po kontinentu i zemlji
pt zemlja tajland                   sve ponude za zemlju ili grad
pt ponuda <ID> --detalji            sve o ponudi + program i cene sa sajta agencije
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

`pt trello ...` koristi Trello REST API; pano i Claude komande ga ne traže (rade preko Trello MCP-a). Ključ: https://trello.com/power-ups/admin → New → API key → generiši token. Zatim:

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
| Viva Travel | `pt` (`/services/list/`) | ture, gradovi, praznici; svi polasci, cena "od" |
| Rapsody Travel | `pt` (`/services/list/`) | gradovi, adventi, Nova godina, omladinska putovanja |
| I Travel | `pt` | daleke destinacije, primer ponude po mesecu |
| Jumbo Travel | `pt` | tropski paketi let + hotel, bez fiksnog datuma |
| Play Travel | preskočeno | sajtu je istekao HTTPS sertifikat |
| Filip Travel, Ponte, Plana Tours | Claude, samo kad pozoveš `/putovanja:agencije` ili `/putovanja:zemlja` | sajt odbija skripte ili cene učitava JavaScript; nisu u nedeljnom pregledu |

Nova agencija: javi Claude-u link, ili napravi klasu sa `pages` i `parse()` u `src/putovanja/scrapers/` i dodaj je u `scrapers/__init__.py`.

Skripte poštuju robots.txt i prave pauzu između stranica. Preporuke imaju najviše 3 ponude po agenciji (`--po-agenciji`), da ne bi jedna agencija zauzela ceo spisak. Sajtovi agencija se menjaju; kad parser prestane da vraća ponude, `pt agencije skeniraj` to pokaže (0 ponuda), a parser je jedan mali fajl.

## Nedeljni pregled

macOS / Linux (`crontab -e`), svake nedelje u 09:47:

```
47 9 * * 0  /putanja/do/Trip-planner/scripts/nedeljni-pregled.sh
```

Na dve nedelje: `47 9 * * 0  PT_SVAKE_DVE=1 /putanja/do/Trip-planner/scripts/nedeljni-pregled.sh`

Windows: vidi komentar na vrhu `scripts/nedeljni-pregled.ps1` (schtasks).

Prvi put pokreni `/putovanja:pregled` ručno u Claude Code-u i dozvoli Trello alate ("Always allow"), da bi zakazano pokretanje radilo bez pitanja. Izveštaji idu u `izvestaji/YYYY-MM-DD.md`, logovi u `logs/`.

## Podaci

- Baza: `~/.local/share/putovanja/putovanja.db` (menja se sa `PT_DATA`)
- Profil: `~/.config/putovanja/config.toml` (menja se sa `PT_CONFIG`)

## Razvoj

```bash
pip install -e ".[dev]" && pytest
```

Delovi workflow-a (sedam faza planiranja, provera pre polaska, "tri opcije sa stavom") su inspirisani skillovima [apljacob/travel-agent](https://github.com/apljacob/travel-agent), [Filip-Kin/travel-agent-skill](https://github.com/Filip-Kin/travel-agent-skill) i [d-wwei/trip-planner](https://github.com/d-wwei/trip-planner); kod nije kopiran.

## Pano: odeljci

`/putovanja` u Claude Code-u otvara pano sa tri odeljka:

- **🏢 Agencije**: destinacije po kontinentima i zemljama, 📅 kalendar polazaka (sa praznicima), detalji ponude sa
  **💶 ukupnom cenom za vas dvoje** (aranžman + takse i obavezne doplate, osiguranje kao preporučeno, fakultativno posebno).
  Desno stoje najbolje ponude po kriterijumu.
- **🧭 Uradi sam**: upišeš kuda i datume, dobiješ linkove za avion, autobus, voz, auto, Booking, Trivago, Airbnb i
  dugme da Claude nađe i sačuva 2–3 kombinacije prevoz + smeštaj sa ukupnom cenom, uporedo sa agencijama za istu destinaciju.
- **👁 Praćeno**: praćene cene i obaveštenja (pojeftinilo, nestalo, novo po vašim željama).

U zaglavlju piše kad je bio poslednji sken (žuto kad je stariji od 7 dana).
