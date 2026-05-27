const BUILD_TAG = '2026.05.28'

export function SystemFooter() {
  return (
    <footer className="footer">
      <div className="footer__group">
        <span>pholex</span>
        <span>fab 7</span>
        <span>build {BUILD_TAG}</span>
      </div>
      <div className="footer__group">
        <span className="footer__live">live</span>
      </div>
    </footer>
  )
}
