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
}

export type Detalji = {
  opis?: string
  program?: string
  obuhvata?: string
  ne_obuhvata?: string
  termini?: string
  napomene?: string
  tekst?: string
  greska?: string
  provereno?: string
}

export type ZemljeMapa = { [kontinent: string]: { [zemlja: string]: number } }

export type Pogled = 'pocetna' | 'kontinent' | 'zemlja' | 'ponuda'

export type Nav = {
  view: Pogled
  kontinent: string
  zemlja: string
  ponudaId: string
  kriterijum: string
  strana: number
  sort: 'datum' | 'cena' | 'popust'
}

declare module 'claude-code' {
  interface PluginState {
    'putesestvije-pano': {
      nav: Nav
      zemlje: ZemljeMapa
      top: Ponuda[]
      lista: Ponuda[]
      ponuda: Ponuda | null
      detalji: Detalji | null
      status: string
    }
  }
}
