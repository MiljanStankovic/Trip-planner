# Putovanja · ponude agencija u Claude-u

U Claude Code-u ukucaš **`/putovanja`** i otvori se **pano**: levo kontinenti i zemlje, u sredini **tabla polazaka**
(polazak, odredište, noći, prevoz, agencija, cena po osobi), desno **izvori podataka** i **konektori**.
Ceo red na tabli je klikabilan i otvara ponudu: svi polasci, šta cena obuhvata, doplate, program, link
i **ukupno za tvoje putnike** (odrasli i deca). Ispod svake ponude stoje **popusti za više osoba**
kad ih agencija navodi (treća osoba, deca, jednokrevetna soba, rani booking). Sa Claude-om se normalno dopisuješ.

```
┌ Putovanja  [Agencije]  Uradi sam  Praćeno ────────────────── Destinacije  Kalendar  Izvori ┐
│▌★ Preporučeno  │ Španija  59 aranžmana                 👥 2 odrasla ▾   ↕ Najjeftinije ▾ │
│ Destinacije    │ Polazak    Destinacija               Prevoz      Trajanje      Po osobi │
│▾ Evropa    386 │ 22.10.     Barselona  −25%           ✈ avion     3 noći        od 299 € │
│ ▌Španija    78 │ četvrtak   10 polazaka, Travelland   1/1 soba: +130 €         598 € za 2 │
│  Italija    75 │                                                                        │
│  …             │ 30.10.     Madrid  −17%              ✈ avion     3 noći        od 299 € │
│                │ petak      4 polazaka, Travelland    1/1 soba: +140 €         598 € za 2 │
│ ✓ 14 agencija · sken pre 2 h · konektori 2/4 · poveži                                   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Podaci stižu sa servera Putovanja (Cloudflare), isti kao u konektoru: agencije se skeniraju same svako jutro.
Na računaru ne treba ništa da se instalira osim samog plugina.

## Instalacija: jedna strana za sve

**[putovanja.miljan-stankovic99.workers.dev](https://putovanja.miljan-stankovic99.workers.dev)** — pošalji ovaj link porodici i prijateljima.

1. **Konektor (telefon, tablet, računar, Chromebook).** Strana napravi tvoju adresu, kopira je i otvori konektore u
   Claude-u; tamo „Add custom connector”, ime *Putovanja*, nalepiš adresu. Posle se Putovanja otvaraju kao prozor u
   razgovoru na svim uređajima gde si prijavljen. Besplatan Claude dozvoljava jedan prilagođeni konektor.
2. **Pano u Claude Code-u (opciono, na računaru).** U Claude Code pošalji
   `/plugin marketplace add MiljanStankovic/Trip-planner`, pa `/plugin install putovanja@putovanja`, ponovo otvori
   Claude Code i otkucaj **`/putovanja`**. Da pano prati isto što i telefon, otkucaj
   `/putovanja adresa <adresa konektora>` (adresa je u Claude-u: Podešavanja → Konektori → putovanja). U prozoru Putovanja dugme **„Pokreni app u Claude Code”** pita Claude-a za ove korake.

Ažuriranje: konektor se ažurira sam; plugin preko `/plugin` (Update).

### Lokalni alat i sken na svom računaru (napredno)

Mali Python alat **`putovanja`** (skraćeno **`pt`**) skida ponude 15 agencija sam, čuva istoriju cena i radi u
terminalu. Pano ga koristi umesto servera kad u podešavanjima plugina upišeš putanju do alata (`ptPath`).
Desktop dodatak [Putovanja.mcpb](https://github.com/MiljanStankovic/Trip-planner/raw/main/mcp/Putovanja.mcpb) radi
isto, lokalno, u Claude desktop aplikaciji ([mcp/README.md](mcp/README.md)); za većinu je konektor jednostavniji.

Instalacija alata jednom komandom (instalira i [uv](https://docs.astral.sh/uv/), koji donese Python):

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/MiljanStankovic/Trip-planner/main/install.ps1 | iex
```

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/MiljanStankovic/Trip-planner/main/install.sh | bash
```

Opcije (pre komande): `$env:PUTOVANJA_BEZ_SKENA="1"` / `PUTOVANJA_BEZ_SKENA=1` preskače prvo skeniranje,
`PUTOVANJA_TRELLO=1` uključuje dodatak za Trello, `PUTOVANJA_GRANA=ime-grane` instalira probnu granu.

**Pano najbolje radi u Windows Terminal-u.** Klik mišem radi kad je Claude Code preko celog prozora (fullscreen,
pano je tada sa strane). U običnom režimu (pano iznad polja za kucanje) koristi tastaturu: `ctrl+x tab` prelazi u pano,
`Tab` i strelice biraju, `Enter` otvara.

### Konektori (letovi, smeštaj, izleti)

Pano desno pokazuje koje konektore imaš: Expedia, SlickTrip, eDreams, Civitatis. Dodaju se jednom, na claude.ai
(Customize → Connectors, claude.ai/customize/connectors), i Claude Code ih posle sam vidi. Bez njih sve radi, samo Claude za letove i smeštaj koristi
pretragu i linkove.

### Trello (opciono, podrazumevano isključen)

Dodatak **putovanja-trello** donosi Trello tablu za ideje i planirana putovanja. Uključuje se jednom i to se pamti:
`claude plugin install putovanja-trello@putovanja` (ili `/plugin` u Claude Code-u). Isključivanje: `/plugin disable putovanja-trello`.
Tablu povezuješ preko Trello konektora na claude.ai; Claude te pita koju tablu koristiš i upiše je u podešavanja.

> Repo je javan: instalacija ne traži GitHub nalog. Izmene (push) mogu da šalju samo vlasnik i dodati saradnici.

## Claude Code komande

Glavna je **`/putovanja`** (pano). `/putovanja Tajland` otvara pano odmah na Tajlandu.

| Komanda | Šta radi |
|---|---|
| `/putovanja [zemlja]` | Pano Putovanja pored razgovora |
| `/putovanja:pano [zemlja]` | Isto, za Claude aplikaciju: tamo je u meniju od starta, pa nema poruke "isn't a command here" |
| `/putovanja:zemlja Tajland` | Sve ponude za zemlju ili grad, najbolji termini i detalji sa sajtova (šta cena obuhvata, doplate) |
| `/putovanja:istrazi <tema>` | Istraživanje: letovi, smeštaj, aranžmani, vize, poređenje sa "uradi sam" |
| `/putovanja:uradi-sam <kuda> <od> <do>` | Prevoz + smeštaj u sopstvenoj režiji, ukupna cena, poređenje sa agencijama |
| `/putovanja:agencije` | Sveže skeniranje (i agencije koje čita Claude) |
| `/putovanja:pregled [auto]` | Nedeljni pregled: izveštaj (uz Trello dodatak i predlozi na tabli) |
| `/putovanja-trello:predlozi`, `/putovanja-trello:planiraj` | Samo uz Trello dodatak: ideje sa table, kartica u Planirano |
| `/putovanja:profil` | Profil: putnici (odrasli, deca), budžet, šta voliš, aerodrom |

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
pt izvori                           agencije: broj ponuda, poslednji sken, greške
pt popusti <ID> [<ID> ...]          popusti za više osoba sa stranica ponuda
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

- **Agencije**: destinacije levo, tabla desno, u kolonama (polazak, destinacija, prevoz, trajanje, agencija kad ima
  mesta, cena po osobi). U drugom, sivom redu: dan, broj polazaka, agencija, jedna napomena i ukupno za putnike. Putnici i redosled se biraju klikom (i u terminalu).
  Stanje izvora je jedan red na dnu; ceo spisak agencija i konektora je na ekranu **Izvori**.
  Kalendar polazaka (sa praznicima) je drugi prikaz. Ponuda: svi polasci, popusti za više osoba i ukupna cena za
  izabrane putnike (aranžman + takse i obavezne doplate; osiguranje kao preporučeno; fakultativno posebno).
- **Uradi sam**: upišeš kuda i datume, dobiješ linkove za avion, autobus, voz, auto, Booking, Trivago, Airbnb i
  dugme da Claude nađe i sačuva 2–3 kombinacije prevoz + smeštaj, uporedo sa agencijama.
- **Praćeno**: praćene cene i obaveštenja (pojeftinilo, nestalo, novo po tvojim željama).
