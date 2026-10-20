"""Destinacija → zemlja → kontinent, na osnovu naziva, naslova i linka ponude.

Proširuje se dodavanjem ključnih reči u KEYWORDS (mala slova, bez kvačica).
"""

from __future__ import annotations

import re
import unicodedata

CONTINENT = {
    # Evropa
    "Srbija": "Evropa", "Grčka": "Evropa", "Italija": "Evropa", "Španija": "Evropa", "Francuska": "Evropa",
    "Portugalija": "Evropa", "Austrija": "Evropa", "Mađarska": "Evropa", "Češka": "Evropa", "Nemačka": "Evropa",
    "Hrvatska": "Evropa", "Slovenija": "Evropa", "Bosna i Hercegovina": "Evropa", "Crna Gora": "Evropa",
    "Severna Makedonija": "Evropa", "Rumunija": "Evropa", "Bugarska": "Evropa", "Albanija": "Evropa",
    "Malta": "Evropa", "Kipar": "Evropa", "Poljska": "Evropa", "Holandija": "Evropa", "Belgija": "Evropa",
    "Švajcarska": "Evropa", "Velika Britanija": "Evropa", "Irska": "Evropa", "Danska": "Evropa",
    "Švedska": "Evropa", "Norveška": "Evropa", "Finska": "Evropa", "Island": "Evropa", "Slovačka": "Evropa",
    "Rusija": "Evropa", "Turska": "Evropa", "Gruzija": "Azija", "Jermenija": "Azija",
    # Azija i Bliski istok
    "Tajland": "Azija", "Vijetnam": "Azija", "Kambodža": "Azija", "Indonezija": "Azija", "Singapur": "Azija",
    "Malezija": "Azija", "Filipini": "Azija", "Japan": "Azija", "Kina": "Azija", "Južna Koreja": "Azija",
    "Indija": "Azija", "Šri Lanka": "Azija", "Maldivi": "Azija", "Nepal": "Azija", "Uzbekistan": "Azija",
    "UAE": "Azija", "Oman": "Azija", "Katar": "Azija", "Jordan": "Azija", "Izrael": "Azija",
    # Afrika
    "Egipat": "Afrika", "Maroko": "Afrika", "Tunis": "Afrika", "Alžir": "Afrika", "Kenija": "Afrika",
    "Tanzanija": "Afrika", "Južna Afrika": "Afrika", "Mauricijus": "Afrika", "Sejšeli": "Afrika",
    "Zelenortska Ostrva": "Afrika", "Namibija": "Afrika", "Madagaskar": "Afrika",
    # Amerike
    "SAD": "Severna Amerika", "Kanada": "Severna Amerika", "Meksiko": "Severna Amerika",
    "Kuba": "Karibi i Centralna Amerika", "Dominikanska Republika": "Karibi i Centralna Amerika",
    "Jamajka": "Karibi i Centralna Amerika", "Kostarika": "Karibi i Centralna Amerika",
    "Panama": "Karibi i Centralna Amerika", "Aruba": "Karibi i Centralna Amerika",
    "Sveti Martin": "Karibi i Centralna Amerika",
    "Brazil": "Južna Amerika", "Argentina": "Južna Amerika", "Peru": "Južna Amerika", "Čile": "Južna Amerika",
    "Kolumbija": "Južna Amerika", "Ekvador": "Južna Amerika", "Bolivija": "Južna Amerika",
    # Okeanija
    "Australija": "Okeanija", "Novi Zeland": "Okeanija", "Francuska Polinezija": "Okeanija",
}

# ključna reč (bez kvačica) -> zemlja. Duže reči imaju prednost.
KEYWORDS: dict[str, str] = {}


def _add(country: str, *words: str) -> None:
    for w in words:
        KEYWORDS[w] = country


_add("Srbija", "srbija", "kopaonik", "zlatibor", "tara", "divcibare", "vrnjacka", "sokobanja", "novi sad",
     "stanisici", "soko terme", "vrdnik", "prolom", "banja koviljaca", "radan", "tonanti", "solaris", "izvor",
     "breza", "fruske terme", "subotica", "nis")
_add("Grčka", "grcka", "atina", "solun", "halkidik", "kasandra", "sitonij", "tasos", "krf", "lefkada", "zakintos",
     "krit", "rodos", "santorini", "mikonos", "kavala", "pefkohori", "hanioti", "olympic beach", "paralija",
     "paralia", "vrasna", "edipsos", "evia", "agia triada", "peloponez", "parga", "sivota", "nea kalikratija",
     "stavros", "asprovalta", "kos", "pelion", "olimpska", "polihrono")
_add("Italija", "italija", "rim", "milano", "venecija", "veneto", "toskana", "firenc", "napulj", "sicilij",
     "palermo", "sardinij", "alghero", "algero", "bari", "pulj", "apulj", "rimini", "bolonj", "san marino",
     "sanremo", "dolomit", "tirol", "trst", "verona", "como", "gardaland", "garda", "torino", "amalfi", "kapri")
_add("Španija", "spanij", "barselon", "madrid", "valensij", "valencia", "sevilj", "sevilla", "andaluz",
     "torremolinos", "malaga", "benidorm", "tenerif", "kanarsk", "majork", "mallorca", "ibiza", "baskij",
     "bilbao", "granad")
_add("Portugalija", "portugal", "lisabon", "porto", "madeir", "algarve")
_add("Francuska", "francusk", "pariz", "nica", "azurn", "provans", "alzas", "kolmar", "strazbur", "burgundij",
     "bretanj", "normandij", "lion", "marsej", "disneyland", "dizniland", "korzik")
_add("Austrija", "austrij", "bec", "salcburg", "salzburg", "halstat", "grac", "insbruk", "parndorf")
_add("Mađarska", "madjarsk", "madarsk", "budimpest", "segedin", "sezged", "morahalom", "mako", "hajduszobosz",
     "debrecin", "balaton")
_add("Češka", "ceska", "prag", "karlove vari", "cesky krumlov")
_add("Nemačka", "nemack", "berlin", "minhen", "drezden", "svarcvald", "keln", "hamburg", "nirnberg")
_add("Hrvatska", "hrvatsk", "zagreb", "istr", "dubrovnik", "split", "plitvic", "opatij", "tuhelj", "rovinj")
_add("Slovenija", "slovenij", "ljubljan", "bled", "bohinj", "portoroz", "kranjska gora", "terme krka",
     "catez", "lasko", "olimia", "rimske terme", "rogaska", "dobrna", "zrece", "topolsica", "ptuj",
     "moravske toplice", "maribor", "piran", "postojn")
_add("Bosna i Hercegovina", "bosn", "hercegovin", "sarajev", "mostar", "trebinj", "jahorin", "vrucic", "visegrad")
_add("Crna Gora", "crna gora", "budva", "kotor", "zabljak", "herceg novi", "ulcinj")
_add("Severna Makedonija", "makedonij", "ohrid", "skopj")
_add("Rumunija", "rumunij", "temisvar", "krajov", "bukurest", "transilvanij", "brasov", "sibiu")
_add("Bugarska", "bugarsk", "bansko", "borovec", "pamporovo", "sofij", "sunčev breg", "suncev breg", "nesebar")
_add("Albanija", "albanij", "drac", "tirana", "saranda", "ksamil", "valona")
_add("Malta", "malta")
_add("Kipar", "kipar", "aja napa", "ayia napa", "larnaka", "pafos", "limasol", "protaras")
_add("Poljska", "poljsk", "krakov", "varsav")
_add("Holandija", "holandij", "amsterdam")
_add("Belgija", "belgij", "brisel", "brige")
_add("Švajcarska", "svajcarsk", "cirih", "zeneva", "lucern", "interlaken")
_add("Velika Britanija", "london", "engleska", "skotsk", "edinburg", "britanij")
_add("Irska", "irsk", "dablin")
_add("Danska", "dansk", "kopenhag")
_add("Švedska", "svedsk", "stokholm")
_add("Norveška", "norvesk", "oslo", "fjord")
_add("Finska", "finsk", "helsink", "laponij", "rovaniemi")
_add("Island", "island", "rejkjavik")
_add("Slovačka", "slovack", "bratislav")
_add("Rusija", "rusij", "moskv", "peterburg")
_add("Turska", "turska", "istanbul", "antalij", "alanj", "kemer", "side", "belek", "bodrum", "kusadas",
     "egejsk", "kapadokij", "didim", "marmaris", "fetije")
_add("Gruzija", "gruzij", "tbilisi", "batumi")
_add("Jermenija", "jermenij", "jerevan")
_add("Tajland", "tajland", "bangkok", "puket", "phuket", "pataj", "ko samui", "krabi", "cijang maj", "chiang")
_add("Vijetnam", "vijetnam", "hanoj", "ha long", "hoi an")
_add("Kambodža", "kambodz", "angkor")
_add("Indonezija", "indonezij", "bali", "lombok", "dzakart")
_add("Singapur", "singapur")
_add("Malezija", "malezij", "kuala lumpur", "langkavi")
_add("Filipini", "filipin")
_add("Japan", "japan", "tokio", "kjoto", "osaka")
_add("Kina", "kina", "kines", "peking", "sangaj", "hong kong")
_add("Južna Koreja", "koreja", "seul")
_add("Indija", "indij", "goa", "radzastan", "delhi")
_add("Šri Lanka", "sri lank", "sri-lank")
_add("Maldivi", "maldiv")
_add("Nepal", "nepal", "katmandu")
_add("Uzbekistan", "uzbekistan", "samarkand", "buhar")
_add("UAE", "dubai", "abu dabi", "emirat")
_add("Oman", "oman", "muskat")
_add("Katar", "katar", "doha")
_add("Jordan", "jordan", "petra", "akab")
_add("Izrael", "izrael", "jerusalim", "tel aviv")
_add("Egipat", "egipat", "hurgad", "sarm el", "sharm", "kairo", "nil", "marsa alam", "makadi", "safaga")
_add("Maroko", "maroko", "marakes", "kazablank", "agadir", "fes")
_add("Tunis", "tunis", "dzerb", "hamamet", "susa", "monastir")
_add("Alžir", "alzir")
_add("Kenija", "kenij", "masai", "mombas", "nairobi")
_add("Tanzanija", "tanzanij", "zanzibar", "serengeti", "kilimandzaro")
_add("Južna Afrika", "juzna afrika", "juznoafricka", "kejptaun")
_add("Mauricijus", "mauricijus")
_add("Sejšeli", "sejsel")
_add("Zelenortska Ostrva", "zelenortsk", "cape verde")
_add("Namibija", "namibij")
_add("Madagaskar", "madagaskar")
_add("SAD", "sad", "amerik", "njujork", "new york", "majami", "las vegas", "kalifornij", "florid", "zapadne amerike")
_add("Kanada", "kanad", "toronto", "vankuver")
_add("Meksiko", "meksik", "kankun", "cancun", "jukatan", "riviera maya", "tulum")
_add("Kuba", "kuba", "havan", "varadero")
_add("Dominikanska Republika", "dominikan", "punta kana", "punta cana")
_add("Jamajka", "jamajk")
_add("Kostarika", "kostarik", "costa rica")
_add("Panama", "panama")
_add("Aruba", "aruba")
_add("Brazil", "brazil", "rio de zaneiro")
_add("Argentina", "argentin", "buenos ajres")
_add("Peru", "peru", "maču pikču", "macu picu")
_add("Čile", "cile")
_add("Kolumbija", "kolumbij")
_add("Ekvador", "ekvador", "galapagos")
_add("Bolivija", "bolivij")
_add("Australija", "australij", "sidnej")
_add("Novi Zeland", "novi zeland")
_add("Francuska Polinezija", "polinezij", "bora bora", "tahiti")

# Opšte regije bez jedne zemlje
REGIONS = {
    "indokin": ("Više zemalja", "Azija"),
    "juzna amerika": ("Više zemalja", "Južna Amerika"),
    "karibi": ("Više zemalja", "Karibi i Centralna Amerika"),
    "skandinav": ("Više zemalja", "Evropa"),
    "baltik": ("Više zemalja", "Evropa"),
}

_add("Španija", "ljoret", "lloret")
_add("Francuska", "les orres", "les 2 alpes", "deux alpes", "villarodin", "serre chevalier", "risoul", "val thorens", "tignes")
_add("Dominikanska Republika", "bayahibe", "bavaro", "la romana")
_add("Sveti Martin", "st martin", "saint martin", "sint maarten")
_add("Italija", "emilij", "romanj", "san remo", "livigno", "val di sole", "marilleva", "severn italij")
_add("Francuska", "sybelles")
_add("Grčka", "atin")
_add("Malta", "malt")
_add("Slovenija", "slovenack", "radenc")
_add("Mađarska", "pecuj")
_add("Nemačka", "bavarsk")

# Padeži: „u Milanu”, „u Veneciji”, „po Toskani”. Za duže reči ključ bez poslednjeg samoglasnika
# (milano -> milan, italija -> italij), da pogodi sve oblike; kraće reči ostaju cele (porto ≠ portorož).
for _w, _c in list(KEYWORDS.items()):
    if len(_w) >= 6 and _w[-1] in "aeiou" and " " not in _w:
        KEYWORDS.setdefault(_w[:-1], _c)

_SORTED = sorted(KEYWORDS.items(), key=lambda kv: -len(kv[0]))


def fold(text: str) -> str:
    """mala slova, bez kvačica, đ->dj, ostali znakovi u razmake."""
    t = text.lower().replace("đ", "dj")
    t = "".join(c for c in unicodedata.normalize("NFKD", t) if not unicodedata.combining(c))
    return " " + re.sub(r"[^a-z0-9]+", " ", t).strip() + " "


def classify(destination: str, title: str = "", url: str = "") -> tuple[str, str]:
    """Vraća (zemlja, kontinent). Najpre destinacija, pa naslov, pa link."""
    for text in (destination, title, url):
        f = fold(text or "")
        if f.strip() == "":
            continue
        for kw, country in _SORTED:
            # početak reči; 'rim' ne sme da pogodi 'primirja'
            if re.search(r" " + re.escape(kw), f):
                return country, CONTINENT.get(country, "Ostalo")
        for kw, (country, cont) in REGIONS.items():
            if " " + kw in f:
                return country, cont
    return "Nepoznato", "Ostalo"
