---
description: Šta agencije nude za zemlju ili grad — pregled, najbolji termini i detalji sa sajtova
argument-hint: "<zemlja ili grad, npr. 'Tajland', 'Budimpešta', 'Egipat'>"
---

Koristi skill `putesestvije-planer`. Zemlja ili grad: **$ARGUMENTS**

1. `pt --json zemlja $ARGUMENTS`. Ako je baza starija od 3 dana (polje `last_seen`), prvo `pt --json agencije skeniraj`.
2. Grupiši po turi (ista agencija i link = jedna tura sa više termina). Za svaku: agencija, noći, prevoz, raspon cena, prvi i ostali termini, popust.
3. Za 3–5 najzanimljivijih (cena, popust, termin koji odgovara) pozovi `pt --json ponuda <ID> --detalji` i iz `sa_sajta` izvuci: šta cena obuhvata, šta ne obuhvata (doplate, takse, osiguranje), program ukratko.
4. Prikaži: preporuka na vrhu, tabela tura, pa detalji za izabrane. Za ture iz inostranstva napomeni ulazak za srpski pasoš ako treba (proveri na zvaničnom izvoru).
5. Ako u bazi nema ništa za tu zemlju, reci to i ponudi pretragu letova i smeštaja (konektori ili web).
6. Ponudi: "Koje da stavim u 📬 Predlozi na Trello?" — upis tek posle odgovora (Trello MCP), pa `pt izabrano --poslato <ID...>` nije potreban jer nisu označene u aplikaciji.
