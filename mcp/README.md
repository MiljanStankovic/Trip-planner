# Putovanja za običan Claude chat

Dodatak za Claude desktop aplikaciju: u običnom razgovoru napišeš „pokaži mi putovanja“
ili „putovanja za Grčku“ i u poruci se otvori prozor sa ponudama agencija (datum, prevoz,
trajanje, cena po osobi i ukupno za putnike). Klik na ponudu otvara detalje u istom prozoru; „Pitaj Claude-a“ šalje ponudu u razgovor.

Prozor je cela aplikacija: ponude po zemljama, detalj ponude sa ukupnom cenom, kalendar, praćenje, uradi sam i izvori. Koristi istu bazu kao terminal (`~/.local/share/putovanja`). Na koraku 0 smo proverili:

1. da li Claude aplikacija prikazuje prozor za lokalni dodatak,
2. da li radi na besplatnom nalogu,
3. da li Claude sam namesti Python (dodatak je tipa `uv`, ne traži instaliran Python).

## Instalacija

1. Skini [Putovanja.mcpb](https://github.com/MiljanStankovic/Trip-planner/raw/main/mcp/Putovanja.mcpb) (poslednja verzija).
2. Dvoklik na fajl, ili u Claude aplikaciji: Settings → Extensions → Advanced settings → Install Extension….
3. Install. U novom razgovoru napiši: **pokaži mi putovanja**.

## Pravljenje paketa

```bash
python mcp/napravi.py --paket   # mcp/Putovanja.mcpb (treba npm/npx)
```

`napravi.py` ugradi MCP Apps SDK u `src/prozor.html` (prozor nema pristup internetu)
i spakuje folder alatom `@anthropic-ai/mcpb`.

## Nova verzija

1. Podigni verziju na tri mesta: `manifest.json`, `pyproject.toml`, `VERZIJA` u `src/server.py` i u `ui/prozor.src.html`
   (adresa prozora sadrži verziju, inače Claude prikazuje stari, zapamćeni prozor).
2. `python mcp/napravi.py --paket`
3. Commit `mcp/Putovanja.mcpb` u `main`: link za preuzimanje u README-u uvek vodi na taj fajl.
