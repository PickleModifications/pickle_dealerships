declare module 'vara' {
  interface VaraTextConfig {
    text: string
    fontSize?: number
    strokeWidth?: number
    color?: string
    duration?: number
    textAlign?: 'left' | 'center' | 'right'
    letterSpacing?: number
    autoAnimation?: boolean
    queued?: boolean
    delay?: number
    x?: number
    y?: number
    fromCurrentPosition?: { x?: boolean; y?: boolean }
    id?: string
  }

  interface VaraProperties {
    fontSize?: number
    strokeWidth?: number
    color?: string
    duration?: number
    textAlign?: 'left' | 'center' | 'right'
    letterSpacing?: number
    autoAnimation?: boolean
    queued?: boolean
  }

  export default class Vara {
    constructor(elem: string, fontSource: string, text: string | VaraTextConfig | VaraTextConfig[], properties?: VaraProperties)
    ready(f: () => void): void
    animationEnd(f: (id: string, obj: unknown) => void): void
    draw(id: string, duration?: number): void
  }
}
