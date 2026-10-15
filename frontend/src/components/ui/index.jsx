import { createPortal } from "react-dom";
import { X, Search, Inbox, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
export function LoadingSkeleton() {
  return (
    <div className="space-y-5 animate-pulse" aria-label="Loading">
      <div className="h-8 w-48 bg-slate-200 rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="h-32 bg-slate-200 rounded-xl" />
        ))}
      </div>
      <div className="h-80 bg-slate-200 rounded-xl" />
    </div>
  );
}
export function EmptyState({
  title = "Nothing here yet",
  description = "Your workspace is ready for its first record.",
  action,
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox size={26} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function StatusBadge({ children }) {
  return (
    <span
      className={
        "badge " +
        (["Active", "Open"].includes(children)
          ? "green"
          : ["Urgent", "Inactive", "Closed"].includes(children)
            ? "rose"
            : "violet")
      }
    >
      {children}
    </span>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = "Search records…",
}) {
  return (
    <div className="search-field">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
export function FormModal({
  title,
  children,
  onClose,
  className = "",
  description,
}) {
  const ref = useRef();
  useEffect(() => {
    const before = document.activeElement;
    ref.current.showModal();
    return () => before?.focus();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className={"modal " + className}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <h2>{title}</h2>
          {description && <p className="modal-description">{description}</p>}
        </div>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>,
    document.body,
  );
}
export function Pagination({ page, pages, total, onChange }) {
  return (
    <div className="pagination">
      <span>
        {total} records · Page {page} of {Math.max(pages, 1)}
      </span>
      <div className="flex gap-2">
        <button
          aria-label="Previous page"
          className="icon-btn"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          aria-label="Next page"
          className="icon-btn"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
export function Field({ label, error, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error && <small className="error-text">{error.message}</small>}
    </label>
  );
}
export function ErrorState({ error, retry }) {
  return (
    <div className="error-box" role="alert">
      <h3>We couldn't load your workspace</h3>
      <p>{error}</p>
      <button className="btn secondary" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
