import { DashboardSidebar } from '@/components/layout/DashboardSidebar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen bg-black">
      <DashboardSidebar />

      {/* Main content
          Mobile: full-width with top padding for the burger button.
          Desktop: takes remaining space next to the persistent sidebar. */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <main className="flex-1 overflow-auto p-4 pt-16 md:p-8 md:pt-8">
          {children}
        </main>
      </div>
    </div>
  )
}
