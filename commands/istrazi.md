---
description: Istraživački mod — letovi, smeštaj, destinacija, aranžmani agencija, poređenje
argument-hint: "<destinacija ili pitanje, npr. 'Barselona novembar 4 noći' ili 'jeftini letovi iz BEG za decembar'>"
---

Koristi skill `putovanja-planer` za: **$ARGUMENTS**

- Pitaj samo ono što menja odgovor (datumi, budžet), sve u jednoj poruci; ostalo uzmi iz `pt --json profil`.
- Pretrage pokreći paralelno: letovi (SlickTrip/eDreams/Expedia ili web), smeštaj (3 kvarta pa 3 smeštaja), aranžmani agencija (`pt --json preporuke` + filtriraj po destinaciji), vize/ulazak za srpski pasoš, vreme, radno vreme.
- Uporedi aranžman agencije sa "uradi sam" varijantom (prtljag, transfer, taksa uračunati).
- Završi sa: preporuka, tri opcije, šta treba rezervisati i do kada, potvrđeno / pretpostavka / treba proveriti, izvori.
- Ako je uključen dodatak putovanja-trello, ponudi da izabrano stavi na tablu.
