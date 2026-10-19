---
description: Pogledaj ili promeni profil putovanja (aerodrom, putnici, budžet, šta voliš)
argument-hint: "[šta menjaš, npr. 'budžet 500' ili 'dodaj Beč u likes']"
---

1. `pt --json profil` i pročitaj config.toml na putanji koju vrati (ako ne postoji, `pt init`).
2. Ako je zadata izmena (**$ARGUMENTS**), izmeni samo te vrednosti u config.toml (Edit), pokaži razliku i potvrdi.
3. Ako nije, prikaži profil čitljivo i pitaj šta fali: polazni aerodrom, broj odraslih i dece (i uzrast dece), budžet po osobi, prevoz, broj noćenja, šta voli, šta ne voli.
4. Nikad ne upisuj ključeve ili tokene u config.toml; idu u okruženje.
