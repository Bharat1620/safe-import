import { useMemo } from 'react'
import { Sheet } from './sheet/Sheet'
import { DEMO_COLUMNS } from './demo/generateRows'
import { InMemorySource } from './demo/InMemorySource'

export default function App() {
  /**
   * The one line that changes on Aug 9: `new ApiSource(importId)`.
   * Nothing inside src/sheet/ knows or cares which one it gets.
   *
   * useMemo matters here — a new source object on every render would look like a
   * different dataset to useWindowedRows and wipe the cache continuously.
   */
  const dataSource = useMemo(() => new InMemorySource(500_000), [])

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <h1 className="text-lg font-semibold text-slate-800">
        Safe Import — virtualized sheet
      </h1>
      <div className="min-h-0 flex-1">
        <Sheet dataSource={dataSource} columns={DEMO_COLUMNS} />
      </div>
    </div>
  )
}
