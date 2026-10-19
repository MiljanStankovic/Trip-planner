export type Termin = { id: string; datum: string | null; noci: number | null; cena: number | null; stara: number | null; valuta: string }

export type Ponuda = {
  id: string
  destination: string
  title: string
  date_from: string | null
  date_to: string | null
  nights: number | null
  transport: string | null
  price: number | null
  old_price: number | null
  currency: string
  agencija: string
  zemlja: string
  kontinent: string
  svi_datumi: string[]
  url: string
  note: string
  zasto?: string
  termini?: Termin[]
  pratim?: boolean
  broj_termina?: number
  ceo_mesec?: boolean
  naziv?: string
  ukupno?: Ukupno | null
}

export type Stavka = { naziv: string; iznos: number; valuta: string; racun: string; tip: 'obavezno' | 'preporučeno' | 'opciono'; izvor: string }

export type Ukupno = {
  osobe: number
  valuta: string
  osnovno: number
  stavke: Stavka[]
  ukupno: number
  ukupno_sa_preporucenim: number
  napomena: string
}

export type Stanje = { poslednji_sken: string | null; pre_dana: number | null; ponuda: number; agencija: number; putnika: number }

export type DiyStavka = { tip?: string; naziv?: string; opis?: string; cena?: number | null; valuta?: string; ocena?: string; link?: string }

export type Kombinacija = {
  id: string
  kuda: string
  odakle?: string
  od?: string
  do?: string
  osoba: number
  naslov?: string
  prevoz: DiyStavka[]
  smestaj: DiyStavka[]
  ostalo: DiyStavka[]
  ukupno: number
  po_osobi: number
  nepotpuno: boolean
  napomena?: string
  sacuvano?: string
}

export type Diy = { odakle: string; kuda: string; od: string; do: string; osoba: string }

export type Detalji = {
  opis?: string
  program?: string
  obuhvata?: string
  ne_obuhvata?: string
  termini?: string
  sobe?: string
  napomene?: string
  tekst?: string
  greska?: string
  provereno?: string
}

export type ZemljeMapa = { [kontinent: string]: { [zemlja: string]: number } }

export type Pogled = 'pocetna' | 'kontinent' | 'zemlja' | 'ponuda' | 'kalendar' | 'pracenje' | 'diy'

export type Nav = {
  view: Pogled
  kontinent: string
  zemlja: string
  ponudaId: string
  kriterijum: string
  strana: number
  sort: 'datum' | 'cena' | 'popust'
  mesec: string
  kalStrana: number
  diy: Diy
}

export type Kalendar = {
  mesec: string
  meseci: { mesec: string; broj: number }[]
  dani: { [datum: string]: Ponuda[] }
  praznici?: { [datum: string]: string }
}

export type Pracena = Ponuda & {
  kljuc: string
  cena_pocetna: number | null
  cena_sada: number | null
  javljena_cena: number | null
  aktivno: boolean
  promena: number | null
  zelja?: string
}

export type Obavestenja = {
  padovi: Pracena[]
  nestali: Pracena[]
  nove_po_zeljama: Pracena[]
  ukupno: number
}

declare module 'claude-code' {
  interface PluginState {
    'putovanja': {
      nav: Nav
      zemlje: ZemljeMapa
      top: Ponuda[]
      lista: Ponuda[]
      ponuda: Ponuda | null
      detalji: Detalji | null
      status: string
      kal: Kalendar | null
      prac: Pracena[]
      obav: Obavestenja | null
      stanje: Stanje | null
      diyLista: Kombinacija[]
      diyAgencije: Ponuda[]
    }
  }
}
