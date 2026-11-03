import Uppy from "@uppy/core";
import Transloadit from "@uppy/transloadit";

export type UploadCallbacks = {
  onProgress: (fraction: number) => void;
  onComplete: (assemblyId: string) => void;
  onError: () => void;
};

export type UploadHandle = { cancel: () => void };

/**
 * Uploads one file directly to Transloadit (tus, via @uppy/transloadit)
 * using server-signed Assembly params. One Uppy instance per file keeps
 * one Assembly per attachment; a retry is a fresh call, which fetches a
 * fresh signed authorization. Completion here is only a claim — the
 * backend re-verifies the Assembly before the attachment becomes usable.
 */
export function startTransloaditUpload(
  file: File,
  authorize: () => Promise<{ params: string; signature: string }>,
  callbacks: UploadCallbacks,
): UploadHandle {
  const uppy = new Uppy({ autoProceed: false });
  uppy.use(Transloadit, {
    waitForEncoding: true,
    assemblyOptions: async () => {
      const { params, signature } = await authorize();
      return { params, signature };
    },
  });

  let settled = false;
  const settle = (fn: () => void) => {
    if (settled) return;
    settled = true;
    fn();
    uppy.destroy();
  };

  uppy.on("upload-progress", (_file, progress) => {
    if (!settled && progress.bytesTotal) callbacks.onProgress(progress.bytesUploaded / progress.bytesTotal);
  });
  uppy.on("transloadit:complete", (assembly) => {
    const id = assembly.assembly_id;
    settle(() => (id ? callbacks.onComplete(id) : callbacks.onError()));
  });
  uppy.on("upload-error", () => settle(callbacks.onError));
  uppy.on("error", () => settle(callbacks.onError));

  uppy.addFile({ name: file.name, type: file.type, data: file });
  void uppy.upload().catch(() => settle(callbacks.onError));

  return {
    cancel: () => {
      if (settled) return;
      settled = true;
      uppy.cancelAll();
      uppy.destroy();
    },
  };
}
