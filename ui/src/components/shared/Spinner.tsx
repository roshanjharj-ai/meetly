// src/components/shared/Spinner.tsx
export default function Spinner() {
  return (
    <div className="d-flex justify-content-center align-items-center w-100 h-100">
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
  );
}