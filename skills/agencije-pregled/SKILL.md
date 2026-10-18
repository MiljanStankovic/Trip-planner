---
name: agencije-pregled
description: Nedeljni ili dvonedeljni pregled ponuda domaćih turističkih agencija i Trello table Putešestvije. Skenira agencije, poredi sa prošlim cenama, bira najbolje po našem profilu, piše sažetak i stavlja predloge u listu Predlozi. Koristi za "šta ima novo", "pregled agencija", "nedeljni pregled" i zakazana pokretanja.
---

# Pregled agencija i predloga

Cilj: jednom nedeljno (ili na dve nedelje) da dobijemo kratak, iskren pregled šta vredi od ponuda agencija i šta sa naše table ima smisla uraditi uskoro. Srpski, latinica, preporuka na vrhu.

## Koraci

1. **Profil.** `pt --json profil`. Ako nema config.toml, radi sa podrazumevanim i napomeni to na kraju.

2. **Skeniraj agencije koje čita Python.** `pt --json agencije skeniraj`. Zabeleži greške po agenciji.

3. **Filip Travel, Ponte i Plana se u nedeljnom pregledu preskaču.** Njih čitaš samo kad korisnik pozove `/putesestvije:agencije` ili `/putesestvije:zemlja`. U izveštaju ih ne pominji kao grešku.

4. **Izaberi.** `pt --json preporuke --limit 12` i `pt --json agencije nove --dana 14`. Od toga izaberi **najviše 5** stvarno dobrih:
   - po jedna destinacija, raznovrsno (city break avionom, autobusom, wellness, praznici)
   - prednost: sniženje, najniža cena do sada, "poslednja mesta", poklapanje sa onim što volimo, polazak u narednih 2–8 nedelja
   - za 1–2 najjače uradi brzu proveru "uradi sam" cene (let + smeštaj, konektori ili web pretraga) i reci da li je aranžman isplativ
   - izbaci rasprodato i ono što je u `dislikes`

5. **Trello tabla.** Pročitaj tablu (Trello MCP `trelloReadCard` `list_by_board`, ili `pt --json trello tabla`). Nađi 2–3 ideje koje imaju smisla u narednih 14 dana: sezonske (labela trenutne sezone, adventi od kraja novembra), one sa skorim rokom, i one za koje je vreme dobro. Za vremensku proveru koristi prognozu samo za narednih ~10 dana.

6. **Predlozi u Trello.** Za izabrane ponude (najviše 5) napravi kartice u listi **📬 Predlozi** (`trelloWriteCard` `create`, lista iz profila `trello.lists.predlozi`, ili `pt trello predlog <ID>`). Naziv: `Destinacija · agencija · polazak`. Opis: cena po osobi (i stara cena), noćenja, prevoz, šta je uključeno ako se zna, link, "provereno <datum>", jedna rečenica zašto. Pre pravljenja proveri da kartica sa istim linkom već ne postoji u Predlozima (`trelloSearch`), da ne dupliraš.
   - U interaktivnom radu pitaj pre upisa. U zakazanom (automatskom) pokretanju upiši bez pitanja, to je dogovoreno.
   - Kartice koje su u Predlozima duže od 3 nedelje i polazak im je prošao, premesti u arhivu (`archive`) i navedi ih u izveštaju.

7. **Izveštaj.** Napiši `izvestaji/YYYY-MM-DD.md` u repou i prikaži ga:

```
# Putešestvije · pregled <datum>

## Preporuka nedelje
<jedna ponuda, dve rečenice zašto, cena, rok, link>

## Ponude agencija (top 5)
| Polazak | Destinacija | Agencija | Noći | Cena/os. | Zašto |

## Sa naše table za narednih 14 dana
- <kartica> — <zašto sad, vreme, rok>

## Promene cena
- <ponuda>: <stara> → <nova> €

## Napomene
- greške po agencijama, šta nije provereno (TBC)
```

Kratko. Bez ponavljanja istih ponuda iz prošlog izveštaja ako se ništa nije promenilo (pročitaj poslednji fajl u `izvestaji/`).

## Šta ne radiš
- Ne bukiraš, ne plaćaš, ne šalješ mejlove.
- Ne menjaš kartice van liste Predlozi, osim ako mi to tražimo.
- Ne zaobilaziš sajtove koji ne dozvoljavaju čitanje.
