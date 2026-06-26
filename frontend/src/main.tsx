import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import './styles.css'
// 하이라이트 애니메이션 시안 A~D — body[data-hl-variant="x"]로 토글. 없으면 미적용(코멧 유지).
import './styles/highlight-variant-a.css'
import './styles/highlight-variant-b.css'
import './styles/highlight-variant-c.css'
import './styles/highlight-variant-d.css'
import './styles/highlight-variant-e.css'
import './styles/highlight-variant-f.css'
import './styles/highlight-variant-g.css'
import './styles/highlight-variant-h.css'
import './styles/highlight-variant-i.css'
import './styles/highlight-variant-j.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
