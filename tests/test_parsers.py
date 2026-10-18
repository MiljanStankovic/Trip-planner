from datetime import date

from putesestvije.models import parse_dates, parse_price
from putesestvije.scrapers.bigblue import BigBlue
from putesestvije.scrapers.odeon import Odeon
from putesestvije.scrapers.travelland import Travelland

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


from putesestvije.models import upcoming
from putesestvije.scrapers.argus import Argus
from putesestvije.scrapers.felix import Felix
from putesestvije.scrapers.grandtours import GrandTours
from putesestvije.scrapers.kontiki import Kontiki

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
