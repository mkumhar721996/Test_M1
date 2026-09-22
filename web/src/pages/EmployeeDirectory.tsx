import type { Employee } from '../api/employeesApi';

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function EmployeeDirectory({
  employees,
  newlyCreatedId,
}: {
  employees: Employee[];
  newlyCreatedId: string | null;
}) {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Employee directory</h1>
          <p className="page-subtitle">
            All employees currently on file. Employee IDs are assigned automatically and never reused.
          </p>
        </div>
      </div>

      <div className="table-wrap">
        <table className="directory">
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Mobile</th>
              <th>Department</th>
              <th>Designation</th>
              <th>Joining date</th>
              <th>Date of birth</th>
              <th>Photo</th>
              <th>ID proof</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} className={emp.id === newlyCreatedId ? 'is-new' : undefined}>
                <td>
                  <span className="id-chip">{emp.id}</span>
                </td>
                <td>
                  {emp.firstName} {emp.lastName}
                </td>
                <td>{emp.email}</td>
                <td>{emp.mobile}</td>
                <td>{emp.department}</td>
                <td>{emp.designation}</td>
                <td>{formatDate(emp.joiningDate)}</td>
                <td>{emp.dob ? formatDate(emp.dob) : <span className="muted-dash">—</span>}</td>
                <td>{emp.photo ? '✓' : <span className="muted-dash">—</span>}</td>
                <td>{emp.idProof ? '✓' : <span className="muted-dash">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
