from datetime import date

from putovanja.models import parse_dates, parse_price
from putovanja.scrapers.bigblue import BigBlue
from putovanja.scrapers.odeon import Odeon
from putovanja.scrapers.travelland import Travelland

TRAVELLAND = """
<a href="/putovanja/barselona/putovanje-barselona-4-noci/1009/?dateFrom=2026-10-21&amp;dateTo=2026-10-25#x" class="card-list-item">
  <div class="departure">21.10.</div>
  <h4 class="title small">Putovanje Barselona - 4 noći</h4>
  <i class="las la-plane-departure"></i>
  <del class="unit-price-old pe-1">€ 499</del><div class="unit-price-total">€ 459</div>
</a>
<a href="/paket-aranzmani/egipat/hurgada/hotel-x/64/" class="card-list-item">
  <div class="departure">21.10.</div>
  <div class="fw-bold">EGIPAT - Hurgada 6 noći</div>
  <h4 class="title small">Hotel X 4*</h4>
  <i class="las la-plane-departure"></i><div class="unit-price-total">€ 1.165</div>
</a>
"""

BIGBLUE = """
<li><a href="https://bigblue.rs/sr/location/atina">Atina - 11.11, 29.12 i 30.12.2026.</a></li>
<li><a href="../location/pariz/">Pariz - od 11.11.2026. do 06.03.2027.</a></li>
<li><a href="https://bigblue.rs/sr/kontakt">Kontakt</a></li>
"""

ODEON = """
<div class="HorizontalImageGallery"><ul>
<li class="itm0"><div class="itm"><div class="caption"><div class="title">NAPULJ ✈ </div>
<div class="content"> POLAZAK 13.02.2027. City break </div>
<div class="detail"><a href="https://www.odeontravel.rs/lokacija/napulj/hotels">Više</a></div></div></div></li>
</ul></div>
"""


def test_travelland():
    offers = Travelland().parse(TRAVELLAND, "https://www.travelland.rs/")
    assert len(offers) == 2
    b, h = offers
    assert (b.date_from, b.date_to, b.nights, b.transport, b.price, b.old_price) == (
        "2026-10-21", "2026-10-25", 4, "avion", 459.0, 499.0)
    assert b.url.startswith("https://www.travelland.rs/putovanja/barselona/")
    assert h.destination == "Hurgada" and h.nights == 6 and h.price == 1165.0
    assert h.date_from and h.date_from.endswith("-10-21")


def test_bigblue():
    offers = BigBlue().parse(BIGBLUE, "https://bigblue.rs/sr/evropske-metropole")
    assert [o.destination for o in offers] == ["Atina", "Pariz"]
    assert offers[0].date_from == "2026-11-11"
    assert offers[0].extra_dates == ["2026-12-29", "2026-12-30"]
    assert offers[1].url == "https://bigblue.rs/sr/location/pariz/"


def test_odeon():
    offers = Odeon().parse(ODEON, "https://www.odeontravel.rs/stranica/gradovi-evrope")
    assert len(offers) == 1
    o = offers[0]
    assert o.destination == "Napulj" and o.date_from == "2027-02-13" and o.transport == "avion"


def test_helpers():
    assert parse_price("od 249€!") == 249.0
    assert parse_price("€ 1.195") == 1195.0
    assert parse_dates("17.11. i 24.11.", today=date(2026, 10, 18)) == ["2026-11-17", "2026-11-24"]
    assert parse_dates("05.01.", today=date(2026, 10, 18)) == ["2027-01-05"]


from putovanja.models import upcoming
from putovanja.scrapers.argus import Argus
from putovanja.scrapers.felix import Felix
from putovanja.scrapers.grandtours import GrandTours
from putovanja.scrapers.kontiki import Kontiki

ARGUS = """
<a class="promo-elements-standard" href="/aranzmani/dan-primirja"><h5 class="naslov">DAN PRIMIRJA</h5>
<p>ISTANBUL - 10.11. od 149€<br> PRAG - 10.11. od 139€<br></p></a>
"""

GRAND = """
<article class="tour_item"><h3><a href="https://grandtours.rs/aranzmani/budimpesta-izlet/">Budimpešta – Izlet</a></h3>
<span class="address">Budimpešta, Mađarska</span>
<div class="description"><p>Više Termina: 17.10. 31.10. 14.11. / Cena: 4.000din.</p></div></article>
<article class="tour_item"><h3><a href="https://grandtours.rs/aranzmani/bec/">Beč – 1 noćenje</a></h3>
<span class="address">Beč, Austrija</span>
<div class="description"><p>Termin putovanja : 13-16.11.2027./ Hit cena: 129€</p></div></article>
"""

FELIX = """
<div class="tour-box"><div class="tour-title"><a href="/putovanje-malta-avionom.html">PUTOVANJE MALTA 2026</a>
<span class="tour-box-tours-item-price">399 €</span><span class="tour-box-item-discount-price tour-box-tours-item-price">349 €</span></div></div>
"""

KONTIKI = '<li><a href="https://kontiki.rs/sr/tour/andaluzijska-tura-27-12-2027/">Andaluzijska tura (27.12.2027.)</a></li>'


def test_upcoming():
    assert upcoming(["2026-10-17", "2026-10-31", "2026-11-14"], today=date(2026, 10, 18)) == ("2026-10-31", ["2026-11-14"])


def test_argus():
    offers = Argus().parse(ARGUS, "https://argus.rs/")
    assert [(o.destination, o.price) for o in offers] == [("Istanbul", 149.0), ("Prag", 139.0)]
    assert offers[1].url == "https://argus.rs/aranzmani/dan-primirja"


def test_grandtours():
    izlet, bec = GrandTours().parse(GRAND, "https://grandtours.rs/")
    assert izlet.currency == "RSD" and izlet.price == 4000.0 and izlet.nights == 0
    assert izlet.destination == "Budimpešta"
    assert (bec.date_from, bec.date_to, bec.price, bec.currency) == ("2027-11-13", "2027-11-16", 129.0, "EUR")


def test_felix():
    (o,) = Felix().parse(FELIX, "https://www.felixtravel.rs/")
    assert (o.destination, o.price, o.old_price, o.transport) == ("Malta", 349.0, 399.0, "avion")


def test_kontiki():
    (o,) = Kontiki().parse(KONTIKI, "https://kontiki.rs/sr/")
    assert o.source == "kontiki" and o.destination == "Andaluzijska tura" and o.date_from == "2027-12-27"


from putovanja.models import parse_month_words
from putovanja.scrapers.halotours import HaloTours
from putovanja.scrapers.jungletribe import JungleTribe

HALO = """<div class="gdl-package-grid2"><h2 class="package-title"><a href="https://www.halotours.rs/aranzman/advent-u-budimpesti/">Budimpešta</a></h2>
<span class="package-price">3999 dinara</span><div class="package-date">04 dec 2027 - 06 dec 2027</div></div>"""


def test_month_words():
    assert parse_month_words("21 okt", today=date(2026, 10, 18)) == ["2026-10-21"]


def test_halotours():
    (o,) = HaloTours().parse(HALO, "https://www.halotours.rs/")
    assert (o.destination, o.price, o.currency, o.date_from, o.nights) == ("Budimpešta", 3999.0, "RSD", "2027-12-04", 2)


def test_jungletribe():
    o = JungleTribe.to_offer({"name": "Hotel X 4*", "startDate": "2027-01-10", "endDate": "2027-01-18",
                              "slug": "destinacije/azija/tajland/hotel-x", "price": "1299.00",
                              "discount": "1099.00", "currency": "EUR", "lastPlaces": 1, "isBestDeal": 0})
    assert (o.destination, o.price, o.old_price, o.nights, o.note) == ("Tajland", 1099.0, 1299.0, 8, "poslednja mesta")
    assert o.url == "https://www.jungletribe.rs/destinacije/azija/tajland/hotel-x"


from putovanja.geo import classify


def test_geo():
    assert classify("Rim Dan Primirija") == ("Italija", "Evropa")
    assert classify("Toskana Dan Primirja") == ("Italija", "Evropa")
    assert classify("Bangkok i Puket") == ("Tajland", "Azija")
    assert classify("Hotel X", "", "https://www.jungletribe.rs/destinacije/afrika/zanzibar/x") == ("Tanzanija", "Afrika")
    assert classify("Krstarenje Nilom") == ("Egipat", "Afrika")
    assert classify("Primirja tura")[0] == "Nepoznato"


def test_details_polasci_i_sobe():
    from putovanja.details import extract
    html = """<html><body><h1>Milano</h1>
    <div class="departure" data-dateFrom="2026-10-22" data-dateTo="2026-10-26">22.10.</div>
    <div class="departure" data-dateFrom="2026-11-11" data-dateTo="2026-11-15">11.11.</div>
    <div data-dateFrom="2026-12-01" data-dateTo="2026-12-05" data-href="/druga-tura/">x</div>
    <h3>Cenovnik</h3><ul><li>€ 259</li><li>€ 199</li><li>€ 159 i još malo teksta</li></ul>
    <div class="unit"><h4>Dvokrevetna soba, Standard</h4>
      <del class="unit-price-old" data-unitPriceOld="€ 159"></del><div class="unit-price-total" data-unitPriceTotal="€ 99"></div></div>
    </body></html>"""
    d = extract(html)
    assert d["termini"] == "22.10.2026. – 26.10.2026.\n11.11.2026. – 15.11.2026."
    assert d["sobe"] == "Dvokrevetna soba, Standard: € 99 po osobi (bilo € 159)"


def test_lemax_kartice_viva_i_rapsody():
    import json
    from putovanja.scrapers.lemax import VivaTravel, Rapsody
    viva = """<a class="card card-travel" href="/putovanja/malta/putovanje-malta-3-noci-avion-2026/1190/">
      <h4 class="title">Putovanje Malta 3 noći - AVION 2099</h4><div class="col small">4 dana | 3 noći</div>
      <div class="departure" data-dateFrom="2099-10-23" data-dateTo="2099-10-26">23.10.</div>
      <div class="departure" data-dateFrom="2099-11-27" data-dateTo="2099-11-30">27.11.</div>
      <i class="las la-plane"></i><div class="unit-price-total">€479</div></a>"""
    o = VivaTravel().parse(json.dumps({"html": viva, "total": 1}), "x")[0]
    assert (o.date_from, o.extra_dates, o.price, o.transport, o.nights, o.destination) == \
        ("2099-10-23", ["2099-11-27"], 479.0, "avion", 3, "Malta")
    rap = """<a class="card shadow" href="/putovanja/amsterdam/nova-godina/1372/"><h2 class="card-title">Amsterdam NG</h2>
      <span>8 dana | 3 noći</span><i class="las la-bus la-lg"></i>
      <div class="departure-link" data-href="/putovanja/amsterdam/nova-godina/1372/#dateFrom=2099-12-28">28.12.</div>
      <del class="text-primary">€ 389</del><span class="h4 text-danger">€ 339</span></a>"""
    o = Rapsody().parse(json.dumps({"html": rap}), "x")[0]
    assert (o.date_from, o.price, o.old_price, o.transport, o.url) == \
        ("2099-12-28", 339.0, 389.0, "autobus", "https://www.rapsodytravel.rs/putovanja/amsterdam/nova-godina/1372/")


def test_itravel_mesec_i_jumbo():
    from datetime import date
    from putovanja.scrapers.itravel import mesec_u_datum
    from putovanja.scrapers.jumbo import Jumbo
    t = date(2026, 10, 19)
    assert mesec_u_datum("Oktobar 2026.", t) == "2026-10-19"
    assert mesec_u_datum("Decembar 2026.", t) == "2026-12-01"
    assert mesec_u_datum("Jun 2026.", t) is None
    html = """<div class="pt-cv-content-item"><h4 class="pt-cv-title"><a href="https://www.jumbo.rs/tropske_destinacije/maldivi/x/">X 4*</a></h4>
      <div class="pt-cv-ctf-opis_aranzmana">avio karta, 7 noćenja</div><div class="pt-cv-ctf-cena_po_osobi">2.400</div></div>"""
    o = Jumbo().parse(html, "https://www.jumbo.rs/tropske_destinacije/destinacija_za_tropsko_letovanje/maldivi/")[0]
    assert (o.destination, o.price, o.nights, o.date_from) == ("Maldivi", 2400.0, 7, None)
    # samo hotel (bez paketa): cena „od 42” je po noćenju, ne aranžman
    html2 = """<div class="pt-cv-content-item"><h4 class="pt-cv-title"><a href="https://www.jumbo.rs/tropske_destinacije/kostarika/banana-azul-3-kostarika/">Banana Azul 3* Kostarika</a></h4>
      <div class="pt-cv-ctf-opis_aranzmana">Simpatičan hotel 3*.</div><div class="pt-cv-ctf-cena_po_osobi">42</div></div>"""
    h = Jumbo().parse(html2, "https://www.jumbo.rs/tropske_destinacije/destinacija_za_tropsko_letovanje/kostarika/")[0]
    assert (h.price, h.transport) == (None, None)
    assert "bez leta" in h.note and "42" in h.note


def test_pracenje_pad_cene_i_nove_po_zeljama(tmp_path):
    import time
    from putovanja import catalog, db, watch
    from putovanja.config import Config
    from putovanja.models import Offer
    conn = db.connect(tmp_path / "t.db")
    o = Offer(source="viva", title="Budimpešta advent", url="https://x.rs/putovanja/b/1/", destination="Budimpešta",
              date_from="2099-12-05", price=120.0)
    db.upsert(conn, [o])
    cfg = Config()
    cfg.profile.likes = ["advent"]
    it = catalog.load(conn)[0]
    assert watch.prati(conn, it) is True
    assert watch.obavestenja(conn, catalog.load(conn), cfg)["ukupno"] == 0  # prvi pregled postavlja početak
    time.sleep(1.1)
    o.price = 99.0
    db.upsert(conn, [o, Offer(source="rapsody", title="Advent Beč", url="https://y.rs/putovanja/bec/2/",
                              destination="Beč", date_from="2099-12-12", price=80.0)])
    ob = watch.obavestenja(conn, catalog.load(conn), cfg, procitano=True)
    assert [p["cena_sada"] for p in ob["padovi"]] == [99.0]
    assert [p["title"] for p in ob["nove_po_zeljama"]] == ["Advent Beč"]
    assert watch.obavestenja(conn, catalog.load(conn), cfg)["ukupno"] == 0  # pročitano
    kal = watch.kalendar(catalog.load(conn), "2099-12")
    assert list(kal["dani"]) == ["2099-12-05", "2099-12-12"]


def test_ukupno_za_dvoje():
    from putovanja.ukupno import proceni
    offer = {"price": 99.0, "currency": "EUR", "nights": 2, "date_from": "2099-10-21", "date_to": None}
    det = {"termini": "21.10.2099. – 25.10.2099.",
           "ne_obuhvata": "* putno osiguranje u iznosu od 1,5€ po osobi/ dnevno (17-74.99g)\n"
                          "Boravišna taksa 4 € po noćenju po osobi\n"
                          "Doplata za 1/1 sobu 80 €\n"
                          "FAKULTATIVNI IZLETI:\nSent Andreja – 20 €/deca 15€\n"
                          "Polisa osiguranja 470000049594 suma 50.000 €"}
    r = proceni(offer, det, 2)
    po = {s["naziv"]: (s["tip"], s["iznos"]) for s in r["stavke"]}
    assert po["Putno osiguranje"] == ("preporučeno", 15.0)        # 1,5 € × 5 dana × 2
    assert po["Boravišna taksa"] == ("obavezno", 16.0)            # 4 € × 2 noći × 2
    assert po["Sent Andreja"] == ("opciono", 40.0)
    assert not any("1/1" in n or "Polisa" in n for n in po)
    assert (r["osnovno"], r["ukupno"], r["ukupno_sa_preporucenim"]) == (198.0, 214.0, 229.0)


def test_naziv_aranzmana():
    from putovanja.catalog import naziv
    assert naziv("Putovanje Budimpešta 2 noći, 2026 - autobus") == "Budimpešta"
    assert naziv("DAN PRIMIRJA SIGURNI: BUDIMPEŠTA - 10.11. od 119€") == "Dan Primirja Sigurni: Budimpešta"
    assert naziv("Budimpešta-Advent / Hit cena: 4.500din") == "Budimpešta-Advent"
    assert naziv("Rim (31.12.2026.)") == "Rim"
    assert naziv("Maldivi") == "Maldivi"
    assert naziv("Gold Zanzibar Beach House & Spa 5*- paket aranžman") == "Gold Zanzibar Beach House & Spa 5*"


def test_praznici_srbija():
    from putovanja.watch import praznici, pravoslavni_uskrs
    assert pravoslavni_uskrs(2026).isoformat() == "2026-04-12"
    assert pravoslavni_uskrs(2027).isoformat() == "2027-05-02"
    p = praznici(2026)
    assert p["2026-11-11"] == "Dan primirja" and p["2026-01-07"] == "Božić"


def test_popusti_iz_teksta_i_soba():
    from putovanja import popusti
    d = {"ne_obuhvata": "Doplata za 1/1 sobu 50%\nPopust za decu do 12 godina u pratnji dve odrasle osobe 10%\n"
                        "Treća odrasla osoba u 1/2+1 sobi ima popust 5%\nObilazak dvorca 40 €, deca 30 € (do 12 godina)",
         "sobe": "Dvokrevetna soba, Standard: € 249 po osobi\nJednokrevetna soba, Standard: € 409 po osobi"}
    p = popusti.iz_detalja(d)
    assert "1/1 soba: +50%" in p and "deca do 12 god.: −10%" in p and "3. osoba: −5%" in p
    assert not any("30" in x for x in p)  # cena izleta za decu nije popust
    assert popusti.iz_soba(d["sobe"]) == ["1/1 soba: +160 €"]
    assert popusti.iz_ponude("FIRST MINUTE ponuda", "") == ["rani booking"]
    assert popusti.iz_detalja({"opis": "Lep hotel blizu plaže."}) == []
