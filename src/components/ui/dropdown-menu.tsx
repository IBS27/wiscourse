import * as React from "react";
import { DropdownMenu as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";

const DropdownMenu = Primitive.Root;
const DropdownMenuTrigger = Primitive.Trigger;
const DropdownMenuSub = Primitive.Sub;
const DropdownMenuSubTrigger = Primitive.SubTrigger;
const DropdownMenuRadioGroup = Primitive.RadioGroup;

const contentClass =
  "z-50 min-w-[232px] rounded-lg border border-line bg-raised p-1 text-[13px] text-ink shadow-menu outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";

function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        className={cn(contentClass, className)}
        {...props}
      />
    </Primitive.Portal>
  );
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.SubContent>) {
  return (
    <Primitive.Portal>
      <Primitive.SubContent
        sideOffset={4}
        className={cn(contentClass, "min-w-[160px]", className)}
        {...props}
      />
    </Primitive.Portal>
  );
}

const itemClass =
  "flex h-8 cursor-pointer items-center gap-[9px] rounded-md px-2 whitespace-nowrap outline-none select-none data-[highlighted]:bg-hover data-[disabled]:opacity-50 [&_svg]:size-[14px] [&_svg]:shrink-0 [&_svg]:text-ink-3";

function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item className={cn(itemClass, className)} {...props} />;
}

function DropdownMenuRadioItem({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.RadioItem>) {
  return <Primitive.RadioItem className={cn(itemClass, "data-[state=checked]:font-medium", className)} {...props} />;
}

function DropdownMenuSeparator(props: React.ComponentProps<typeof Primitive.Separator>) {
  return <Primitive.Separator className="my-1 h-px bg-line" {...props} />;
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  itemClass as dropdownItemClass,
};
