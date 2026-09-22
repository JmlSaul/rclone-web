import { cn } from '@/lib/ui'

export function PageHeader({
    title,
    description,
    actions,
    className,
    ...props
}: React.ComponentProps<'section'> & {
    title: string
    description?: string
    actions?: React.ReactNode
}) {
    return (
        <section
            className={cn(
                'flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4 sm:px-6',
                className
            )}
            {...props}
        >
            <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
                {description ? <p className="text-muted-foreground">{description}</p> : null}
            </div>
            {actions ? (
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end sm:gap-4">
                    {actions}
                </div>
            ) : null}
        </section>
    )
}
