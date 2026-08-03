import { PortfolioIcon } from '../../shared/components/Icons'

export function PaperPortfolioDashboard() {
  return (
    <section className="page-stack portfolio-page">
      <div className="page-heading-row">
        <div className="page-heading">
          <div className="page-title-icon"><PortfolioIcon size={20} /></div>
          <div>
            <h2>Portfolio</h2>
            <p>Protected portfolio operations are managed outside the browser.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
