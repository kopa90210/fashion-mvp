import BottomNav from '@/src/components/nav/BottomNav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="stylegraph-app-shell">
        {children}
      </div>
      <BottomNav />
    </>
  )
}
