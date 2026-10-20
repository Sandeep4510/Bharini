// Keep in sync with backend/accounts/validators.py and AUTH_PASSWORD_VALIDATORS
const rules = [
  { label: "At least 8 characters", test: (value: string) => value.length >= 8 },
  { label: "One uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { label: "One lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { label: "One number", test: (value: string) => /\d/.test(value) },
  { label: "One special character", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

export function unmetPasswordRules(password: string) {
  return rules.filter((rule) => !rule.test(password)).map((rule) => rule.label.toLowerCase());
}

export function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="space-y-1 text-sm" aria-live="polite">
      {rules.map((rule) => {
        const passed = rule.test(password);
        return (
          <li key={rule.label} className={passed ? "text-emerald-300" : "text-slate-400"}>
            <span aria-hidden="true">{passed ? "✓" : "○"}</span> {rule.label}
            <span className="sr-only">{passed ? " (met)" : " (not met)"}</span>
          </li>
        );
      })}
    </ul>
  );
}
