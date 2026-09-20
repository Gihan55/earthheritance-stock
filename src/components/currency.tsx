"use client";

// Shared currency dropdown. USD and LKR lead the list because supplier
// payments settle in LKR while buyer/export documents are USD or other
// foreign currencies. Legacy records can hold any three-letter code, so a
// value outside this list is kept as a fallback option instead of being lost.
export const COMMON_CURRENCIES = [
  "USD",
  "LKR",
  "INR",
  "EUR",
  "GBP",
  "AED",
  "AUD",
  "CAD",
  "SGD",
];

export function CurrencySelect({
  name,
  value,
  defaultValue,
  required = false,
  includeBlank = false,
  onChange,
}: {
  name: string;
  value?: string;
  defaultValue?: string;
  required?: boolean;
  includeBlank?: boolean;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  const codes = [...COMMON_CURRENCIES];
  const current = value ?? defaultValue;
  if (current && /^[A-Z]{3}$/.test(current) && !codes.includes(current)) {
    codes.unshift(current);
  }
  return (
    <select
      name={name}
      value={value}
      defaultValue={includeBlank && !current ? "" : defaultValue}
      required={required}
      onChange={onChange}
    >
      {includeBlank && (
        <option value="">{required ? "Select a currency…" : "No preference"}</option>
      )}
      {codes.map((currency) => (
        <option key={currency} value={currency}>
          {currency}
        </option>
      ))}
    </select>
  );
}
