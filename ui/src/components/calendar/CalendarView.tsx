import { FiCalendar } from "react-icons/fi";

export default function CalendarView() {
  return (
    <div className="p-4 d-flex flex-column h-100">
        {/* <div className="mb-4">
            <button className="btn btn-outline-secondary d-inline-flex align-items-center" onClick={onBack}>
                <FiArrowLeft/> Back to Home
            </button>
        </div> */}
        <div className="d-flex flex-column align-items-center justify-content-center flex-grow-1">
            <FiCalendar size={60} className="text-muted mb-3" />
            <h2 className="text-muted">Calendar View</h2>
            <p className="text-center">
                This is where a full calendar component (e.g., FullCalendar, react-big-calendar) would be integrated <br /> to display all your meetings visually.
            </p>
        </div>
    </div>
  );
}