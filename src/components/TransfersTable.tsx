import { CheckCircle2Icon, RefreshCwIcon, XCircleIcon } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Badge, badgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
import type { TranslationKey } from '@/lib/i18n'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/ui'
import type { JobRow } from '@/rclone/jobs'

function getTransferredLabel(job: JobRow) {
    if (job.totalBytes > 0) {
        return `${formatBytes(job.bytes)} / ${formatBytes(job.totalBytes)}`
    }

    return formatBytes(job.bytes)
}

const ellipsis = '…'
let measureContext: CanvasRenderingContext2D | null = null

function getMeasureContext() {
    measureContext ??= document.createElement('canvas').getContext('2d')
    return measureContext
}

// Shortens a path in the middle so it fits the cell, keeping its beginning and filename.
function TransferLocationCell({ value }: { value: string }) {
    const ref = useRef<HTMLSpanElement>(null)
    const [label, setLabel] = useState(value)

    useLayoutEffect(() => {
        const element = ref.current
        const context = getMeasureContext()
        if (!element || !context) return

        const update = () => {
            context.font = getComputedStyle(element).font
            const width = element.clientWidth
            const measure = (text: string) => context.measureText(text).width
            if (measure(value) <= width) {
                setLabel(value)
                return
            }

            const characters = Array.from(value)
            const filename = value.slice(
                Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'), value.lastIndexOf(':')) +
                    1
            )
            // Keep the whole filename when it fits, otherwise its ending.
            const suffixBudget =
                measure(ellipsis + filename) <= width
                    ? width - measure(ellipsis)
                    : Math.max(0, width * 0.8 - measure(ellipsis))

            let low = 0
            let high = characters.length
            while (low < high) {
                const middle = Math.ceil((low + high) / 2)
                if (measure(characters.slice(-middle).join('')) <= suffixBudget) {
                    low = middle
                } else {
                    high = middle - 1
                }
            }
            const suffixLength = Math.min(low, Array.from(filename).length || low)
            const suffix = suffixLength ? characters.slice(-suffixLength).join('') : ''

            low = 0
            high = characters.length - suffixLength
            while (low < high) {
                const middle = Math.ceil((low + high) / 2)
                if (measure(characters.slice(0, middle).join('') + ellipsis + suffix) <= width) {
                    low = middle
                } else {
                    high = middle - 1
                }
            }
            setLabel(characters.slice(0, low).join('') + ellipsis + suffix)
        }

        update()
        const observer = new ResizeObserver(update)
        observer.observe(element)
        return () => observer.disconnect()
    }, [value])

    return (
        <span
            ref={ref}
            title={value}
            className="block w-full min-w-0 overflow-hidden leading-4 whitespace-nowrap"
        >
            <span aria-hidden="true">{label || '—'}</span>
            <span className="sr-only">{value || '—'}</span>
        </span>
    )
}

const statusUi: Record<
    JobRow['status'],
    {
        label: TranslationKey
        icon: typeof RefreshCwIcon
        badgeClassName: string
        progressClassName: string
    }
> = {
    running: {
        label: 'transfersTable.running',
        icon: RefreshCwIcon,
        badgeClassName: 'bg-emerald-500/15 text-emerald-500',
        progressClassName: 'bg-emerald-500',
    },
    completed: {
        label: 'transfersTable.completed',
        icon: CheckCircle2Icon,
        badgeClassName: 'bg-sky-500/15 text-sky-500',
        progressClassName: 'bg-sky-500',
    },
    failed: {
        label: 'transfersTable.failed',
        icon: XCircleIcon,
        badgeClassName: 'bg-destructive/15 text-destructive',
        progressClassName: 'bg-destructive',
    },
}

const columnWidths = {
    id: 'w-[64px]',
    status: 'w-[112px]',
    source: 'w-[240px]',
    destination: 'w-[240px]',
    progress: 'w-[220px]',
    speed: 'w-[100px]',
    eta: 'w-[100px]',
    actions: 'w-[80px]',
} as const

function StatusBadge({ job }: { job: JobRow }) {
    const t = useT()
    const ui = statusUi[job.status]
    const StatusIcon = ui.icon
    const renderBadge = (className?: string) => (
        <Badge
            className={cn('h-7 gap-1.5 px-2.5 text-xs tracking-wide', ui.badgeClassName, className)}
            variant="secondary"
        >
            <StatusIcon className={cn('size-3.5', job.status === 'running' && 'animate-spin')} />
            {t(ui.label)}
        </Badge>
    )

    if (job.status === 'failed' && job.errorText) {
        return (
            <>
                {/* 桌面端：悬停查看错误原因 */}
                <Tooltip>
                    <TooltipTrigger render={renderBadge('hidden lg:inline-flex')} />
                    <TooltipContent
                        side="bottom"
                        align="start"
                        className="max-w-sm p-3 text-left text-sm leading-5 whitespace-pre-wrap break-words"
                    >
                        {job.errorText}
                    </TooltipContent>
                </Tooltip>

                {/* 移动端：轻点查看错误原因 */}
                <Popover>
                    <PopoverTrigger
                        aria-label={t('transfersTable.failureReason')}
                        className={cn(
                            badgeVariants({ variant: 'secondary' }),
                            'h-7 cursor-pointer gap-1.5 px-2.5 text-xs tracking-wide transition-opacity hover:opacity-80 lg:hidden',
                            ui.badgeClassName
                        )}
                    >
                        <StatusIcon className="size-3.5" />
                        {t(ui.label)}
                    </PopoverTrigger>
                    <PopoverContent
                        side="bottom"
                        align="start"
                        className="max-h-[70svh] w-[min(22rem,calc(100vw-1.5rem))] gap-2 overflow-y-auto overscroll-contain p-3"
                    >
                        <p className="text-xs font-medium tracking-wide text-destructive uppercase">
                            {t('transfersTable.failureReason')}
                        </p>
                        <p className="max-h-60 overflow-y-auto text-left text-sm leading-5 break-words whitespace-pre-wrap">
                            {job.errorText}
                        </p>
                    </PopoverContent>
                </Popover>
            </>
        )
    }

    return renderBadge()
}

function ProgressBar({ job }: { job: JobRow }) {
    const ui = statusUi[job.status]

    return (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
                className={cn('h-full rounded-full transition-all', ui.progressClassName)}
                style={{ width: `${job.progress}%` }}
            />
        </div>
    )
}

function TransferCard({
    job,
    onStop,
    isStopping,
}: {
    job: JobRow
    onStop: (jobid: number) => void
    isStopping: boolean
}) {
    const t = useT()

    return (
        <div className="rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm font-medium text-muted-foreground">
                    #{job.id}
                </span>
                <StatusBadge job={job} />
            </div>

            <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-4 text-sm tabular-nums">
                    <span className="font-medium">{job.progress}%</span>
                    <span className="text-muted-foreground">{getTransferredLabel(job)}</span>
                </div>
                <ProgressBar job={job} />
            </div>

            <dl className="mt-3 space-y-3 text-sm">
                <div className="space-y-1">
                    <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                        {t('transfersTable.source')}
                    </dt>
                    <dd className="break-all">{job.source || '—'}</dd>
                </div>
                <div className="space-y-1">
                    <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                        {t('transfersTable.destination')}
                    </dt>
                    <dd className="break-all">{job.destination || '—'}</dd>
                </div>
            </dl>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>
                        {t('transfersTable.speed')}:{' '}
                        <span className="font-medium tabular-nums text-foreground">
                            {job.speedLabel}
                        </span>
                    </span>
                    <span>
                        {t('transfersTable.eta')}:{' '}
                        <span className="font-medium tabular-nums text-foreground">
                            {job.etaLabel}
                        </span>
                    </span>
                </div>
                {job.canStop ? (
                    <Button
                        size="sm"
                        variant="destructive"
                        disabled={isStopping}
                        onClick={() => onStop(job.id)}
                    >
                        {t('common.stop')}
                    </Button>
                ) : null}
            </div>
        </div>
    )
}

export function TransfersTable({
    jobs,
    onStop,
    isStopping,
}: {
    jobs: JobRow[]
    onStop: (jobid: number) => void
    isStopping: boolean
}) {
    const t = useT()
    return (
        <>
            {/* 移动端：卡片视图 */}
            <div className="space-y-3 lg:hidden">
                {jobs.map((job) => (
                    <TransferCard
                        key={job.rowKey}
                        job={job}
                        onStop={onStop}
                        isStopping={isStopping}
                    />
                ))}
            </div>

            {/* 桌面端：紧凑表格（官方最新样式） */}
            <div className="hidden overflow-hidden rounded-xl border lg:block">
                <Table className="min-w-[1156px] table-fixed text-xs">
                    <TableHeader className="bg-muted/40">
                        <TableRow className="hover:bg-muted/40">
                            <TableHead
                                className={cn(
                                    columnWidths.id,
                                    'h-9 px-2 text-left font-semibold text-muted-foreground'
                                )}
                            >
                                {t('transfersTable.group')}
                            </TableHead>
                            <TableHead
                                className={cn(
                                    columnWidths.status,
                                    'h-9 px-2 text-left font-semibold text-muted-foreground'
                                )}
                            >
                                {t('transfersTable.status')}
                            </TableHead>
                            <TableHead
                                className={cn(
                                    columnWidths.source,
                                    'h-9 px-2 text-left font-semibold text-muted-foreground'
                                )}
                            >
                                {t('transfersTable.source')}
                            </TableHead>
                            <TableHead
                                className={cn(
                                    columnWidths.destination,
                                    'h-9 px-2 text-left font-semibold text-muted-foreground'
                                )}
                            >
                                {t('transfersTable.destination')}
                            </TableHead>
                            <TableHead
                                className={cn(
                                    columnWidths.progress,
                                    'h-9 px-2 text-left font-semibold text-muted-foreground'
                                )}
                            >
                                {t('transfersTable.progress')}
                            </TableHead>
                            <TableHead
                                className={cn(
                                    columnWidths.speed,
                                    'h-9 px-2 text-left font-semibold text-muted-foreground'
                                )}
                            >
                                {t('transfersTable.speed')}
                            </TableHead>
                            <TableHead
                                className={cn(
                                    columnWidths.eta,
                                    'h-9 px-2 text-left font-semibold text-muted-foreground'
                                )}
                            >
                                {t('transfersTable.eta')}
                            </TableHead>
                            <TableHead
                                className={cn(
                                    columnWidths.actions,
                                    'h-9 px-2 text-left font-semibold text-muted-foreground'
                                )}
                            >
                                {t('transfersTable.actions')}
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {jobs.map((job) => {
                            const ui = statusUi[job.status]
                            return (
                                <TableRow key={job.rowKey} className="hover:bg-muted/20">
                                    <TableCell
                                        className={cn(
                                            columnWidths.id,
                                            'px-2 py-1.5 text-left font-mono font-medium text-muted-foreground tabular-nums align-middle'
                                        )}
                                    >
                                        #{job.id}
                                    </TableCell>

                                    <TableCell
                                        className={cn(
                                            columnWidths.status,
                                            'px-2 py-1.5 text-left align-middle'
                                        )}
                                    >
                                        <div className="flex justify-start">
                                            <StatusBadge job={job} />
                                        </div>
                                    </TableCell>

                                    <TableCell
                                        className={cn(
                                            columnWidths.source,
                                            'px-2 py-1.5 text-left align-middle'
                                        )}
                                    >
                                        <TransferLocationCell value={job.source} />
                                    </TableCell>

                                    <TableCell
                                        className={cn(
                                            columnWidths.destination,
                                            'px-2 py-1.5 text-left align-middle'
                                        )}
                                    >
                                        <TransferLocationCell value={job.destination} />
                                    </TableCell>

                                    <TableCell
                                        className={cn(
                                            columnWidths.progress,
                                            'px-2 py-1.5 text-left align-middle'
                                        )}
                                    >
                                        <div className="w-full max-w-[204px] space-y-1">
                                            <div className="flex items-center justify-between gap-2 tabular-nums">
                                                <span className="font-medium">{job.progress}%</span>
                                                <span className="text-muted-foreground">
                                                    {getTransferredLabel(job)}
                                                </span>
                                            </div>
                                            <div className="h-1 overflow-hidden rounded-full bg-muted">
                                                <div
                                                    className={cn(
                                                        'h-full rounded-full transition-all',
                                                        ui.progressClassName
                                                    )}
                                                    style={{ width: `${job.progress}%` }}
                                                />
                                            </div>
                                        </div>
                                    </TableCell>

                                    <TableCell
                                        className={cn(
                                            columnWidths.speed,
                                            'px-2 py-1.5 text-left font-medium tabular-nums align-middle'
                                        )}
                                    >
                                        {job.speedLabel}
                                    </TableCell>

                                    <TableCell
                                        className={cn(
                                            columnWidths.eta,
                                            'px-2 py-1.5 text-left font-medium tabular-nums align-middle'
                                        )}
                                    >
                                        {job.etaLabel}
                                    </TableCell>

                                    <TableCell
                                        className={cn(
                                            columnWidths.actions,
                                            'px-2 py-1.5 text-left align-middle'
                                        )}
                                    >
                                        {job.canStop ? (
                                            <div className="flex justify-start">
                                                <Button
                                                    size="xs"
                                                    variant="destructive"
                                                    disabled={isStopping}
                                                    onClick={() => onStop(job.id)}
                                                >
                                                    {t('common.stop')}
                                                </Button>
                                            </div>
                                        ) : null}
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </div>
        </>
    )
}
