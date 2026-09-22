import { RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/ui'

interface RefreshButtonProps {
    isFetching: boolean
    refetch: () => void
}

export function RefreshButton({ isFetching, refetch }: RefreshButtonProps) {
    const t = useT()

    return (
        <Button
            size="lg"
            type="button"
            variant="outline"
            disabled={isFetching}
            onClick={refetch}
            aria-label={t('common.refresh')}
        >
            <RefreshCwIcon className={cn(isFetching && 'animate-spin')} />
            {t('common.refresh')}
        </Button>
    )
}
