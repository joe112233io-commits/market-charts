import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";

/** A select over a short list of labelled values. */
export function SimpleSelect<T extends string>({
  value,
  onChange,
  options,
  testId,
  label,
  id,
  className,
  placeholder,
}: {
  value: T | null;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  testId?: string;
  label?: string;
  id?: string;
  className?: string;
  placeholder?: string;
}) {
  return (
    <Select
      items={options as { value: T; label: string }[]}
      value={value}
      onValueChange={(v) => {
        if (v !== null) onChange(v as T);
      }}
    >
      <SelectTrigger id={id} data-testid={testId} aria-label={label} className={className ?? "w-full"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
