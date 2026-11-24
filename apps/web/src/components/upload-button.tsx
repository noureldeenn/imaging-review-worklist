import { LoaderCircle, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { ApiRequestError, NetworkError } from '../api/client';
import { useUploadStudy } from '../queries/study-mutations';
import { useSessionStore } from '../stores/session-store';
import { Button } from './ui/button';

function reason(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof NetworkError)
    return 'Could not reach the server. Check that the API is running, then try again';
  return 'Upload failed';
}

/** Uploads one or more DICOM files; each becomes a new Unassigned study. */
export function UploadButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadStudy();
  const selectStudy = useSessionStore((s) => s.selectStudy);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onFiles(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setFailed(false);
    setMessage(`Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`);
    const errors: string[] = [];
    let lastId: string | null = null;
    for (const file of files) {
      try {
        lastId = (await upload.mutateAsync(file)).id;
      } catch (err) {
        errors.push(`${file.name}: ${reason(err)}`);
      }
    }
    const ok = files.length - errors.length;
    setBusy(false);
    setFailed(errors.length > 0);
    setMessage(
      [ok > 0 ? `Uploaded ${ok} stud${ok === 1 ? 'y' : 'ies'}.` : '', ...errors]
        .filter(Boolean)
        .join(' '),
    );
    if (files.length === 1 && lastId) selectStudy(lastId);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".dcm,.dicom,application/dicom"
        className="sr-only"
        tabIndex={-1}
        aria-label="DICOM files"
        data-testid="upload-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void onFiles(files);
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <Upload aria-hidden="true" />
        )}
        Upload study
      </Button>
      <p
        role={failed ? 'alert' : 'status'}
        className={failed ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
      >
        {message}
      </p>
    </div>
  );
}
