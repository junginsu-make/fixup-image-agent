// CSS: import "@fixup/ui/src/styles/globals.css" in your app's root CSS/layout

// Utility
export { cn } from "./lib/utils";

// UI Components
export { Button, buttonVariants } from "./components/ui/button";
export type { ButtonProps } from "./components/ui/button";
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "./components/ui/card";
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";
export { Input } from "./components/ui/input";
export type { InputProps } from "./components/ui/input";
export { Textarea } from "./components/ui/textarea";
export type { TextareaProps } from "./components/ui/textarea";
export { Badge, badgeVariants } from "./components/ui/badge";
export type { BadgeProps } from "./components/ui/badge";
export { Label } from "./components/ui/label";
export { Separator } from "./components/ui/separator";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from "./components/ui/dropdown-menu";
export { Skeleton } from "./components/ui/skeleton";

// Theme
export { ThemeProvider } from "./components/theme-provider";
export { ThemeToggle } from "./components/theme-toggle";

// Toaster
export { Toaster, toast } from "./components/toaster";

// App Shell
export { AppShell } from "./components/app-shell";
export { BrandMark } from "./components/brand-mark";
export { ImageLightbox, type LightboxImage } from "./components/image-lightbox";
