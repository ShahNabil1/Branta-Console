import { DayPicker } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Calendar({ className, ...props }: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      {...props}
      className={cn("p-3 pointer-events-auto", className)}
      classNames={{
        months: "relative",
        month: "space-y-3",
        month_caption: "flex h-8 items-center justify-center font-semibold text-sm",
        nav: "absolute inset-x-0 top-0 flex justify-between",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-xs text-muted-foreground text-center",
        week: "flex mt-1",
        day: "size-9 text-center text-sm",
        day_button:
          "size-9 rounded-sm hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring",
        selected: "bg-primary text-primary-foreground rounded-sm",
        today: "font-bold",
        outside: "text-muted-foreground opacity-40",
        disabled: "opacity-30",
        hidden: "invisible",
      }}
      components={{
        PreviousMonthButton: ({ children, ...p }) => (
          <Button {...p} variant="ghost" size="icon" className="size-8">
            {children}
          </Button>
        ),
        NextMonthButton: ({ children, ...p }) => (
          <Button {...p} variant="ghost" size="icon" className="size-8">
            {children}
          </Button>
        ),
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          ),
      }}
    />
  );
}
