export type QubitType = "superconducting" | "trapped-ion" | "photonic" | "neutral-atom" | "all"
export type CodeType = "surface-code" | "color-code" | "stabilizer" | "bosonic" | "all"

export interface Decoder {
  id: string
  title: string
  author: string
  authorAvatar?: string
  description: string
  stars: number
  downloads: number
  tags: string[]
  codeType: CodeType
  qubitType: QubitType
  distance?: number
  createdAt: string
  updatedAt: string
  language?: string
  license?: string
}

export interface DecoderFilters {
  search?: string
  codeType?: CodeType
  qubitType?: QubitType
  minDistance?: number
  tags?: string[]
}

