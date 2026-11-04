import { AdminButton } from '../components/AdminButton'
import { EmptyState } from '../components/states'
import { PageHeader } from '../components/layout'
import { useText } from '../i18n'

export function NotFoundPage() {
  const t = useText()
  return (
    <>
      <PageHeader title={t.notFound.title} />
      <EmptyState icon="alert" action={<AdminButton to="/" variant="primary">{t.notFound.back}</AdminButton>}>
        {t.notFound.body}
      </EmptyState>
    </>
  )
}
