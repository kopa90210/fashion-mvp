export default function DemoOfferNote({ offer }: { offer: { brand: string; referenceUrl?: string } }) {
  if (!offer.referenceUrl) return <p className="mt-3 text-sm">Demo offer · illustrative price, unavailable for purchase.</p>
  return <div className="mt-3">
    <p className="text-sm">Workbook sample · recorded price. Current price, size and stock unverified.</p>
    <a className="inline-flex min-h-11 items-center rounded-lg underline focus-visible:outline-2"
      href={offer.referenceUrl} target="_blank" rel="noopener noreferrer">View original product at {offer.brand} ↗</a>
  </div>
}
