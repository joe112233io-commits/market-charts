import { useState } from "react";
import { toast } from "sonner";
import { FormDialog } from "@/client/components/FormDialog";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { errorMessage } from "@/client/lib/format";

/** Asks for a name; closes once `onSave` resolves, shows its error otherwise. */
export function NameDialog({
  title,
  initial,
  onClose,
  onSave,
  submitLabel = "Save",
}: {
  title: string;
  initial: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initial);
  const [pending, setPending] = useState(false);
  return (
    <FormDialog
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="name-form" pending={pending} disabled={!name.trim()}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        id="name-form"
        className="grid gap-1.5"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          try {
            await onSave(name.trim());
            onClose();
          } catch (error) {
            toast.error(errorMessage(error));
            setPending(false);
          }
        }}
      >
        <Label htmlFor="name-input">Name</Label>
        <Input id="name-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
      </form>
    </FormDialog>
  );
}
