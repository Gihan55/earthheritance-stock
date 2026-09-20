"use client";
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      className="button button-secondary"
      onClick={() => window.print()}
    >
      <Printer size={16} />
      Print
    </button>
  );
}
