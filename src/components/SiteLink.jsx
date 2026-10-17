// Link nazad na glavni sajt studija.
export const SITE_URL = 'https://wokeandrooted.com'
export const INSTAGRAM_URL = 'https://www.instagram.com/woke.and.rooted'

export default function SiteLink({ onDark = false }) {
  return (
    <p className={`site-link${onDark ? ' on-dark' : ''}`}>
      <a href={SITE_URL}>← wokeandrooted.com</a>
      <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Instagram</a>
    </p>
  )
}
