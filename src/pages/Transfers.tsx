import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleDotIcon, PlusIcon, TrashIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PageContent } from '@/components/PageContent'
import { PageHeader } from '@/components/PageHeader'
import { PageWrapper } from '@/components/PageWrapper'
import { RefreshButton } from '@/components/RefreshButton'
import { TransfersTable } from '@/components/TransfersTable'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { useT } from '@/lib/i18n'
import { deleteJobStatsGroup, fetchJobsSnapshot, stopJob } from '@/rclone/jobs'
import { fetchRemotesList } from '@/rclone/usage'

type ClearKind = 'failed' | 'completed'

export function TransfersPage() {
    const t = useT()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [clearDialog, setClearDialog] = useState<ClearKind | null>(null)

    const jobsQuery = useQuery({
        queryKey: ['jobs'],
        queryFn: fetchJobsSnapshot,
        refetchInterval: 1500,
    })

    const remotesListQuery = useQuery({
        queryKey: ['remotes', 'list'],
        queryFn: fetchRemotesList,
    })

    const firstRemote = remotesListQuery.data?.[0]

    const stopMutation = useMutation({
        mutationFn: stopJob,
        onSuccess: () => {
            toast.success(t('transfers.stopSuccess'))
            queryClient.invalidateQueries({ queryKey: ['jobs'] })
        },
        onError: (error) => {
            const message = error instanceof Error ? error.message : t('common.unknownError')
            toast.error(t('transfers.stopError', { message }))
        },
    })

    const jobs = jobsQuery.data ?? []

    // 按任务分组统计：有进行中条目的分组不参与清除
    const jobGroups = useMemo(() => {
        const groups = new Map<number, { running: number; failed: number; completed: number }>()
        for (const job of jobs) {
            const group = groups.get(job.id) ?? { running: 0, failed: 0, completed: 0 }
            if (job.status === 'running') group.running += 1
            else if (job.status === 'failed') group.failed += 1
            else group.completed += 1
            groups.set(job.id, group)
        }
        return groups
    }, [jobs])

    const failedJobIds = useMemo(
        () =>
            [...jobGroups.entries()]
                .filter(([, group]) => group.failed > 0 && group.running === 0)
                .map(([jobid]) => jobid),
        [jobGroups]
    )

    const completedJobIds = useMemo(
        () =>
            [...jobGroups.entries()]
                .filter(
                    ([, group]) => group.completed > 0 && group.running === 0 && group.failed === 0
                )
                .map(([jobid]) => jobid),
        [jobGroups]
    )

    const clearMutation = useMutation({
        mutationFn: async ({ kind, jobIds }: { kind: ClearKind; jobIds: number[] }) => {
            const results = await Promise.allSettled(jobIds.map((jobid) => deleteJobStatsGroup(jobid)))
            const succeeded = results.filter((result) => result.status === 'fulfilled').length
            return { kind, succeeded, failed: results.length - succeeded }
        },
        onSuccess: ({ kind, succeeded, failed }) => {
            if (failed > 0) {
                toast.warning(
                    t('transfers.clearPartial', {
                        done: String(succeeded),
                        failed: String(failed),
                    })
                )
            } else {
                toast.success(
                    t(
                        kind === 'failed'
                            ? 'transfers.clearFailedDone'
                            : 'transfers.clearCompletedDone',
                        { count: String(succeeded) }
                    )
                )
            }
            queryClient.invalidateQueries({ queryKey: ['jobs'] })
        },
        onError: (error) => {
            const message = error instanceof Error ? error.message : t('common.unknownError')
            toast.error(t('transfers.clearError', { message }))
        },
    })

    const clearTargets = clearDialog === 'failed' ? failedJobIds : completedJobIds
    const isClearing = clearMutation.isPending

    return (
        <PageWrapper>
            <PageHeader
                title={t('transfers.title')}
                description={t('transfers.description')}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        {firstRemote ? (
                            <Button
                                size="lg"
                                type="button"
                                onClick={() => navigate(`/remotes/${firstRemote.name}`)}
                            >
                                <PlusIcon />
                                {t('transfers.newTransfer')}
                            </Button>
                        ) : null}

                        <Button
                            size="lg"
                            type="button"
                            variant="outline"
                            disabled={failedJobIds.length === 0 || isClearing}
                            onClick={() => setClearDialog('failed')}
                        >
                            <TrashIcon />
                            {t('transfers.clearFailed')}
                        </Button>

                        <Button
                            size="lg"
                            type="button"
                            variant="outline"
                            disabled={completedJobIds.length === 0 || isClearing}
                            onClick={() => setClearDialog('completed')}
                        >
                            <TrashIcon />
                            {t('transfers.clearCompleted')}
                        </Button>

                        <RefreshButton
                            isFetching={jobsQuery.isFetching}
                            refetch={jobsQuery.refetch}
                        />
                    </div>
                }
            />
            <PageContent>
                {jobsQuery.isPending ? (
                    <div className="flex items-center justify-center px-6 py-14">
                        <Spinner className="size-8" />
                    </div>
                ) : null}

                {jobsQuery.isError ? (
                    <Alert variant="destructive">
                        <AlertTitle>{t('transfers.loadError')}</AlertTitle>
                        <AlertDescription>
                            {jobsQuery.error instanceof Error
                                ? jobsQuery.error.message
                                : t('common.unknownError')}
                        </AlertDescription>
                        <AlertAction>
                            <Button
                                type="button"
                                variant="outline"
                                size="xs"
                                onClick={() => {
                                    jobsQuery.refetch()
                                }}
                            >
                                {t('common.retry')}
                            </Button>
                        </AlertAction>
                    </Alert>
                ) : null}

                {jobsQuery.isSuccess && jobs.length === 0 ? (
                    <Empty className="rounded-xl border">
                        <EmptyHeader>
                            <EmptyMedia variant="icon">
                                <CircleDotIcon />
                            </EmptyMedia>
                            <EmptyTitle>{t('transfers.emptyTitle')}</EmptyTitle>
                            <EmptyDescription>{t('transfers.emptyDescription')}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                ) : null}

                {jobs.length > 0 ? (
                    <TransfersTable
                        jobs={jobs}
                        onStop={(jobid) => stopMutation.mutate(jobid)}
                        isStopping={stopMutation.isPending}
                    />
                ) : null}
            </PageContent>

            <AlertDialog
                open={clearDialog !== null}
                onOpenChange={(open) => {
                    if (!open) setClearDialog(null)
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {clearDialog === 'failed'
                                ? t('transfers.clearFailedTitle')
                                : t('transfers.clearCompletedTitle')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {clearDialog === 'failed'
                                ? t('transfers.clearFailedDescription', {
                                      count: String(clearTargets.length),
                                  })
                                : t('transfers.clearCompletedDescription', {
                                      count: String(clearTargets.length),
                                  })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={isClearing}
                            onClick={() => {
                                if (!clearDialog) return
                                const kind = clearDialog
                                setClearDialog(null)
                                clearMutation.mutate({ kind, jobIds: clearTargets })
                            }}
                        >
                            {clearDialog === 'failed'
                                ? t('transfers.clearFailed')
                                : t('transfers.clearCompleted')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </PageWrapper>
    )
}
