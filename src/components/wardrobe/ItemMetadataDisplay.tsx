type MetadataRow = { label: string; value?: string | null; values?: string[] }

export default function ItemMetadataDisplay({ rows }: { rows: MetadataRow[] }) {
  return (
    <dl className="mt-6 divide-y divide-[#E4DBD0] rounded-2xl border border-[#E4DBD0] bg-[#FFFDFA]">
      {rows.map(({ label, value, values }) => {
        const present = values?.length ? values : value?.trim() ? [value.trim()] : []
        return (
          <div key={label} className="grid gap-2 px-4 py-4 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-sm text-[#6D6257]">{label}</dt>
            <dd className="flex flex-wrap gap-2 text-sm font-medium capitalize">
              {present.length ? present.map((entry) => <span key={entry} className={present.length > 1 ? 'rounded-full bg-[#EBE3D8] px-3 py-1.5 text-xs' : ''}>{entry}</span>) : <span className="text-[#8C7F72]">Add {label.toLowerCase()}</span>}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
