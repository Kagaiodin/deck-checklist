import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { bootDemoFromUrl, refreshStaleDemo } from './features/demo/demoControl'

// A running demo is brought up to the current sample data, and `?demo=true` handled,
// before anything reads localStorage.
refreshStaleDemo()
  .catch(() => false)
  .then(() => bootDemoFromUrl())
  .catch(() => "none")
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
