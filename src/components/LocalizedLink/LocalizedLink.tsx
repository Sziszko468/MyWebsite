import { Link, type LinkProps } from 'react-router'
import { localizedPath } from '../../i18n/paths'
import { useI18n } from '../../i18n/useI18n'

interface LocalizedLinkProps extends Omit<LinkProps, 'to'> {
  /** Language-free path, e.g. '/' or '/services'. */
  to: string
}

export function LocalizedLink({ to, ...rest }: LocalizedLinkProps) {
  const { lang } = useI18n()
  return <Link to={localizedPath(lang, to)} {...rest} />
}
