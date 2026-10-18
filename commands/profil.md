---
description: Pogledaj ili promeni naš profil putovanja (aerodrom, budžet, šta volimo)
argument-hint: "[šta menjaš, npr. 'budžet 500' ili 'dodaj Beč u likes']"
---

1. `pt --json profil` i pročitaj config.toml na putanji koju vrati (ako ne postoji, `pt init`).
2. Ako je zadata izmena (**$ARGUMENTS**), izmeni samo te vrednosti u config.toml (Edit), pokaži razliku i potvrdi.
3. Ako nije, prikaži profil čitljivo i pitaj šta fali: polazni aerodrom, budžet po osobi, prevoz, broj noćenja, šta volimo, šta ne volimo.
4. Nikad ne upisuj Trello ključ ili token u config.toml — ide u okruženje (TRELLO_KEY, TRELLO_TOKEN).
