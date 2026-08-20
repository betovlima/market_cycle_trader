import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { I18nProvider } from './i18n/I18nProvider'
import './styles/base.css'
import './styles/model-tuning.css'
import './styles/backtest-analytics.css'
import './styles/temporal-intelligence.css'
import './styles/research-workspaces.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)

