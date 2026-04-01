import { useEffect, useRef } from 'react'

export function useNuiEvent<T = unknown>(action: string, handler: (data: T) => void) {
  const savedHandler = useRef(handler)

  useEffect(() => {
    savedHandler.current = handler
  }, [handler])

  useEffect(() => {
    const eventListener = (event: MessageEvent) => {
      const { type, ...rest } = event.data
      if (type === action) {
        savedHandler.current(rest as T)
      }
    }

    window.addEventListener('message', eventListener)
    return () => window.removeEventListener('message', eventListener)
  }, [action])
}
