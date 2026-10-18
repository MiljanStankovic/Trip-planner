---
description: Pošalji ponude označene u aplikaciji (taster t) na Trello, u listu 📬 Predlozi
---

1. `pt --json izabrano`. Ako je prazno, reci da se ponude označavaju u aplikaciji `pt` tasterom **t**.
2. Pokaži spisak (destinacija, agencija, polazak, cena, link) i pitaj da li da ih pošalješ. Ako je korisnik već rekao "pošalji", nastavi.
3. Za svaku ponudu napravi karticu u listi 📬 Predlozi (Trello MCP `trelloWriteCard` `create`; ID liste iz `pt --json profil` → `trello.lists.predlozi`). Pre toga `trelloSearch` po linku, da ne dupliraš.
   - Naziv: `Destinacija · Agencija · DD.MM.`
   - Opis: zemlja, svi termini, noći, prevoz, cena po osobi (i stara cena), šta cena obuhvata ako je poznato (`pt --json ponuda <ID> --detalji`), link, "provereno <datum>".
   - `due` = datum polaska (09:00 Europe/Belgrade → UTC).
4. Posle uspešnog slanja: `pt izabrano --poslato <ID...>`.
5. Na kraju: koliko kartica je napravljeno, sa linkovima.
