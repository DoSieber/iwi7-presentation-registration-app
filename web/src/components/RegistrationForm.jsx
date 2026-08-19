import { useEffect, useState } from 'react';
import { Turnstile, turnstileEnabled } from './Turnstile';

const EMPTY = {
  firstName: '',
  lastName: '',
  email: '',
  matriculation: '',
  thesisType: '',
  presentationType: '',
  thesisTitle: '',
  supervisorId: '',
  consent: false,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(values, t) {
  const errors = {};
  for (const field of ['firstName', 'lastName', 'matriculation', 'thesisTitle']) {
    if (!values[field].trim()) errors[field] = t.errRequired;
  }
  if (!values.email.trim()) errors.email = t.errRequired;
  else if (!EMAIL_RE.test(values.email.trim())) errors.email = t.errEmail;
  for (const field of ['thesisType', 'presentationType', 'supervisorId']) {
    if (!values[field]) errors[field] = t.errRequired;
  }
  if (!values.consent) errors.consent = t.errConsent;
  return errors;
}

function Field({ id, label, error, wide, children }) {
  const className = [wide ? 'field field-wide' : 'field', error ? 'has-error' : ''].join(' ').trim();
  return (
    <div className={className}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function RegistrationForm({ session, supervisors, t, submitting, serverError, onSubmit }) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [token, setToken] = useState('');
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    // A failed submit invalidates the Turnstile token, so force a fresh widget.
    if (serverError) {
      setToken('');
      setResetKey((k) => k + 1);
    }
  }, [serverError]);

  const set = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const found = validate(values, t);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = document.getElementById(Object.keys(found)[0]);
      if (first) first.focus();
      return;
    }
    onSubmit({
      sessionKey: session.key,
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      email: values.email.trim(),
      matriculation: values.matriculation.trim(),
      thesisType: values.thesisType,
      presentationType: values.presentationType,
      thesisTitle: values.thesisTitle.trim(),
      supervisorId: Number(values.supervisorId),
      turnstileToken: token,
    });
  };

  const blockedByCaptcha = turnstileEnabled && !token;

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <h2>{t.formHeading}</h2>

      <div className="grid">
        <Field id="firstName" label={t.firstName} error={errors.firstName}>
          <input id="firstName" name="firstName" autoComplete="given-name" value={values.firstName} onChange={set('firstName')} />
        </Field>

        <Field id="lastName" label={t.lastName} error={errors.lastName}>
          <input id="lastName" name="lastName" autoComplete="family-name" value={values.lastName} onChange={set('lastName')} />
        </Field>

        <Field id="email" label={t.email} error={errors.email}>
          <input id="email" name="email" type="email" autoComplete="email" value={values.email} onChange={set('email')} />
        </Field>

        <Field id="matriculation" label={t.matriculation} error={errors.matriculation}>
          <input id="matriculation" name="matriculation" inputMode="numeric" value={values.matriculation} onChange={set('matriculation')} />
        </Field>

        <Field id="thesisType" label={t.thesisType} error={errors.thesisType}>
          <select id="thesisType" name="thesisType" value={values.thesisType} onChange={set('thesisType')}>
            <option value="">{t.choose}</option>
            <option value="Bachelor">{t.bachelor}</option>
            <option value="Master">{t.master}</option>
          </select>
        </Field>

        <Field id="presentationType" label={t.presentationType} error={errors.presentationType}>
          <select
            id="presentationType"
            name="presentationType"
            value={values.presentationType}
            onChange={set('presentationType')}
          >
            <option value="">{t.choose}</option>
            <option value="Interim">{t.interim}</option>
            <option value="Final">{t.final}</option>
          </select>
        </Field>

        <Field id="supervisorId" label={t.supervisorLabel} error={errors.supervisorId} wide>
          <select
            id="supervisorId"
            name="supervisorId"
            value={values.supervisorId}
            onChange={set('supervisorId')}
          >
            <option value="">{t.choose}</option>
            {supervisors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field id="thesisTitle" label={t.thesisTitle} error={errors.thesisTitle}>
        <input id="thesisTitle" name="thesisTitle" value={values.thesisTitle} onChange={set('thesisTitle')} />
      </Field>

      <div className={errors.consent ? 'field checkbox has-error' : 'field checkbox'}>
        <label htmlFor="consent">
          <input id="consent" name="consent" type="checkbox" checked={values.consent} onChange={set('consent')} />
          <span>{t.consent}</span>
        </label>
        {errors.consent ? (
          <p className="field-error" role="alert">
            {errors.consent}
          </p>
        ) : null}
      </div>

      <Turnstile onToken={setToken} resetKey={resetKey} />

      {serverError ? (
        <p className="alert alert-error" role="alert">
          {serverError}
        </p>
      ) : null}

      <button type="submit" className="btn-primary" disabled={submitting || blockedByCaptcha}>
        {submitting ? t.submitting : t.submit}
      </button>
    </form>
  );
}
