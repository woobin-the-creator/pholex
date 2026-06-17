import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import './styles.css'

// throwaway 프로토타입 분기 — ?proto=lot-hold-pagination 일 때만 시안 셸을 띄운다.
// 프로덕션 경로(App)는 그대로. prototype 폴더는 통째로 삭제 가능.
const proto = new URLSearchParams(window.location.search).get('proto')

async function mount() {
  const root = ReactDOM.createRoot(document.getElementById('root')!)
  if (proto === 'lot-hold-pagination') {
    const { LotHoldPaginationProto } = await import('./prototype/LotHoldPaginationProto')
    root.render(
      <React.StrictMode>
        <LotHoldPaginationProto />
      </React.StrictMode>,
    )
    return
  }
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

void mount()
