import { useState } from 'react';
import { getErrorCode, getErrorMessage, getFieldErrors } from '../api/client.js';
import { validateForm } from '../lib/validation.js';

/**
 * Shared form logic for the auth pages: field values, client-side validation,
 * server error mapping, and the submitting flag.
 *
 * `fieldForErrorCode` maps API error codes to a field, e.g. { EMAIL_TAKEN: 'email' }.
 * `onError` may return true to mark a failed submit as handled, so no error is shown.
 */
export function useFormState({ initialValues, schema, onSubmit, onError, fieldForErrorCode = {} }) {
  const [values, setValues] = useState(initialValues);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((previous) => ({ ...previous, [name]: value }));
    setFieldErrors((previous) => ({ ...previous, [name]: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);

    const { data, errors } = validateForm(schema, values);
    if (errors) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(data);
    } catch (error) {
      if (onError?.(error)) {
        setSubmitting(false);
        return;
      }
      const field = fieldForErrorCode[getErrorCode(error)];
      const serverFieldErrors = getFieldErrors(error);

      if (field) {
        setFieldErrors({ [field]: getErrorMessage(error) });
      } else if (Object.keys(serverFieldErrors).length > 0) {
        setFieldErrors(serverFieldErrors);
      } else {
        setFormError(getErrorMessage(error));
      }
      setSubmitting(false);
    }
  }

  return { values, fieldErrors, formError, submitting, handleChange, handleSubmit };
}
