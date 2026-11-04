import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** One toast lap = its lifetime: the brand line circles once, then the toast leaves. Keep in sync with --toast-life in styles.css. */
export const TOAST_DURATION = 4500;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group branta-toaster"
      position="top-center"
      duration={TOAST_DURATION}
      closeButton
      gap={10}
      offset={16}
      toastOptions={{
        classNames: {
          toast:
            "group toast branta-toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-0 group-[.toaster]:shadow-xl group-[.toaster]:rounded-xl group-[.toaster]:font-semibold group-[.toaster]:text-[13px] group-[.toaster]:pr-11",
          title: "font-bold",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:font-medium",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton: "branta-toast-close",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
