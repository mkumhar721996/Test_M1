import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ApiDuplicateEmailError,
  ApiValidationError,
  createEmployee,
  type Employee,
} from '../api/employeesApi';
import { validateEmployeeFields } from '../validation/clientValidation';
import { validateIdProofFile, validatePhotoFile } from '../validation/clientFileValidation';

const DEPARTMENTS = [
  'Engineering',
  'Sales',
  'Marketing',
  'Finance',
  'HR',
  'Operations',
  'IT',
  'Customer Support',
  'Legal',
];

const DESIGNATIONS = [
  'Software Engineer',
  'Senior Software Engineer',
  'Sales Executive',
  'Sales Manager',
  'Accountant',
  'Finance Manager',
  'HR Executive',
  'HR Manager',
  'Operations Manager',
  'Marketing Executive',
  'IT Support Engineer',
  'Customer Support Associate',
  'Legal Counsel',
];

const REQUIRED_FIELD_KEYS = [
  'firstName',
  'lastName',
  'email',
  'mobile',
  'department',
  'designation',
  'joiningDate',
] as const;

type RequiredFieldKey = (typeof REQUIRED_FIELD_KEYS)[number];

const FIELD_INPUT_ID: Record<RequiredFieldKey, string> = {
  firstName: 'first-name',
  lastName: 'last-name',
  email: 'email',
  mobile: 'mobile',
  department: 'department',
  designation: 'designation',
  joiningDate: 'joining-date',
};

interface FormValues {
  firstName: string;
  lastName: string;
  dob: string;
  email: string;
  mobile: string;
  department: string;
  designation: string;
  joiningDate: string;
}

const EMPTY_VALUES: FormValues = {
  firstName: '',
  lastName: '',
  dob: '',
  email: '',
  mobile: '',
  department: '',
  designation: '',
  joiningDate: '',
};

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function humanSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function RegisterEmployee({ onRegistered }: { onRegistered: (employee: Employee) => void }) {
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [idProofFile, setIdProofFile] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<'none' | 'required' | 'duplicate'>('none');
  const [duplicateMessage, setDuplicateMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<Employee | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const idProofInputRef = useRef<HTMLInputElement>(null);

  function setValue(key: keyof FormValues, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validatePhotoFile(file);
    if (error) {
      setFieldErrors((prev) => ({ ...prev, photo: error }));
      setPhotoFile(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
      return;
    }
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.photo;
      return next;
    });
    setPhotoFile(file);
  }

  function handleIdProofChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateIdProofFile(file);
    if (error) {
      setFieldErrors((prev) => ({ ...prev, idProof: error }));
      setIdProofFile(null);
      if (idProofInputRef.current) idProofInputRef.current.value = '';
      return;
    }
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.idProof;
      return next;
    });
    setIdProofFile(file);
  }

  function resetForm() {
    setValues(EMPTY_VALUES);
    setPhotoFile(null);
    setIdProofFile(null);
    setFieldErrors({});
    setBanner('none');
    setDuplicateMessage('');
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (idProofInputRef.current) idProofInputRef.current.value = '';
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const errors = validateEmployeeFields(values);
    if (fieldErrors.photo) errors.photo = fieldErrors.photo;
    if (fieldErrors.idProof) errors.idProof = fieldErrors.idProof;

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setBanner('required');
      const firstBadKey = REQUIRED_FIELD_KEYS.find((key) => errors[key]);
      if (firstBadKey) document.getElementById(FIELD_INPUT_ID[firstBadKey])?.focus();
      return;
    }

    setFieldErrors({});
    setBanner('none');
    setSubmitting(true);

    const formData = new FormData();
    formData.append('firstName', values.firstName);
    formData.append('lastName', values.lastName);
    formData.append('email', values.email);
    formData.append('mobile', values.mobile);
    formData.append('department', values.department);
    formData.append('designation', values.designation);
    formData.append('joiningDate', values.joiningDate);
    if (values.dob) formData.append('dob', values.dob);
    if (photoFile) formData.append('photo', photoFile);
    if (idProofFile) formData.append('idProof', idProofFile);

    try {
      const employee = await createEmployee(formData);
      setSuccess(employee);
      onRegistered(employee);
    } catch (err) {
      if (err instanceof ApiValidationError) {
        setFieldErrors(err.fieldErrors);
        setBanner('required');
      } else if (err instanceof ApiDuplicateEmailError) {
        setFieldErrors((prev) => ({ ...prev, email: 'This email is already registered.' }));
        setDuplicateMessage(err.message);
        setBanner('duplicate');
        document.getElementById('email')?.focus();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function fieldError(key: string) {
    return fieldErrors[key] ? (
      <p className="field-error is-visible" role="alert">
        <span aria-hidden="true">⚠</span>
        <span>{fieldErrors[key]}</span>
      </p>
    ) : (
      <p className="field-error" role="alert">
        <span aria-hidden="true">⚠</span>
        <span></span>
      </p>
    );
  }

  if (success) {
    return (
      <div className="success-card is-visible">
        <div className="card">
          <div className="success-icon" aria-hidden="true">
            ✓
          </div>
          <h2 className="card-title">Employee registered successfully</h2>
          <p className="card-body">A new employee record has been created and added to the directory.</p>
          <div className="success-id-chip">{success.id}</div>
          <ul className="summary-list">
            <li>
              <span className="k">Name</span>
              <span className="v">
                {success.firstName} {success.lastName}
              </span>
            </li>
            <li>
              <span className="k">Email</span>
              <span className="v">{success.email}</span>
            </li>
            <li>
              <span className="k">Mobile</span>
              <span className="v">{success.mobile}</span>
            </li>
            <li>
              <span className="k">Department</span>
              <span className="v">{success.department}</span>
            </li>
            <li>
              <span className="k">Designation</span>
              <span className="v">{success.designation}</span>
            </li>
            <li>
              <span className="k">Joining date</span>
              <span className="v">{formatDate(success.joiningDate)}</span>
            </li>
            <li>
              <span className="k">Date of birth</span>
              <span className="v">{success.dob ? formatDate(success.dob) : 'Not provided'}</span>
            </li>
            <li>
              <span className="k">Photo</span>
              <span className="v">{success.photo ? success.photo.originalName : 'Not provided'}</span>
            </li>
            <li>
              <span className="k">ID proof</span>
              <span className="v">{success.idProof ? success.idProof.originalName : 'Not provided'}</span>
            </li>
          </ul>
          <div className="success-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSuccess(null);
                resetForm();
              }}
            >
              Register another employee
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Register new employee</h1>
          <p className="page-subtitle">
            Fields marked <span className="required-mark">*</span> are required. An Employee ID is
            generated automatically once the record is saved.
          </p>
        </div>
      </div>

      <form className="reg-form" onSubmit={handleSubmit} noValidate>
        {banner === 'required' && (
          <div className="banner is-visible" role="alert">
            <span className="banner__icon" aria-hidden="true">
              ⚠
            </span>
            <div>
              <p className="banner__title">Some required fields need attention</p>
              <p className="banner__body">Fix the fields highlighted below, then submit again.</p>
            </div>
          </div>
        )}

        {banner === 'duplicate' && (
          <div className="banner is-visible" role="alert">
            <span className="banner__icon" aria-hidden="true">
              ⚠
            </span>
            <div>
              <p className="banner__title">Duplicate email</p>
              <p className="banner__body">{duplicateMessage}</p>
            </div>
          </div>
        )}

        <fieldset className="form-group">
          <legend>Personal details</legend>

          <div className={`field${fieldErrors.firstName ? ' has-error' : ''}`}>
            <label className="label" htmlFor="first-name">
              First name <span className="required-mark">*</span>
            </label>
            <input
              className="input"
              type="text"
              id="first-name"
              autoComplete="given-name"
              value={values.firstName}
              onChange={(e) => setValue('firstName', e.target.value)}
            />
            {fieldError('firstName')}
          </div>

          <div className={`field${fieldErrors.lastName ? ' has-error' : ''}`}>
            <label className="label" htmlFor="last-name">
              Last name <span className="required-mark">*</span>
            </label>
            <input
              className="input"
              type="text"
              id="last-name"
              autoComplete="family-name"
              value={values.lastName}
              onChange={(e) => setValue('lastName', e.target.value)}
            />
            {fieldError('lastName')}
          </div>

          <div className="field">
            <label className="label" htmlFor="dob">
              Date of birth <span className="u-text-muted">(optional)</span>
            </label>
            <input
              className="input"
              type="date"
              id="dob"
              value={values.dob}
              onChange={(e) => setValue('dob', e.target.value)}
            />
            <p className="field-help">Leave blank if not provided — the record will still be created.</p>
          </div>

          <div className="field" />

          <div className={`field span-2${fieldErrors.photo ? ' has-error' : ''}`}>
            <label className="label" htmlFor="photo">
              Photo <span className="u-text-muted">(optional, JPG or PNG, max 2MB)</span>
            </label>
            <div className={`upload-field${fieldErrors.photo ? ' has-error' : ''}`}>
              <div className="upload-row">
                <input
                  ref={photoInputRef}
                  className="input"
                  style={{ width: 'auto', flex: 1, minWidth: 200 }}
                  type="file"
                  id="photo"
                  accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                  onChange={handlePhotoChange}
                />
              </div>
              {photoFile && (
                <div className="upload-preview is-visible">
                  <span className="upload-preview__name">
                    {photoFile.name} ({humanSize(photoFile.size)})
                  </span>
                </div>
              )}
              {fieldError('photo')}
            </div>
          </div>

          <div className={`field span-2${fieldErrors.idProof ? ' has-error' : ''}`}>
            <label className="label" htmlFor="id-proof">
              ID proof <span className="u-text-muted">(optional, PDF, JPG or PNG, max 5MB)</span>
            </label>
            <div className={`upload-field${fieldErrors.idProof ? ' has-error' : ''}`}>
              <div className="upload-row">
                <input
                  ref={idProofInputRef}
                  className="input"
                  style={{ width: 'auto', flex: 1, minWidth: 200 }}
                  type="file"
                  id="id-proof"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={handleIdProofChange}
                />
              </div>
              {idProofFile && (
                <div className="upload-preview is-visible">
                  <span className="upload-preview__name">
                    {idProofFile.name} ({humanSize(idProofFile.size)})
                  </span>
                </div>
              )}
              {fieldError('idProof')}
            </div>
          </div>
        </fieldset>

        <fieldset className="form-group">
          <legend>Contact details</legend>

          <div className={`field${fieldErrors.email ? ' has-error' : ''}`}>
            <label className="label" htmlFor="email">
              Email <span className="required-mark">*</span>
            </label>
            <input
              className="input"
              type="email"
              id="email"
              autoComplete="email"
              placeholder="name@company.com"
              value={values.email}
              onChange={(e) => setValue('email', e.target.value)}
            />
            {fieldError('email')}
          </div>

          <div className={`field${fieldErrors.mobile ? ' has-error' : ''}`}>
            <label className="label" htmlFor="mobile">
              Mobile number <span className="required-mark">*</span>
            </label>
            <input
              className="input"
              type="tel"
              id="mobile"
              inputMode="numeric"
              placeholder="9876543210"
              value={values.mobile}
              onChange={(e) => setValue('mobile', e.target.value)}
            />
            <p className="field-help">10 digits, no spaces or dashes.</p>
            {fieldError('mobile')}
          </div>
        </fieldset>

        <fieldset className="form-group">
          <legend>Employment details</legend>

          <div className={`field${fieldErrors.department ? ' has-error' : ''}`}>
            <label className="label" htmlFor="department">
              Department <span className="required-mark">*</span>
            </label>
            <select
              className="input"
              id="department"
              value={values.department}
              onChange={(e) => setValue('department', e.target.value)}
            >
              <option value="">Select department</option>
              {DEPARTMENTS.map((dept) => (
                <option key={dept}>{dept}</option>
              ))}
            </select>
            {fieldError('department')}
          </div>

          <div className={`field${fieldErrors.designation ? ' has-error' : ''}`}>
            <label className="label" htmlFor="designation">
              Designation <span className="required-mark">*</span>
            </label>
            <input
              className="input"
              type="text"
              id="designation"
              list="designation-list"
              placeholder="e.g. Software Engineer"
              value={values.designation}
              onChange={(e) => setValue('designation', e.target.value)}
            />
            <datalist id="designation-list">
              {DESIGNATIONS.map((designation) => (
                <option key={designation} value={designation} />
              ))}
            </datalist>
            {fieldError('designation')}
          </div>

          <div className={`field${fieldErrors.joiningDate ? ' has-error' : ''}`}>
            <label className="label" htmlFor="joining-date">
              Joining date <span className="required-mark">*</span>
            </label>
            <input
              className="input"
              type="date"
              id="joining-date"
              value={values.joiningDate}
              onChange={(e) => setValue('joiningDate', e.target.value)}
            />
            {fieldError('joiningDate')}
          </div>
        </fieldset>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={resetForm}>
            Clear
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? (
              <>
                <span className="spinner" aria-hidden="true"></span> Registering…
              </>
            ) : (
              'Register employee'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
