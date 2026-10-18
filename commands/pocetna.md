---
description: Početni ekran — Trello tabla, preporuke agencija i šta je novo, u jednom pregledu
---

Napravi početni ekran Putešestvija:

1. Pokreni `pt --json preporuke --limit 6` i `pt --json agencije nove --dana 7` (bez skeniranja; ako je baza prazna, predloži `/putesestvije:agencije`).
2. Pročitaj Trello tablu Putešestvije preko Trello MCP-a (`trelloReadCard` `list_by_board`, board iz `pt --json profil`).
3. Prikaži kompaktno:
   - **Tabla:** broj kartica po listi; šta je u *Planirano* sa datumima; šta čeka u *📬 Predlozi*.
   - **⭐ Preporuke:** tabela (ID, polazak, destinacija, cena, zašto).
   - **🆕 Novo ove nedelje:** do 5 stavki.
   - **Predlog za sledeći korak:** jedna rečenica (npr. "Barselona 21.10. je 459 € umesto 499 €, hoćeš da je stavim u Predloge?").
4. Na kraju ponudi modove: `/putesestvije:predlozi`, `/putesestvije:istrazi`, `/putesestvije:planiraj`, `/putesestvije:agencije`, `/putesestvije:pregled`.

Za pun terminalski prikaz korisnik može da pokrene samo `pt` u terminalu.
