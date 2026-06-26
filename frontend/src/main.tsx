import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import './styles.css'
// 알람 디자인 시안 A~D — body[data-alarm-variant="x"]로 토글. 속성이 없으면 미적용(기본 유지).
import './styles/alarm-variant-a.css'
import './styles/alarm-variant-b.css'
import './styles/alarm-variant-c.css'
import './styles/alarm-variant-d.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
