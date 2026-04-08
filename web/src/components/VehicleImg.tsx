import { useState } from 'react'
import { Car } from 'lucide-react'
import { getVehicleImage } from '../lib/utils'

interface Props {
  image?: string | null
  model: string
  alt?: string
  className?: string
  fallbackClassName?: string
  iconClassName?: string
}

export default function VehicleImg({ image, model, alt, className, fallbackClassName, iconClassName }: Props) {
  const src = getVehicleImage(image, model)
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div className={fallbackClassName || className}>
        <Car className={iconClassName || 'h-5 w-5 text-muted-foreground/30'} />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt || model}
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  )
}
