export function formatNumber(value, options = {}) {
  const { minimumFractionDigits = 2, maximumFractionDigits = 2 } = options;
  const numericValue = Number(value ?? 0);

  if (!Number.isFinite(numericValue)) {
    return '0.00';
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(numericValue);
}

export function formatPeso(value, options = {}) {
  const { signed = false, minimumFractionDigits = 2, maximumFractionDigits = 2 } = options;
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) {
    return signed ? '-₱0.00' : '₱0.00';
  }

  const absValue = Math.abs(numericValue);
  const formatted = formatNumber(absValue, { minimumFractionDigits, maximumFractionDigits });
  const prefix = signed && numericValue < 0 ? '-₱' : '₱';
  return `${prefix}${formatted}`;
}

export function formatPesoSigned(value) {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) {
    return '₱0.00';
  }

  const sign = numericValue < 0 ? '-' : '+';
  return `${sign}${formatPeso(Math.abs(numericValue))}`;
}
