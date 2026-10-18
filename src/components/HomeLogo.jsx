import { Link } from 'react-router-dom'

// Logo uvek vodi na početnu stranu aplikacije (ulogovani: njihova početna; ostali: prijava).
export default function HomeLogo({ src = '/brand/logo-brown.svg', onHome }) {
  function click() {
    if (onHome) onHome()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return (
    <Link to="/" className="logo-link" onClick={click} aria-label="Woke & Rooted – početna">
      <img className="logo" src={src} alt="Woke & Rooted" />
    </Link>
  )
}
