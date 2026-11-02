import type { SVGProps } from 'react'

/** The shop's few icons: 20px line drawings that take the colour of the text around them. */

function Icon({ children, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="1.25em" height="1.25em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  )
}

export const CartIcon = () => (
  <Icon>
    <path d="M2.5 3.5h2.2l1.6 8.4h8.3l1.4-6H5.4" />
    <circle cx="7.6" cy="16" r="1.2" />
    <circle cx="14.2" cy="16" r="1.2" />
  </Icon>
)

export const SearchIcon = () => (
  <Icon>
    <circle cx="8.8" cy="8.8" r="5.3" />
    <path d="M13 13l4 4" />
  </Icon>
)

export const CheckIcon = () => (
  <Icon strokeWidth="2.25">
    <path d="M4.5 10.5l3.6 3.6 7.4-8.2" />
  </Icon>
)

export const ChevronIcon = () => (
  <Icon>
    <path d="M5 7.5l5 5 5-5" />
  </Icon>
)

export const CloseIcon = () => (
  <Icon>
    <path d="M5 5l10 10M15 5L5 15" />
  </Icon>
)

export const TrashIcon = () => (
  <Icon>
    <path d="M3.5 5.5h13M8 5.5V3.8h4v1.7M5.5 5.5l.8 10.7h7.4l.8-10.7M8.5 9v4.5M11.5 9v4.5" />
  </Icon>
)

export const ArrowLeftIcon = () => (
  <Icon>
    <path d="M16 10H4m0 0l4.5-4.5M4 10l4.5 4.5" />
  </Icon>
)

/** One geometric mark per package, drawn in the package's own colour: a rising arrow, rising bars, blocks, a ring. */
export function PackageGlyph({ id }: { id: 'launch' | 'grow' | 'build' | 'care' }) {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {id === 'launch' && <path d="M12 36L36 12M20 12h16v16M10 44l6-8" />}
      {id === 'grow' && <path d="M8 40h32M13 40V30M24 40V20M35 40V9" />}
      {id === 'build' && (
        <>
          <rect x="8" y="8" width="14" height="14" rx="2" />
          <rect x="26" y="8" width="14" height="14" rx="2" />
          <rect x="8" y="26" width="14" height="14" rx="2" />
          <rect x="29" y="29" width="14" height="14" rx="2" />
        </>
      )}
      {id === 'care' && (
        <>
          <circle cx="24" cy="24" r="15" />
          <path d="M16.5 24.5l5 5 10-11" />
        </>
      )}
    </svg>
  )
}
