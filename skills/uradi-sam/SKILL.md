---
name: uradi-sam
description: Putovanje u sopstvenoj režiji za Miljana i devojku - prevoz (avion, autobus, voz, auto) i smeštaj (Booking, Trivago, Airbnb, hoteli) za zadatu destinaciju i datume, sa ukupnom cenom za sve i poređenjem sa agencijama. Koristi kad stigne poruka iz panoa "Uradi sam" ili kad pitaju koliko košta da odu sami.
---

# Uradi sam

Cilj: 2–3 realne kombinacije **prevoz + smeštaj** sa ukupnom cenom za sve putnike, sačuvane u alat `pt` da se vide u panou (odeljak 🧭 Uradi sam), i kratko poređenje sa ponudama agencija za istu destinaciju.

## Ulaz
Odakle (podrazumevano Beograd), kuda, datum polaska i povratka, broj osoba (`pt --json stanje` → `putnika`, podrazumevano 2). Ako fali datum, pitaj jednom; ako fali broj noći, uzmi vikend (pet–ned).

## Koraci

1. **Prevoz.** Proveri sve što ima smisla za tu relaciju, ne samo avion:
   - **Avion:** alati za letove ako su povezani (npr. SlickTrip `search_flights`, Expedia `search_flights`, eDreams `search_flights`). Iz Beograda i sa alternativnih aerodroma iz profila (`pt --json profil`: BUD, TSR, INI) kad su osetno jeftiniji, uz trošak dolaska do njih. Cena za sve putnike, sa prtljagom ako se zna.
   - **Autobus:** FlixBus, GetByBus/BusTicket4.me, domaći prevoznici (WebSearch + WebFetch). Red vožnje i cena povratne karte.
   - **Voz:** Srbijavoz, MÁV, ÖBB i sl. (npr. Beograd–Subotica–Budimpešta). Cena i trajanje.
   - **Auto:** km, gorivo (~7 l/100 km, cena goriva u Srbiji), putarine i vinjete, parking na destinaciji.
2. **Smeštaj.** Alati za hotele ako su povezani (SlickTrip `search_hotels`, Expedia `search_hotels`), inače WebSearch. Booking i Trivago ne mogu da se čitaju direktno: daj link za pretragu sa datumima i broj osoba (pano ih već ima), a cene uzmi iz alata ili pretrage. Traži centar ili dobru vezu javnim prevozom, ocena 8+, doručak kad ima smisla.
3. **Kombinacije.** Napravi 2–3 različite: najjeftinija, najudobnija, najbolji odnos. Sve cene su **ukupne za sve putnike** u EUR (dinare preračunaj po `rsd_per_eur` iz profila ili ostavi `"valuta": "RSD"`). Dodaj `ostalo` za ono što se plaća sigurno (gradski prevoz, boravišna taksa ako nije u ceni).
4. **Sačuvaj** u `pt` (JSON lista, oblik je opisan u `src/putesestvije/diy.py`):
   ```bash
   pt --json uradisam sacuvaj kombinacije.json     # ili: ... | pt --json uradisam sacuvaj -
   ```
   Polja: `kuda, odakle, od, do, osoba, naslov, prevoz[{tip, opis, cena, valuta, link}], smestaj[{naziv, opis, cena, valuta, ocena, link}], ostalo[{opis, cena, valuta}], napomena, izvori[]`. Uvek link do mesta gde se rezerviše.
5. **Poređenje sa agencijama:** `pt --json zemlja "<kuda>"` (radi i za grad). Najbolja agencijska ponuda za iste ili bliske datume: cena po osobi × broj osoba + takse (`pt --json ponuda <ID> --detalji` → `ukupno`).
6. **Odgovor** (kratko, srpski latinica): tabela kombinacija (prevoz, smeštaj, ukupno, po osobi) + red "Agencija:" za poređenje, i jedna rečenica šta bi ti izabrao i zašto. Reci da su kombinacije u panou (🧭 Uradi sam). Na kraju `Sources:` sa linkovima.

## Pravila
- Ne rezerviši i ne plaćaj ništa. Samo linkovi.
- Cene sa datumom provere; ako cenu nisi našao, ostavi `cena` prazno i reci to (pano će označiti kombinaciju kao nepotpunu).
- Ako alat za letove/hotele nije povezan, reci to u jednoj rečenici i radi preko pretrage.
