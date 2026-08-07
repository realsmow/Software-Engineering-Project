import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Alert (shadcn/ui pattern), bridged to ULMs tokens. */
const alertVariants = cva(
  "relative flex w-full items-start gap-2.5 rounded-md border px-3.5 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-foreground",
        success: "border-[var(--s-ok-b)] bg-[var(--s-ok-bg)] text-[var(--s-ok-t)]",
        warning: "border-[var(--s-warn-b)] bg-[var(--s-warn-bg)] text-[var(--s-warn-t)]",
        destructive: "border-[var(--s-alert-b)] bg-[var(--s-alert-bg)] text-[var(--s-alert-t)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface AlertProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = "Alert";

export const AlertTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5 ref={ref} className={cn("font-medium leading-none tracking-tight", className)} {...props} />
  ),
);
AlertTitle.displayName = "AlertTitle";

export const AlertDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm opacity-90 [&_p]:leading-relaxed", className)} {...props} />
  ),
);
AlertDescription.displayName = "AlertDescription";

export default Alert;
