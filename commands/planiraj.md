---
description: Isplaniraj izabranu karticu i prebaci je u Planirano (opis, datum, labela, kalendar)
argument-hint: "<naziv kartice, npr. 'Segedin'>"
---

Koristi skill `putesestvije-planer`. Kartica: **$ARGUMENTS**

1. Nađi karticu na tabli (`trelloSearch`). Ako ih ima više, pitaj koju.
2. Ako datum nije poznat, pitaj kada (ili predloži 2–3 termina; kalendar proveri ako je Google Calendar povezan).
3. Istraži koliko treba za tu vrstu stvari: za izlet adresa, radno vreme, cena, prevoz i vreme puta; za putovanje plan po danima, rezervacije i rokovi.
4. Pokaži plan i šta ćeš upisati, pa posle "da":
   - premesti karticu u **Planirano**
   - opis: sažetak (šta, kada, cena po osobi, link za rezervaciju, rok, provereno-datum)
   - `due` = datum (09:00 Europe/Belgrade → UTC)
   - sezonska labela
   - ponudi događaj u kalendaru i podsetnik za rok rezervacije
