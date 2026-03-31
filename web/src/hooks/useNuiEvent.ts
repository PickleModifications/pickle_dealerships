import { useEffect, useRef } from 'react'

interface NuiMessageData<T = unknown> {
  type: string
  [key: string]: T | string
}

export function useNuiEvent<T = unknown>(action: string, handler: (data: T) => void) {
  const savedHandler = useRef(handler)

  useEffect(() => {
    savedHandler.current = handler
  }, [handler])

  useEffect(() => {
    const eventListener = (event: MessageEvent<NuiMessageData<T>>) => {
      const { type, ...data } = event.data
      if (type === action) {
        savedHandler.current(data as unknown as T)
      }
    }

    window.addEventListener('message', eventListener)
    return () => window.removeEventListener('message', eventListener)
  }, [action])
}
