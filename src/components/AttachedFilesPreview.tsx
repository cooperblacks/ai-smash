import React from 'react';
import { X, FileText, Image as ImageIcon, Music, Code, File as GenericFile, Trash2 } from 'lucide-react';
import { AttachedFile } from '../types';

interface AttachedFilesPreviewProps {
  files: AttachedFile[];
  onRemoveFile: (id: string) => void;
  onClearAll: () => void;
}

export const AttachedFilesPreview: React.FC<AttachedFilesPreviewProps> = ({
  files,
  onRemoveFile,
  onClearAll,
}) => {
  if (files.length === 0) return null;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type: string, name: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-sky-500" />;
    if (type.startsWith('audio/')) return <Music className="w-4 h-4 text-emerald-500" />;
    if (
      name.endsWith('.ts') ||
      name.endsWith('.tsx') ||
      name.endsWith('.js') ||
      name.endsWith('.jsx') ||
      name.endsWith('.py') ||
      name.endsWith('.json') ||
      name.endsWith('.html') ||
      name.endsWith('.css')
    ) {
      return <Code className="w-4 h-4 text-amber-500" />;
    }
    if (name.endsWith('.md') || type.includes('pdf') || type.includes('text')) {
      return <FileText className="w-4 h-4 text-sky-500" />;
    }
    return <GenericFile className="w-4 h-4 text-neutral-400" />;
  };

  return (
    <div className="w-full px-3 pt-2 pb-1.5 border-b border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] rounded-t-xl transition-all animate-in fade-in slide-in-from-bottom-1 duration-150">
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <span className="text-[11px] font-semibold tracking-wide text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-accent)]" />
          Attached Files ({files.length})
        </span>
        {files.length > 1 && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-[11px] text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors flex items-center gap-1 cursor-pointer"
            title="Remove all attached files"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear all</span>
          </button>
        )}
      </div>

      {/* Dynamic Arrangement based on count */}
      {files.length === 1 ? (
        /* Single file card */
        <div className="relative flex items-center gap-3 p-2 rounded-xl bg-white dark:bg-[#151824] border border-black/[0.08] dark:border-white/[0.08] shadow-xs max-w-sm group">
          {files[0].isImage && files[0].previewUrl ? (
            <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-neutral-100 dark:bg-neutral-800 border border-black/5 dark:border-white/5">
              <img
                src={files[0].previewUrl}
                alt={files[0].name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
              {getFileIcon(files[0].type, files[0].name)}
            </div>
          )}

          <div className="flex-1 min-w-0 pr-6">
            <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">
              {files[0].name}
            </p>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-neutral-400 font-mono">
              <span>{formatFileSize(files[0].size)}</span>
              {files[0].type && (
                <>
                  <span>&bull;</span>
                  <span className="truncate max-w-[120px]">{files[0].type}</span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onRemoveFile(files[0].id)}
            className="absolute top-2 right-2 w-5 h-5 rounded-full bg-neutral-100 hover:bg-red-100 dark:bg-neutral-800 dark:hover:bg-red-950/60 text-neutral-400 hover:text-red-500 dark:hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer"
            title="Remove file"
          >
            <X className="w-3 h-3 stroke-[2.5]" />
          </button>
        </div>
      ) : files.length === 2 ? (
        /* 2 files side-by-side */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="relative flex items-center gap-2.5 p-2 rounded-xl bg-white dark:bg-[#151824] border border-black/[0.08] dark:border-white/[0.08] shadow-xs group"
            >
              {file.isImage && file.previewUrl ? (
                <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-neutral-100 dark:bg-neutral-800 border border-black/5 dark:border-white/5">
                  <img
                    src={file.previewUrl}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                  {getFileIcon(file.type, file.name)}
                </div>
              )}

              <div className="flex-1 min-w-0 pr-5">
                <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">
                  {file.name}
                </p>
                <p className="text-[10px] text-neutral-400 font-mono mt-0.5">
                  {formatFileSize(file.size)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onRemoveFile(file.id)}
                className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-neutral-100 hover:bg-red-100 dark:bg-neutral-800 dark:hover:bg-red-950/60 text-neutral-400 hover:text-red-500 dark:hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer"
                title="Remove file"
              >
                <X className="w-3 h-3 stroke-[2.5]" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        /* 3+ files responsive grid / scroll */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto scrollbar-thin">
          {files.map((file) => (
            <div
              key={file.id}
              className="relative flex items-center gap-2 p-1.5 rounded-xl bg-white dark:bg-[#151824] border border-black/[0.08] dark:border-white/[0.08] shadow-xs group"
            >
              {file.isImage && file.previewUrl ? (
                <div className="relative w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-neutral-100 dark:bg-neutral-800 border border-black/5 dark:border-white/5">
                  <img
                    src={file.previewUrl}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                  {getFileIcon(file.type, file.name)}
                </div>
              )}

              <div className="flex-1 min-w-0 pr-4">
                <p className="text-[11px] font-medium text-neutral-800 dark:text-neutral-200 truncate">
                  {file.name}
                </p>
                <p className="text-[9px] text-neutral-400 font-mono">
                  {formatFileSize(file.size)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onRemoveFile(file.id)}
                className="absolute top-1 right-1 w-4 h-4 rounded-full bg-neutral-100 hover:bg-red-100 dark:bg-neutral-800 dark:hover:bg-red-950/60 text-neutral-400 hover:text-red-500 dark:hover:text-red-400 flex items-center justify-center transition-colors cursor-pointer"
                title="Remove file"
              >
                <X className="w-2.5 h-2.5 stroke-[2.5]" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
