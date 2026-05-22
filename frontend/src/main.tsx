import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './components/settings/theme-provider.tsx'

createRoot(document.getElementById('root')!).render(

  <StrictMode>
    <ThemeProvider
    attribute="class"
    defaultTheme='system'
    storageKey="vite-ui-theme">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)