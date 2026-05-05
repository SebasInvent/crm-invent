import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Plain HTML <label> styled to match shadcn Label without bringing in
 * @radix-ui/react-label as a dependency. Functionally equivalent for
 * standard form-label usage.
 */
const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className,
    )}
    {...props}
  />
))
Label.displayName = 'Label'

export { Label }
