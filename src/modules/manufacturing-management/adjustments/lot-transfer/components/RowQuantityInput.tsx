"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface RowQuantityInputProps {
  value: number;
  onChange: (val: number) => void;
  max?: number;
  min?: number;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export const RowQuantityInput: React.FC<RowQuantityInputProps> = ({
  value,
  onChange,
  max,
  min = 0.0001,
  disabled = false,
  className,
  placeholder = "0.00",
}) => {
  const [prevValue, setPrevValue] = useState(value);
  const [localText, setLocalText] = useState<string>(value > 0 ? String(value) : "");

  if (value !== prevValue) {
    setPrevValue(value);
    setLocalText(value > 0 ? String(value) : "");
  }

  const handleFocusOrClick = (e: React.FocusEvent<HTMLInputElement> | React.MouseEvent<HTMLInputElement>) => {
    e.currentTarget.select();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow empty string or valid decimal number during typing
    if (raw === "" || /^\d*\.?\d*$/.test(raw)) {
      setLocalText(raw);
      const parsed = parseFloat(raw);
      if (!isNaN(parsed) && parsed > 0) {
        onChange(parsed);
      }
    }
  };

  const handleBlur = () => {
    const parsed = parseFloat(localText);
    if (isNaN(parsed) || parsed < min) {
      const fallback = min;
      setLocalText(String(fallback));
      onChange(fallback);
    } else if (max !== undefined && parsed > max) {
      setLocalText(String(max));
      onChange(max);
    } else {
      setLocalText(String(parsed));
      onChange(parsed);
    }
  };

  const isExceeded = max !== undefined && parseFloat(localText) > max;

  return (
    <div className="relative flex items-center">
      <Input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={localText}
        onChange={handleChange}
        onFocus={handleFocusOrClick}
        onClick={handleFocusOrClick}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={cn(
          "h-8 text-right font-mono transition-colors",
          isExceeded && "border-destructive focus-visible:ring-destructive text-destructive font-semibold",
          disabled && "bg-muted cursor-not-allowed opacity-75",
          className
        )}
      />
    </div>
  );
};
