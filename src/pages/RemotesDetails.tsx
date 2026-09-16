import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    ArchiveIcon,
    CloudIcon,
    DownloadIcon,
    EllipsisVerticalIcon,
    FileIcon,
    FileImageIcon,
    FileSpreadsheetIcon,
    FileTextIcon,
    FolderIcon,
    FolderPlusIcon,
    HardDriveIcon,
    HouseIcon,
    ImageIcon,
    MonitorIcon,
    MusicIcon,
    PanelLeftIcon,
    PencilIcon,
    SearchIcon,
    SendIcon,
    TrashIcon,
    UploadIcon,
    UsbIcon,
    VideoIcon,
    XIcon,
} from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    Link,
    NavLink,
    useLocation,
    useNavigate,
    useParams,
    useSearchParams,
} from 'react-router-dom'
import { toast } from 'sonner'
import { PageContent } from '@/components/PageContent'
import { RefreshButton } from '@/components/RefreshButton'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty'
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from '@/components/ui/input-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatBytes } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/ui'
import rclone, { rcloneAsync } from '@/rclone/client'
import {
    fetchLocalUsage,
    fetchRemotesList,
    fetchRemoteUsage,
    type RemoteUsage,
} from '@/rclone/usage'

const IMAGE_EXTS = new Set([
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
    'svg',
    'bmp',
    'ico',
    'tiff',
    'tif',
    'avif',
])
const SPREADSHEET_EXTS = new Set(['xlsx', 'xls', 'csv', 'ods', 'tsv', 'numbers'])
const ARCHIVE_EXTS = new Set(['zip', 'tar', 'gz', 'bz2', 'rar', '7z', 'xz', 'zst', 'tgz'])
const PDF_EXTS = new Set(['pdf'])

function getFileExtension(name: string): string {
    const lastDot = name.lastIndexOf('.')
    if (lastDot < 0) return ''
    return name.slice(lastDot + 1).toLowerCase()
}

function getFileTypeIcon(name: string) {
    const ext = getFileExtension(name)

    if (PDF_EXTS.has(ext)) {
        return { icon: FileTextIcon, className: 'bg-rose-500/10 text-rose-600' }
    }
    if (SPREADSHEET_EXTS.has(ext)) {
        return { icon: FileSpreadsheetIcon, className: 'bg-emerald-500/10 text-emerald-600' }
    }
    if (IMAGE_EXTS.has(ext)) {
        return { icon: FileImageIcon, className: 'bg-sky-500/10 text-sky-600' }
    }
    if (ARCHIVE_EXTS.has(ext)) {
        return { icon: ArchiveIcon, className: 'bg-amber-500/10 text-amber-600' }
    }

    return { icon: FileTextIcon, className: 'bg-muted text-muted-foreground' }
}

function normalizePath(pathParam: string | null | undefined) {
    if (!pathParam) return ''
    return pathParam
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean)
        .join('/')
}

function getPathSegments(path: string) {
    const normalized = normalizePath(path)
    if (!normalized) return []
    return normalized.split('/')
}

function buildRemotePathHref(remoteName: string, path: string) {
    const normalized = normalizePath(path)
    if (!normalized) return `/remotes/${remoteName}`
    const query = new URLSearchParams({ path: normalized })
    return `/remotes/${remoteName}?${query.toString()}`
}

function getDiskLabel(disk: string): string {
    const last = disk.split(/[/\\]/).filter(Boolean).pop()
    return last ?? disk
}

function getDiskIcon(disk: string) {
    const last = disk.split(/[/\\]/).filter(Boolean).pop()?.toLowerCase()
    switch (last) {
        case 'desktop':
            return { icon: MonitorIcon, className: 'text-sky-400' }
        case 'documents':
            return { icon: FileTextIcon, className: 'text-blue-400' }
        case 'downloads':
            return { icon: DownloadIcon, className: 'text-green-400' }
        case 'music':
            return { icon: MusicIcon, className: 'text-pink-400' }
        case 'pictures':
            return { icon: ImageIcon, className: 'text-purple-400' }
        case 'videos':
        case 'movies':
            return { icon: VideoIcon, className: 'text-red-400' }
    }
    if (disk === '/' || /^[A-Z]:[\\/]?$/i.test(disk))
        return { icon: HardDriveIcon, className: 'text-zinc-400' }
    if (/[\\/](?:media|Volumes|mnt)[\\/]/i.test(disk))
        return { icon: UsbIcon, className: 'text-orange-400' }
    return { icon: HouseIcon, className: 'text-amber-400' }
}

function buildLocalPathHref(disk: string, path: string) {
    const params = new URLSearchParams({ disk })
    const normalized = normalizePath(path)
    if (normalized) params.set('path', normalized)
    return `/local?${params}`
}

function formatModTimeParts(modTime: string | undefined) {
    if (!modTime) return null
    const date = new Date(modTime)
    if (Number.isNaN(date.getTime())) return null

    const pad = (value: number) => String(value).padStart(2, '0')

    return {
        date: date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        }),
        time: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    }
}

function formatModTime(modTime: string | undefined): string {
    const parts = formatModTimeParts(modTime)
    return parts ? `${parts.date} ${parts.time}` : '\u2014'
}

function ModTimeCell({ modTime }: { modTime: string | undefined }) {
    const parts = formatModTimeParts(modTime)

    if (!parts) return <span className="font-medium text-muted-foreground">{'\u2014'}</span>

    return (
        <span className="flex flex-col font-medium text-muted-foreground">
            <span>{parts.date}</span>
            <span className="font-normal tabular-nums text-xs">{parts.time}</span>
        </span>
    )
}

type TransferSource = {
    fs: string
    path: string
    name: string
    isDir: boolean
}

function TransferPanel({
    source,
    isPending,
    onCancel,
    onExecute,
}: {
    source: TransferSource
    isPending: boolean
    onCancel: () => void
    onExecute: (mode: 'copy' | 'move') => void
}) {
    const t = useT()

    return (
        <Card size="sm" className="gap-0">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm">{t('remotesDetails.transfer')}</CardTitle>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t('remotesDetails.cancelTransfer')}
                        onClick={onCancel}
                    >
                        <XIcon className="size-3.5" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-xs">
                    {source.isDir ? (
                        <FolderIcon className="size-3.5 shrink-0 text-indigo-400" />
                    ) : (
                        <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate font-medium">{source.name}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                    {t('remotesDetails.transferFrom', {
                        remote: source.fs.replace(/[/:]+$/, ''),
                        path: source.path.split('/').slice(0, -1).join('/') || '/',
                    })}
                </p>
                <p className="text-xs text-muted-foreground">
                    {t('remotesDetails.navigateToDestination')}
                </p>
                <div className="flex gap-2">
                    <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className="flex-1"
                        disabled={isPending}
                        onClick={() => onExecute('move')}
                    >
                        {t('remotesDetails.moveHere')}
                    </Button>
                    <Button
                        type="button"
                        size="xs"
                        className="flex-1"
                        disabled={isPending}
                        onClick={() => onExecute('copy')}
                    >
                        {t('remotesDetails.copyHere')}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

function StorageUsageBody({
    usage,
    isPending,
    fallbackText,
}: {
    usage: RemoteUsage | null
    isPending: boolean
    fallbackText: string
}) {
    const t = useT()

    if (isPending) {
        return (
            <div className="flex justify-center py-2">
                <Spinner className="size-4" />
            </div>
        )
    }

    if (!usage) {
        return <p className="text-xs text-muted-foreground">{fallbackText}</p>
    }

    return (
        <>
            <Progress value={usage.barPercent ?? 50} />
            <p className="text-xs text-muted-foreground">
                {usage.totalLabel
                    ? t('remotesDetails.storageUsedOf', {
                          used: usage.usedLabel,
                          total: usage.totalLabel,
                      })
                    : t('remotesDetails.storageUsed', { used: usage.usedLabel })}
            </p>
        </>
    )
}

function buildServeUrl(rcUrl: string, serveAddr: string): string {
    const parsed = new URL(rcUrl.trim().replace(/\/+$/, ''))
    const portMatch = serveAddr.match(/:(\d+)$/)
    if (!portMatch) throw new Error('Could not parse serve address')
    return `${parsed.protocol}//${parsed.hostname}:${portMatch[1]}`
}

type ListItem = {
    rowKey: string
    Name: string
    Path: string
    Size: number
    ModTime: string
    IsDir: boolean
}

export function RemotesDetailsPage() {
    const t = useT()
    const location = useLocation()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { remoteName = '' } = useParams()
    const [searchParams, setSearchParams] = useSearchParams()
    const [searchTerm, setSearchTerm] = useState('')
    const [sidebarSearch, setSidebarSearch] = useState('')
    const [sidebarCompact, setSidebarCompact] = useState(false)
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
    const [transferSource, setTransferSource] = useState<TransferSource | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const isLocalMode = location.pathname === '/local'
    const diskPath = searchParams.get('disk') ?? ''
    const currentFs = isLocalMode ? diskPath.replace(/\/?$/, '/') : `${remoteName}:`
    const currentPath = useMemo(() => normalizePath(searchParams.get('path')), [searchParams])

    // --- Queries ---

    const disksQuery = useQuery({
        queryKey: ['core', 'disks'],
        queryFn: () => rclone('/core/disks'),
    })

    const disks = useMemo(() => disksQuery.data?.disks ?? [], [disksQuery.data])

    const remotesListQuery = useQuery({
        queryKey: ['remotes', 'list'],
        queryFn: fetchRemotesList,
    })

    const remotes = useMemo(() => remotesListQuery.data ?? [], [remotesListQuery.data])

    const remoteNames = useMemo(() => remotes.map((r) => r.name) ?? [], [remotes])

    const remoteExists =
        !!remoteName && (!remotesListQuery.isSuccess || remoteNames.includes(remoteName))

    const canBrowse = remoteExists || (isLocalMode && !!diskPath)

    useEffect(() => {
        if (isLocalMode && !diskPath && disks.length > 0) {
            navigate(buildLocalPathHref(disks[0], ''), { replace: true })
        }
    }, [isLocalMode, diskPath, disks, navigate])

    const listQuery = useQuery({
        queryKey: ['remote-browse', currentFs, currentPath] as const,
        queryFn: async ({ queryKey: [, qFs, qPath], signal }) => {
            const response = await rclone('/operations/list', {
                params: { query: { fs: qFs, remote: qPath } },
                signal,
            })
            const rawList = response.list ?? []
            return rawList
                .map((item, index): ListItem => {
                    const name = String(item.Name ?? '')
                    const path = String(item.Path ?? name)
                    const size = Number(item.Size ?? 0)
                    const modTime = String(item.ModTime ?? '')
                    const isDir = Boolean(item.IsDir || item.IsBucket)
                    const id = String(item.ID ?? '')
                    const origId = String(item.OrigID ?? '')
                    const encryptedPath = String(item.EncryptedPath ?? '')

                    return {
                        rowKey: JSON.stringify([
                            qFs,
                            qPath,
                            id,
                            origId,
                            encryptedPath,
                            path,
                            name,
                            modTime,
                            size,
                            isDir ? 'dir' : 'file',
                            index,
                        ]),
                        Name: name,
                        Path: path,
                        Size: size,
                        ModTime: modTime,
                        IsDir: isDir,
                    }
                })
                .sort((a, b) => {
                    if (a.IsDir !== b.IsDir) return a.IsDir ? -1 : 1
                    return a.Name.localeCompare(b.Name)
                })
        },
        enabled: canBrowse,
    })

    const usageQuery = useQuery({
        queryKey: ['remotes', 'usage', isLocalMode ? diskPath : remoteName] as const,
        queryFn: ({ queryKey: [, , qKey] }) =>
            isLocalMode
                ? fetchLocalUsage(qKey)
                : fetchRemoteUsage(qKey, remotes.find((r) => r.name === qKey)?.type ?? 'unknown'),
        enabled: isLocalMode ? !!diskPath : remoteExists,
        staleTime: 5 * 60 * 1000,
        retry: false,
    })

    // --- Mutations ---

    const deleteMutation = useMutation({
        mutationFn: async ({ fs, path, isDir }: { fs: string; path: string; isDir: boolean }) => {
            if (isDir) {
                await rclone('/operations/purge', {
                    params: { query: { fs, remote: path } },
                })
            } else {
                await rclone('/operations/deletefile', {
                    params: { query: { fs, remote: path } },
                })
            }
        },
        onSuccess: (_data, { fs }) => {
            toast.success(t('remotesDetails.deleteSuccess'))
            queryClient.invalidateQueries({ queryKey: ['remote-browse', fs] })
            queryClient.invalidateQueries({ queryKey: ['jobs'] })
        },
        onError: (error) => {
            toast.error(
                t('remotesDetails.deleteError', {
                    message: error instanceof Error ? error.message : t('common.unknownError'),
                })
            )
        },
    })

    const mkdirMutation = useMutation({
        mutationFn: async ({ fs, path }: { fs: string; path: string }) => {
            await rclone('/operations/mkdir', {
                params: { query: { fs, remote: path } },
            })
        },
        onSuccess: (_, { fs }) => {
            toast.success(t('remotesDetails.createFolderSuccess'))
            queryClient.invalidateQueries({ queryKey: ['remote-browse', fs] })
        },
        onError: (error) => {
            toast.error(
                t('remotesDetails.createFolderError', {
                    message: error instanceof Error ? error.message : t('common.unknownError'),
                })
            )
        },
    })

    const renameMutation = useMutation({
        mutationFn: async ({
            fs,
            oldPath,
            newPath,
            isDir,
        }: {
            fs: string
            oldPath: string
            newPath: string
            isDir: boolean
        }) => {
            if (isDir) {
                await rclone('/sync/move', {
                    params: {
                        query: {
                            srcFs: `${fs}${oldPath}/`,
                            dstFs: `${fs}${newPath}/`,
                            deleteEmptySrcDirs: true,
                        },
                    },
                })
            } else {
                await rclone('/operations/movefile', {
                    params: {
                        query: {
                            srcFs: fs,
                            srcRemote: oldPath,
                            dstFs: fs,
                            dstRemote: newPath,
                        },
                    },
                })
            }
        },
        onSuccess: (_data, { fs }) => {
            toast.success(t('remotesDetails.renameSuccess'))
            queryClient.invalidateQueries({ queryKey: ['remote-browse', fs] })
            queryClient.invalidateQueries({ queryKey: ['jobs'] })
        },
        onError: (error) => {
            toast.error(
                t('remotesDetails.renameError', {
                    message: error instanceof Error ? error.message : t('common.unknownError'),
                })
            )
        },
    })

    const uploadMutation = useMutation({
        mutationFn: async ({
            fs,
            currentPath,
            files,
        }: {
            fs: string
            currentPath: string
            files: File[]
        }) => {
            const { url, user, pass } = useStore.getState()
            const baseUrl = url.trim().replace(/\/+$/, '')
            const params = new URLSearchParams({
                fs,
                remote: currentPath,
            })

            for (const file of files) {
                const formData = new FormData()
                formData.append('file', file, file.name)

                const response = await fetch(`${baseUrl}/operations/uploadfile?${params}`, {
                    method: 'POST',
                    headers:
                        user && pass
                            ? { Authorization: `Basic ${btoa(`${user}:${pass}`)}` }
                            : undefined,
                    body: formData,
                })

                if (!response.ok) {
                    let errorMsg = `${response.status} ${response.statusText}`
                    try {
                        const data = (await response.json()) as { error?: string }
                        if (data?.error) errorMsg = data.error
                    } catch {}
                    throw new Error(`Failed to upload ${file.name}: ${errorMsg}`)
                }
            }
        },
        onSuccess: (_data, { fs, currentPath }) => {
            toast.success(t('remotesDetails.uploadComplete'))
            queryClient.invalidateQueries({
                queryKey: ['remote-browse', fs, currentPath],
            })
            queryClient.invalidateQueries({ queryKey: ['jobs'] })
            if (fileInputRef.current) fileInputRef.current.value = ''
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : t('remotesDetails.uploadFailed'))
            if (fileInputRef.current) fileInputRef.current.value = ''
        },
    })

    const downloadMutation = useMutation({
        mutationFn: async ({
            fs,
            name,
            path,
            isDir,
        }: {
            fs: string
            name: string
            path: string
            isDir: boolean
        }) => {
            const result = await rclone('/serve/start', {
                body: { type: 'http', fs, addr: ':0', allow_origin: '*' },
            })

            const { id: serveId, addr: serveAddr } = result

            try {
                const { url } = useStore.getState()
                const serveBaseUrl = buildServeUrl(url, serveAddr)

                const downloadUrl = isDir
                    ? `${serveBaseUrl}/${path}/?download=zip`
                    : `${serveBaseUrl}/${path}`

                const response = await fetch(downloadUrl)
                if (!response.ok) {
                    throw new Error(`Download failed: ${response.status} ${response.statusText}`)
                }

                const blob = await response.blob()
                const objectUrl = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = objectUrl
                a.download = isDir ? `${name}.zip` : name
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(objectUrl)
            } finally {
                try {
                    await rclone('/serve/stop', {
                        params: { query: { id: serveId } },
                    })
                } catch {
                    // Swallow stop errors
                }
            }
        },
        onError: (error) => {
            toast.error(
                t('remotesDetails.downloadError', {
                    message: error instanceof Error ? error.message : t('common.unknownError'),
                })
            )
        },
    })

    const transferMutation = useMutation({
        mutationFn: async ({
            source,
            dstFs,
            dstCurrentPath,
            mode,
        }: {
            source: { fs: string; path: string; name: string; isDir: boolean }
            dstFs: string
            dstCurrentPath: string
            mode: 'copy' | 'move'
        }) => {
            const dstPath = [dstCurrentPath, source.name].filter(Boolean).join('/')

            if (source.isDir) {
                await rclone('/operations/mkdir', {
                    params: { query: { fs: dstFs, remote: dstPath } },
                })

                const syncBody = {
                    srcFs: `${source.fs}${source.path}`,
                    dstFs: `${dstFs}${dstPath}`,
                    createEmptySrcDirs: true,
                }
                const result =
                    mode === 'copy'
                        ? await rcloneAsync('/sync/copy', { body: syncBody })
                        : await rcloneAsync('/sync/move', { body: syncBody })

                const jobid = result.jobid
                if (!jobid) throw new Error('No job ID returned')

                await new Promise((resolve) => setTimeout(resolve, 1000))
                const status = await rclone('/job/status', {
                    params: { query: { jobid } },
                }).catch(() => null)

                if (!status) throw new Error('Could not verify job status')
                if (status.error) throw new Error(status.error)

                return jobid
            }

            const fileBody = {
                srcFs: source.fs,
                srcRemote: source.path,
                dstFs,
                dstRemote: dstPath,
            }
            const result =
                mode === 'copy'
                    ? await rcloneAsync('/operations/copyfile', { body: fileBody })
                    : await rcloneAsync('/operations/movefile', { body: fileBody })

            const jobid = result.jobid
            if (!jobid) throw new Error('No job ID returned')

            await new Promise((resolve) => setTimeout(resolve, 1000))
            const status = await rclone('/job/status', {
                params: { query: { jobid } },
            }).catch(() => null)

            if (!status) throw new Error('Could not verify job status')
            if (status.error) throw new Error(status.error)

            return jobid
        },
    })

    // --- Memos ---

    const sortedRemotes = useMemo(
        () => [...remoteNames].sort((a, b) => a.localeCompare(b)),
        [remoteNames]
    )

    const filteredDisks = useMemo(() => {
        const q = sidebarSearch.trim().toLowerCase()
        if (!q) return disks
        return disks.filter((d) => d.toLowerCase().includes(q))
    }, [disks, sidebarSearch])

    const filteredRemotes = useMemo(() => {
        const q = sidebarSearch.trim().toLowerCase()
        if (!q) return sortedRemotes
        return sortedRemotes.filter((name) => name.toLowerCase().includes(q))
    }, [sortedRemotes, sidebarSearch])
    const items = useMemo(() => listQuery.data ?? [], [listQuery.data])
    const filteredItems = useMemo(() => {
        const q = searchTerm.trim().toLowerCase()
        if (!q) return items
        return items.filter((item) => item.Name.toLowerCase().includes(q))
    }, [items, searchTerm])

    const breadcrumbItems = useMemo(() => {
        const segments = getPathSegments(currentPath)
        return segments.map((segment, index) => ({
            label: segment,
            path: segments.slice(0, index + 1).join('/'),
        }))
    }, [currentPath])

    const usage = useMemo(() => {
        const data = usageQuery.data
        if (data?.state !== 'success') return null
        return data.usage
    }, [usageQuery.data])

    const hasStorageTarget = isLocalMode ? !!diskPath : !!remoteName

    const remoteNotFound = useMemo(
        () =>
            !isLocalMode &&
            remotesListQuery.isSuccess &&
            remoteName !== '' &&
            !sortedRemotes.includes(remoteName),
        [isLocalMode, remotesListQuery.isSuccess, remoteName, sortedRemotes]
    )

    const isMutating = useMemo(
        () =>
            deleteMutation.isPending ||
            mkdirMutation.isPending ||
            renameMutation.isPending ||
            uploadMutation.isPending ||
            downloadMutation.isPending ||
            transferMutation.isPending,
        [
            deleteMutation.isPending,
            mkdirMutation.isPending,
            renameMutation.isPending,
            uploadMutation.isPending,
            downloadMutation.isPending,
            transferMutation.isPending,
        ]
    )

    // --- Callbacks ---

    const setPath = useCallback(
        (path: string) => {
            const normalized = normalizePath(path)
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev)
                if (normalized) {
                    next.set('path', normalized)
                } else {
                    next.delete('path')
                }
                return next
            })
        },
        [setSearchParams]
    )

    const openFolder = useCallback(
        (folderName: string) => {
            setPath([currentPath, folderName].filter(Boolean).join('/'))
        },
        [setPath, currentPath]
    )

    const handleNewFolder = useCallback(() => {
        const name = window.prompt(t('remotesDetails.folderNamePrompt'))
        if (!name?.trim()) return
        const folderPath = [currentPath, name.trim()].filter(Boolean).join('/')
        mkdirMutation.mutate({ fs: currentFs, path: folderPath })
    }, [currentPath, currentFs, mkdirMutation.mutate, t])

    const handleRename = useCallback(
        (item: ListItem) => {
            const newName = window.prompt(t('remotesDetails.renamePrompt'), item.Name)
            if (!newName?.trim() || newName.trim() === item.Name) return
            const oldPath = [currentPath, item.Name].filter(Boolean).join('/')
            const newPath = [currentPath, newName.trim()].filter(Boolean).join('/')
            renameMutation.mutate({ fs: currentFs, oldPath, newPath, isDir: item.IsDir })
        },
        [currentPath, currentFs, renameMutation.mutate, t]
    )

    const handleDelete = useCallback(
        (item: ListItem) => {
            const confirmed = window.confirm(
                item.IsDir
                    ? t('remotesDetails.deleteFolderConfirm', { name: item.Name })
                    : t('remotesDetails.deleteConfirm', { name: item.Name })
            )
            if (!confirmed) return
            const itemPath = [currentPath, item.Name].filter(Boolean).join('/')
            deleteMutation.mutate({ fs: currentFs, path: itemPath, isDir: item.IsDir })
        },
        [currentPath, currentFs, deleteMutation.mutate, t]
    )

    const handleDownload = useCallback(
        (item: ListItem) => {
            const itemPath = [currentPath, item.Name].filter(Boolean).join('/')
            downloadMutation.mutate({
                fs: currentFs,
                name: item.Name,
                path: itemPath,
                isDir: item.IsDir,
            })
        },
        [currentPath, currentFs, downloadMutation.mutate]
    )

    const handleTransfer = useCallback(
        (item: ListItem) => {
            const itemPath = [currentPath, item.Name].filter(Boolean).join('/')
            setTransferSource({
                fs: currentFs,
                path: itemPath,
                name: item.Name,
                isDir: item.IsDir,
            })
        },
        [currentPath, currentFs]
    )

    const handleTransferExecute = useCallback(
        (mode: 'copy' | 'move') => {
            if (!transferSource) return

            transferMutation.mutate(
                {
                    source: transferSource,
                    dstFs: currentFs,
                    dstCurrentPath: currentPath,
                    mode,
                },
                {
                    onSuccess: () => {
                        const source = transferSource
                        setTransferSource(null)

                        const sourceDir = source.path.split('/').slice(0, -1).join('/')
                        const movedAway = source.fs !== currentFs || sourceDir !== currentPath
                        const sourceIsLocal = source.fs.startsWith('/')
                        const sourcePath = sourceIsLocal
                            ? buildLocalPathHref(source.fs.replace(/\/$/, ''), sourceDir)
                            : buildRemotePathHref(source.fs.replace(/:$/, ''), sourceDir)

                        toast(
                            mode === 'copy'
                                ? t('remotesDetails.copyStarted')
                                : t('remotesDetails.moveStarted'),
                            {
                                position: 'bottom-left',
                                action: movedAway
                                    ? {
                                          label: t('remotesDetails.backToSource'),
                                          onClick: () => navigate(sourcePath),
                                      }
                                    : undefined,
                                cancel: {
                                    label: t('remotesDetails.viewTransfers'),
                                    onClick: () => navigate('/transfers'),
                                },
                            }
                        )

                        queryClient.invalidateQueries({ queryKey: ['jobs'] })
                    },
                    onError: (error) => {
                        toast.error(
                            t('remotesDetails.transferError', {
                                message:
                                    error instanceof Error
                                        ? error.message
                                        : t('common.unknownError'),
                            })
                        )
                    },
                }
            )
        },
        [
            transferSource,
            currentFs,
            currentPath,
            navigate,
            queryClient.invalidateQueries,
            transferMutation.mutate,
            t,
        ]
    )

    const handleCancelTransfer = useCallback(() => {
        const source = transferSource
        setTransferSource(null)
        if (!source) return

        const sourceDir = source.path.split('/').slice(0, -1).join('/')
        if (source.fs === currentFs && sourceDir === currentPath) return

        const sourceIsLocal = source.fs.startsWith('/')
        const sourcePath = sourceIsLocal
            ? buildLocalPathHref(source.fs.replace(/\/$/, ''), sourceDir)
            : buildRemotePathHref(source.fs.replace(/:$/, ''), sourceDir)

        toast(t('remotesDetails.transferCancelled'), {
            position: 'bottom-left',
            action: {
                label: t('remotesDetails.backToSource'),
                onClick: () => navigate(sourcePath),
            },
        })
    }, [transferSource, currentFs, currentPath, navigate, t])

    const handleUpload = useCallback(() => {
        fileInputRef.current?.click()
    }, [])

    const handleFileChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const files = event.target.files
            if (!files || files.length === 0) return
            uploadMutation.mutate({ fs: currentFs, currentPath, files: Array.from(files) })
        },
        [uploadMutation, currentFs, currentPath]
    )

    // --- Render ---

    return (
        <section className="relative flex h-full min-h-0 w-full overflow-hidden">
            <input
                ref={fileInputRef}
                type="file"
                multiple={true}
                className="hidden"
                onChange={handleFileChange}
            />

            {isMobileSidebarOpen && (
                <div
                    className="absolute inset-0 z-20 bg-black/40 md:hidden"
                    aria-hidden="true"
                    onClick={() => setIsMobileSidebarOpen(false)}
                />
            )}

            {transferSource ? (
                <div className="absolute inset-x-0 bottom-0 z-10 border-t bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.4)] backdrop-blur md:hidden">
                    <TransferPanel
                        source={transferSource}
                        isPending={transferMutation.isPending}
                        onCancel={handleCancelTransfer}
                        onExecute={handleTransferExecute}
                    />
                </div>
            ) : null}

            <aside
                className={cn(
                    'absolute inset-y-0 left-0 z-30 flex w-72 max-w-[85vw] shrink-0 flex-col border-r bg-background shadow-xl transition-transform duration-200',
                    'md:relative md:inset-auto md:z-auto md:max-w-none md:translate-x-0 md:shadow-none md:transition-none',
                    sidebarCompact ? 'md:w-48' : 'md:w-72',
                    isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
                )}
            >
                <InputGroup className="h-10 shrink-0 rounded-none border-x-0 border-t-0 !ring-0 [&]:border-x-0 [&]:border-t-0">
                    <InputGroupAddon align="inline-start">
                        <SearchIcon />
                    </InputGroupAddon>
                    <InputGroupInput
                        value={sidebarSearch}
                        onChange={(e) => setSidebarSearch(e.target.value)}
                        placeholder={t('remotesDetails.sidebarSearchPlaceholder')}
                        aria-label="Search remotes and disks"
                    />
                    {sidebarSearch && (
                        <InputGroupAddon align="inline-end">
                            <InputGroupButton
                                size="icon-xs"
                                onClick={() => setSidebarSearch('')}
                                aria-label="Clear search"
                            >
                                <XIcon />
                            </InputGroupButton>
                        </InputGroupAddon>
                    )}
                </InputGroup>

                <nav
                    className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3"
                    onClick={() => setIsMobileSidebarOpen(false)}
                >
                    {filteredDisks.length > 0 && (
                        <div>
                            <h2 className="px-1 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                {t('remotesDetails.sidebarLocal')}
                            </h2>
                            <div className="space-y-1">
                                {filteredDisks.map((disk) => {
                                    const { icon: DiskIcon, className: iconColor } =
                                        getDiskIcon(disk)
                                    return (
                                        <NavLink
                                            key={disk}
                                            to={buildLocalPathHref(disk, '')}
                                            className={() =>
                                                cn(
                                                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                                    isLocalMode && diskPath === disk
                                                        ? 'bg-muted text-foreground'
                                                        : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                                                )
                                            }
                                        >
                                            <DiskIcon
                                                className={cn('size-4 shrink-0', iconColor)}
                                            />
                                            <span className="truncate" title={disk}>
                                                {getDiskLabel(disk)}
                                            </span>
                                        </NavLink>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {(remotesListQuery.isPending ||
                        remotesListQuery.isError ||
                        sortedRemotes.length === 0 ||
                        filteredRemotes.length > 0) && (
                        <div>
                            <h2 className="px-1 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                {t('remotesDetails.sidebarRemotes')}
                            </h2>
                            <div className="space-y-1">
                                {remotesListQuery.isPending ? (
                                    <div className="flex justify-center py-6">
                                        <Spinner className="size-5" />
                                    </div>
                                ) : remotesListQuery.isError ? (
                                    <p className="px-3 py-2 text-sm text-destructive">
                                        {t('remotesDetails.failedToLoadRemotes')}
                                    </p>
                                ) : sortedRemotes.length === 0 ? (
                                    <p className="px-3 py-2 text-sm text-muted-foreground">
                                        {t('remotesDetails.noRemotes')}
                                    </p>
                                ) : (
                                    filteredRemotes.map((name) => (
                                        <NavLink
                                            key={name}
                                            to={buildRemotePathHref(name, '')}
                                            className={({ isActive }) =>
                                                cn(
                                                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                                    isActive && !isLocalMode
                                                        ? 'bg-muted text-foreground'
                                                        : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                                                )
                                            }
                                        >
                                            <CloudIcon className="size-4 shrink-0" />
                                            <span className="truncate">{name}</span>
                                        </NavLink>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </nav>

                <div className="hidden border-t p-4 md:block">
                    {transferSource ? (
                        <TransferPanel
                            source={transferSource}
                            isPending={transferMutation.isPending}
                            onCancel={handleCancelTransfer}
                            onExecute={handleTransferExecute}
                        />
                    ) : hasStorageTarget ? (
                        <Card size="sm" className="gap-3">
                            <CardHeader className="pb-0">
                                <div className="flex items-center justify-between gap-3">
                                    <CardTitle className="text-sm">
                                        {t('remotesDetails.storageTitle')}
                                    </CardTitle>
                                    {usage?.percentLabel ? (
                                        <span className="text-xs text-muted-foreground">
                                            {usage.percentLabel}
                                        </span>
                                    ) : null}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <StorageUsageBody
                                    usage={usage}
                                    isPending={usageQuery.isPending}
                                    fallbackText={t('remotesDetails.storageUnavailable')}
                                />
                            </CardContent>
                        </Card>
                    ) : (
                        <Card size="sm">
                            <CardContent>
                                <p className="text-xs text-muted-foreground">
                                    {t('remotesDetails.selectRemoteStorage')}
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
                <button
                    type="button"
                    aria-label="Toggle sidebar width"
                    className="absolute top-0 right-0 hidden h-full w-1.5 cursor-pointer border-0 bg-transparent transition-colors hover:bg-ring/50 md:block"
                    onClick={() => setSidebarCompact((prev) => !prev)}
                />
            </aside>

            <div
                className={cn(
                    'flex min-h-0 flex-1 flex-col overflow-y-auto',
                    transferSource && 'pb-48 md:pb-0'
                )}
            >
                {remoteNotFound ? (
                    <div className="border-b px-3 py-4 sm:px-6">
                        <p className="text-2xl font-semibold tracking-tight">
                            {t('remotesDetails.notFoundTitle')}
                        </p>
                        <p className="text-muted-foreground">
                            {t('remotesDetails.notFoundDescription', { name: remoteName })}
                        </p>
                    </div>
                ) : canBrowse ? (
                    <div className="sticky top-0 z-10 space-y-3 border-b bg-background px-3 py-3 sm:px-6 sm:py-4">
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                className="shrink-0 md:hidden"
                                aria-label={t('remotesDetails.sidebarLocal')}
                                aria-expanded={isMobileSidebarOpen}
                                onClick={() => setIsMobileSidebarOpen(true)}
                            >
                                <PanelLeftIcon className="size-4" />
                            </Button>
                            <Breadcrumb className="min-w-0 flex-1">
                                <BreadcrumbList>
                                    <BreadcrumbItem>
                                        <Link
                                            to={
                                                isLocalMode
                                                    ? buildLocalPathHref(diskPath, '')
                                                    : buildRemotePathHref(remoteName, '')
                                            }
                                            className="inline-flex items-center transition-colors hover:text-foreground"
                                        >
                                            <HouseIcon className="size-3.5" />
                                        </Link>
                                    </BreadcrumbItem>

                                    {breadcrumbItems.map((item, index) => (
                                        <Fragment key={item.path}>
                                            <BreadcrumbSeparator />
                                            <BreadcrumbItem>
                                                {index === breadcrumbItems.length - 1 ? (
                                                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
                                                ) : (
                                                    <Link
                                                        to={
                                                            isLocalMode
                                                                ? buildLocalPathHref(
                                                                      diskPath,
                                                                      item.path
                                                                  )
                                                                : buildRemotePathHref(
                                                                      remoteName,
                                                                      item.path
                                                                  )
                                                        }
                                                        className="transition-colors hover:text-foreground"
                                                    >
                                                        {item.label}
                                                    </Link>
                                                )}
                                            </BreadcrumbItem>
                                        </Fragment>
                                    ))}
                                </BreadcrumbList>
                            </Breadcrumb>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <InputGroup className="min-w-0 flex-1 basis-48">
                                <InputGroupAddon align="inline-start">
                                    <SearchIcon />
                                </InputGroupAddon>
                                <InputGroupInput
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    placeholder={t('remotesDetails.searchPlaceholder')}
                                    aria-label="Search files and folders"
                                />
                            </InputGroup>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    onClick={handleNewFolder}
                                    disabled={mkdirMutation.isPending}
                                >
                                    <FolderPlusIcon />
                                    {mkdirMutation.isPending
                                        ? t('remotesDetails.newFolderCreating')
                                        : t('remotesDetails.newFolder')}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleUpload}
                                    disabled={uploadMutation.isPending || !!transferSource}
                                >
                                    <UploadIcon />
                                    {uploadMutation.isPending
                                        ? t('remotesDetails.uploading')
                                        : t('remotesDetails.upload')}
                                </Button>

                                <RefreshButton
                                    isFetching={listQuery.isFetching}
                                    refetch={listQuery.refetch}
                                />
                            </div>
                            {hasStorageTarget ? (
                                <Popover>
                                    <PopoverTrigger
                                        render={
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="ml-auto shrink-0 md:hidden"
                                                aria-label={t('remotesDetails.storageTitle')}
                                            >
                                                <HardDriveIcon />
                                                {usage?.percentLabel ? (
                                                    <span className="tabular-nums">
                                                        {usage.percentLabel}
                                                    </span>
                                                ) : null}
                                            </Button>
                                        }
                                    />
                                    <PopoverContent align="end" className="w-64">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="font-medium">
                                                {t('remotesDetails.storageTitle')}
                                            </span>
                                            {usage?.percentLabel ? (
                                                <span className="text-xs text-muted-foreground">
                                                    {usage.percentLabel}
                                                </span>
                                            ) : null}
                                        </div>
                                        <div className="space-y-2">
                                            <StorageUsageBody
                                                usage={usage}
                                                isPending={usageQuery.isPending}
                                                fallbackText={t(
                                                    'remotesDetails.storageUnavailable'
                                                )}
                                            />
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            ) : null}
                        </div>
                    </div>
                ) : null}

                <PageContent>
                    {remoteNotFound ? (
                        <Empty className="mt-6 rounded-xl border">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <HardDriveIcon />
                                </EmptyMedia>
                                <EmptyTitle>{t('remotesDetails.notFoundEmptyTitle')}</EmptyTitle>
                                <EmptyDescription>
                                    {t('remotesDetails.notFoundEmptyDescription', {
                                        name: remoteName,
                                    })}
                                </EmptyDescription>
                            </EmptyHeader>
                            <EmptyContent>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => navigate('/remotes')}
                                >
                                    {t('remotesDetails.goToRemotes')}
                                </Button>
                            </EmptyContent>
                        </Empty>
                    ) : listQuery.isPending ? (
                        <div className="flex items-center justify-center py-14">
                            <Spinner className="size-8" />
                        </div>
                    ) : listQuery.isError ? (
                        <div className="mt-6">
                            <Alert variant="destructive">
                                <AlertTitle>{t('remotesDetails.listError')}</AlertTitle>
                                <AlertDescription>
                                    {listQuery.error instanceof Error
                                        ? listQuery.error.message
                                        : t('common.unknownError')}
                                </AlertDescription>
                                <AlertAction>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="xs"
                                        onClick={() => listQuery.refetch()}
                                    >
                                        {t('common.retry')}
                                    </Button>
                                </AlertAction>
                            </Alert>
                        </div>
                    ) : (
                        <div className="mt-4 sm:mt-6">
                            <div className="overflow-hidden rounded-xl border">
                                <Table className="table-fixed">
                                    <TableHeader className="bg-muted/40">
                                        <TableRow className="hover:bg-muted/40">
                                            <TableHead className="px-2 font-semibold text-muted-foreground uppercase">
                                                {t('remotesDetails.name')}
                                            </TableHead>
                                            <TableHead className="w-14 px-2 font-semibold text-muted-foreground uppercase sm:w-20 sm:px-4">
                                                {t('remotesDetails.size')}
                                            </TableHead>
                                            <TableHead className="hidden w-36 px-4 font-semibold text-muted-foreground uppercase sm:table-cell">
                                                {t('remotesDetails.modified')}
                                            </TableHead>
                                            <TableHead className="w-12 px-2 text-right font-semibold text-muted-foreground uppercase sm:w-36 sm:px-4">
                                                <span className="hidden sm:inline">
                                                    {t('common.actions')}
                                                </span>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>

                                    <TableBody key={JSON.stringify([currentFs, currentPath])}>
                                        {filteredItems.length === 0 ? (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={4}
                                                    className="px-4 py-10 text-center"
                                                >
                                                    <div className="space-y-1">
                                                        <p className="text-sm font-medium">
                                                            {searchTerm
                                                                ? t('remotesDetails.noItemsMatch')
                                                                : t('remotesDetails.emptyFolder')}
                                                        </p>
                                                        <p className="text-sm text-muted-foreground">
                                                            {searchTerm
                                                                ? t(
                                                                      'remotesDetails.noItemsMatchHint'
                                                                  )
                                                                : t(
                                                                      'remotesDetails.emptyFolderHint'
                                                                  )}
                                                        </p>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredItems.map((item, index) => {
                                                const fileTypeUi = getFileTypeIcon(item.Name)
                                                const FileTypeIcon = fileTypeUi.icon

                                                return (
                                                    <TableRow
                                                        key={
                                                            item.rowKey ||
                                                            JSON.stringify([
                                                                currentFs,
                                                                currentPath,
                                                                item.Path,
                                                                item.Name,
                                                                item.ModTime,
                                                                item.Size,
                                                                item.IsDir,
                                                                index,
                                                            ])
                                                        }
                                                        className="group/row hover:bg-muted/20"
                                                    >
                                                        <TableCell className="px-2 py-3 overflow-hidden">
                                                            {item.IsDir ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        openFolder(item.Name)
                                                                    }
                                                                    className="flex max-w-full items-center gap-3 rounded-md px-1 py-1 pr-2.5 -translate-x-1 text-left transition-colors hover:bg-muted"
                                                                >
                                                                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-600 sm:size-10">
                                                                        <FolderIcon />
                                                                    </span>
                                                                    <span className="flex min-w-0 flex-col">
                                                                        <span className="truncate font-medium">
                                                                            {item.Name}
                                                                        </span>
                                                                        <span className="truncate text-xs text-muted-foreground sm:hidden">
                                                                            {formatModTime(
                                                                                item.ModTime
                                                                            )}
                                                                        </span>
                                                                    </span>
                                                                </button>
                                                            ) : (
                                                                <div className="flex max-w-full items-center gap-3">
                                                                    <span
                                                                        className={cn(
                                                                            'inline-flex size-8 shrink-0 items-center justify-center rounded-md sm:size-10',
                                                                            fileTypeUi.className
                                                                        )}
                                                                    >
                                                                        <FileTypeIcon />
                                                                    </span>
                                                                    <span className="flex min-w-0 flex-col">
                                                                        <span className="truncate font-medium">
                                                                            {item.Name}
                                                                        </span>
                                                                        <span className="truncate text-xs text-muted-foreground sm:hidden">
                                                                            {formatModTime(
                                                                                item.ModTime
                                                                            )}
                                                                        </span>
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </TableCell>

                                                        <TableCell className="px-2 py-3 font-medium text-muted-foreground sm:px-4">
                                                            {item.IsDir
                                                                ? '--'
                                                                : formatBytes(item.Size)}
                                                        </TableCell>
                                                        <TableCell className="hidden px-4 py-3 sm:table-cell">
                                                            <ModTimeCell modTime={item.ModTime} />
                                                        </TableCell>

                                                        <TableCell className="px-2 py-3 sm:px-4">
                                                            <div className="flex justify-end sm:hidden">
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger
                                                                        render={
                                                                            <Button
                                                                                type="button"
                                                                                variant="ghost"
                                                                                size="icon-sm"
                                                                                aria-label={t(
                                                                                    'common.actions'
                                                                                )}
                                                                            >
                                                                                <EllipsisVerticalIcon className="size-4" />
                                                                            </Button>
                                                                        }
                                                                    />
                                                                    <DropdownMenuContent
                                                                        align="end"
                                                                        className="w-44"
                                                                    >
                                                                        <DropdownMenuItem
                                                                            disabled={isMutating}
                                                                            onClick={() =>
                                                                                handleTransfer(
                                                                                    item
                                                                                )
                                                                            }
                                                                        >
                                                                            <SendIcon className="size-4" />
                                                                            {t(
                                                                                'remotesDetails.transfer'
                                                                            )}
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem
                                                                            disabled={
                                                                                isMutating ||
                                                                                !!transferSource
                                                                            }
                                                                            onClick={() =>
                                                                                handleDownload(
                                                                                    item
                                                                                )
                                                                            }
                                                                        >
                                                                            <DownloadIcon className="size-4" />
                                                                            {item.IsDir
                                                                                ? t(
                                                                                      'remotesDetails.downloadZip'
                                                                                  )
                                                                                : t(
                                                                                      'remotesDetails.download'
                                                                                  )}
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuItem
                                                                            disabled={
                                                                                isMutating ||
                                                                                !!transferSource
                                                                            }
                                                                            onClick={() =>
                                                                                handleRename(
                                                                                    item
                                                                                )
                                                                            }
                                                                        >
                                                                            <PencilIcon className="size-4" />
                                                                            {t(
                                                                                'remotesDetails.rename'
                                                                            )}
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuSeparator />
                                                                        <DropdownMenuItem
                                                                            variant="destructive"
                                                                            disabled={
                                                                                isMutating ||
                                                                                !!transferSource
                                                                            }
                                                                            onClick={() =>
                                                                                handleDelete(
                                                                                    item
                                                                                )
                                                                            }
                                                                        >
                                                                            <TrashIcon className="size-4" />
                                                                            {t('common.delete')}
                                                                        </DropdownMenuItem>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                            </div>
                                                            <div className="hidden justify-end gap-1 sm:flex sm:opacity-0 sm:transition-opacity sm:group-hover/row:opacity-100 sm:group-focus-within/row:opacity-100">
                                                                <div className="hidden sm:block">
                                                                    <Tooltip>
                                                                        <TooltipTrigger
                                                                            render={
                                                                                <Button
                                                                                    type="button"
                                                                                    variant="ghost"
                                                                                    size="icon-xs"
                                                                                    aria-label={`Transfer ${item.Name}`}
                                                                                    disabled={
                                                                                        isMutating
                                                                                    }
                                                                                    onClick={() =>
                                                                                        handleTransfer(
                                                                                            item
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    <SendIcon className="size-3.5" />
                                                                                </Button>
                                                                            }
                                                                        />
                                                                        <TooltipContent>
                                                                            {t(
                                                                                'remotesDetails.transfer'
                                                                            )}
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                </div>
                                                                <Tooltip>
                                                                    <TooltipTrigger
                                                                        render={
                                                                            <Button
                                                                                type="button"
                                                                                variant="ghost"
                                                                                size="icon-xs"
                                                                                aria-label={`Download ${item.Name}`}
                                                                                disabled={
                                                                                    isMutating ||
                                                                                    !!transferSource
                                                                                }
                                                                                onClick={() =>
                                                                                    handleDownload(
                                                                                        item
                                                                                    )
                                                                                }
                                                                            >
                                                                                <DownloadIcon className="size-3.5" />
                                                                            </Button>
                                                                        }
                                                                    />
                                                                    <TooltipContent>
                                                                        {item.IsDir
                                                                            ? t(
                                                                                  'remotesDetails.downloadZip'
                                                                              )
                                                                            : t(
                                                                                  'remotesDetails.download'
                                                                              )}
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                                <Tooltip>
                                                                    <TooltipTrigger
                                                                        render={
                                                                            <Button
                                                                                type="button"
                                                                                variant="ghost"
                                                                                size="icon-xs"
                                                                                aria-label={`Rename ${item.Name}`}
                                                                                disabled={
                                                                                    isMutating ||
                                                                                    !!transferSource
                                                                                }
                                                                                onClick={() =>
                                                                                    handleRename(
                                                                                        item
                                                                                    )
                                                                                }
                                                                            >
                                                                                <PencilIcon className="size-3.5" />
                                                                            </Button>
                                                                        }
                                                                    />
                                                                    <TooltipContent>
                                                                        {t('remotesDetails.rename')}
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                                <Tooltip>
                                                                    <TooltipTrigger
                                                                        render={
                                                                            <Button
                                                                                type="button"
                                                                                variant="ghost"
                                                                                size="icon-xs"
                                                                                aria-label={`Delete ${item.Name}`}
                                                                                disabled={
                                                                                    isMutating ||
                                                                                    !!transferSource
                                                                                }
                                                                                onClick={() =>
                                                                                    handleDelete(
                                                                                        item
                                                                                    )
                                                                                }
                                                                            >
                                                                                <TrashIcon className="size-3.5" />
                                                                            </Button>
                                                                        }
                                                                    />
                                                                    <TooltipContent>
                                                                        {t('common.delete')}
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}
                </PageContent>

                {transferSource ? (
                    <div className="h-32 shrink-0 md:hidden" aria-hidden="true" />
                ) : null}
            </div>
        </section>
    )
}
