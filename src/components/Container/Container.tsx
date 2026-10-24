import type { ComponentPropsWithoutRef, ElementType } from 'react'
import { cx } from '../../utils/cx'
import styles from './Container.module.scss'

type ContainerProps<T extends ElementType> = {
  as?: T
  size?: 'default' | 'narrow' | 'wide'
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'size'>

export function Container<T extends ElementType = 'div'>({
  as,
  size = 'default',
  className,
  ...rest
}: ContainerProps<T>) {
  const Tag: ElementType = as ?? 'div'
  return <Tag className={cx(styles.container, styles[size], className)} {...rest} />
}
