export interface ValidationResult {
  isValid: boolean;
  autoApprove: boolean;
  reason?: string;
}

export async function validateManualPayment(
  reference: string,
  amount: number,
  paymentDate: Date,
  expectedAmount: number,
  existingReferences: string[]
): Promise<ValidationResult> {
  // 1. Duplicate reference check
  if (existingReferences.includes(reference)) {
    return {
      isValid: false,
      autoApprove: false,
      reason: 'Duplicate reference number. This transaction has already been processed.',
    };
  }

  // 2. Reference format validation (at least 8 alphanumeric characters)
  const refRegex = /^[A-Z0-9]{8,30}$/i;
  if (!refRegex.test(reference)) {
    return {
      isValid: false,
      autoApprove: false,
      reason: 'Invalid reference format. Must be 8-30 alphanumeric characters.',
    };
  }

  // 3. Amount validation with tolerance (allow ±50 NGN for bank charges)
  const tolerance = 50;
  if (Math.abs(amount - expectedAmount) > tolerance) {
    return {
      isValid: false,
      autoApprove: false,
      reason: `Amount mismatch. Expected ₦${expectedAmount.toLocaleString()}, received ₦${amount.toLocaleString()}.`,
    };
  }

  // 4. Date validation (must be within last 7 days)
  const now = new Date();
  const sevenDaysAgo = new Date(now.setDate(now.getDate() - 7));
  if (paymentDate < sevenDaysAgo) {
    return {
      isValid: false,
      autoApprove: false,
      reason: 'Payment date is older than 7 days. Please submit a recent transaction.',
    };
  }

  // 5. Future date check
  if (paymentDate > new Date()) {
    return {
      isValid: false,
      autoApprove: false,
      reason: 'Payment date cannot be in the future.',
    };
  }

  // All checks passed → auto-approve
  return {
    isValid: true,
    autoApprove: true,
  };
}

export function generateManualPaymentReference(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `MP-${timestamp}-${random}`;
}
