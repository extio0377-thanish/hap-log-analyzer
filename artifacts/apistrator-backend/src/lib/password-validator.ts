export interface PasswordPolicy {
  min_length: number;
  min_uppercase: number;
  min_lowercase: number;
  min_special: number;
}

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePassword(password: string, policy: PasswordPolicy): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < policy.min_length) {
    errors.push(`At least ${policy.min_length} characters required (got ${password.length})`);
  }
  const upper = (password.match(/[A-Z]/g) || []).length;
  if (upper < policy.min_uppercase) {
    errors.push(`At least ${policy.min_uppercase} uppercase letter(s) required`);
  }
  const lower = (password.match(/[a-z]/g) || []).length;
  if (lower < policy.min_lowercase) {
    errors.push(`At least ${policy.min_lowercase} lowercase letter(s) required`);
  }
  const special = (password.match(/[^A-Za-z0-9]/g) || []).length;
  if (special < policy.min_special) {
    errors.push(`At least ${policy.min_special} special character(s) required`);
  }

  return { valid: errors.length === 0, errors };
}
