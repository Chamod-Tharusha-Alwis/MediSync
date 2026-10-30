import React, { useId } from 'react';
import PasswordInput from './PasswordInput';
import PasswordStrengthMeter from './PasswordStrengthMeter';
import PasswordCriteriaTips from './PasswordCriteriaTips';

/**
 * PasswordField
 * High-level form control bundling PasswordInput with optional StrengthMeter and CriteriaTips.
 * Automatically manages ARIA describedBy bindings.
 */
const PasswordField = ({
  id,
  value = '',
  onChange,
  label,
  error,
  withStrengthMeter = false,
  withCriteriaTips = false,
  className,
  ...inputProps
}) => {
  const generatedId = useId();
  const cleanGenId = generatedId.replace(/:/g, '');
  const baseId = id || `password-field-${cleanGenId}`;
  const strengthMeterId = `${baseId}-strength`;
  const criteriaTipsId = `${baseId}-criteria`;

  const descriptions = [];
  if (withStrengthMeter) descriptions.push(strengthMeterId);
  if (withCriteriaTips) descriptions.push(criteriaTipsId);
  const describedBy = inputProps.describedBy || (descriptions.length > 0 ? descriptions.join(' ') : `${baseId}-criteria`);

  return (
    <div className={className}>
      <PasswordInput
        id={baseId}
        value={value}
        onChange={onChange}
        label={label}
        error={error}
        describedBy={describedBy}
        {...inputProps}
      />

      {withStrengthMeter && value && (
        <PasswordStrengthMeter
          id={strengthMeterId}
          password={value}
          className="mt-1"
        />
      )}

      {withCriteriaTips && value && (
        <PasswordCriteriaTips
          id={criteriaTipsId}
          password={value}
          className="mt-2"
        />
      )}
    </div>
  );
};

export default PasswordField;
