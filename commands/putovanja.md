---
description: Režim putovanja — pregled ponuda agencija sa menijem za klikanje (kontinent → zemlja → ponuda → detalji / Trello), uz slobodno dopisivanje
argument-hint: "[opciono: zemlja, grad ili pitanje]"
---

Uđi u **režim putovanja** i ostani u njemu do kraja razgovora. Koristi skill `putesestvije-planer` za istraživanje i pravila. Piši srpski, latinica, kratko.

## Početak

1. U jednom koraku pokreni: `pt --json zemlje`, `pt --json preporuke --limit 5 --po-agenciji 2` i proveri poslednje skeniranje (`last_seen` u preporukama). Ako je baza prazna ili starija od 3 dana, reci to u jednoj rečenici i ponudi skeniranje kao prvu opciju menija.
2. Ako je zadat argument (**$ARGUMENTS**), preskoči pozdrav i odmah idi na tu zemlju/grad/pitanje (kao da je izabrano iz menija).
3. Inače prikaži pozdravni pregled, najviše 8 redova:
   - broj ponuda i agencija, poslednje skeniranje
   - kontinenti sa brojem ponuda u jednom redu
   - 3 najbolje ponude danas (destinacija · agencija · polazak · cena · zašto)
4. Zatim meni (AskUserQuestion), npr. "Odakle krećemo?":
   - 🌍 Kontinenti i zemlje
   - ⭐ Najbolje ponude (pa izbor kriterijuma)
   - 🔎 Traži zemlju ili grad — korisnik upisuje preko "Other"
   - 📌 Pošalji označeno u Trello (samo ako `pt --json izabrano` nije prazno; inače 🔄 Osveži ponude)

## Navigacija (meniji)

Posle svakog izbora: kratko prikaži rezultat u tekstu (kompaktna tabela), pa sledeći meni. Meni ima 2–4 opcije, a korisnik uvek može da upiše svoje preko "Other" — to tretiraj kao slobodnu poruku.

- **Kontinent:** `pt --json zemlje` → ponudi 3 kontinenta sa najviše ponuda; ostale navedi u tekstu ("ili upiši: Afrika, Južna Amerika…").
- **Zemlja:** prikaži sve zemlje kontinenta sa brojem ponuda u tekstu; u meniju 3–4 sa najviše ponuda ili najboljim cenama.
- **Ponude za zemlju:** `pt --json zemlja <naziv>`. Grupiši po turi (agencija + link). U tekstu tabela do 10 tura (polazak +N termina, destinacija, noći, cena od, agencija). U meniju 3–4 najzanimljivije, a za svaku opciju stavi `preview` sa: svim terminima i cenama, noćima, prevozom, popustom, agencijom i linkom — tako se detalji vide već pri prelasku preko opcije.
- **Najbolje ponude:** meni sa kriterijumima (preporučeno, najveći popust, najjeftinije, specijalne / poslednja mesta; ostali preko "Other": polazi uskoro, izleti). Podaci: `pt --json preporuke` ili `pt --json zemlja` / `zemlje` + sortiranje po kriterijumu.
- **Izabrana ponuda:** `pt --json ponuda <ID> --detalji` i prikaži: svi termini sa cenama, šta cena obuhvata, šta ne obuhvata (doplate), program ukratko, link. Zatim meni:
  - 📌 Stavi u Trello (📬 Predlozi)
  - 🔍 Uporedi (iste destinacije kod drugih agencija + "uradi sam" let i smeštaj, po skillu)
  - 🔗 Pošalji mi link / otvori
  - ↩️ Nazad na <zemlja>

## Trello

Klik na "📌 Stavi u Trello" je potvrda — napravi karticu odmah (Trello MCP, lista `trello.lists.predlozi` iz `pt --json profil`; prethodno `trelloSearch` po linku da ne dupliraš). Naziv `Destinacija · Agencija · DD.MM.`, opis: zemlja, termini, noći, prevoz, cena po osobi, šta cena obuhvata, link, "provereno <datum>". `due` = polazak 09:00 Europe/Belgrade → UTC. Ako je ponuda bila označena u aplikaciji, posle slanja `pt izabrano --poslato <ID>`.

## Slobodno dopisivanje

Kad korisnik napiše nešto umesto da klikne ("a nešto jeftinije u decembru?", "šta je bolje, Bali ili Tajland?", "koliko košta let do Lisabona?"), odgovori normalno po skillu `putesestvije-planer` (baza, pretraga, konektori za letove i smeštaj), pa na kraju ponudi meni sa 2–4 logična sledeća koraka. Ne ponavljaj pozdravni pregled.

## Pravila

- Ništa ne izmišljaj: cene, datumi i šta je uključeno dolaze iz `pt` ili sa sajta agencije; ako nečega nema, piši "na sajtu" sa linkom.
- Filip Travel, Ponte i Plana nisu u bazi; za zemlju koja ih zanima proveri ih po koraku 2 iz `/putesestvije:zemlja`.
- Jedan meni po odgovoru. Bez dugih uvoda pre menija.
