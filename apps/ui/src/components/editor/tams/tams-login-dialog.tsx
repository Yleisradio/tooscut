import { LogInIcon } from "lucide-react";
import { useState, useEffect, type FormEvent } from "react";

import { useSettingsStore } from "../../../state/settings-store";
import { useTamsAuthStore } from "../../../state/tams-auth-store";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "../../ui/dialog";
import { Input } from "../../ui/input";

interface TamsLoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TamsLoginDialog({ open, onOpenChange }: TamsLoginDialogProps) {
  const { login, isLoggingIn, loginError } = useTamsAuthStore();
  const { tamsApiUrl, tamsUsername, setTamsApiUrl } = useSettingsStore();

  const [apiUrl, setApiUrl] = useState(tamsApiUrl);
  const [username, setUsername] = useState(tamsUsername);
  const [password, setPassword] = useState("");

  // Sync fields when dialog opens so they reflect the latest saved values
  useEffect(() => {
    if (open) {
      setApiUrl(tamsApiUrl);
      setUsername(tamsUsername);
      setPassword("");
    }
  }, [open, tamsApiUrl, tamsUsername]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (apiUrl !== tamsApiUrl) {
      await setTamsApiUrl(apiUrl);
    }
    await login(username, password);
    if (useTamsAuthStore.getState().isAuthenticated) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Connect to TAMS</DialogTitle>
            <DialogDescription>
              Enter your TAMS server URL and credentials. They are stored locally in your browser.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="tams-url">
                Server URL
              </label>
              <Input
                id="tams-url"
                placeholder="http://localhost:3000"
                type="url"
                value={apiUrl}
                onChange={(e) => setApiUrl((e.target as HTMLInputElement).value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="tams-username">
                Username
              </label>
              <Input
                autoComplete="username"
                id="tams-username"
                placeholder="admin"
                type="text"
                value={username}
                onChange={(e) => setUsername((e.target as HTMLInputElement).value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="tams-password">
                Password
              </label>
              <Input
                autoComplete="current-password"
                id="tams-password"
                placeholder="••••••••"
                type="password"
                value={password}
                onChange={(e) => setPassword((e.target as HTMLInputElement).value)}
              />
            </div>
            {loginError && <p className="text-sm text-destructive">{loginError}</p>}
          </DialogPanel>
          <DialogFooter>
            <Button
              disabled={isLoggingIn || !apiUrl || !username || !password}
              type="submit"
            >
              <LogInIcon />
              {isLoggingIn ? "Connecting…" : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
