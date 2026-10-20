---
name: trello-tabla
description: Trello tabla uz plugin Putovanja - ideje za izlete i putovanja, predlozi iz pregleda agencija, planirano i završeno. Koristi kad korisnik traži da nešto stavi na tablu, premesti u Planirano, pogleda ideje sa table, ili kad stigne poruka iz panoa "Stavi ponudu <ID> u Trello".
---

# Trello tabla

Trello tabla je samo tabla ideja i statusa. Istraživanje i savet se dešavaju u razgovoru (skill `putovanja:putovanja-planer`); u Trello upisuješ samo ono što je korisnik izabrao, ili kratak sažetak na karticu.

## Koja tabla

1. `pt --json profil` → `trello_board` i `profil` → liste u config.toml (`[trello]` i `[trello.lists]`).
2. Ako `trello_board` nije upisan: preko Trello konektora nađi korisnikove table (`trelloReadMember` `get_me`, pa njegove table), pitaj koju koristi za putovanja, pročitaj njene liste (`trelloReadBoard`) i ponudi da upišeš ID table i lista (bar `predlozi` i `planirano`) u config.toml. Ključeve nikad ne upisuj u config: `TRELLO_KEY` i `TRELLO_TOKEN` idu u okruženje, i trebaju samo za `pt trello` bez konektora.
3. Ako Trello konektor nije povezan i nema ključeva, reci kako se povezuje (Trello konektor na claude.ai, pa `/mcp` u Claude Code-u) i stani.

## Pravila

- Pre bilo kakvog upisa ili premeštanja reci šta ćeš uraditi i sačekaj "da". Izuzeci: poruka iz panoa (klik je potvrda) i zakazani pregled sa `auto`.
- Ne menjaj nazive lista, ne briši kartice i ne spajaj kartice, čak i kad liče (npr. više kartica za advente na različitim mestima).
- U opise ne upisuj brojeve rezervacija ni podatke o plaćanju.
- Pre pravljenja kartice proveri da kartica sa istim linkom već ne postoji (`trelloSearch`).

## Stavi ponudu u Trello (poruka iz panoa ili zahtev)

Lista **Predlozi** (ID iz `trello.lists.predlozi`). Naziv: `Destinacija · agencija · polazak`. Opis: cena po osobi (i stara cena), popusti za više osoba ako postoje, noći, prevoz, šta je uključeno, link, "provereno <datum>", jedna rečenica zašto. Bez konektora: `pt trello predlog <ID>`.

## Planiraj (kartica → Planirano)

1. Nađi karticu (`trelloSearch`); ako ih je više, pitaj koju.
2. Ako datum nije poznat, pitaj ili predloži 2–3 termina.
3. Istraži po skillu `putovanja:putovanja-planer` koliko treba za tu vrstu stvari.
4. Pokaži plan i šta ćeš upisati, pa posle "da": premesti u **Planirano**, u opis sažetak (šta, kada, cena po osobi, link za rezervaciju, rok, provereno-datum), `due` = datum polaska (09:00 po lokalnom vremenu korisnika, pretvoreno u UTC), sezonska labela ako tabla ima takve (pročitaj ih preko `trelloReadBoard`), pa ponudi događaj u kalendaru i podsetnik za rok rezervacije.

Kad se korisnik vrati sa puta, ponudi da se kartica premesti u **Završeno** (ako tabla ima takvu listu) i da se dopiše utisak.

## Uz pregled agencija (skill `putovanja:agencije-pregled`)

1. Pročitaj tablu i nađi 2–3 ideje koje imaju smisla u narednih 14 dana: sezonske, sa skorim rokom, i one za koje je vreme dobro (prognoza samo za narednih ~10 dana). U izveštaj ih dodaj pod "## Sa table za narednih 14 dana".
2. Izabrane ponude (najviše 5) stavi u **Predlozi** kao gore. U interaktivnom radu pitaj pre upisa; u zakazanom (`auto`) upiši bez pitanja.
3. Kartice u Predlozima starije od 3 nedelje kojima je polazak prošao arhiviraj i navedi ih u izveštaju.
