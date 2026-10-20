# Putovanja: dodatak za Claude desktop (lokalno)

Isti prozor kao konektor, ali sve radi na tvom računaru: dodatak sam skenira agencije i čuva bazu u
`~/.local/share/putovanja` (istu kao alat `pt` u terminalu). Za većinu je jednostavniji **konektor** sa
[putovanja.miljan-stankovic99.workers.dev](https://putovanja.miljan-stankovic99.workers.dev): radi i na telefonu i
tabletu, bez instalacije. Dodatak je za one koji žele podatke lokalno.

Dodatak je tipa `uv`: Claude aplikacija sama namesti Python, ne treba ga instalirati.

## Instalacija

1. Skini [Putovanja.mcpb](https://github.com/MiljanStankovic/Trip-planner/raw/main/mcp/Putovanja.mcpb).
2. Dvoklik na fajl, ili u Claude aplikaciji: Settings → Extensions → Advanced settings → Install Extension….
3. Install. U novom razgovoru napiši **„pokaži mi putovanja”**.

## Šta je unutra

| Fajl | Šta je |
|---|---|
| `manifest.json` | opis dodatka i alata |
| `src/server.py` | lokalni MCP server (alati `otvori_putovanja`, `detalji_ponude`, `skeniraj_agencije`, `putovanja_podaci`) |
| `ui/prozor.src.html` | izvor prozora, isti za dodatak i za konektor na Cloudflare-u |
| `napravi.py` | ugradi MCP Apps SDK u `src/prozor.html` (prozor nema pristup internetu) i spakuje `.mcpb` |

## Pravljenje paketa

```bash
python mcp/napravi.py           # samo prozor: mcp/src/prozor.html
python mcp/napravi.py --paket   # i mcp/Putovanja.mcpb (treba npm/npx)
```

Nova verzija: podigni verziju na svim mestima navedenim u glavnom [README-u](../README.md#razvoj), napravi paket i
commituj `mcp/Putovanja.mcpb` u `main` (link za preuzimanje uvek vodi na taj fajl).
