import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { LayoutDashboard, Building2, Mail, Upload, Settings, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from '@/components/theme-toggle'
import { DemoSeeder } from './demo-seeder'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/emails', label: 'Email Log', icon: Mail, badge: true },
  { href: '/import', label: 'Import', icon: Upload },
  { href: '/settings', label: 'Settings', icon: Settings },
]

const isDemo = process.env.DEMO_MODE === 'true'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const { count: openReviewCount } = await supabase
    .from('inbound_emails')
    .select('id', { count: 'exact', head: true })
    .eq('processing_status', 'needs_review')

  const { data: fund } = await supabase
    .from('funds')
    .select('name')
    .limit(1)
    .single() as { data: { name: string } | null }

  const reviewBadge = openReviewCount ?? 0
  const fundName = fund?.name ?? 'Portfolio Reporting'

  return (
    <div className="flex h-screen overflow-hidden flex-col">
      {isDemo && (
        <div className="bg-amber-500 text-white text-center text-xs py-1.5 px-4 shrink-0">
          Running in demo mode — email parsing is disabled
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 border-r bg-card flex flex-col shrink-0">
          <div className="px-4 py-4">
            <p className="font-semibold text-sm tracking-tight truncate">{fundName}</p>
          </div>

          <Separator />

          <nav className="flex-1 p-2 space-y-0.5">
            {NAV_ITEMS.map(({ href, label, icon: Icon, badge }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {badge && reviewBadge > 0 && (
                  <span className="rounded-full bg-amber-500 text-white text-[10px] font-semibold leading-none px-1.5 py-0.5 min-w-[18px] text-center">
                    {reviewBadge > 99 ? '99+' : reviewBadge}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          <Separator />

          <div className="p-3 space-y-2">
            <ThemeToggle />
            <p className="text-xs text-muted-foreground truncate px-3 py-1">{user.email}</p>
            <form action="/api/auth/logout" method="POST">
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </form>
          </div>
        </aside>

        {/* Page content */}
        <main className="flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>

      {isDemo && <DemoSeeder />}
    </div>
  )
}
