import { useEffect, useState } from 'react';
import { EmployeeDirectory } from './pages/EmployeeDirectory';
import { RegisterEmployee } from './pages/RegisterEmployee';
import { listEmployees, type Employee } from './api/employeesApi';

type View = 'directory' | 'register';

export function App() {
  const [view, setView] = useState<View>('directory');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  useEffect(() => {
    listEmployees()
      .then(setEmployees)
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load the employee directory:', err);
        setDirectoryError('Failed to load the employee directory. Please refresh the page to try again.');
      });
  }, []);

  function handleRegistered(employee: Employee) {
    setEmployees((prev) => [...prev, employee]);
    setNewlyCreatedId(employee.id);
  }

  return (
    <>
      <div className="app-nav">
        <span className="app-nav__brand">Acme HR</span>
        <div className="app-nav__links">
          <button
            type="button"
            className={`app-nav__link${view === 'directory' ? ' is-active' : ''}`}
            onClick={() => setView('directory')}
          >
            Employee Directory
          </button>
          <button
            type="button"
            className={`app-nav__link${view === 'register' ? ' is-active' : ''}`}
            onClick={() => setView('register')}
          >
            Register Employee
          </button>
        </div>
      </div>

      {view === 'directory' ? (
        <>
          {directoryError && (
            <div className="page">
              <div className="banner is-visible" role="alert">
                <span className="banner__icon" aria-hidden="true">
                  ⚠
                </span>
                <div>
                  <p className="banner__title">Couldn't load the employee directory</p>
                  <p className="banner__body">{directoryError}</p>
                </div>
              </div>
            </div>
          )}
          <EmployeeDirectory employees={employees} newlyCreatedId={newlyCreatedId} />
        </>
      ) : (
        <RegisterEmployee onRegistered={handleRegistered} />
      )}
    </>
  );
}
