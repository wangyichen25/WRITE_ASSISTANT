"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const ScrollArea = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="scroll-area"
      className={cn("relative overflow-y-auto overflow-x-hidden", className)}
      {...props}
    >
      {children}
    </div>
  ),
);

ScrollArea.displayName = "ScrollArea";

export { ScrollArea };
