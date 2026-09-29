"""Synthetic bank-transaction generator for the Transaction ML project.

Every row is invented. Merchants are either well-known public brands or
procedurally generated local businesses built from generic word lists; the
people in peer-to-peer transfers and the employers in payroll deposits are
made up. No real account data is used anywhere.

The generator imitates how card and ACH descriptors look on a statement:
processor prefixes ("SQ *", "TST*", "PAYPAL *"), store numbers, a city and
state, reference numbers, truncation to a fixed field width, abbreviations,
dropped punctuation and mixed casing. Amounts follow a per-category
distribution, and a few chains are genuinely ambiguous (a supercenter receipt
may be groceries or shopping), so there is an irreducible error floor, as there
is with real data.

Splits are by merchant group, never by row: every transaction from a given
merchant (and its sister brands, e.g. a ride-hailing app and its food-delivery
arm) lands in exactly one of train, validation or test. A random row split lets
the model memorize merchant strings it will see again at test time and
overstates how well it handles a merchant it has never seen.

Pure Python with a seeded random.Random, so the output is identical on every
platform.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

Split = Literal["train", "val", "test"]

CATEGORIES: tuple[tuple[str, str], ...] = (
    ("groceries", "Groceries"),
    ("dining", "Dining"),
    ("transport", "Transport & rideshare"),
    ("fuel", "Fuel"),
    ("subscriptions", "Subscriptions"),
    ("shopping", "Shopping"),
    ("utilities", "Utilities & telecom"),
    ("housing", "Rent & housing"),
    ("health", "Health & fitness"),
    ("travel", "Travel"),
    ("entertainment", "Entertainment"),
    ("income", "Income"),
    ("transfers", "Transfers & payments"),
    ("fees", "Fees & interest"),
)
CATEGORY_IDS: tuple[str, ...] = tuple(c for c, _ in CATEGORIES)

DEFAULT_SEED = 20260928
DEFAULT_ROWS = 24_000
SPLIT_SHARES = {"train": 0.70, "val": 0.15, "test": 0.15}


@dataclass(frozen=True)
class Merchant:
    name: str
    category: str
    group: str
    kind: Literal["brand", "local", "p2p", "payroll", "bank"]
    # Other categories this merchant's receipts are sometimes labeled with, and how often.
    alt: tuple[tuple[str, float], ...] = ()
    # Fixed price points (subscriptions, memberships); empty means draw from the category.
    prices: tuple[float, ...] = ()
    chain: bool = False
    online: bool = False
    popularity: float = 1.0


@dataclass(frozen=True)
class Transaction:
    description: str
    amount: float | None
    date: str
    category: str
    merchant: str
    group: str
    kind: str
    split: Split


# ─── Word lists (generic, public) ──────────────────────────────────────────────

CITIES: tuple[tuple[str, str], ...] = (
    ("SAN DIEGO", "CA"),
    ("LOS ANGELES", "CA"),
    ("SAN FRANCISCO", "CA"),
    ("SACRAMENTO", "CA"),
    ("OAKLAND", "CA"),
    ("SAN JOSE", "CA"),
    ("FRESNO", "CA"),
    ("IRVINE", "CA"),
    ("PORTLAND", "OR"),
    ("SEATTLE", "WA"),
    ("SPOKANE", "WA"),
    ("BOISE", "ID"),
    ("PHOENIX", "AZ"),
    ("TUCSON", "AZ"),
    ("LAS VEGAS", "NV"),
    ("RENO", "NV"),
    ("DENVER", "CO"),
    ("BOULDER", "CO"),
    ("SALT LAKE CITY", "UT"),
    ("ALBUQUERQUE", "NM"),
    ("AUSTIN", "TX"),
    ("DALLAS", "TX"),
    ("HOUSTON", "TX"),
    ("SAN ANTONIO", "TX"),
    ("CHICAGO", "IL"),
    ("MINNEAPOLIS", "MN"),
    ("MILWAUKEE", "WI"),
    ("DETROIT", "MI"),
    ("COLUMBUS", "OH"),
    ("CLEVELAND", "OH"),
    ("INDIANAPOLIS", "IN"),
    ("ST LOUIS", "MO"),
    ("KANSAS CITY", "MO"),
    ("NASHVILLE", "TN"),
    ("ATLANTA", "GA"),
    ("CHARLOTTE", "NC"),
    ("RALEIGH", "NC"),
    ("MIAMI", "FL"),
    ("ORLANDO", "FL"),
    ("TAMPA", "FL"),
    ("NEW YORK", "NY"),
    ("BROOKLYN", "NY"),
    ("BUFFALO", "NY"),
    ("BOSTON", "MA"),
    ("PHILADELPHIA", "PA"),
    ("PITTSBURGH", "PA"),
    ("BALTIMORE", "MD"),
    ("WASHINGTON", "DC"),
    ("RICHMOND", "VA"),
    ("NEW ORLEANS", "LA"),
)
PLACES = (
    "HARBOR",
    "MISSION",
    "OCEAN",
    "PARKSIDE",
    "RIVERSIDE",
    "HILLCREST",
    "NORTH PARK",
    "LAKEVIEW",
    "OLD TOWN",
    "MIDTOWN",
    "EASTSIDE",
    "WESTGATE",
    "SUNSET",
    "BAYVIEW",
    "CEDAR",
    "MAPLE",
    "GREENWOOD",
    "FAIRVIEW",
    "HIGHLAND",
    "BRIDGEPORT",
    "CANYON",
    "MESA",
    "VALLEY",
    "PINE HILL",
    "UNION",
    "CENTRAL",
    "SOUTHGATE",
    "LINCOLN",
    "FRANKLIN",
    "COASTAL",
    "SUMMIT",
    "MEADOW",
)
SURNAMES = (
    "SMITH",
    "JOHNSON",
    "GARCIA",
    "MILLER",
    "DAVIS",
    "RODRIGUEZ",
    "MARTINEZ",
    "LOPEZ",
    "WILSON",
    "ANDERSON",
    "THOMAS",
    "TAYLOR",
    "MOORE",
    "JACKSON",
    "MARTIN",
    "LEE",
    "PEREZ",
    "THOMPSON",
    "WHITE",
    "HARRIS",
    "CLARK",
    "LEWIS",
    "ROBINSON",
    "WALKER",
    "YOUNG",
    "ALLEN",
    "KING",
    "WRIGHT",
    "SCOTT",
    "NGUYEN",
    "HILL",
    "FLORES",
    "GREEN",
    "ADAMS",
    "NELSON",
    "BAKER",
    "HALL",
    "RIVERA",
    "CAMPBELL",
    "MITCHELL",
    "CARTER",
    "ROBERTS",
    "KIM",
    "PATEL",
    "CHEN",
    "WONG",
    "COHEN",
    "MURPHY",
    "SULLIVAN",
    "RUSSO",
    "ROSSI",
    "COSTA",
    "SILVA",
    "TANAKA",
    "SATO",
    "MULLER",
    "BECKER",
    "NOVAK",
)
FIRST_NAMES = (
    "JAMES",
    "MARY",
    "JOHN",
    "PATRICIA",
    "ROBERT",
    "JENNIFER",
    "MICHAEL",
    "LINDA",
    "DAVID",
    "ELIZABETH",
    "WILLIAM",
    "SUSAN",
    "JOSEPH",
    "JESSICA",
    "CARLOS",
    "SARAH",
    "DANIEL",
    "KAREN",
    "MATTHEW",
    "LISA",
    "ANTHONY",
    "NANCY",
    "MARK",
    "SANDRA",
    "KEVIN",
    "ASHLEY",
    "BRIAN",
    "EMILY",
    "ALEX",
    "SOFIA",
    "LUIS",
    "MAYA",
    "ETHAN",
    "OLIVIA",
    "NOAH",
    "EMMA",
    "LIAM",
    "AVA",
    "MIA",
    "LEO",
)
WORDS = (
    "GOLDEN",
    "BLUE",
    "RED",
    "GREEN",
    "SILVER",
    "LUCKY",
    "HAPPY",
    "LITTLE",
    "BIG",
    "WILD",
    "URBAN",
    "RUSTIC",
    "SUNNY",
    "COZY",
    "BRIGHT",
    "FRESH",
    "OLIVE",
    "LOTUS",
    "PHOENIX",
    "DRAGON",
    "TIGER",
    "EAGLE",
    "FOX",
    "BEAR",
    "WILLOW",
    "IVY",
    "JUNIPER",
    "SAGE",
    "CORAL",
    "AMBER",
    "COPPER",
    "IRON",
    "NORTHERN",
    "SOUTHERN",
    "PACIFIC",
    "ATLANTIC",
    "PRAIRIE",
    "ALPINE",
    "HARVEST",
    "ORCHARD",
)
COMPANY_WORDS = (
    "NORTHWIND",
    "BLUE RIVER",
    "SUMMIT",
    "PIONEER",
    "KEYSTONE",
    "BRIGHTPATH",
    "IRONWOOD",
    "CASCADE",
    "MERIDIAN",
    "REDWOOD",
    "SILVERLINE",
    "HORIZON",
    "LAKESHORE",
    "EVERGREEN",
    "GRANITE",
    "HARBORVIEW",
    "TRUENORTH",
    "CLEARWATER",
    "OAKRIDGE",
    "STARLING",
    "ALDER",
    "CRESTVIEW",
    "BAYSIDE",
    "COPPERLEAF",
)
COMPANY_SUFFIXES = ("INC", "LLC", "CORP", "CO", "GROUP", "HOLDINGS", "SYSTEMS", "LABS")
SUB_STEMS = (
    "STREAM",
    "CLOUD",
    "NOTE",
    "FIT",
    "READ",
    "TUNE",
    "SNAP",
    "BOX",
    "PIXEL",
    "QUILL",
    "LEARN",
    "PLAN",
    "VAULT",
    "SPARK",
    "LOOP",
    "NEST",
    "HIVE",
    "DASH",
    "FLOW",
    "GRID",
)

Brand = tuple[str, str, dict[str, object]]


def _b(name: str, group: str | None = None, **opts: object) -> Brand:
    """A brand. The group ties sister brands together so they share a split."""
    return (name, group or name, dict(opts))


BRANDS: dict[str, list[Brand]] = {
    "groceries": [
        _b("SAFEWAY", chain=True, popularity=3.0),
        _b("KROGER", chain=True, popularity=3.0),
        _b("TRADER JOE'S", chain=True, popularity=3.0),
        _b("WHOLE FOODS MKT", chain=True, popularity=2.5),
        _b("ALDI", chain=True, popularity=2.0),
        _b("PUBLIX", chain=True, popularity=2.0),
        _b("WEGMANS", chain=True),
        _b("H-E-B", chain=True, popularity=1.5),
        _b("SPROUTS FARMERS MKT", chain=True),
        _b("COSTCO WHSE", "COSTCO", chain=True, popularity=2.5, alt=(("shopping", 0.3),)),
        _b("FOOD LION", chain=True),
        _b("GIANT EAGLE", chain=True),
        _b("RALPHS", chain=True, popularity=1.5),
        _b("VONS", chain=True),
        _b("ALBERTSONS", chain=True),
        _b("WINCO FOODS", chain=True),
        _b("MEIJER", chain=True, alt=(("shopping", 0.3),)),
        _b("HY-VEE", chain=True),
        _b("STOP & SHOP", chain=True),
        _b("SMART & FINAL", chain=True),
        _b("INSTACART", online=True, popularity=1.5),
        _b("FRESH THYME MKT", chain=True),
    ],
    "dining": [
        _b("MCDONALD'S", chain=True, popularity=3.0),
        _b("STARBUCKS", chain=True, popularity=4.0),
        _b("CHIPOTLE", chain=True, popularity=2.5),
        _b("SUBWAY", chain=True, popularity=1.5),
        _b("TACO BELL", chain=True, popularity=1.5),
        _b("CHICK-FIL-A", chain=True, popularity=2.0),
        _b("PANERA BREAD", chain=True),
        _b("DOMINO'S", chain=True),
        _b("PIZZA HUT", chain=True),
        _b("WENDY'S", chain=True),
        _b("BURGER KING", chain=True),
        _b("DUNKIN", chain=True, popularity=2.0),
        _b("SHAKE SHACK", chain=True),
        _b("PANDA EXPRESS", chain=True),
        _b("IN-N-OUT BURGER", chain=True),
        _b("FIVE GUYS", chain=True),
        _b("DOORDASH", online=True, popularity=3.0),
        _b("GRUBHUB", online=True),
        _b("UBER EATS", "UBER", online=True, popularity=2.5),
        _b("SWEETGREEN", chain=True),
        _b("OLIVE GARDEN", chain=True),
        _b("APPLEBEE'S", chain=True),
        _b("PEET'S COFFEE", chain=True),
        _b("JAMBA", chain=True),
    ],
    "transport": [
        _b("UBER TRIP", "UBER", online=True, popularity=4.0),
        _b("LYFT RIDE", "LYFT", online=True, popularity=3.0),
        _b("BART", popularity=1.5),
        _b("MTA NYCT PAYGO", popularity=1.5),
        _b("CLIPPER TRANSIT"),
        _b("SP+ PARKING", chain=True),
        _b("PARKMOBILE", online=True, popularity=1.5),
        _b("E-ZPASS", popularity=1.5),
        _b("FASTRAK", popularity=1.2),
        _b("LIME RIDE", online=True),
        _b("CITI BIKE"),
        _b("WMATA METRO"),
        _b("CTA VENTRA"),
        _b("SUNPASS"),
        _b("LAZ PARKING", chain=True),
    ],
    "fuel": [
        _b("SHELL OIL", chain=True, popularity=3.0),
        _b("CHEVRON", chain=True, popularity=3.0),
        _b("EXXONMOBIL", chain=True, popularity=2.0),
        _b("BP", chain=True),
        _b("ARCO", chain=True, popularity=2.0),
        _b("76", chain=True),
        _b("VALERO", chain=True),
        _b("SUNOCO", chain=True),
        _b("CIRCLE K", chain=True, alt=(("groceries", 0.25),)),
        _b("SPEEDWAY", chain=True),
        _b("WAWA", chain=True, alt=(("dining", 0.3),)),
        _b("SHEETZ", chain=True, alt=(("dining", 0.25),)),
        _b("MARATHON PETRO", chain=True),
        _b("COSTCO GAS", "COSTCO", chain=True),
        _b("QUIKTRIP", chain=True),
        _b("CITGO", chain=True),
        _b("PHILLIPS 66", chain=True),
        _b("CASEY'S", chain=True, alt=(("dining", 0.25),)),
    ],
    "subscriptions": [
        _b("NETFLIX.COM", online=True, prices=(6.99, 15.49, 22.99), popularity=3.0),
        _b("SPOTIFY USA", online=True, prices=(10.99, 11.99, 16.99), popularity=3.0),
        _b("HULU", online=True, prices=(7.99, 17.99)),
        _b("DISNEY PLUS", online=True, prices=(7.99, 13.99)),
        _b(
            "APPLE.COM/BILL", "APPLE", online=True, prices=(0.99, 2.99, 9.99, 19.95), popularity=3.0
        ),
        _b("GOOGLE *YOUTUBEPREMIUM", "GOOGLE", online=True, prices=(13.99, 22.99)),
        _b("AMAZON PRIME", "AMAZON", online=True, prices=(14.99, 139.00), popularity=2.0),
        _b("ADOBE", online=True, prices=(9.99, 22.99, 59.99)),
        _b("DROPBOX", online=True, prices=(11.99, 19.99)),
        _b("NYTIMES", online=True, prices=(4.00, 17.00, 25.00)),
        _b("AUDIBLE", online=True, prices=(7.95, 14.95)),
        _b("PARAMOUNT+", online=True, prices=(7.99, 12.99)),
        _b("MAX.COM", online=True, prices=(9.99, 16.99)),
        _b("PATREON", online=True, prices=(3.00, 5.00, 10.00)),
        _b("MICROSOFT*365", "MICROSOFT", online=True, prices=(9.99, 12.99, 99.99)),
        _b("PEACOCK", online=True, prices=(7.99, 13.99)),
        _b("DUOLINGO", online=True, prices=(12.99, 83.99)),
        _b("SIRIUSXM", online=True, prices=(10.99, 18.99)),
    ],
    "shopping": [
        _b("AMAZON.COM", "AMAZON", online=True, popularity=5.0),
        _b("AMZN MKTP US", "AMAZON", online=True, popularity=4.0),
        _b("TARGET", chain=True, popularity=3.0, alt=(("groceries", 0.2),)),
        _b("WALMART", chain=True, popularity=3.0, alt=(("groceries", 0.4),)),
        _b("BEST BUY", chain=True),
        _b("THE HOME DEPOT", chain=True, popularity=2.0),
        _b("LOWE'S", chain=True),
        _b("IKEA", chain=True),
        _b("MACY'S", chain=True),
        _b("NORDSTROM", chain=True),
        _b("TJ MAXX", chain=True),
        _b("EBAY", online=True),
        _b("ETSY", online=True),
        _b("NIKE", chain=True),
        _b("UNIQLO", chain=True),
        _b("APPLE STORE", "APPLE", chain=True),
        _b("OLD NAVY", chain=True),
        _b("KOHL'S", chain=True),
        _b("WAYFAIR", online=True),
        _b("SEPHORA", chain=True),
        _b("REI", chain=True),
        _b("BARNES & NOBLE", chain=True),
        _b("DICK'S SPORTING", chain=True),
    ],
    "utilities": [
        _b("PG&E", popularity=2.0),
        _b("CON EDISON", popularity=1.5),
        _b("DUKE ENERGY", popularity=1.5),
        _b("COMCAST XFINITY", popularity=2.0),
        _b("VERIZON WIRELESS", popularity=2.0),
        _b("AT&T", popularity=2.0),
        _b("T-MOBILE", popularity=2.0),
        _b("SPECTRUM", popularity=1.5),
        _b("SOCALGAS"),
        _b("NATIONAL GRID"),
        _b("DOMINION ENERGY"),
        _b("GEORGIA POWER"),
        _b("SDG&E"),
        _b("XCEL ENERGY"),
        _b("COX COMMUNICATIONS"),
        _b("GOOGLE FIBER", "GOOGLE"),
        _b("MINT MOBILE"),
        _b("WASTE MANAGEMENT"),
    ],
    "housing": [
        _b("ROCKET MORTGAGE"),
        _b("WELLS FARGO HOME MTG", "WELLS FARGO"),
        _b("CHASE MORTGAGE", "CHASE"),
        _b("APPFOLIO RENT"),
        _b("ZILLOW RENT PAYMENT"),
        _b("BILT RENT"),
        _b("PUBLIC STORAGE"),
        _b("EXTRA SPACE STORAGE"),
        _b("MR. COOPER MTG"),
    ],
    "health": [
        _b("CVS/PHARMACY", "CVS", chain=True, popularity=2.5, alt=(("shopping", 0.25),)),
        _b("WALGREENS", chain=True, popularity=2.5, alt=(("shopping", 0.25),)),
        _b("RITE AID", chain=True),
        _b("KAISER PERMANENTE", popularity=1.5),
        _b("LABCORP"),
        _b("QUEST DIAGNOSTICS"),
        _b("PLANET FITNESS", prices=(10.00, 24.99), popularity=1.5),
        _b("24 HOUR FITNESS", prices=(39.99, 49.99)),
        _b("EQUINOX", prices=(260.00, 285.00)),
        _b("ONE MEDICAL"),
        _b("ZOCDOC"),
        _b("GOODRX", online=True),
        _b("ORANGETHEORY", prices=(79.00, 169.00)),
        _b("LENSCRAFTERS", chain=True),
        _b("TELADOC", online=True),
    ],
    "travel": [
        _b("UNITED AIRLINES", popularity=2.0),
        _b("DELTA AIR LINES", popularity=2.0),
        _b("AMERICAN AIRLINES", popularity=2.0),
        _b("SOUTHWEST AIRLINES", popularity=2.0),
        _b("JETBLUE"),
        _b("ALASKA AIRLINES"),
        _b("MARRIOTT", chain=True, popularity=1.5),
        _b("HILTON", chain=True, popularity=1.5),
        _b("HYATT", chain=True),
        _b("AIRBNB", online=True, popularity=2.0),
        _b("EXPEDIA", online=True, popularity=1.5),
        _b("BOOKING.COM", online=True),
        _b("HERTZ", chain=True),
        _b("ENTERPRISE RENT-A-CAR", chain=True),
        _b("AVIS", chain=True),
        _b("AMTRAK"),
        _b("VRBO", online=True),
        _b("SPIRIT AIRLINES"),
        _b("HOLIDAY INN", chain=True),
    ],
    "entertainment": [
        _b("AMC THEATRES", chain=True, popularity=2.0),
        _b("REGAL CINEMAS", chain=True),
        _b("TICKETMASTER", online=True, popularity=2.0),
        _b("STUBHUB", online=True),
        _b("STEAM GAMES", online=True, popularity=1.5),
        _b("PLAYSTATION NETWORK", online=True),
        _b("NINTENDO", online=True),
        _b("EVENTBRITE", online=True),
        _b("DAVE & BUSTER'S", chain=True),
        _b("TOPGOLF", chain=True),
        _b("SIX FLAGS", chain=True),
        _b("LIVE NATION", online=True),
        _b("FANDANGO", online=True),
        _b("CINEMARK", chain=True),
        _b("SEATGEEK", online=True),
        _b("XBOX", "MICROSOFT", online=True),
        _b("BOWLERO", chain=True),
    ],
    "transfers": [
        _b("CHASE CREDIT CRD AUTOPAY", "CHASE", popularity=2.0),
        _b("AMEX EPAYMENT", popularity=2.0),
        _b("DISCOVER E-PAYMENT"),
        _b("CAPITAL ONE ONLINE PMT", popularity=1.5),
        _b("CITI CARD ONLINE PAYMENT"),
        _b("ONLINE TRANSFER TO SAV", popularity=2.0),
        _b("ONLINE TRANSFER FROM CHK", popularity=1.5),
        _b("ATM WITHDRAWAL", popularity=2.0),
        _b("PAYPAL TRANSFER", "PAYPAL"),
        _b("COINBASE"),
        _b("FIDELITY MONEYLINE"),
        _b("VANGUARD BUY INVESTMENT"),
        _b("ROBINHOOD"),
    ],
}

# Procedural local merchants. {S} surname, {P} place, {W} word, {C} city, {X} app-like stem.
LOCAL_TEMPLATES: dict[str, tuple[str, ...]] = {
    "groceries": (
        "{S}'S MARKET",
        "{P} FARMERS MARKET",
        "{P} FOOD CO-OP",
        "{S} BROS GROCERY",
        "{W} GROCERY",
        "{P} MEAT & DELI",
        "{W} ORGANIC MARKET",
        "{P} SUPERMARKET",
        "{W} ASIAN MARKET",
        "{S} PRODUCE",
        "{P} FOODS",
        "MERCADO {W}",
    ),
    "dining": (
        "{S}'S PIZZA",
        "{W} THAI KITCHEN",
        "TAQUERIA {W}",
        "{P} SUSHI",
        "{W} BURGER BAR",
        "{S}'S DINER",
        "CAFE {W}",
        "{W} COFFEE ROASTERS",
        "{W} BAKERY",
        "{W} RAMEN",
        "PHO {W}",
        "{P} GRILL",
        "{W} BREWING CO",
        "{S}'S TAVERN",
        "{W} NOODLE HOUSE",
        "{P} BBQ",
        "{W} BISTRO",
        "{S} DELI & CAFE",
        "{W} TACOS",
        "{P} PIZZERIA",
        "{W} KITCHEN",
        "{W} ESPRESSO BAR",
        "{S}'S RESTAURANT",
    ),
    "transport": (
        "{P} PARKING GARAGE",
        "CITY OF {C} PARKING",
        "{P} TRANSIT",
        "{P} TAXI",
        "YELLOW CAB {P}",
        "{W} PARKING LLC",
        "{C} METER PARKING",
        "{P} TOLL ROAD",
    ),
    "fuel": (
        "{P} GAS & MART",
        "{W} FUEL STOP",
        "{S} SERVICE STATION",
        "{W} PETROLEUM",
        "{P} FUEL",
        "{W} GAS N GO",
        "{P} TRUCK STOP",
    ),
    "subscriptions": (
        "{X}LY PREMIUM",
        "{X} MONTHLY PLAN",
        "{X}.IO SUBSCR",
        "{X}APP PRO",
        "{X} MEMBERSHIP",
        "{X}HQ ANNUAL PLAN",
        "{X} PLUS RENEWAL",
    ),
    "shopping": (
        "{W} BOUTIQUE",
        "{S} HARDWARE",
        "{P} OUTFITTERS",
        "{W} HOME GOODS",
        "{W} BOOKS",
        "{W} SHOES",
        "{P} THRIFT STORE",
        "{W} GIFT SHOP",
        "{S} JEWELERS",
        "{W} TOY CO",
        "{P} CYCLE SHOP",
        "{W} ELECTRONICS",
        "{W} CLOTHING CO",
        "{W} SUPPLY CO",
        "{P} ART SUPPLY",
    ),
    "utilities": (
        "CITY OF {C} UTILITIES",
        "{P} WATER DISTRICT",
        "{P} ELECTRIC COOP",
        "{W} FIBER INTERNET",
        "{P} WASTE MGMT",
        "{C} PUBLIC UTILITIES",
        "{W} WIRELESS",
        "{P} GAS & ELECTRIC",
    ),
    "housing": (
        "{W} APARTMENTS",
        "{P} PROPERTY MGMT",
        "{S} REALTY RENT",
        "{W} HOA DUES",
        "{P} TOWNHOMES",
        "{W} RESIDENTIAL LLC",
        "{S} PROPERTIES RENT",
        "{P} LOFTS",
        "{W} VILLAGE APTS",
    ),
    "health": (
        "{S} FAMILY DENTAL",
        "{P} MEDICAL GROUP",
        "{S} CHIROPRACTIC",
        "{P} URGENT CARE",
        "{W} PHYSICAL THERAPY",
        "{P} PEDIATRICS",
        "{W} OPTOMETRY",
        "{W} YOGA STUDIO",
        "{W} FITNESS",
        "{P} DERMATOLOGY",
        "{S} ORTHODONTICS",
        "{P} PHARMACY",
        "{W} CROSSFIT",
        "{P} VISION CENTER",
        "{S} COUNSELING",
    ),
    "travel": (
        "{W} INN & SUITES",
        "{P} MOTEL",
        "HOTEL {W}",
        "{W} RESORT",
        "{P} AIRPORT SHUTTLE",
        "{W} LODGE",
        "{P} BED & BREAKFAST",
        "{W} HOSTEL",
        "{P} CAR RENTAL",
    ),
    "entertainment": (
        "{W} CINEMAS",
        "{P} BOWLING",
        "{W} ESCAPE ROOM",
        "{P} MUSEUM",
        "{W} COMEDY CLUB",
        "{P} ZOO",
        "{W} MINI GOLF",
        "{W} ARCADE",
        "{P} THEATRE",
        "{W} MUSIC HALL",
        "{P} AQUARIUM",
        "{W} LASER TAG",
        "{P} ICE RINK",
    ),
}

FEES: tuple[tuple[str, tuple[float, ...]], ...] = (
    ("MONTHLY SERVICE FEE", (12.00, 15.00, 5.00)),
    ("OVERDRAFT FEE", (35.00, 34.00, 29.00)),
    ("FOREIGN TRANSACTION FEE", ()),
    ("ATM FEE", (2.50, 3.00, 3.50)),
    ("NON-BANK ATM FEE", (2.50, 3.00, 5.00)),
    ("INTEREST CHARGE ON PURCHASES", ()),
    ("INTEREST CHARGED ON CASH ADV", ()),
    ("LATE PAYMENT FEE", (29.00, 40.00, 25.00)),
    ("WIRE TRANSFER FEE", (25.00, 30.00, 15.00)),
    ("ANNUAL MEMBERSHIP FEE", (95.00, 250.00, 550.00, 695.00)),
    ("NSF RETURNED ITEM FEE", (35.00, 34.00)),
    ("PAPER STATEMENT FEE", (2.00, 3.00)),
    ("CASH ADVANCE FEE", ()),
    ("STOP PAYMENT FEE", (30.00, 32.00)),
    ("MINIMUM INTEREST CHARGE", (1.00, 2.00)),
    ("RETURNED PAYMENT FEE", (25.00, 40.00)),
)

# Median absolute amount (USD) and log-normal spread per category.
AMOUNTS: dict[str, tuple[float, float]] = {
    "groceries": (58.0, 0.75),
    "dining": (17.0, 0.65),
    "transport": (15.0, 0.7),
    "fuel": (46.0, 0.4),
    "subscriptions": (12.0, 0.6),
    "shopping": (42.0, 1.0),
    "utilities": (95.0, 0.5),
    "housing": (1850.0, 0.35),
    "health": (38.0, 0.9),
    "travel": (240.0, 0.9),
    "entertainment": (32.0, 0.8),
    "income": (2400.0, 0.5),
    "transfers": (300.0, 1.1),
    "fees": (12.0, 0.9),
}

# Processor prefixes on local merchants, and how often each category carries one.
PREFIXES: dict[str, tuple[tuple[str, float], ...]] = {
    "dining": (("SQ *", 0.30), ("TST* ", 0.30), ("CLOVER ", 0.06)),
    "groceries": (("SQ *", 0.06),),
    "shopping": (("SQ *", 0.10), ("SP * ", 0.14), ("PAYPAL *", 0.10)),
    "subscriptions": (("PAYPAL *", 0.22), ("GOOGLE *", 0.10)),
    "entertainment": (("SQ *", 0.12), ("PAYPAL *", 0.06)),
    "health": (("SQ *", 0.10),),
    "transport": (("SQ *", 0.04),),
    "travel": (("PAYPAL *", 0.06),),
}
CARD_LEADS = (
    "POS ",
    "POS DEBIT ",
    "DEBIT CARD PURCHASE ",
    "CHECKCARD {MMDD} ",
    "PURCHASE AUTHORIZED ON {MM/DD} ",
    "VISA DDA PUR ",
    "DBT CRD {HHMM} ",
)


# ─── Merchant catalog ─────────────────────────────────────────────────────────


def _fill(template: str, rng: random.Random) -> str:
    return (
        template.replace("{S}", rng.choice(SURNAMES))
        .replace("{P}", rng.choice(PLACES))
        .replace("{W}", rng.choice(WORDS))
        .replace("{C}", rng.choice(CITIES)[0])
        .replace("{X}", rng.choice(SUB_STEMS))
    )


def build_merchants(seed: int = DEFAULT_SEED, locals_per_category: int = 70) -> list[Merchant]:
    """Every merchant in the synthetic world: brands, local businesses, people, employers, banks."""
    rng = random.Random(seed)
    out: list[Merchant] = []
    seen: set[str] = set()

    def add(m: Merchant) -> None:
        if m.name not in seen:
            seen.add(m.name)
            out.append(m)

    for cat in CATEGORY_IDS:
        for name, group, opts in BRANDS.get(cat, []):
            alt = opts.get("alt", ())
            prices = opts.get("prices", ())
            popularity = opts.get("popularity", 1.0)
            assert isinstance(alt, tuple) and isinstance(prices, tuple)
            assert isinstance(popularity, (int, float))
            add(
                Merchant(
                    name=name,
                    category=cat,
                    group=group,
                    kind="brand",
                    alt=alt,
                    prices=prices,
                    chain=bool(opts.get("chain", False)),
                    online=bool(opts.get("online", False)),
                    popularity=float(popularity) * 2.0,
                )
            )
        templates = LOCAL_TEMPLATES.get(cat)
        made = tries = 0
        while templates and made < locals_per_category and tries < locals_per_category * 20:
            tries += 1
            name = _fill(rng.choice(templates), rng)
            if name in seen:
                continue
            fixed: tuple[float, ...] = ()
            if cat == "subscriptions":
                fixed = (rng.choice((4.99, 7.99, 9.99, 12.99, 14.99, 29.99, 59.99)),)
            add(
                Merchant(
                    name, cat, "L:" + name, "local", prices=fixed, popularity=rng.uniform(0.3, 1.2)
                )
            )
            made += 1

    for _ in range(40):  # employers
        company = f"{rng.choice(COMPANY_WORDS)} {rng.choice(COMPANY_SUFFIXES)}"
        add(
            Merchant(company, "income", "E:" + company, "payroll", popularity=rng.uniform(1.0, 3.0))
        )
    for name in ("IRS TREAS 310 TAX REF", "INTEREST PAYMENT", "STATE TAX REFUND", "SSA TREAS 310"):
        add(Merchant(name, "income", name, "bank"))
    for _ in range(90):  # people, for peer-to-peer transfers
        person = f"{rng.choice(FIRST_NAMES)} {rng.choice(SURNAMES)}"
        add(Merchant(person, "transfers", "P:" + person, "p2p", popularity=rng.uniform(0.3, 1.5)))
    for name, prices in FEES:
        add(Merchant(name, "fees", "F:" + name, "bank", prices=prices, popularity=2.0))
    return out


def assign_splits(merchants: list[Merchant], seed: int = DEFAULT_SEED) -> dict[str, Split]:
    """Merchant group -> split, stratified by the group's main category."""
    rng = random.Random(seed + 1)
    by_cat: dict[str, list[str]] = {}
    owner: dict[str, str] = {}
    for m in merchants:
        if m.group not in owner:  # a group belongs to its first merchant's category
            owner[m.group] = m.category
            by_cat.setdefault(m.category, []).append(m.group)
    out: dict[str, Split] = {}
    for cat in CATEGORY_IDS:
        groups = sorted(by_cat.get(cat, []))
        rng.shuffle(groups)
        n = len(groups)
        n_test = max(2, round(n * SPLIT_SHARES["test"]))
        n_val = max(2, round(n * SPLIT_SHARES["val"]))
        for i, g in enumerate(groups):
            out[g] = "test" if i < n_test else "val" if i < n_test + n_val else "train"
    return out


# ─── Descriptor rendering ──────────────────────────────────────────────────────


def _amount(m: Merchant, cat: str, rng: random.Random) -> float:
    if m.prices and cat == m.category:
        value = rng.choice(m.prices)
        if rng.random() < 0.15:  # sales tax, price changes
            value = round(value * rng.uniform(1.0, 1.1), 2)
        return value
    if cat == "fees":
        return round(rng.uniform(0.5, 45.0) if rng.random() < 0.8 else rng.uniform(45, 120), 2)
    median, sigma = AMOUNTS[cat]
    value = median * math.exp(rng.gauss(0.0, sigma))
    if cat == "housing" and m.kind == "local":
        value = round(value / 25) * 25  # rents are round
    elif cat in ("transfers", "income") and rng.random() < 0.55:
        value = round(value / 50) * 50 or 50.0
    elif cat == "health" and rng.random() < 0.3:
        value = rng.choice((20.0, 25.0, 30.0, 40.0, 50.0))  # copays
    return round(max(value, 0.5), 2)


def _mangle(name: str, rng: random.Random) -> str:
    """How processors shorten and strip merchant names."""
    s = name
    if "'" in s and rng.random() < 0.6:
        s = s.replace("'", "")
    if rng.random() < 0.25:
        for long, short in (
            (" MARKET", " MKT"),
            ("RESTAURANT", "REST"),
            ("SERVICE", "SVC"),
            ("CENTER", "CTR"),
            ("PHARMACY", "PHARM"),
            ("APARTMENTS", "APTS"),
            ("PARKING", "PKG"),
            ("SUPERMARKET", "SUPERMKT"),
            ("COFFEE", "COFFE"),
        ):
            s = s.replace(long, short)
    if rng.random() < 0.08:
        s = s.replace(" ", "", 1)
    if rng.random() < 0.05:
        s = s.replace("-", "")
    return s


def _card_descriptor(m: Merchant, d: date, rng: random.Random) -> str:
    name = _mangle(m.name, rng)
    if m.kind == "local":
        for prefix, p in PREFIXES.get(m.category, ()):
            if rng.random() < p:
                name = prefix + name
                break
    width = rng.choice((22, 23, 25, 25, 30, 40))
    body = name
    if m.chain and rng.random() < 0.75 and len(name) < width - 4:
        body += rng.choice(
            (
                f" #{rng.randint(1, 9999)}",
                f" {rng.randint(100, 99999):05d}",
                f" {rng.randint(1, 999)}",
            )
        )
    desc = body[:width].rstrip()
    if m.online:
        if rng.random() < 0.4:
            desc += f" {rng.randint(800, 888)}-{rng.randint(200, 999)}-{rng.randint(1000, 9999)}"
        desc += " " + rng.choice(("CA", "WA", "NY", "DE", "TX"))
    elif rng.random() < 0.85:
        city, st = rng.choice(CITIES)
        desc += f" {city[: rng.choice((13, 13, 11, 20))].rstrip()} {st}"
    r = rng.random()
    if r < 0.3:
        lead = (
            rng.choice(CARD_LEADS)
            .replace("{MMDD}", d.strftime("%m%d"))
            .replace("{MM/DD}", d.strftime("%m/%d"))
            .replace("{HHMM}", f"{rng.randint(0, 23):02d}{rng.randint(0, 59):02d}")
        )
        desc = lead + desc
        if lead.startswith("PURCHASE AUTHORIZED") and rng.random() < 0.7:
            desc += f" S{rng.randint(10**14, 10**15 - 1)} CARD {rng.randint(1000, 9999)}"
    elif r < 0.36:
        desc += f" {d.strftime('%m/%d')}"
    return desc


def _ach_descriptor(m: Merchant, d: date, rng: random.Random) -> str:
    ref = rng.randint(10**9, 10**10 - 1)
    if m.kind == "payroll":
        return rng.choice(
            (
                f"{m.name} PAYROLL PPD ID: {ref}",
                f"DIRECT DEP {m.name}",
                f"{m.name} DIR DEP {d.strftime('%m%d%y')}",
                f"PAYROLL {m.name}",
                f"ACH CREDIT {m.name} PAYROLL",
                f"{m.name} DES:PAYROLL ID:{ref}",
            )
        )
    if m.kind == "p2p":
        first, last = m.name.split(" ", 1)
        short = f"{first} {last[0]}" if rng.random() < 0.3 else m.name
        return rng.choice(
            (
                f"ZELLE TO {short}",
                f"ZELLE FROM {short}",
                f"VENMO *{short}",
                f"VENMO PAYMENT {ref}",
                f"CASH APP*{short}",
                f"ZELLE PAYMENT TO {short} CONF# {ref % 10**8}",
                f"PAYPAL *{last}{first[0]}",
            )
        )
    if m.category == "fees":
        return rng.choice((m.name, m.name, m.name.title(), f"{m.name} {d.strftime('%m/%d')}"))
    if m.category == "income":
        return rng.choice((m.name, f"{m.name} {d.strftime('%m%d%y')}", f"ACH CREDIT {m.name}"))
    if rng.random() < 0.5:
        return rng.choice(
            (
                f"{m.name} PPD ID: {ref}",
                f"{m.name} WEB ID: {ref}",
                f"ACH DEBIT {m.name}",
                f"{m.name} DES:PAYMENT ID:{ref % 10**7}",
                f"ONLINE PMT {m.name}",
            )
        )
    return m.name


def _case(desc: str, rng: random.Random) -> str:
    r = rng.random()
    if r < 0.12:
        return desc.title()
    if r < 0.15:
        return desc.lower()
    return desc


def _label(m: Merchant, rng: random.Random) -> str:
    r = rng.random()
    acc = 0.0
    for cat, p in m.alt:
        acc += p
        if r < acc:
            return cat
    return m.category


def generate(
    seed: int = DEFAULT_SEED, n: int = DEFAULT_ROWS, amount_missing: float = 0.1
) -> list[Transaction]:
    """n labeled transactions, each tagged with its merchant group's split.

    A share of rows (amount_missing) carry no amount, so the model also learns
    to work from the description alone.
    """
    merchants = build_merchants(seed)
    splits = assign_splits(merchants, seed)
    rng = random.Random(seed + 2)
    start = date(2025, 1, 1)
    picks = rng.choices(merchants, weights=[m.popularity for m in merchants], k=n)
    out: list[Transaction] = []
    for m in picks:
        d = start + timedelta(days=rng.randrange(365))
        label = _label(m, rng)
        ach = m.kind in ("payroll", "p2p", "bank") or m.category in (
            "housing",
            "utilities",
            "transfers",
        )
        if ach and not (m.kind in ("brand", "local") and rng.random() < 0.35):
            desc = _ach_descriptor(m, d, rng)
        else:
            desc = _card_descriptor(m, d, rng)
        desc = _case(" ".join(desc.split()), rng)
        amt = _amount(m, label, rng)
        credit = label == "income" or (
            label == "transfers" and ("FROM" in desc.upper() or rng.random() < 0.25)
        )
        refund = not credit and label in ("shopping", "travel") and rng.random() < 0.03
        if refund:
            desc = rng.choice(("RETURN ", "REFUND ", "CREDIT ")) + desc
        signed = amt if (credit or refund) else -amt
        out.append(
            Transaction(
                description=desc,
                amount=None if rng.random() < amount_missing else signed,
                date=d.isoformat(),
                category=label,
                merchant=m.name,
                group=m.group,
                kind=m.kind,
                split=splits[m.group],
            )
        )
    return out


def summarize(rows: list[Transaction]) -> dict[str, object]:
    """Counts per split and category, and a check that no merchant group crosses splits."""
    by_split: dict[str, dict[str, int]] = {}
    merchants: dict[str, set[str]] = {}
    groups: dict[str, set[str]] = {}
    for r in rows:
        counts = by_split.setdefault(r.split, dict.fromkeys(CATEGORY_IDS, 0))
        counts[r.category] += 1
        merchants.setdefault(r.split, set()).add(r.merchant)
        groups.setdefault(r.split, set()).add(r.group)
    train = groups.get("train", set())
    held = groups.get("val", set()) | groups.get("test", set())
    return {
        "rows": len(rows),
        "splits": {
            k: {
                "rows": sum(v.values()),
                "merchants": len(merchants[k]),
                "merchant_groups": len(groups[k]),
                "by_category": v,
            }
            for k, v in sorted(by_split.items())
        },
        "amount_missing_share": sum(r.amount is None for r in rows) / max(len(rows), 1),
        "groups_shared_across_splits": len(train & held)
        + len(groups.get("val", set()) & groups.get("test", set())),
    }
