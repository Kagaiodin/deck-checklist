import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { bootDemoFromUrl } from './features/demo/demoControl'

// `?demo=true` must be handled before anything reads localStorage.
bootDemoFromUrl()
  .catch(() => "none")
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
