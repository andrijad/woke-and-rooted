// Link nazad na glavni sajt studija.
export const SITE_URL = 'https://wokeandrooted.com'

export default function SiteLink({ onDark = false }) {
  return (
    <p className={`site-link${onDark ? ' on-dark' : ''}`}>
      <a href={SITE_URL}>← wokeandrooted.com</a>
    </p>
  )
}
