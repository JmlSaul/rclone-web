import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    CheckIcon,
    LogOutIcon,
    MenuIcon,
    MoonIcon,
    RefreshCwIcon,
    ScreenShareIcon,
    SettingsIcon,
    SunIcon,
} from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { LANGUAGES, type Language, type TranslationKey, useT } from '@/lib/i18n'
import { clearAuthSession, useStore } from '@/lib/store'
import { cn } from '@/lib/ui'
import rclone from '@/rclone/client'
import { updateCheckQueryOptions } from '@/rclone/update'

const navItems: { key: TranslationKey; to: string; end?: boolean }[] = [
    { key: 'nav.remotes', to: '/remotes', end: true },
    { key: 'nav.mounts', to: '/mounts' },
    { key: 'nav.serves', to: '/serves' },
    { key: 'nav.transfers', to: '/transfers' },
    { key: 'nav.settings', to: '/settings' },
]

const MESSAGES: readonly { path: string; key: TranslationKey }[] = [
    { path: '/', key: 'app.footerDashboard' },
    { path: '/remotes', key: 'app.footerRemotes' },
    { path: '/mounts', key: 'app.footerMounts' },
    { path: '/transfers', key: 'app.footerTransfers' },
    { path: '/serves', key: 'app.footerServes' },
]

export function App() {
    const t = useT()
    const location = useLocation()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const hasAuthCredentials = useStore((state) => Boolean(state.user && state.pass))

    const updateCheckQuery = useQuery(updateCheckQueryOptions())
    useQuery({ queryKey: ['core', 'disks'], queryFn: () => rclone('/core/disks') })

    const latestVersion = useMemo(() => updateCheckQuery.data, [updateCheckQuery.data])

    const isExploreActive =
        location.pathname === '/local' ||
        (location.pathname.startsWith('/remotes/') &&
            !location.pathname.endsWith('/edit') &&
            location.pathname !== '/remotes/new')
    const footerMessageKey = useMemo(
        () => MESSAGES.find(({ path }) => location.pathname === path)?.key,
        [location.pathname]
    )

    const currentTitleKey = useMemo<TranslationKey | undefined>(() => {
        if (location.pathname === '/') return 'nav.dashboard'
        if (isExploreActive) return 'nav.explore'
        return navItems.find((item) =>
            item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
        )?.key
    }, [location.pathname, isExploreActive])

    const handleExit = useCallback(() => {
        clearAuthSession()
        navigate('/login', { replace: true })
    }, [navigate])

    const updateMutation = useMutation({
        mutationFn: async () => {
            await rclone('/core/command', {
                body: { command: 'selfupdate' },
            })
        },
        onSuccess: () => {
            toast.success(t('app.updateSuccess'))
            queryClient.setQueryData(['core', 'updateCheck'], null)
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['core', 'version'] })
            }, 5000)
        },
        onError: (error) => {
            const message = error instanceof Error ? error.message : t('common.unknownError')
            toast.error(t('app.updateError', { message }))
        },
    })

    const handleRcloneUpdate = useCallback(() => {
        const shouldUpdate = window.confirm(t('app.updateConfirm'))
        if (!shouldUpdate) return
        updateMutation.mutate()
    }, [updateMutation, t])

    const longPressTimerRef = useRef<number | null>(null)
    const longPressFiredRef = useRef(false)
    const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false)
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
    const [isDarkMode, setIsDarkMode] = useState(() =>
        document.documentElement.classList.contains('dark')
    )
    const currentLanguage = useStore((state) => state.language)

    const startLongPress = useCallback(() => {
        longPressFiredRef.current = false
        longPressTimerRef.current = window.setTimeout(() => {
            longPressFiredRef.current = true
            const el = document.querySelector<HTMLImageElement>('header img[src="/icon.svg"]')
            if (el) {
                el.style.transition = 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)'
                el.style.transform = 'rotate(360deg)'
                setTimeout(() => {
                    el.style.transition = ''
                    el.style.transform = ''
                }, 500)
            }
        }, 500)
    }, [])

    const cancelLongPress = useCallback(() => {
        if (longPressTimerRef.current !== null) {
            window.clearTimeout(longPressTimerRef.current)
            longPressTimerRef.current = null
        }
    }, [])

    const toggleDarkMode = useCallback((dark: boolean) => {
        localStorage.setItem('theme', dark ? 'dark' : 'light')
        document.documentElement.classList.toggle('dark', dark)
        setIsDarkMode(dark)
    }, [])

    const selectLanguage = useCallback(
        (language: Language | undefined) => {
            useStore.setState({ language })
            queryClient.invalidateQueries()
        },
        [queryClient]
    )

    return (
        <div className="flex h-dvh min-h-screen flex-col overflow-hidden overscroll-none bg-background text-foreground">
            <header className="sticky top-0 z-10 border-b bg-background/95">
                <div className="mx-auto flex items-center gap-2 px-3 py-3 sm:gap-4 sm:px-6 sm:py-4">
                    {/* biome-ignore lint/a11y/noStaticElementInteractions: logo shortcut to settings; settings remain reachable via normal navigation. TODO: promote to a real button. */}
                    <img
                        alt=""
                        className="size-6 shrink-0 select-none"
                        src="/icon.svg"
                        draggable={false}
                        onPointerDown={startLongPress}
                        onPointerUp={cancelLongPress}
                        onPointerLeave={cancelLongPress}
                        onPointerCancel={cancelLongPress}
                        onContextMenu={(e) => {
                            e.preventDefault()
                            const el = e.currentTarget
                            el.style.transition = 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)'
                            el.style.transform = 'rotate(360deg)'
                            setTimeout(() => {
                                el.style.transition = ''
                                el.style.transform = ''
                            }, 500)
                        }}
                        onClick={() => {
                            if (longPressFiredRef.current) return
                            setIsSettingsDialogOpen(true)
                        }}
                    />
                    <span className="min-w-0 truncate text-sm font-semibold md:hidden">
                        {currentTitleKey ? t(currentTitleKey) : ''}
                    </span>
                    <nav className="hidden md:flex">
                        <NavLink
                            end
                            to="/"
                            className={({ isActive }) =>
                                isActive
                                    ? 'px-3 py-1.5 text-sm text-foreground'
                                    : 'px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
                            }
                        >
                            {t('nav.dashboard')}
                        </NavLink>
                        <NavLink
                            to="/local"
                            className={
                                isExploreActive
                                    ? 'px-3 py-1.5 text-sm text-foreground'
                                    : 'px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
                            }
                        >
                            {t('nav.explore')}
                        </NavLink>
                        {navItems.map((item) => (
                            <NavLink
                                key={item.to}
                                end={item.end}
                                to={item.to}
                                className={({ isActive }) =>
                                    isActive
                                        ? 'px-3 py-1.5 text-sm text-foreground'
                                        : 'px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
                                }
                            >
                                {t(item.key)}
                            </NavLink>
                        ))}
                    </nav>
                    <div className="ml-auto flex items-center gap-1 sm:gap-2">
                        {latestVersion && (
                            <button
                                type="button"
                                onClick={() => handleRcloneUpdate()}
                                disabled={updateMutation.isPending}
                                aria-label={
                                    updateMutation.isPending
                                        ? t('app.updating')
                                        : t('app.updateAvailable')
                                }
                                className="inline-flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-sm text-blue-800 transition-colors hover:bg-muted hover:text-blue-700 disabled:opacity-50 sm:px-3"
                            >
                                <RefreshCwIcon
                                    className={cn(
                                        'size-4 md:hidden',
                                        updateMutation.isPending && 'animate-spin'
                                    )}
                                />
                                <span className="hidden md:inline">
                                    {updateMutation.isPending
                                        ? t('app.updating')
                                        : t('app.updateAvailable')}
                                </span>
                            </button>
                        )}
                        {hasAuthCredentials && (
                            <button
                                type="button"
                                onClick={handleExit}
                                aria-label={t('app.logOut')}
                                className="hidden cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-red-600 sm:px-3 md:inline-flex"
                            >
                                <LogOutIcon className="size-4" />
                                {/* Log out */}
                            </button>
                        )}
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-lg"
                            className="md:hidden"
                            aria-label={t('app.menu')}
                            aria-expanded={isMobileNavOpen}
                            onClick={() => setIsMobileNavOpen(true)}
                        >
                            <MenuIcon className="size-5" />
                        </Button>
                    </div>
                </div>
            </header>

            <main className="mx-auto flex min-h-0 w-full flex-1 flex-col overflow-y-auto overscroll-none">
                <Outlet />

                {footerMessageKey ? (
                    <footer className="mt-auto group shrink-0 px-4 py-4 text-center text-sm text-muted-foreground flex justify-center gap-1.5 items-center sm:px-6">
                        <a
                            href="https://rcloneui.com/web"
                            target="_blank"
                            rel="noreferrer"
                            className="transition-colors group-hover:text-foreground"
                        >
                            {t(footerMessageKey)}
                        </a>
                        <ScreenShareIcon className="size-4 duration-1000 transition-colors group-hover:text-foreground" />
                    </footer>
                ) : null}
            </main>

            <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('app.settingsTitle')}</DialogTitle>
                    </DialogHeader>

                    <div className="-mx-2 space-y-1">
                        <h3 className="px-2 pb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                            {t('app.themeSection')}
                        </h3>
                        <label className="flex items-center justify-between rounded-md px-3 py-2.5 transition-colors hover:bg-muted cursor-pointer">
                            <span className="flex items-center gap-3 text-sm">
                                {isDarkMode ? (
                                    <MoonIcon className="size-4 text-muted-foreground" />
                                ) : (
                                    <SunIcon className="size-4 text-muted-foreground" />
                                )}
                                {t('app.darkMode')}
                            </span>
                            <Switch checked={isDarkMode} onCheckedChange={toggleDarkMode} />
                        </label>

                        <Separator className="!my-3" />

                        <h3 className="px-2 pb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                            {t('app.languageSection')}
                        </h3>
                        <LanguageOption
                            emoji="🌐"
                            label={t('app.defaultLanguage')}
                            isActive={!currentLanguage}
                            onSelect={() => selectLanguage(undefined)}
                        />
                        {LANGUAGES.map((language) => (
                            <LanguageOption
                                key={language.code}
                                emoji={language.emoji}
                                label={language.label}
                                isActive={currentLanguage === language.code}
                                onSelect={() => selectLanguage(language.code)}
                            />
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            <MobileNavDialog
                open={isMobileNavOpen}
                onOpenChange={setIsMobileNavOpen}
                isExploreActive={isExploreActive}
                onOpenSettings={() => setIsSettingsDialogOpen(true)}
                showLogout={hasAuthCredentials}
                onLogout={handleExit}
            />
        </div>
    )
}

function MobileNavDialog({
    open,
    onOpenChange,
    isExploreActive,
    onOpenSettings,
    showLogout,
    onLogout,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    isExploreActive: boolean
    onOpenSettings: () => void
    showLogout: boolean
    onLogout: () => void
}) {
    const t = useT()
    const baseLinkClassName =
        'flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors'
    const activeLinkClassName = 'bg-muted text-foreground'
    const inactiveLinkClassName = 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
    const resolveLinkClassName = (isActive: boolean) =>
        cn(baseLinkClassName, isActive ? activeLinkClassName : inactiveLinkClassName)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="top-0 left-0 flex h-dvh max-h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 flex-col gap-1 rounded-none border-r p-3 sm:max-w-[85vw]">
                <DialogHeader>
                    <DialogTitle>{t('app.menu')}</DialogTitle>
                </DialogHeader>

                <nav className="flex flex-col gap-1">
                    <NavLink
                        end
                        to="/"
                        className={({ isActive }) => resolveLinkClassName(isActive)}
                        onClick={() => onOpenChange(false)}
                    >
                        {t('nav.dashboard')}
                    </NavLink>
                    <NavLink
                        to="/local"
                        className={() => resolveLinkClassName(isExploreActive)}
                        onClick={() => onOpenChange(false)}
                    >
                        {t('nav.explore')}
                    </NavLink>
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            end={item.end}
                            to={item.to}
                            className={({ isActive }) => resolveLinkClassName(isActive)}
                            onClick={() => onOpenChange(false)}
                        >
                            {t(item.key)}
                        </NavLink>
                    ))}
                </nav>

                <Separator className="!my-2" />

                <button
                    type="button"
                    onClick={() => {
                        onOpenChange(false)
                        onOpenSettings()
                    }}
                    className={cn(
                        baseLinkClassName,
                        inactiveLinkClassName,
                        'w-full cursor-pointer gap-3 text-left'
                    )}
                >
                    <SettingsIcon className="size-4 shrink-0" />
                    {t('app.appearance')}
                </button>

                {showLogout ? (
                    <div className="mt-auto pt-2">
                        <Separator className="!mb-2" />
                        <button
                            type="button"
                            onClick={() => {
                                onOpenChange(false)
                                onLogout()
                            }}
                            className={cn(
                                baseLinkClassName,
                                'w-full cursor-pointer gap-3 text-left text-red-600 hover:bg-red-500/10'
                            )}
                        >
                            <LogOutIcon className="size-4 shrink-0" />
                            {t('app.logOut')}
                        </button>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    )
}

function LanguageOption({
    emoji,
    label,
    isActive,
    onSelect,
}: {
    emoji: string
    label: string
    isActive: boolean
    onSelect: () => void
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted',
                isActive && 'bg-muted'
            )}
        >
            <span className="text-lg leading-none">{emoji}</span>
            <span className="flex-1">{label}</span>
            {isActive ? <CheckIcon className="size-4 text-muted-foreground" /> : null}
        </button>
    )
}

export default App
