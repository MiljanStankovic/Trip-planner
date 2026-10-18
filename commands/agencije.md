---
description: Skeniraj domaće agencije (uključujući Filip Travel preko WebFetch-a) i prikaži nove i pojeftinjene ponude
argument-hint: "[destinacija ili tip, opciono]"
---

1. `pt --json agencije skeniraj`
2. Filip Travel: uradi korak 3 iz skilla `agencije-pregled` (WebFetch → JSON → `pt --json agencije ubaci <fajl>`).
3. `pt --json agencije nove --dana 7` i `pt --json preporuke --limit 10`.
4. Ako je zadat filter (**$ARGUMENTS**), prikaži samo ono što mu odgovara.
5. Prikaži tabelu (ID, polazak, destinacija, agencija, noći, cena/os., promena cene, zašto) i greške po agenciji. Napomeni Kontiki (ručno, kontiki.rs).
6. Ponudi: "Koje da stavim u 📬 Predlozi?" (ID-jevi) — upis tek posle odgovora.
