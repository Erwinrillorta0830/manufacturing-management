"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Representative } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/types/representative.schema";
import { Mail, Phone, X } from "lucide-react";
import { formatPhoneNumber } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/utils/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface RepresentativeCardProps {
  representative: Representative;
  onRemove: (id: number) => Promise<boolean>;
}

export function RepresentativeCard({
  representative,
  onRemove,
}: RepresentativeCardProps) {
  const fullName = [representative.first_name, representative.last_name]
    .filter(Boolean)
    .join(" ");

  const initials =
    `${representative.first_name?.charAt(0) || ""}${representative.last_name?.charAt(0) || ""}`.toUpperCase();

  return (
    <TooltipProvider delayDuration={100}>
      <div className="relative inline-block group hover:z-30 transition-all">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative cursor-pointer transition-transform hover:-translate-y-1 active:scale-95">
              <Avatar className="h-12 w-12 border-2 border-white shadow-sm ring-1 ring-slate-100 group-hover:ring-blue-500 transition-all">
                <AvatarImage
                  src={`https://api.dicebear.com/7.x/initials/svg?seed=${fullName}`}
                />
                <AvatarFallback className="bg-slate-100 text-slate-600 font-bold text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </div>
          </TooltipTrigger>

          <TooltipContent side="top">
            <div className="space-y-2">
              <p>{fullName}</p>
              <div className="flex items-center gap-2 text-[12px]">
                <Mail className="h-3 w-3" />
                <span>{representative.email}</span>
              </div>
              <div className="flex items-center gap-2 text-[12px]">
                <Phone className="h-3 w-3" />
                <span>{formatPhoneNumber(representative.contact_number)}</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Delete Button - Floating X */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="absolute -top-1 -right-1 h-5 w-5 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:border-red-100 shadow-sm transition-all z-40">
              <X className="h-3 w-3" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Representative?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove <strong>{fullName}</strong>?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onRemove(representative.id!)}
                className="bg-red-500 hover:bg-red-600 rounded-xl"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

