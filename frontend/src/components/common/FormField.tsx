import React from 'react';

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string | null;
  helper?: string;
  children: React.ReactNode;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  htmlFor,
  required = false,
  error,
  helper,
  children,
}) => {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="required">*</span>}
      </label>
      {children}
      {error && <p className="form-error">{error}</p>}
      {!error && helper && <p className="form-helper">{helper}</p>}
    </div>
  );
};
