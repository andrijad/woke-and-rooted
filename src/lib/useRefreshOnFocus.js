import { useEffect, useRef } from 'react'

// Poziva callback kad se korisnik vrati na tab/prozor, da bi videla
// promenu statusa (npr. potvrđenu uplatu) bez ručnog osvežavanja.
export function useRefreshOnFocus(callback) {
  const ref = useRef(callback)
  ref.current = callback

  useEffect(() => {
    function run() { ref.current() }
    function onVisible() { if (document.visibilityState === 'visible') run() }
    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
