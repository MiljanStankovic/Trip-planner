---
name: agencije-pregled
description: Nedeljni ili dvonedeljni pregled ponuda domaćih turističkih agencija. Skenira agencije, poredi sa prošlim cenama, bira najbolje po profilu i piše kratak izveštaj. Koristi za "šta ima novo", "pregled agencija", "nedeljni pregled" i zakazana pokretanja.
---

# Pregled agencija

Cilj: jednom nedeljno (ili na dve nedelje) kratak, iskren pregled šta vredi od ponuda agencija. Srpski, latinica, preporuka na vrhu, cene po osobi.

## Koraci

1. **Profil.** `pt --json profil`. Ako nema config.toml, radi sa podrazumevanim i napomeni to na kraju.

2. **Skeniraj.** `pt --json agencije skeniraj`, pa `pt --json izvori` za greške po agenciji. Zatim `pt --json obavestenja`: padovi cena praćenih aranžmana i nove ponude po željama idu prvi u pregled.

3. **Filip Travel, Ponte i Plana se u nedeljnom pregledu preskaču.** Njih čitaš samo kad korisnik pozove `/putovanja:agencije` ili `/putovanja:zemlja`. U izveštaju ih ne pominji kao grešku.

4. **Izaberi.** `pt --json preporuke --limit 12` i `pt --json agencije nove --dana 14`. Od toga izaberi **najviše 5** stvarno dobrih:
   - po jedna destinacija, raznovrsno (city break avionom, autobusom, wellness, praznici)
   - prednost: sniženje, najniža cena do sada, "poslednja mesta", popust za više osoba kad putuje više ljudi, poklapanje sa onim što korisnik voli, polazak u narednih 2–8 nedelja
   - za 1–2 najjače uradi brzu proveru "uradi sam" cene (let + smeštaj, konektori ili web pretraga) i reci da li je aranžman isplativ
   - izbaci rasprodato i ono što je u `dislikes`

5. **Dodaci.** Ako je uključen plugin **putovanja-trello**, uradi i korake iz njegovog skilla `trello-tabla` (odeljak "Uz nedeljni pregled"). Inače ih preskoči i ne pominji.

6. **Izveštaj.** Napiši `izvestaji/YYYY-MM-DD.md` u trenutnom folderu i prikaži ga:

```
# Putovanja · pregled <datum>

## Preporuka nedelje
<jedna ponuda, dve rečenice zašto, cena po osobi, rok, link>

## Ponude agencija (top 5)
| Polazak | Destinacija | Agencija | Noći | Cena/os. | Popusti | Zašto |

## Promene cena
- <ponuda>: <stara> → <nova> €

## Napomene
- greške po agencijama, šta nije provereno (TBC)
```

Kratko. Bez ponavljanja istih ponuda iz prošlog izveštaja ako se ništa nije promenilo (pročitaj poslednji fajl u `izvestaji/`).

## Šta ne radiš
- Ne bukiraš, ne plaćaš, ne šalješ mejlove.
- Ne zaobilaziš sajtove koji ne dozvoljavaju čitanje.
